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
    assignedLaneIndex: number = 1
  ): ControlInput {
    const v = vehicle.state;
    const frenet = track.frenet.cartesianToFrenet(v.position, v.heading, v.speed);

    // 1. Precise Kinematic Lane Centering via Pure Pursuit
    // Looks ahead along the target lane to determine proper road curvature & heading
    const currentLane = track.getLaneIndex(frenet.d);
    const targetLane = assignedLaneIndex >= 0 ? assignedLaneIndex : currentLane;
    const targetLaneD = track.getLaneCenterD(targetLane);

    const lookahead = Math.max(8.0, Math.min(32.0, v.speed * 0.9));
    let targetS = frenet.s + lookahead;
    if (track.closed && track.spline.totalLength > 0) {
      if (targetS >= track.spline.totalLength) targetS -= track.spline.totalLength;
      if (targetS < 0) targetS += track.spline.totalLength;
    }

    const targetWaypoint = track.frenet.frenetToCartesian(targetS, targetLaneD);
    const toWaypoint = targetWaypoint.position.sub(v.position);

    // Heading error to waypoint
    const targetAngle = toWaypoint.angle();
    let alpha = targetAngle - v.heading;
    while (alpha > Math.PI) alpha -= 2 * Math.PI;
    while (alpha < -Math.PI) alpha += 2 * Math.PI;

    // Kinematic Pure Pursuit curvature: 2 * sin(alpha) / Ld
    const Ld = Math.max(1.0, toWaypoint.magnitude());
    const curvature = (2.0 * Math.sin(alpha)) / Ld;
    const laneSteerAngle = Math.atan(curvature * vehicle.config.wheelbase);
    const laneGuidanceSteer = Math.max(-1.0, Math.min(1.0, laneSteerAngle / vehicle.config.maxSteerAngle));

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

    if (Math.abs(wallRepulseSteer) > 0.1) {
      // Priority 1: Imminent wall collision avoidance
      finalSteer = wallRepulseSteer * 0.75 + laneGuidanceSteer * 0.25;
      finalThrottle *= 0.5; // Ease throttle when making urgent evasive correction
    } else {
      // Priority 2: Lane discipline with AI nuance (50% lane guidance + 50% AI racing line / overtake)
      finalSteer = laneGuidanceSteer * 0.55 + rawControl.steer * 0.45;
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
