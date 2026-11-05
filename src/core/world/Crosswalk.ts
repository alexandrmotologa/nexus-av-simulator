import { Vector2D } from '../math/Vector2D';
import { Track } from './Track';

export class Crosswalk {
  public id: string;
  public s: number; // Longitudinal position on track
  public width: number; // Width along the road (e.g. 4.0 meters)
  public leftPosition: Vector2D;
  public rightPosition: Vector2D;
  public heading: number;

  constructor(id: string, s: number, track: Track, width: number = 4.5) {
    this.id = id;
    this.s = s;
    this.width = width;

    const halfRoadWidth = track.totalWidth * 0.5;
    const leftCart = track.frenet.frenetToCartesian(s, halfRoadWidth);
    const rightCart = track.frenet.frenetToCartesian(s, -halfRoadWidth);

    this.leftPosition = leftCart.position;
    this.rightPosition = rightCart.position;
    this.heading = leftCart.heading;
  }
}
