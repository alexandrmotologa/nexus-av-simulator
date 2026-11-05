import { Vector2D } from '../math/Vector2D';

export type TrafficLightPhase = 'RED' | 'YELLOW' | 'GREEN' | 'ALL_RED';

export interface V2ISignalingPacket {
  id: string;
  phase: TrafficLightPhase;
  remainingTime: number; // seconds
  stopLineS: number; // longitudinal track position
  distanceToStopLine: number; // meters from querying vehicle
  recommendedSpeed: number | null; // km/h green wave advisory
}

export class TrafficLight {
  public id: string;
  public s: number; // longitudinal track position of intersection
  public stopLineS: number; // position of white stop bar on asphalt
  public position: Vector2D; // Cartesian rendering coordinate
  public heading: number;

  public phase: TrafficLightPhase = 'GREEN';
  public timer: number = 0;

  // Phase duration configuration (seconds)
  public greenDuration: number = 14.0;
  public yellowDuration: number = 3.5;
  public allRedDuration: number = 1.5;
  public redDuration: number = 11.0;

  constructor(id: string, s: number, position: Vector2D, heading: number, initialPhase: TrafficLightPhase = 'GREEN') {
    this.id = id;
    this.s = s;
    this.stopLineS = Math.max(0, s - 6.0); // Stop line is 6m ahead of signal gantry
    this.position = position;
    this.heading = heading;
    this.phase = initialPhase;
    this.timer = 0;
  }

  public update(dt: number): void {
    this.timer += dt;

    if (this.phase === 'GREEN' && this.timer >= this.greenDuration) {
      this.phase = 'YELLOW';
      this.timer = 0;
    } else if (this.phase === 'YELLOW' && this.timer >= this.yellowDuration) {
      this.phase = 'ALL_RED';
      this.timer = 0;
    } else if (this.phase === 'ALL_RED' && this.timer >= this.allRedDuration) {
      this.phase = 'RED';
      this.timer = 0;
    } else if (this.phase === 'RED' && this.timer >= this.redDuration) {
      this.phase = 'GREEN';
      this.timer = 0;
    }
  }

  public getRemainingPhaseTime(): number {
    switch (this.phase) {
      case 'GREEN':
        return Math.max(0, this.greenDuration - this.timer);
      case 'YELLOW':
        return Math.max(0, this.yellowDuration - this.timer);
      case 'ALL_RED':
        return Math.max(0, this.allRedDuration - this.timer);
      case 'RED':
        return Math.max(0, this.redDuration - this.timer);
    }
  }

  /**
   * Broadcasts V2I telemetry packet to an approaching connected autonomous vehicle
   */
  public getV2ITelemetry(vehicleS: number, trackLength: number, isClosed: boolean): V2ISignalingPacket {
    let dist = this.stopLineS - vehicleS;
    if (isClosed) {
      if (dist < -trackLength * 0.5) dist += trackLength;
      if (dist > trackLength * 0.5) dist -= trackLength;
    }

    const remaining = this.getRemainingPhaseTime();
    let advisorySpeed: number | null = null;

    if (dist > 5.0 && dist < 120.0) {
      if (this.phase === 'GREEN') {
        // Can we clear before yellow?
        if (remaining > 2.0) {
          const reqSpeedMs = dist / (remaining - 1.0);
          const reqSpeedKmh = reqSpeedMs * 3.6;
          if (reqSpeedKmh >= 20 && reqSpeedKmh <= 90) {
            advisorySpeed = Math.round(reqSpeedKmh);
          }
        }
      } else if (this.phase === 'RED') {
        // Green wave arrival right when it turns green
        const timeToGreen = remaining;
        if (timeToGreen > 1.0) {
          const reqSpeedMs = dist / timeToGreen;
          const reqSpeedKmh = reqSpeedMs * 3.6;
          if (reqSpeedKmh >= 15 && reqSpeedKmh <= 75) {
            advisorySpeed = Math.round(reqSpeedKmh);
          }
        }
      }
    }

    return {
      id: this.id,
      phase: this.phase,
      remainingTime: parseFloat(remaining.toFixed(1)),
      stopLineS: this.stopLineS,
      distanceToStopLine: parseFloat(dist.toFixed(1)),
      recommendedSpeed: advisorySpeed,
    };
  }
}
