import { Vector2D } from '../math/Vector2D';
import { VehicleModel } from '../physics/VehicleModel';
import { Track } from '../world/Track';
import { LidarSensor } from '../sensors/LidarSensor';
import { RadarSensor } from '../sensors/RadarSensor';
import { RoadObstacle } from '../world/Obstacle';
import { ControlInput } from '../physics/VehicleState';

export interface SafetyGovernorConfig {
  wallSafetyMargin: number;     // Distance (m) to start repulsive wall evasion (e.g. 3.2m)
  criticalWallDistance: number; // Distance (m) for urgent counter-steer (e.g. 1.8m)
  leadVehicleFollowDistance: number; // Desired distance to vehicle ahead (e.g. 12m)
  emergencyBrakeDistance: number;    // Hard AEB distance (e.g. 8m)
  safeLaneChangeGapFront: number;    // Minimum space ahead in target lane (e.g. 14m)
  safeLaneChangeGapRear: number;     // Minimum space behind in target lane (e.g. 10m)
}

export const DEFAULT_SAFETY_CONFIG: SafetyGovernorConfig = {
  wallSafetyMargin: 3.5,
  criticalWallDistance: 1.8,
  leadVehicleFollowDistance: 14.0,
  emergencyBrakeDistance: 8.5,
  safeLaneChangeGapFront: 15.0,
  safeLaneChangeGapRear: 11.0,
};

export class SafetyGovernor {
  public config: SafetyGovernorConfig;

  constructor(config: Partial<SafetyGovernorConfig> = {}) {
    this.config = { ...DEFAULT_SAFETY_CONFIG, ...config };
  }

