import { Vector2D } from '../math/Vector2D';
import { Track } from '../world/Track';
import { VehicleModel } from '../physics/VehicleModel';

export type VRUType = 'PEDESTRIAN' | 'CYCLIST';
export type PedestrianState = 'WAITING' | 'CROSSING' | 'COMPLETED' | 'RIDING';

export class PedestrianModel {
  public id: string;
  public type: VRUType;
  public position: Vector2D;
  public velocity: Vector2D = new Vector2D(0, 0);
  public heading: number;
  public speed: number;
  public baseSpeed: number;
  public radius: number;
  public state: PedestrianState;
  public s: number;
  public d: number;
  public targetD: number;
  public crossingDirection: 1 | -1 = 1; // 1 = right to left, -1 = left to right
  public walkPhase: number = 0;
  public isDamaged: boolean = false;

  constructor(
    id: string,
    type: VRUType,
    s: number,
    d: number,
    targetD: number,
    heading: number,
    speed: number = 1.3
  ) {
    this.id = id;
    this.type = type;
    this.s = s;
    this.d = d;
    this.targetD = targetD;
    this.heading = heading;
    this.speed = speed;
    this.baseSpeed = speed;
    this.radius = type === 'PEDESTRIAN' ? 0.45 : 0.85;
    this.state = type === 'PEDESTRIAN' ? 'WAITING' : 'RIDING';
    this.position = new Vector2D(0, 0);
  }

  public update(dt: number, track: Track, vehicles: VehicleModel[]): void {
    if (this.isDamaged) return;

    this.walkPhase += dt * (this.speed * 4.0);

    if (this.type === 'PEDESTRIAN') {
      const halfRoadWidth = track.totalWidth * 0.5;

      // 1. Waiting at kerb: inspect approaching vehicles
      if (this.state === 'WAITING') {
        let isVehicleTooClose = false;

        for (const v of vehicles) {
          const vFrenet = track.frenet.cartesianToFrenet(v.state.position, v.state.heading, v.state.speed);
          let distS = this.s - vFrenet.s;
          if (track.closed) {
            if (distS < -track.spline.totalLength * 0.5) distS += track.spline.totalLength;
            if (distS > track.spline.totalLength * 0.5) distS -= track.spline.totalLength;
          }

          // Approaching fast within 25 meters
          if (distS > -2.0 && distS < 25.0 && v.state.speed > 3.0) {
            isVehicleTooClose = true;
            break;
          }
        }

        if (!isVehicleTooClose) {
          this.state = 'CROSSING';
        }
      }

      // 2. Crossing the road across Frenet lateral offset d
      if (this.state === 'CROSSING') {
        const stepD = this.speed * dt * this.crossingDirection;
        this.d += stepD;

        if (
          (this.crossingDirection === 1 && this.d >= this.targetD) ||
          (this.crossingDirection === -1 && this.d <= this.targetD)
        ) {
          // Reached opposite shoulder, turnaround after pause
          this.state = 'COMPLETED';
          setTimeout(() => {
            this.crossingDirection = this.crossingDirection === 1 ? -1 : 1;
            this.targetD = this.crossingDirection === 1 ? halfRoadWidth + 1.2 : -halfRoadWidth - 1.2;
            this.state = 'WAITING';
          }, 3500);
        }
      }

      // Sync Cartesian position from (s, d)
      const cart = track.frenet.frenetToCartesian(this.s, this.d);
      this.position = cart.position;
      // Heading is perpendicular to road when crossing
      this.heading = cart.heading + (this.crossingDirection === 1 ? Math.PI * 0.5 : -Math.PI * 0.5);
    } else {
      // CYCLIST: rides along road right margin in direction of traffic
      this.s += this.speed * dt;
      if (track.closed && this.s >= track.spline.totalLength) {
        this.s -= track.spline.totalLength;
      }

      const cart = track.frenet.frenetToCartesian(this.s, this.d);
      this.position = cart.position;
      this.heading = cart.heading;
    }

    // Physical collision check with vehicles
    for (const v of vehicles) {
      if (this.position.distance(v.state.position) < this.radius + 1.2) {
        this.isDamaged = true;
        this.speed = 0;
      }
    }
  }
}
