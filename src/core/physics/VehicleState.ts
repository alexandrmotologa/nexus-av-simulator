import { Vector2D } from '../math/Vector2D';

export interface VehicleConfig {
  id: string;
  name: string;
  width: number;       // Lateral dimension (e.g. 2.0 meters)
  length: number;      // Longitudinal dimension (e.g. 4.5 meters)
  wheelbase: number;   // Distance between front & rear axles (e.g. 2.8 meters)
  maxSpeed: number;    // Maximum forward speed (e.g. 45 m/s ~ 160 km/h)
  maxReverseSpeed: number;
  maxSteerAngle: number; // In radians (e.g. 35° = 0.61 rad)
  maxSteerRate: number;  // Max delta steer angle per second (e.g. 2.0 rad/s)
  acceleration: number;  // Engine accel capability (e.g. 5.5 m/s²)
  brakeDecel: number;    // Braking capability (e.g. 9.0 m/s²)
  dragCoeff: number;     // Air/rolling resistance factor
  tireGripCoeff: number; // Lateral adhesion limit before slip/skid
  color: string;
  mass?: number;         // Vehicle curb weight (kg, default 1500)
  cgHeight?: number;     // Center of gravity height above ground (m, default 0.52)
}

export interface ControlInput {
  throttle: number; // 0.0 to 1.0
  brake: number;    // 0.0 to 1.0
  steer: number;    // -1.0 (full left) to +1.0 (full right)
}

export class VehicleState {
  public position: Vector2D = new Vector2D(0, 0);
  public velocity: Vector2D = new Vector2D(0, 0);
  public speed: number = 0; // Magnitude of longitudinal speed (m/s)
  public heading: number = 0; // Radians, 0 = facing +X
  public steerAngle: number = 0; // Front wheel angle relative to chassis
  public yawRate: number = 0; // Angular velocity (rad/s)
  public lateralAcc: number = 0; // G-force indicator (m/s²)
  public longitudinalAcc: number = 0; // Longitudinal acceleration (m/s²)
  public isDamaged: boolean = false;
  public isSkidding: boolean = false;
  public totalDistance: number = 0;
  public polygon: Vector2D[] = [];
  public isBlinkingLeft: boolean = false;
  public isBlinkingRight: boolean = false;
  public isBraking: boolean = false;
  public blinkTimer: number = 0;
  public tireTemp: number = 30.0;
  public tireStatus: 'COLD' | 'OPTIMAL' | 'OVERHEATED' = 'COLD';
  public frontAxleLoad: number = 7650; // Newtons (~52% of 1500kg * 9.81)
  public rearAxleLoad: number = 7065;  // Newtons (~48% of 1500kg * 9.81)
  public frontSlipAngle: number = 0;   // Radians (Pacejka alpha_f)
  public rearSlipAngle: number = 0;    // Radians (Pacejka alpha_r)

  constructor(initialPos: Vector2D, initialHeading: number = 0) {
    this.position = initialPos.clone();
    this.heading = initialHeading;
  }
}
