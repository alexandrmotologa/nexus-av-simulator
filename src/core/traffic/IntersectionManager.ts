import { Track } from '../world/Track';
import { TrafficLight, V2ISignalingPacket } from '../world/TrafficLight';
import { VehicleModel } from '../physics/VehicleModel';

export class IntersectionManager {
  public lights: TrafficLight[] = [];
  private track: Track;

  constructor(track: Track) {
    this.track = track;
    this.initializeSignals();
  }

  public setTrack(track: Track): void {
    this.track = track;
    this.initializeSignals();
  }

  public initializeSignals(): void {
    this.lights = [];
    const len = this.track.spline.totalLength;
    if (len < 120) return;

    // Place smart traffic lights at strategic track intervals (e.g., straight sectors)
    const interval = Math.max(160, len * 0.45);
    const count = Math.max(1, Math.floor(len / interval));

    const roadsideD = -(this.track.totalWidth * 0.5 + 1.8);

    for (let i = 0; i < count; i++) {
      const s = (i + 1) * interval - 25.0;
      if (s >= len) continue;

      const pos = this.track.frenet.frenetToCartesian(s, roadsideD);
      const initialPhase = i % 2 === 0 ? 'GREEN' : 'RED';
      const light = new TrafficLight(`tl-${i + 1}`, s, pos.position, pos.heading, initialPhase);
      this.lights.push(light);
    }
  }

  public update(dt: number): void {
    for (const light of this.lights) {
      light.update(dt);
    }
  }

  /**
   * Retrieves active V2I telemetry packet for the ego vehicle approaching upcoming intersections
   */
  public getClosestV2IPacket(egoVehicle: VehicleModel): V2ISignalingPacket | null {
    if (this.lights.length === 0) return null;

    const frenet = this.track.frenet.cartesianToFrenet(
      egoVehicle.state.position,
      egoVehicle.state.heading,
      egoVehicle.state.speed
    );

    let closestPacket: V2ISignalingPacket | null = null;
    let minPositiveDist = Infinity;

    for (const light of this.lights) {
      const packet = light.getV2ITelemetry(frenet.s, this.track.spline.totalLength, this.track.closed);
      if (packet.distanceToStopLine > -5.0 && packet.distanceToStopLine < minPositiveDist) {
        minPositiveDist = packet.distanceToStopLine;
        closestPacket = packet;
      }
    }

    return closestPacket;
  }

  /**
   * Checks whether the given vehicle must brake for a red/yellow light ahead
   */
  public shouldVehicleStop(vS: number, vSpeed: number): { stop: boolean; distance: number } {
    const len = this.track.spline.totalLength;

    for (const light of this.lights) {
      if (light.phase === 'RED' || light.phase === 'ALL_RED' || light.phase === 'YELLOW') {
        let dist = light.stopLineS - vS;
        if (this.track.closed) {
          if (dist < -len * 0.5) dist += len;
          if (dist > len * 0.5) dist -= len;
        }

        // Approaching stop zone: between 2m and 45m ahead
        if (dist >= 1.5 && dist <= Math.max(25.0, vSpeed * 2.8)) {
          return { stop: true, distance: dist };
        }
      }
    }

    return { stop: false, distance: Infinity };
  }
}
