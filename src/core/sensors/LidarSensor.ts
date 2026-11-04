import { Vector2D } from '../math/Vector2D';
import { Collision } from '../math/Collision';
import { VehicleModel } from '../physics/VehicleModel';
import { Track } from '../world/Track';

export interface LidarBeamHit {
  point: Vector2D;
  distance: number;       // In meters
  normalizedDist: number; // 0 = at sensor, 1 = max range
  hitType: 'none' | 'border' | 'vehicle';
  targetVehicleId?: string;
}

export interface LidarConfig {
  rayCount: number;      // 20 rays around the vehicle
  maxRange: number;      // e.g. 50 meters
  fieldOfView: number;   // 2*PI for full 360° omnidirectional detection
  noiseStdDev: number;
}

export const DEFAULT_LIDAR_CONFIG: LidarConfig = {
  rayCount: 20,
  maxRange: 50.0,
  fieldOfView: Math.PI * 2.0, // Full 360° Omnidirectional Sensing
  noiseStdDev: 0.0,
};

export class LidarSensor {
  public config: LidarConfig;
  public beams: { start: Vector2D; end: Vector2D; angle: number }[] = [];
  public hits: LidarBeamHit[] = [];

  constructor(config: Partial<LidarConfig> = {}) {
    this.config = { ...DEFAULT_LIDAR_CONFIG, ...config };
  }

  /**
   * Casts 360° LiDAR beams covering front, flanks, and rear blind-spots
   * against track boundaries and surrounding traffic vehicles.
   */
  public update(egoVehicle: VehicleModel, track: Track, otherVehicles: VehicleModel[]): void {
    const origin = egoVehicle.state.position;
    const heading = egoVehicle.state.heading;

    this.beams = [];
    this.hits = [];

    for (let i = 0; i < this.config.rayCount; i++) {
      // Evenly distribute rays across 360 degrees around vehicle heading
      const angleOffset = (i / this.config.rayCount) * (Math.PI * 2.0);
      const rayAngle = heading + angleOffset;

      const rayDir = Vector2D.fromAngle(rayAngle);
      const rayEnd = origin.add(rayDir.scale(this.config.maxRange));

      this.beams.push({
        start: origin.clone(),
        end: rayEnd,
        angle: rayAngle,
      });

      let closestDist = this.config.maxRange;
      let closestHitPoint = rayEnd;
      let hitType: 'none' | 'border' | 'vehicle' = 'none';
      let targetVehicleId: string | undefined = undefined;

      // 1. Raycast against left track barrier / border
      this.checkBoundaryList(origin, rayEnd, track.leftBoundary, (dist, pt) => {
        if (dist < closestDist) {
          closestDist = dist;
          closestHitPoint = pt;
          hitType = 'border';
        }
      });

      // 2. Raycast against right track barrier / border
      this.checkBoundaryList(origin, rayEnd, track.rightBoundary, (dist, pt) => {
        if (dist < closestDist) {
          closestDist = dist;
          closestHitPoint = pt;
          hitType = 'border';
        }
      });

      // 3. Raycast against other vehicles (front and rear)
      for (const other of otherVehicles) {
        if (other === egoVehicle || other.state.isDamaged) continue;

        const poly = other.state.polygon;
        for (let v = 0; v < poly.length; v++) {
          const p1 = poly[v];
          const p2 = poly[(v + 1) % poly.length];
          const hit = Collision.raySegmentIntersection(origin, rayEnd, p1, p2);

          if (hit) {
            const dist = origin.distance(hit.point);
            if (dist < closestDist) {
              closestDist = dist;
              closestHitPoint = hit.point;
              hitType = 'vehicle';
              targetVehicleId = other.config.id;
            }
          }
        }
      }

      this.hits.push({
        point: closestHitPoint,
        distance: closestDist,
        normalizedDist: Math.max(0, Math.min(1, closestDist / this.config.maxRange)),
        hitType,
        targetVehicleId,
      });
    }
  }

  private checkBoundaryList(
    origin: Vector2D,
    rayEnd: Vector2D,
    boundary: Vector2D[],
    onHit: (dist: number, pt: Vector2D) => void
  ): void {
    for (let i = 0; i < boundary.length - 1; i++) {
      const p1 = boundary[i];
      const p2 = boundary[i + 1];
      const hit = Collision.raySegmentIntersection(origin, rayEnd, p1, p2);
      if (hit) {
        const dist = origin.distance(hit.point);
        onHit(dist, hit.point);
      }
    }
  }

  /** Normalized sensor array for neural network inputs (values in [0, 1]) */
  public getReadings(): number[] {
    return this.hits.map((h) => h.normalizedDist);
  }
}
