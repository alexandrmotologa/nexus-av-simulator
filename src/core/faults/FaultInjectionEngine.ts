export interface FaultConfig {
  cameraLensDirt: boolean;
  cameraSunGlare: boolean;
  lidarBlindSector: boolean; // 90-degree blind spot
  lidarGaussianNoise: number; // 0 to 3 meters sigma
  radarGhostTargets: boolean;
  steeringLagSeconds: number; // 0 to 0.3s
  brakeFadeMultiplier: number; // 1.0 = normal, 0.5 = 50% loss
}

export class FaultInjectionEngine {
  private static instance: FaultInjectionEngine;

  public config: FaultConfig = {
    cameraLensDirt: false,
    cameraSunGlare: false,
    lidarBlindSector: false,
    lidarGaussianNoise: 0.0,
    radarGhostTargets: false,
    steeringLagSeconds: 0.0,
    brakeFadeMultiplier: 1.0,
  };

  private steerBuffer: { time: number; steer: number }[] = [];

  public static getInstance(): FaultInjectionEngine {
    if (!FaultInjectionEngine.instance) {
      FaultInjectionEngine.instance = new FaultInjectionEngine();
    }
    return FaultInjectionEngine.instance;
  }

  public getActiveFaultCount(): number {
    let count = 0;
    if (this.config.cameraLensDirt) count++;
    if (this.config.cameraSunGlare) count++;
    if (this.config.lidarBlindSector) count++;
    if (this.config.lidarGaussianNoise > 0.1) count++;
    if (this.config.radarGhostTargets) count++;
    if (this.config.steeringLagSeconds > 0.01) count++;
    if (this.config.brakeFadeMultiplier < 0.95) count++;
    return count;
  }

  public resetAll(): void {
    this.config.cameraLensDirt = false;
    this.config.cameraSunGlare = false;
    this.config.lidarBlindSector = false;
    this.config.lidarGaussianNoise = 0.0;
    this.config.radarGhostTargets = false;
    this.config.steeringLagSeconds = 0.0;
    this.config.brakeFadeMultiplier = 1.0;
    this.steerBuffer = [];
  }

  /**
   * Applies optical dirt and blinding solar glare onto the Virtual Camera canvas
   */
  public applyToCamera(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // 1. Mud / Dirt Splatter
    if (this.config.cameraLensDirt) {
      ctx.save();
      ctx.fillStyle = 'rgba(78, 52, 34, 0.78)';
      // Procedural fixed dirt blobs
      ctx.beginPath();
      ctx.ellipse(width * 0.28, height * 0.42, 14, 18, 0.4, 0, Math.PI * 2);
      ctx.ellipse(width * 0.72, height * 0.65, 18, 12, -0.2, 0, Math.PI * 2);
      ctx.ellipse(width * 0.52, height * 0.35, 9, 11, 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2. High-Beam / Solar Glare
    if (this.config.cameraSunGlare) {
      ctx.save();
      const grad = ctx.createRadialGradient(
        width * 0.55,
        height * 0.38,
        4,
        width * 0.55,
        height * 0.38,
        width * 0.65
      );
      grad.addColorStop(0, 'rgba(255, 255, 240, 0.95)');
      grad.addColorStop(0.3, 'rgba(254, 240, 138, 0.65)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  /**
   * Applies blind sector occlusion and precipitation noise to LiDAR readings
   */
  public applyToLidar(readings: number[]): number[] {
    const output = [...readings];
    const N = output.length;

    // 1. Blind sector (drops front-right quadrant ~25% of rays)
    if (this.config.lidarBlindSector) {
      const startIdx = Math.floor(N * 0.05);
      const endIdx = Math.floor(N * 0.30);
      for (let i = startIdx; i <= endIdx; i++) {
        output[i] = 0; // complete beam loss / timeout
      }
    }

    // 2. Gaussian range noise
    if (this.config.lidarGaussianNoise > 0.05) {
      const sigma = this.config.lidarGaussianNoise;
      for (let i = 0; i < N; i++) {
        if (output[i] > 0) {
          const noise = (Math.random() + Math.random() - 1.0) * sigma;
          output[i] = Math.max(0.2, output[i] + noise);
        }
      }
    }

    return output;
  }

  /**
   * Applies actuator lag and thermal brake fade to driving commands
   */
  public applyToControl(
    control: { steer: number; throttle: number; brake: number },
    nowSeconds: number
  ): { steer: number; throttle: number; brake: number } {
    let effectiveBrake = control.brake * this.config.brakeFadeMultiplier;

    if (this.config.steeringLagSeconds <= 0.01) {
      return {
        steer: control.steer,
        throttle: control.throttle,
        brake: effectiveBrake,
      };
    }

    // Buffer steering inputs to simulate hydraulic/CAN-bus latency
    this.steerBuffer.push({ time: nowSeconds, steer: control.steer });
    // Keep max 2 seconds
    while (this.steerBuffer.length > 0 && nowSeconds - this.steerBuffer[0].time > 1.0) {
      this.steerBuffer.shift();
    }

    const targetTime = nowSeconds - this.config.steeringLagSeconds;
    let delayedSteer = control.steer;

    for (let i = this.steerBuffer.length - 1; i >= 0; i--) {
      if (this.steerBuffer[i].time <= targetTime) {
        delayedSteer = this.steerBuffer[i].steer;
        break;
      }
    }

    return {
      steer: delayedSteer,
      throttle: control.throttle,
      brake: effectiveBrake,
    };
  }
}
