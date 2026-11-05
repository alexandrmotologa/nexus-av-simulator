import { Vector2D } from '../math/Vector2D';

export interface HeatmapPoint {
  position: Vector2D;
  heading: number;
  longitudinalAcc: number; // m/s²
  speed: number;
  color: string;
  isBreak?: boolean;
}

export class TelemetryHeatmap {
  public points: HeatmapPoint[] = [];
  public maxPoints: number = 320;
  private minDistanceSq: number = 2.0; // Sample every ~1.4 meters

  /**
   * Adds vehicle position & acceleration data to the telemetry ribbon
   */
  public addSample(
    pos: Vector2D,
    heading: number,
    longitudinalAcc: number,
    speed: number
  ): void {
    if (speed < 0.5) return; // Skip stationary idle points

    let isBreak = false;
    if (this.points.length > 0) {
      const last = this.points[this.points.length - 1];
      const dSq = last.position.distanceSq(pos);
      if (dSq < this.minDistanceSq) {
        return;
      }
      if (dSq > 16.0) {
        // Discontinuity detected: car teleported, reset on crash, or camera switched agents
        isBreak = true;
      }
    }

    // Determine color based on acceleration / braking intensity
    let color = '#f59e0b'; // Amber: neutral cruising
    if (longitudinalAcc > 1.2) {
      color = '#10b981'; // Emerald: brisk acceleration
    } else if (longitudinalAcc < -1.2) {
      color = '#ef4444'; // Crimson: active braking
    }

    this.points.push({
      position: pos.clone(),
      heading,
      longitudinalAcc,
      speed,
      color,
      isBreak,
    });

    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }
  }

  public clear(): void {
    this.points = [];
  }
}
