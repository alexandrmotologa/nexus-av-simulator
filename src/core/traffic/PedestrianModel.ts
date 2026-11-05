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
  public pauseTimer: number = 0;
  public damagedTimer: number = 0;

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
    const halfRoadWidth = track.totalWidth * 0.5;

    // 0. Impact recovery: never freeze permanently on the road
    if (this.isDamaged) {
      this.damagedTimer += dt;
      if (this.damagedTimer > 2.0) {
        // Recover and safely reposition onto the nearest sidewalk curb
        this.isDamaged = false;
        this.damagedTimer = 0;
        this.d = this.d >= 0 ? halfRoadWidth + 1.2 : -halfRoadWidth - 1.2;
        this.state = 'WAITING';
        this.pauseTimer = 0;
      } else {
        return;
      }
    }

    this.walkPhase += dt * (this.speed * 4.0);

    if (this.type === 'PEDESTRIAN') {
      // 1. Waiting at kerb: inspect approaching vehicles in both travel directions
      if (this.state === 'WAITING') {
        this.pauseTimer += dt;
        let isVehicleTooClose = false;

        if (this.pauseTimer > 1.2) {
          for (const v of vehicles) {
            const vFrenet = track.frenet.cartesianToFrenet(v.state.position, v.state.heading, v.state.speed);
            let distS = this.s - vFrenet.s;
            if (track.closed) {
              if (distS < -track.spline.totalLength * 0.5) distS += track.spline.totalLength;
              if (distS > track.spline.totalLength * 0.5) distS -= track.spline.totalLength;
            }

            // Approaching vehicle moving fast within 28 meters
            if (distS > -1.5 && distS < 28.0 && v.state.speed > 2.5) {
              isVehicleTooClose = true;
              break;
            }
          }

          if (!isVehicleTooClose) {
            this.state = 'CROSSING';
            this.pauseTimer = 0;
          }
        }
      }

      // 2. Crossing the road: steadily advance across zebra stripes until reaching the sidewalk
      if (this.state === 'CROSSING') {
        let walkSpeed = this.baseSpeed;

        // If a vehicle is within 5 meters, quicken pace (~1.8 m/s) to clear the road promptly
        for (const v of vehicles) {
          if (this.position.distance(v.state.position) < 5.0) {
            walkSpeed = Math.max(walkSpeed, 1.8);
            break;
          }
        }

        const stepD = walkSpeed * dt * this.crossingDirection;
        this.d += stepD;

        if (
          (this.crossingDirection === 1 && this.d >= this.targetD) ||
          (this.crossingDirection === -1 && this.d <= this.targetD)
        ) {
          // Reached opposite sidewalk: transition to COMPLETED
          this.state = 'COMPLETED';
          this.pauseTimer = 0;
        }
      }

      // 3. Completed crossing: wait safely on the sidewalk before turning around
      if (this.state === 'COMPLETED') {
        this.pauseTimer += dt;
        if (this.pauseTimer >= 4.5) {
          this.crossingDirection = this.crossingDirection === 1 ? -1 : 1;
          this.targetD = this.crossingDirection === 1 ? halfRoadWidth + 1.2 : -halfRoadWidth - 1.2;
          this.state = 'WAITING';
          this.pauseTimer = 0;
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

    // Physical collision check: only register damage on actual high-speed vehicle impact
    for (const v of vehicles) {
      if (v.state.speed > 3.0 && this.position.distance(v.state.position) < this.radius + 0.9) {
        this.isDamaged = true;
        this.damagedTimer = 0;
      }
    }
  }
}