  /**
   * Evaluates 360° LiDAR, radar, and lane geometry to apply certified safety shielding
   * over raw AI commands, enforcing traffic lane discipline and preventing wall collisions.
   */
  public applySafetyShield(
    vehicle: VehicleModel,
    track: Track,
    lidar: LidarSensor,
    radar: RadarSensor,
    allVehicles: VehicleModel[],
    obstacles: RoadObstacle[],
    rawControl: ControlInput,
    dt: number,
    assignedLaneIndex: number = -1
  ): ControlInput {
    const v = vehicle.state;
    const frenet = track.frenet.cartesianToFrenet(v.position, v.heading, v.speed);

    // 1. Precise Curvature-Compensated Stanley Kinematic Lane Centering (Zero Corner-Cutting)
    let targetLane = assignedLaneIndex;
    if (targetLane < 0) {
      let bestLane = 0;
      let minLaneDist = Infinity;
      for (let l = 0; l < track.laneCount; l++) {
        const laneD = track.getLaneCenterD(l);
        const dist = Math.abs(frenet.d - laneD);
        if (dist < minLaneDist) {
          minLaneDist = dist;
          bestLane = l;
        }
      }
      targetLane = bestLane;
    }
    const targetLaneD = track.getLaneCenterD(targetLane);

    // Lateral deviation from target lane center (+d is along track normal, pointing to car's right)
    const lateralOffset = frenet.d - targetLaneD;

    // Road tangent, normal and curvature evaluated at vehicle distance s
    const roadState = track.spline.evaluateAtDistance(frenet.s);
    const roadHeading = Math.atan2(roadState.tangent.y, roadState.tangent.x);
    let headingError = v.heading - roadHeading;
    while (headingError > Math.PI) headingError -= 2 * Math.PI;
    while (headingError < -Math.PI) headingError += 2 * Math.PI;

    // Curvature feedforward: calculates exact geometric steering needed to follow curve arc with 0 chord error
    const curveFeedforward = Math.atan(roadState.curvature * vehicle.config.wheelbase);

    // Stanley cross-track error feedback:
    // In canvas coordinates (+y down, clockwise heading increases):
    // Track normal points to the RIGHT of forward direction.
    // If lateralOffset > 0 (vehicle is to the right of center), negative steer turns left towards center.
    // If lateralOffset < 0 (vehicle is to the left of center), positive steer turns right towards center.
    const kCrossTrack = 0.95;
    const kHeading = 0.85;
    const crossTrackSteer = -Math.atan((kCrossTrack * lateralOffset) / Math.max(1.5, v.speed * 0.85 + 1.2));
    const headingCorrection = -kHeading * headingError;

    const totalGuidanceSteerAngle = curveFeedforward + crossTrackSteer + headingCorrection;
    const laneGuidanceSteer = Math.max(-1.0, Math.min(1.0, totalGuidanceSteerAngle / vehicle.config.maxSteerAngle));

    // 2. 360° LiDAR Repulsive Wall & Obstacle Vector (Vehicle-Local Frame)
    // Vehicle Forward: (cos(heading), sin(heading))
    // Vehicle Right:   (-sin(heading), cos(heading)) [Canvas coords: +y is down, so +90° turns right]
    const uForward = Vector2D.fromAngle(v.heading);
    const uRight = new Vector2D(-uForward.y, uForward.x);

    let minFrontDist = Infinity;
    let wallRepulseSteer = 0;

    for (let i = 0; i < lidar.hits.length; i++) {
      const hit = lidar.hits[i];
      if (hit.hitType === 'none' || hit.distance >= this.config.wallSafetyMargin) continue;

      const toHit = hit.point.sub(v.position);
      const xLocal = toHit.dot(uForward); // positive = in front, negative = behind
      const yLocal = toHit.dot(uRight);   // positive = right side, negative = left side
      const dist = hit.distance;

      // Front proximity (within ±1.4m lateral corridor ahead)
      if (xLocal > 0 && Math.abs(yLocal) < 1.4) {
        if (dist < minFrontDist) minFrontDist = dist;
      }

      // Lateral wall repulsion: only consider hits along flanks or forward diagonals
      if (xLocal > -1.5 && Math.abs(yLocal) > 0.4) {
        const severity = Math.max(0, 1.0 - dist / this.config.wallSafetyMargin);
        // If obstacle is on RIGHT (yLocal > 0), push LEFT (negative steer)
        // If obstacle is on LEFT (yLocal < 0), push RIGHT (positive steer)
        const pushDirection = yLocal > 0 ? -1.0 : 1.0;
        wallRepulseSteer += pushDirection * severity * 0.8;
      }
    }

    wallRepulseSteer = Math.max(-1.0, Math.min(1.0, wallRepulseSteer));

    // 3. Autonomous Emergency Braking (AEB) & Adaptive Car-Following
    let finalThrottle = rawControl.throttle;
    let finalBrake = rawControl.brake;

    const radarDist = radar.targetDetected ? radar.targetDistance : Infinity;
    const obstacleDist = Math.min(minFrontDist, radarDist);

    if (obstacleDist < this.config.emergencyBrakeDistance) {
      // Hard AEB emergency stop
      finalThrottle = 0;
      finalBrake = 1.0;
    } else if (obstacleDist < this.config.leadVehicleFollowDistance) {
      // Proactive headway deceleration
      const speedRatio = Math.max(
        0,
        (obstacleDist - this.config.emergencyBrakeDistance) /
          (this.config.leadVehicleFollowDistance - this.config.emergencyBrakeDistance)
      );
      finalThrottle = Math.min(finalThrottle, speedRatio * 0.4);
      if (v.speed > 6.0) {
        finalBrake = Math.max(finalBrake, 0.5 * (1.0 - speedRatio));
      }
    }

    // 3b. Intelligent Speed Assistance (ISA) - Certified Legal Speed Limit Compliance
    const activeSpeedLimitKmh = track.getSpeedLimitAtDistance(frenet.s);
    const legalMaxSpeedMps = activeSpeedLimitKmh / 3.6;

    if (v.speed > legalMaxSpeedMps) {
      const overspeed = v.speed - legalMaxSpeedMps;
      // Cut throttle progressively when exceeding the posted speed limit
      finalThrottle = Math.max(0, finalThrottle - overspeed * 0.35);
      // Active braking when vehicle exceeds legal speed limit by > 3 km/h (0.85 m/s)
      if (overspeed > 0.85) {
        finalBrake = Math.max(finalBrake, Math.min(0.65, overspeed * 0.25));
      }
    }

    // 4. Blend AI Intent with Certified Safety Guidance & Wall Repulsion
    let finalSteer = rawControl.steer;

    // Check if vehicle is straddling any divider line without active lane change signaling
    let isStraddlingDivider = false;
    const halfCarW = vehicle.config.width * 0.5;
    for (let l = 1; l < track.laneCount; l++) {
      const dividerD = (track.totalWidth * 0.5) - l * track.laneWidth;
      if (Math.abs(frenet.d - dividerD) < halfCarW + 0.15) {
        isStraddlingDivider = true;
        break;
      }
    }

    const absOffset = Math.abs(lateralOffset);

    // Compute dynamic DC-bias rejection:
    // If the driver/AI is steering in the same direction as the existing lateral error
    // (e.g. car is already drifting right (lateralOffset > 0), and AI is steering right (steer > 0)),
    // progressively filter out the off-center push so the vehicle never settles on a line.
    let aiSteerDamped = rawControl.steer;
    const isPushingFurtherOffCenter =
      (lateralOffset > 0 && rawControl.steer > 0.05) ||
      (lateralOffset < 0 && rawControl.steer < -0.05);

    if (isPushingFurtherOffCenter) {
      const pushSeverity = Math.min(1.0, absOffset / 0.35);
      aiSteerDamped = rawControl.steer * (1.0 - pushSeverity * 0.85);
    }

    if (Math.abs(wallRepulseSteer) > 0.1) {
      // Priority 1: Imminent wall collision avoidance
      finalSteer = wallRepulseSteer * 0.75 + laneGuidanceSteer * 0.25;
      finalThrottle *= 0.5; // Ease throttle when making urgent evasive correction
    } else if (isStraddlingDivider && !v.isBlinkingLeft && !v.isBlinkingRight) {
      // Priority 2: Lane Straddling Correction - firmly pull vehicle into center of target lane
      finalSteer = laneGuidanceSteer * 0.90 + aiSteerDamped * 0.10;
    } else if (absOffset <= 0.08) {
      // Zone 1: Center Deadband sweet spot (|offset| <= 8cm)
      // Car is centered naturally. Soft guidance prevents micro-jitter.
      finalSteer = laneGuidanceSteer * 0.55 + aiSteerDamped * 0.45;
    } else if (absOffset <= 0.35) {
      // Zone 2: Progressive Centering Corridor (8cm to 35cm)
      // Smooth Hermite ramp from 55% to 85% centering authority
      const t = (absOffset - 0.08) / 0.27;
      const smoothAuthority = 0.55 + (0.85 - 0.55) * (t * t * (3 - 2 * t));
      finalSteer = laneGuidanceSteer * smoothAuthority + aiSteerDamped * (1.0 - smoothAuthority);
    } else {
      // Zone 3: Line Buffer Zone (|offset| > 35cm)
      // Approaching outer boundaries; high authority smoothly realigns vehicle into corridor
      finalSteer = laneGuidanceSteer * 0.92 + aiSteerDamped * 0.08;
    }

    // Double Solid Yellow Centerline Protection (prevent crossing into oncoming traffic flow)
    if (track.isBidirectional && !track.isOncomingLane(targetLane)) {
      const oncomingBoundaryD = track.totalWidth * 0.5 - track.oncomingLaneCount * track.laneWidth;
      // In Track coords, oncoming lanes have d > oncomingBoundaryD
      if (frenet.d > oncomingBoundaryD - 0.7) {
        // Firmly push back towards legal forward lanes
        finalSteer = Math.min(finalSteer, -0.4);
      }
    }

    return {
      throttle: Math.max(0, Math.min(1, finalThrottle)),
      brake: Math.max(0, Math.min(1, finalBrake)),
      steer: Math.max(-1, Math.min(1, finalSteer)),
    };
  }

