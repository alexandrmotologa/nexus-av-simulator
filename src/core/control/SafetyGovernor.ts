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

    // 1. Analyze 360° LiDAR rays for wall & obstacle proximity
    let minLeftDist = Infinity;
    let minRightDist = Infinity;
    let minFrontDist = Infinity;
    let frontObstacleDetected = false;

    for (let i = 0; i < lidar.hits.length; i++) {
      const hit = lidar.hits[i];
      const beam = lidar.beams[i];
      if (!beam) continue;

      // Calculate relative angle to vehicle heading (-PI to +PI)
      let relAngle = beam.angle - v.heading;
      while (relAngle > Math.PI) relAngle -= Math.PI * 2;
      while (relAngle < -Math.PI) relAngle += Math.PI * 2;

      const d = hit.distance;

      // Front sector (-25° to +25°)
      if (Math.abs(relAngle) < (25 * Math.PI) / 180) {
        if (d < minFrontDist) {
          minFrontDist = d;
          if (hit.hitType !== 'none') frontObstacleDetected = true;
        }
      }
      // Left sector (+20° to +85°)
      else if (relAngle > (20 * Math.PI) / 180 && relAngle < (85 * Math.PI) / 180) {
        if (d < minLeftDist) minLeftDist = d;
      }
      // Right sector (-85° to -20°)
      else if (relAngle < (-20 * Math.PI) / 180 && relAngle > (-85 * Math.PI) / 180) {
        if (d < minRightDist) minRightDist = d;
      }
    }

    // 2. Autonomous Emergency Braking (AEB) & Adaptive Car-Following
    let finalThrottle = rawControl.throttle;
    let finalBrake = rawControl.brake;

    // Check distance to lead vehicle in same lane or front radar
    const radarDist = radar.targetDetected ? radar.targetDistance : Infinity;
    const obstacleDist = Math.min(minFrontDist, radarDist);

    if (obstacleDist < this.config.emergencyBrakeDistance) {
      // Urgent collision risk: cut throttle, apply full regenerative/hydraulic brake
      finalThrottle = 0;
      finalBrake = 1.0;
    } else if (obstacleDist < this.config.leadVehicleFollowDistance) {
      // Car-following rule: decelerate to match lead speed smoothly
      const speedRatio = Math.max(0, (obstacleDist - this.config.emergencyBrakeDistance) /
        (this.config.leadVehicleFollowDistance - this.config.emergencyBrakeDistance));
      finalThrottle = Math.min(finalThrottle, speedRatio * 0.4);
      if (v.speed > 8.0) {
        finalBrake = Math.max(finalBrake, 0.45 * (1.0 - speedRatio));
      }
    }

    // 3. Lane Centering Control (Traffic Lane Discipline)
    const currentLane = track.getLaneIndex(frenet.d);
    const targetLaneD = track.getLaneCenterD(assignedLaneIndex >= 0 ? assignedLaneIndex : currentLane);
    const laneOffset = frenet.d - targetLaneD;

    // Proportional-Derivative lane centering torque
    const laneCenteringSteer = -Math.max(-0.6, Math.min(0.6, laneOffset * 0.45));

    // 4. LiDAR Wall Repulsive Shield (Peretele)
    let wallEvasionSteer = 0;

    if (minLeftDist < this.config.wallSafetyMargin) {
      // Wall dangerously close on left -> push firmly to the right
      const severity = 1.0 - Math.max(0, minLeftDist - this.config.criticalWallDistance) /
        (this.config.wallSafetyMargin - this.config.criticalWallDistance);
      wallEvasionSteer += Math.min(1.0, severity * 0.85);
      finalThrottle *= Math.max(0.2, 1.0 - severity * 0.5);
    }

    if (minRightDist < this.config.wallSafetyMargin) {
      // Wall dangerously close on right -> push firmly to the left
      const severity = 1.0 - Math.max(0, minRightDist - this.config.criticalWallDistance) /
        (this.config.wallSafetyMargin - this.config.criticalWallDistance);
      wallEvasionSteer -= Math.min(1.0, severity * 0.85);
      finalThrottle *= Math.max(0.2, 1.0 - severity * 0.5);
    }

    // 5. Blend Raw AI Pilot Intent with Safety Governor
    // AI has full control when the car is centered and safe;
    // Safety Governor gracefully overrides if the car approaches walls or hazards.
    let finalSteer = rawControl.steer;

    if (Math.abs(wallEvasionSteer) > 0.05) {
      // Priority 1: Do not hit the wall!
      finalSteer = wallEvasionSteer;
    } else {
      // Priority 2: Lane discipline with AI nuance
      // 60% lane guidance + 40% AI racing line / overtake intent
      finalSteer = laneCenteringSteer * 0.65 + rawControl.steer * 0.35;
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
