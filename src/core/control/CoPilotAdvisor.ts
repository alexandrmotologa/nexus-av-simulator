import { VehicleModel } from '../physics/VehicleModel';
import { Track } from '../world/Track';
import { LidarSensor } from '../sensors/LidarSensor';
import { RadarSensor } from '../sensors/RadarSensor';
import { RoadObstacle } from '../world/Obstacle';
import { ControlInput } from '../physics/VehicleState';
import { Vector2D } from '../math/Vector2D';

export interface CoPilotIntervention {
  isIntervening: boolean;
  type: 'NONE' | 'EMERGENCY_BRAKE' | 'WALL_EVASION' | 'LANE_KEEP';
  message: string;
}

export class CoPilotAdvisor {
  public isEnabled: boolean = true;
  public lastIntervention: CoPilotIntervention = {
    isIntervening: false,
    type: 'NONE',
    message: '',
  };

  /**
   * Evaluates telemetry and intervenes if the human driver is heading into an unavoidable crash
   */
  public supervise(
    vehicle: VehicleModel,
    track: Track,
    lidar: LidarSensor,
    radar: RadarSensor,
    trafficVehicles: VehicleModel[],
    obstacles: RoadObstacle[],
    rawControl: ControlInput,
    dt: number
  ): ControlInput {
    if (!this.isEnabled || vehicle.state.isDamaged) {
      this.lastIntervention = { isIntervening: false, type: 'NONE', message: '' };
      return rawControl;
    }

    const v = vehicle.state;
    const frenet = track.frenet.cartesianToFrenet(v.position, v.heading, v.speed);

    // 1. Check forward radar threat (approaching stopped or slow traffic)
    const forwardThreat = radar.targetDetected && radar.targetDistance < 8.5 && v.speed > 5.0;
    if (forwardThreat) {
      this.lastIntervention = {
        isIntervening: true,
        type: 'EMERGENCY_BRAKE',
        message: 'ADAS AEB: Forward Collision Avoidance',
      };
      return {
        throttle: 0,
        brake: 1.0,
        steer: rawControl.steer * 0.5,
      };
    }

    // 2. Check hard boundary proximity (approaching road barrier)
    const halfRoadWidth = track.totalWidth * 0.5;
    const distToBarrier = halfRoadWidth - Math.abs(frenet.d) - vehicle.config.width * 0.5;

    if (distToBarrier < 1.4 && v.speed > 3.0) {
      // Urgent wall counter-steer
      const uForward = Vector2D.fromAngle(v.heading);
      const uRight = new Vector2D(-uForward.y, uForward.x);
      // If car is near right barrier (negative d), push left
      // If car is near left barrier (positive d), push right
      const steerAway = frenet.d > 0 ? 0.75 : -0.75;

      this.lastIntervention = {
        isIntervening: true,
        type: 'WALL_EVASION',
        message: 'ADAS ESC: Emergency Barrier Counter-Steer',
      };

      return {
        throttle: rawControl.throttle * 0.3,
        brake: Math.max(rawControl.brake, 0.4),
        steer: steerAway,
      };
    }

    // 3. Check static sandbox obstacles ahead
    for (const obs of obstacles) {
      const dist = v.position.distance(obs.position);
      if (dist < obs.radius + 3.8 && v.speed > 4.0) {
        this.lastIntervention = {
          isIntervening: true,
          type: 'EMERGENCY_BRAKE',
          message: 'ADAS AEB: Hazard Obstacle Avoidance',
        };
        return {
          throttle: 0,
          brake: 1.0,
          steer: rawControl.steer,
        };
      }
    }

    this.lastIntervention = { isIntervening: false, type: 'NONE', message: '' };
    return rawControl;
  }
}
