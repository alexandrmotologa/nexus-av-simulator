import { Vector2D } from '../math/Vector2D';

export interface BlackBoxFrame {
  timestamp: number;
  timeSec: number; // Offset from incident (e.g. -3.8s down to 0.0s impact)
  position: { x: number; y: number };
  heading: number;
  speedKmH: number;
  steerAngleDeg: number;
  lateralG: number;
  longitudinalG: number;
  throttle: number;
  brake: number;
  isDamaged: boolean;
  incidentReason?: string;
  closestDistance: number;
  closingSpeed: number;
}

export interface IncidentReport {
  id: string;
  timestamp: number;
  impactSpeedKmH: number;
  maxDecelG: number;
  rootCause: string;
  frames: BlackBoxFrame[];
}

export class BlackBoxRecorder {
  private static instance: BlackBoxRecorder | null = null;
  private buffer: BlackBoxFrame[] = [];
  private maxFrames: number = 240; // 4.0 seconds rolling buffer at 60 FPS
  public activeIncident: IncidentReport | null = null;
  private lastTriggerTime: number = 0;

  public static getInstance(): BlackBoxRecorder {
    if (!BlackBoxRecorder.instance) {
      BlackBoxRecorder.instance = new BlackBoxRecorder();
    }
    return BlackBoxRecorder.instance;
  }

  public recordFrame(frame: Omit<BlackBoxFrame, 'timeSec'>): void {
    const f: BlackBoxFrame = { ...frame, timeSec: 0 };
    this.buffer.push(f);
    if (this.buffer.length > this.maxFrames) {
      this.buffer.shift();
    }
  }

  public triggerIncident(rootCause: string): IncidentReport | null {
    const now = performance.now();
    // Debounce triggers: at least 4 seconds between incident logs
    if (now - this.lastTriggerTime < 4000) return null;
    this.lastTriggerTime = now;

    const framesCount = this.buffer.length;
    if (framesCount < 10) return null;

    const frames: BlackBoxFrame[] = this.buffer.map((f, i) => {
      const timeSec = (i - (framesCount - 1)) / 60;
      return { ...f, timeSec: parseFloat(timeSec.toFixed(2)) };
    });

    const impactFrame = frames[frames.length - 1];
    let maxG = 0;
    for (const f of frames) {
      const g = Math.hypot(f.lateralG, f.longitudinalG);
      if (g > maxG) maxG = g;
    }

    this.activeIncident = {
      id: `incident-${Date.now()}`,
      timestamp: now,
      impactSpeedKmH: impactFrame ? impactFrame.speedKmH : 0,
      maxDecelG: parseFloat(maxG.toFixed(2)),
      rootCause,
      frames,
    };

    return this.activeIncident;
  }

  public clear(): void {
    this.activeIncident = null;
  }
}
