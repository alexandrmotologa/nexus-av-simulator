import { Vector2D } from '../math/Vector2D';

export type RoadSignType =
  | 'SPEED_LIMIT_50'
  | 'SPEED_LIMIT_80'
  | 'SPEED_LIMIT_90'
  | 'SPEED_LIMIT_120'
  | 'SHARP_CURVE_LEFT'
  | 'SHARP_CURVE_RIGHT'
  | 'NO_OVERTAKING'
  | 'PEDESTRIAN_CROSSING';

export interface RoadSign {
  id: string;
  type: RoadSignType;
  s: number; // Longitudinal track position
  position: Vector2D; // World Cartesian coordinate on the road margin
  heading: number; // Angle facing incoming traffic
  speedValue?: number; // km/h limit if applicable
}
