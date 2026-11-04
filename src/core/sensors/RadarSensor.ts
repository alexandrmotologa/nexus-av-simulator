import { VehicleModel } from '../physics/VehicleModel';
import { Track } from '../world/Track';

export interface RadarTarget {
  id: string;
  distance: number;       // Distance along Frenet s (m)
  relativeSpeed: number;  // v_target - v_ego (m/s)
  laneOffset: number;     // target_d - ego_d (m)
  timeToCollision: number; // In seconds (TTC)
  isBehind: boolean;      // True if vehicle is approaching from the rear
}

export class RadarSensor {
  public maxRange: number;
  public frontTarget: RadarTarget | null = null;
  public rearTarget: RadarTarget | null = null;
  public rearThreatLevel: number = 0; // 0 to 1

  constructor(maxRange: number = 70.0) {
    this.maxRange = maxRange;
  }

  public update(egoVehicle: VehicleModel, track: Track, traffic: VehicleModel[]): void {
    this.frontTarget = null;
    this.rearTarget = null;
    this.rearThreatLevel = 0;

    const egoFrenet = track.frenet.cartesianToFrenet(
      egoVehicle.state.position,
      egoVehicle.state.heading,
      egoVehicle.state.speed
    );

    let closestFrontDist = this.maxRange;
    let closestRearDist = this.maxRange;

    for (const other of traffic) {
      if (other === egoVehicle || other.state.isDamaged) continue;

      const otherFrenet = track.frenet.cartesianToFrenet(
        other.state.position,
        other.state.heading,
        other.state.speed
      );

      let deltaS = otherFrenet.s - egoFrenet.s;
      if (track.closed) {
        if (deltaS < -track.spline.totalLength * 0.5) deltaS += track.spline.totalLength;
        if (deltaS > track.spline.totalLength * 0.5) deltaS -= track.spline.totalLength;
      }

      const deltaD = otherFrenet.d - egoFrenet.d;
      const inLaneCorridor = Math.abs(deltaD) < track.laneWidth * 0.9;
      const relSpeed = other.state.speed - egoVehicle.state.speed;

      // 1. Vehicle Ahead
      if (deltaS > 0 && deltaS < this.maxRange && inLaneCorridor) {
        if (deltaS < closestFrontDist) {
          closestFrontDist = deltaS;
          const ttc = relSpeed < -0.1 ? deltaS / Math.abs(relSpeed) : Infinity;
          this.frontTarget = {
            id: other.config.id,
            distance: deltaS,
            relativeSpeed: relSpeed,
            laneOffset: deltaD,
            timeToCollision: ttc,
            isBehind: false,
          };
        }
      }

      // 2. Vehicle Behind (Approaching from the rear / blind spot)
      if (deltaS < 0 && Math.abs(deltaS) < this.maxRange && inLaneCorridor) {
        const absDist = Math.abs(deltaS);
        if (absDist < closestRearDist) {
          closestRearDist = absDist;
          // Threat is high if rear car is faster (relSpeed > 0) and close
          const closingSpeed = Math.max(0, other.state.speed - egoVehicle.state.speed);
          const rearTTC = closingSpeed > 0.5 ? absDist / closingSpeed : Infinity;

          this.rearTarget = {
            id: other.config.id,
            distance: absDist,
            relativeSpeed: relSpeed,
            laneOffset: deltaD,
            timeToCollision: rearTTC,
            isBehind: true,
          };

          if (absDist < 20.0 && closingSpeed > 1.0) {
            this.rearThreatLevel = Math.max(0, Math.min(1.0, (20.0 - absDist) / 20.0));
          }
        }
      }
    }
  }

  // Alias for backward compatibility
  get target(): RadarTarget | null {
    return this.frontTarget;
  }
}
