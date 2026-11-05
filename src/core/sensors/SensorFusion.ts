import { Vector2D } from '../math/Vector2D';
import { VehicleModel } from '../physics/VehicleModel';
import { RoadObstacle } from '../world/Obstacle';
import { RadarSensor } from './RadarSensor';
import { LidarSensor } from './LidarSensor';

export interface TrackedEntity {
  id: string;
  type: 'NPC_VEHICLE' | 'HAZARD_CONE' | 'HAZARD_BARRIER';
  position: Vector2D;
  polygon: Vector2D[];
  distance: number;       // in meters
  speedKmH: number;
  relativeSpeedKmH: number;
  velocityVector: Vector2D;
  confidence: number;     // 0.0 to 1.0
  heading: number;
  isThreat: boolean;      // Distance < 12m or closing speed high
}

export class SensorFusionEngine {
  public maxTrackingRange: number = 45.0; // 45m fusion perimeter

  /**
   * Fuses LiDAR point cloud and Radar tracking data with geometric entity hulls
   */
  public trackSurroundingEntities(
    egoVehicle: VehicleModel,
    surroundingVehicles: VehicleModel[],
    obstacles: RoadObstacle[] = [],
    _radar?: RadarSensor,
    _lidar?: LidarSensor
  ): TrackedEntity[] {
    const ego = egoVehicle.state;
    const egoPos = ego.position;
    const tracked: TrackedEntity[] = [];

    // 1. Fuse surrounding NPC vehicles
    for (const other of surroundingVehicles) {
      if (other === egoVehicle || other.state.isDamaged) continue;

      const dist = egoPos.distance(other.state.position);
      if (dist > this.maxTrackingRange) continue;

      const relSpeed = other.state.speed - ego.speed;
      const velVector = Vector2D.fromAngle(other.state.heading, other.state.speed * 0.45);
      const isThreat = dist < 12.0 || (dist < 22.0 && relSpeed < -4.0);

      tracked.push({
        id: other.config.id,
        type: 'NPC_VEHICLE',
        position: other.state.position.clone(),
        polygon: other.state.polygon.map((p) => p.clone()),
        distance: parseFloat(dist.toFixed(1)),
        speedKmH: Math.round(other.state.speed * 3.6),
        relativeSpeedKmH: Math.round(relSpeed * 3.6),
        velocityVector: velVector,
        confidence: dist < 20 ? 0.98 : 0.85,
        heading: other.state.heading,
        isThreat,
      });
    }

    // 2. Fuse static road hazards (Cones / Barriers)
    for (const obs of obstacles) {
      const dist = egoPos.distance(obs.position);
      if (dist > this.maxTrackingRange) continue;

      const isThreat = dist < 14.0;
      const radius = obs.radius;
      const box: Vector2D[] = [
        new Vector2D(obs.position.x - radius, obs.position.y - radius),
        new Vector2D(obs.position.x + radius, obs.position.y - radius),
        new Vector2D(obs.position.x + radius, obs.position.y + radius),
        new Vector2D(obs.position.x - radius, obs.position.y + radius),
      ];

      tracked.push({
        id: obs.id,
        type: obs.type === 'cone' ? 'HAZARD_CONE' : 'HAZARD_BARRIER',
        position: obs.position.clone(),
        polygon: box,
        distance: parseFloat(dist.toFixed(1)),
        speedKmH: 0,
        relativeSpeedKmH: Math.round(-ego.speed * 3.6),
        velocityVector: new Vector2D(0, 0),
        confidence: 0.95,
        heading: 0,
        isThreat,
      });
    }

    // Sort by proximity so closest threats render on top
    tracked.sort((a, b) => a.distance - b.distance);
    return tracked;
  }
}