  /**
   * Asserts whether a lane change into targetLaneIndex is legally and physically safe:
   * 1. No lead vehicle in target lane closer than safeLaneChangeGapFront
   * 2. No rear trailing vehicle approaching from behind (avoids cutting off other cars)
   * 3. Cannot cross double solid yellow line into oncoming traffic
   */
  public isLaneChangeSafe(
    egoVehicle: VehicleModel,
    track: Track,
    allVehicles: VehicleModel[],
    targetLaneIndex: number
  ): boolean {
    if (targetLaneIndex < 0 || targetLaneIndex >= track.laneCount) return false;

    const egoFrenet = track.frenet.cartesianToFrenet(
      egoVehicle.state.position,
      egoVehicle.state.heading,
      egoVehicle.state.speed
    );

    // Rule 1: Never cross DOUBLE_SOLID_YELLOW into oncoming traffic!
    const currentLane = track.getLaneIndex(egoFrenet.d);
    if (track.isBidirectional) {
      const isCurrentlyForward = !track.isOncomingLane(currentLane);
      const isTargetOncoming = track.isOncomingLane(targetLaneIndex);
      if (isCurrentlyForward && isTargetOncoming) return false;
      if (!isCurrentlyForward && !isTargetOncoming) return false;
    }

    const targetLaneD = track.getLaneCenterD(targetLaneIndex);

    for (const other of allVehicles) {
      if (other === egoVehicle) continue;
      const otherFrenet = track.frenet.cartesianToFrenet(
        other.state.position,
        other.state.heading,
        other.state.speed
      );

      // Check if other vehicle is in or entering the target lane
      const distToTargetLane = Math.abs(otherFrenet.d - targetLaneD);
      if (distToTargetLane < track.laneWidth * 0.7) {
        let deltaS = otherFrenet.s - egoFrenet.s;
        if (track.closed) {
          if (deltaS < -track.spline.totalLength * 0.5) deltaS += track.spline.totalLength;
          if (deltaS > track.spline.totalLength * 0.5) deltaS -= track.spline.totalLength;
        }

        // Forward gap check (is target lane clear ahead?)
        if (deltaS >= 0 && deltaS < this.config.safeLaneChangeGapFront) {
          return false;
        }

        // Rear gap check (would we cut off a car behind?)
        if (deltaS < 0 && Math.abs(deltaS) < this.config.safeLaneChangeGapRear) {
          return false;
        }
      }
    }

    return true;
  }
}
