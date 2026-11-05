import { Vector2D } from '../math/Vector2D';
import { SimulationTelemetry } from '../engine/Simulation';

export interface AVBridgeTelemetryPacket {
  header: {
    seq: number;
    timestamp: number;
    frameId: string;
  };
  pose: {
    x: number;
    y: number;
    heading: number;
    speedKmh: number;
  };
  dynamics: {
    lateralG: number;
    longitudinalG: number;
    steerAngleDeg: number;
    isSkidding: boolean;
  };
  v2x?: {
    phase: string;
    remainingSeconds: number;
    advisorySpeedKmh: number | null;
  };
  perception: {
    obstacleCount: number;
    laneOffsetPercent: number;
  };
}

export class TelemetryBridge {
  private static instance: TelemetryBridge;
  private socket: WebSocket | null = null;
  private seq: number = 0;
  public isConnected: boolean = false;
  public endpointUrl: string = 'ws://localhost:9090';

  public static getInstance(): TelemetryBridge {
    if (!TelemetryBridge.instance) {
      TelemetryBridge.instance = new TelemetryBridge();
    }
    return TelemetryBridge.instance;
  }

  public connect(url: string = this.endpointUrl): void {
    this.endpointUrl = url;
    try {
      this.socket = new WebSocket(url);
      this.socket.onopen = () => {
        this.isConnected = true;
        console.log(`[TelemetryBridge] Connected to ROS2/AV bridge at ${url}`);
      };
      this.socket.onclose = () => {
        this.isConnected = false;
      };
      this.socket.onerror = () => {
        this.isConnected = false;
      };
    } catch {
      this.isConnected = false;
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
  }

  /**
   * Broadcasts real-time AV telemetry packet over WebSocket stream
   */
  public broadcast(telemetry: SimulationTelemetry, egoPos: Vector2D, egoHeading: number): void {
    this.seq++;

    const packet: AVBridgeTelemetryPacket = {
      header: {
        seq: this.seq,
        timestamp: Date.now(),
        frameId: 'ego_vehicle',
      },
      pose: {
        x: parseFloat(egoPos.x.toFixed(2)),
        y: parseFloat(egoPos.y.toFixed(2)),
        heading: parseFloat(egoHeading.toFixed(3)),
        speedKmh: telemetry.currentBestSpeed,
      },
      dynamics: {
        lateralG: telemetry.lateralG,
        longitudinalG: telemetry.longitudinalG,
        steerAngleDeg: telemetry.steerAngleDeg,
        isSkidding: telemetry.isSkidding,
      },
      v2x: telemetry.v2iPacket
        ? {
            phase: telemetry.v2iPacket.phase,
            remainingSeconds: telemetry.v2iPacket.remainingTime,
            advisorySpeedKmh: telemetry.v2iPacket.recommendedSpeed,
          }
        : undefined,
      perception: {
        obstacleCount: telemetry.obstacleCount,
        laneOffsetPercent: Math.round((telemetry.visionResult?.centerOffset || 0) * 100),
      },
    };

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(packet));
    }
  }
}
