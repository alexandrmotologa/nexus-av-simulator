import { Vector2D } from '../math/Vector2D';
import { VehicleModel } from '../physics/VehicleModel';

export interface GhostSample {
  position: Vector2D;
  heading: number;
  speed: number;
  time: number;
}

export class GhostLapManager {
  public isRecording: boolean = false;
  public isReplaying: boolean = false;
  public currentLapSamples: GhostSample[] = [];
  public bestLapSamples: GhostSample[] = [];
  public bestLapTime: number = Infinity;
  public replayTime: number = 0;

  // Virtual vehicle representing the replayed ghost
  public ghostVehicle: VehicleModel;

  constructor() {
    this.ghostVehicle = new VehicleModel(
      {
        id: 'ghost-champion-vehicle',
        name: 'Benchmark Ghost',
        color: '#38bdf8', // Neon cyan hologram
        width: 2.1,
        length: 4.6,
      },
      new Vector2D(0, 0),
      0
    );
  }

  public startLap(): void {
    this.isRecording = true;
    this.currentLapSamples = [];
  }

  public recordSample(pos: Vector2D, heading: number, speed: number, lapTime: number): void {
    if (!this.isRecording) return;
    this.currentLapSamples.push({
      position: pos.clone(),
      heading,
      speed,
      time: lapTime,
    });
  }

  public finishLap(totalLapTime: number, isClean: boolean): boolean {
    this.isRecording = false;
    if (isClean && totalLapTime < this.bestLapTime && this.currentLapSamples.length > 50) {
      this.bestLapTime = totalLapTime;
      this.bestLapSamples = [...this.currentLapSamples];
      this.isReplaying = true;
      this.replayTime = 0;
      return true; // New record lap saved
    }
    return false;
  }

  /**
   * Advances ghost replay clock and interpolates position
   */
  public updateReplay(dt: number): void {
    if (!this.isReplaying || this.bestLapSamples.length < 2) return;

    this.replayTime += dt;
    if (this.replayTime > this.bestLapTime) {
      this.replayTime = this.replayTime % this.bestLapTime;
    }

    // Binary search or linear scan for nearest replay interval
    const samples = this.bestLapSamples;
    let idx = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      if (samples[i].time <= this.replayTime && samples[i + 1].time >= this.replayTime) {
        idx = i;
        break;
      }
    }

    const s0 = samples[idx];
    const s1 = samples[idx + 1] || s0;
    const timeDelta = s1.time - s0.time;
    const alpha = timeDelta > 1e-4 ? (this.replayTime - s0.time) / timeDelta : 0;

    // Linear position interpolation
    this.ghostVehicle.state.position.x = s0.position.x + (s1.position.x - s0.position.x) * alpha;
    this.ghostVehicle.state.position.y = s0.position.y + (s1.position.y - s0.position.y) * alpha;

    // Heading interpolation (shortest angular distance)
    let dHeading = s1.heading - s0.heading;
    while (dHeading > Math.PI) dHeading -= 2 * Math.PI;
    while (dHeading < -Math.PI) dHeading += 2 * Math.PI;
    this.ghostVehicle.state.heading = s0.heading + dHeading * alpha;
    this.ghostVehicle.state.speed = s0.speed + (s1.speed - s0.speed) * alpha;
    this.ghostVehicle.updatePolygon();
  }

  public clear(): void {
    this.isRecording = false;
    this.isReplaying = false;
    this.currentLapSamples = [];
    this.bestLapSamples = [];
    this.bestLapTime = Infinity;
    this.replayTime = 0;
  }
}
