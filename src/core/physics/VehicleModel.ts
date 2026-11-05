import { Vector2D } from '../math/Vector2D';
import { VehicleConfig, VehicleState, ControlInput } from './VehicleState';
import { Track } from '../world/Track';
import { TireThermalModel } from './TireThermalModel';
import { PacejkaTireModel } from './PacejkaTireModel';

export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
  id: 'ego-sedan',
  name: 'Nexus Alpha',
  width: 2.1,
  length: 4.6,
  wheelbase: 2.8,
  maxSpeed: 42.0, // ~150 km/h
  maxReverseSpeed: 10.0, // Full reverse gear capability (~36 km/h)
  maxSteerAngle: 0.58, // ~33 degrees
  maxSteerRate: 3.5, // rad/s
  acceleration: 6.0, // m/s²
  brakeDecel: 9.5, // m/s²
  dragCoeff: 0.04,
  tireGripCoeff: 8.5, // m/s² max lateral grip (~0.87 G)
  color: '#3b82f6',
  mass: 1500, // kg
  cgHeight: 0.52, // m
};

export class VehicleModel {
  public state: VehicleState;
  public config: VehicleConfig;
  public tireThermals: TireThermalModel = new TireThermalModel();
  public pacejka: PacejkaTireModel = new PacejkaTireModel();

  constructor(
    config: Partial<VehicleConfig> = {},
    initialPos: Vector2D = new Vector2D(0, 0),
    initialHeading: number = 0
  ) {
    this.config = { ...DEFAULT_VEHICLE_CONFIG, ...config };
    this.state = new VehicleState(initialPos, initialHeading);
    this.updatePolygon();
  }

  /**
   * Updates vehicle state based on physical inputs over timestep dt (in seconds).
   */
  public step(input: ControlInput, dt: number): void {
    if (this.state.isDamaged) {
      // Rapidly decelerate to dead stop when crashed
      this.state.speed *= Math.max(0, 1 - 6 * dt);
      this.state.velocity = this.state.velocity.scale(Math.max(0, 1 - 6 * dt));
      this.updatePolygon();
      return;
    }

    // 1. Steering angle transition (rate-limited)
    const targetSteer = Math.max(-1, Math.min(1, input.steer)) * this.config.maxSteerAngle;
    const maxSteerDelta = this.config.maxSteerRate * dt;
    const steerDiff = targetSteer - this.state.steerAngle;

    if (Math.abs(steerDiff) <= maxSteerDelta) {
      this.state.steerAngle = targetSteer;
    } else {
      this.state.steerAngle += Math.sign(steerDiff) * maxSteerDelta;
    }

    // 2. Longitudinal acceleration & braking (with seamless Reverse Gear)
    const throttle = Math.max(0, Math.min(1, input.throttle));
    const brake = Math.max(0, Math.min(1, input.brake));
    const dragForce = Math.sign(this.state.speed) * Math.abs(this.state.speed) * this.config.dragCoeff;

    this.state.isBraking = brake > 0.08;
    this.state.blinkTimer += dt;

    let netAccel = 0;

    if (this.state.speed >= 0.2) {
      // Forward motion: throttle accelerates forward, brake decelerates
      const accelForce = throttle * this.config.acceleration;
      const decelForce = brake * this.config.brakeDecel;
      netAccel = accelForce - decelForce - dragForce;
    } else if (this.state.speed <= -0.2) {
      // Reverse motion: brake acts as reverse accelerator, throttle acts as brake
      const revAccel = brake * this.config.acceleration * 0.7; // brisk reverse acceleration
      const forwardBrake = throttle * this.config.brakeDecel;
      netAccel = -revAccel + forwardBrake - dragForce;
    } else {
      // Transition zone near zero speed (-0.2 <= speed <= 0.2)
      if (throttle > 0 && brake === 0) {
        netAccel = throttle * this.config.acceleration;
      } else if (brake > 0 && throttle === 0) {
        // Pressing S / brake at standstill engages reverse gear!
        netAccel = -brake * this.config.acceleration * 0.7;
      } else {
        // Friction stop
        this.state.speed = 0;
        netAccel = 0;
      }
    }

    // Integrate speed within forward and reverse bounds
    this.state.speed += netAccel * dt;
    this.state.longitudinalAcc = netAccel;
    this.state.speed = Math.max(-this.config.maxReverseSpeed, Math.min(this.config.maxSpeed, this.state.speed));

    // 3. Dynamic Weight Transfer & Pacejka Single-Track Kinetics
    const L = this.config.wheelbase;
    const m = this.config.mass || 1500;
    const h = this.config.cgHeight || 0.52;
    const lf = L * 0.48; // Front axle to CG
    const lr = L * 0.52; // Rear axle to CG

    // Longitudinal load transfer (Newtons)
    const deltaFz = (m * netAccel * h) / L;
    const Fzf = Math.max(800, (m * 9.81 * (lr / L)) - deltaFz);
    const Fzr = Math.max(800, (m * 9.81 * (lf / L)) + deltaFz);
    this.state.frontAxleLoad = Math.round(Fzf);
    this.state.rearAxleLoad = Math.round(Fzr);

    // Kinematic Body Slip Angle beta
    const tanSteer = Math.tan(this.state.steerAngle);
    const beta = Math.atan((lr / L) * tanSteer);

    // Front & Rear Tire Slip Angles (alpha_f and alpha_r)
    const alphaF = this.state.steerAngle - beta;
    const alphaR = -beta;
    this.state.frontSlipAngle = parseFloat(alphaF.toFixed(3));
    this.state.rearSlipAngle = parseFloat(alphaR.toFixed(3));

    // Dynamic Pacejka Lateral Forces
    const thermalMultiplier = this.tireThermals.getGripMultiplier();
    const Fyf = this.pacejka.calculateLateralForce(alphaF, Fzf, thermalMultiplier);
    const Fyr = this.pacejka.calculateLateralForce(alphaR, Fzr, thermalMultiplier);

    // Yaw rate (angular velocity) with dynamic tire force response
    if (Math.abs(this.state.speed) > 0.01) {
      const kinematicYaw = (this.state.speed / L) * Math.cos(beta) * tanSteer;
      // Slight oversteer/understeer yaw torque contribution from Pacejka axle imbalance
      const torqueImbalance = (lf * Fyf * Math.cos(this.state.steerAngle) - lr * Fyr) / (m * lf * lr);
      const dynamicYawFactor = Math.abs(this.state.speed) > 5.0 ? 0.06 : 0.0;
      this.state.yawRate = kinematicYaw + torqueImbalance * dynamicYawFactor;
    } else {
      this.state.yawRate = 0;
    }

    // Integrate heading
    this.state.heading += this.state.yawRate * dt;
    while (this.state.heading > Math.PI) this.state.heading -= 2 * Math.PI;
    while (this.state.heading < -Math.PI) this.state.heading += 2 * Math.PI;

    // Movement direction vector
    const movementHeading = this.state.heading + beta;
    const dx = Math.cos(movementHeading) * this.state.speed * dt;
    const dy = Math.sin(movementHeading) * this.state.speed * dt;

    this.state.position.x += dx;
    this.state.position.y += dy;
    this.state.velocity.set(dx / dt, dy / dt);

    // 4. Lateral G-force & thermodynamic tire grip check
    this.state.lateralAcc = Math.abs(this.state.speed * this.state.yawRate);
    const lateralG = this.state.lateralAcc / 9.81;
    this.tireThermals.update(dt, this.state.speed, this.state.isSkidding, this.state.isBraking, lateralG);
    this.state.tireTemp = parseFloat(this.tireThermals.temperature.toFixed(1));
    this.state.tireStatus = this.tireThermals.getStatus();

    const dynamicGrip = this.config.tireGripCoeff * thermalMultiplier;
    // Authentic physical tire grip saturation:
    // Skidding occurs only when lateral acceleration demand severely exceeds maximum tire grip limit (> 1.25x dynamic grip)
    // AND rear slip angle saturates violently (> 26 degrees / 0.45 rad), or during an acute vehicle spinout
    const isGripExceeded = this.state.lateralAcc > dynamicGrip * 1.25;
    const isSlipSaturated = Math.abs(alphaR) > 0.45;
    const isSpinout = Math.abs(this.state.yawRate) > 3.0 && Math.abs(this.state.speed) > 3.0;
    this.state.isSkidding = (isGripExceeded && isSlipSaturated) || isSpinout;

    // 5. Update boundary polygon for collisions and rendering
    this.updatePolygon();
  }

  /**
   * Enforces hard track boundaries (guardrails/barriers):
   * Vehicles cannot phase through outer road walls; they impact, absorb energy, and bounce back.
   */
  public enforceTrackBoundary(track: Track): boolean {
    const frenet = track.frenet.cartesianToFrenet(
      this.state.position,
      this.state.heading,
      this.state.speed
    );

    const halfRoadWidth = track.totalWidth * 0.5;
    const halfCarWidth = this.config.width * 0.5;
    const maxAllowedD = halfRoadWidth - halfCarWidth;

    if (Math.abs(frenet.d) > maxAllowedD) {
      // Barrier collision!
      this.state.isDamaged = true;

      // Clamp position to stay inside track barrier
      const clampedD = Math.sign(frenet.d) * maxAllowedD;
      const resolved = track.frenet.frenetToCartesian(frenet.s, clampedD);
      this.state.position = resolved.position;

      // Inelastic collision with barrier: absorb 85% of speed
      this.state.speed *= 0.15;
      this.updatePolygon();
      return true;
    }

    return false;
  }

  public updatePolygon(): void {
    const halfL = this.config.length * 0.5;
    const halfW = this.config.width * 0.5;
    const cos = Math.cos(this.state.heading);
    const sin = Math.sin(this.state.heading);

    const localPoints = [
      new Vector2D(halfL, halfW),   // Front Left
      new Vector2D(halfL, -halfW),  // Front Right
      new Vector2D(-halfL, -halfW), // Rear Right
      new Vector2D(-halfL, halfW),  // Rear Left
    ];

    this.state.polygon = localPoints.map((pt) => {
      return new Vector2D(
        this.state.position.x + (pt.x * cos - pt.y * sin),
        this.state.position.y + (pt.x * sin + pt.y * cos)
      );
    });
  }

  public reset(pos: Vector2D, heading: number = 0): void {
    this.state.position = pos.clone();
    this.state.heading = heading;
    this.state.speed = 0;
    this.state.velocity.set(0, 0);
    this.state.steerAngle = 0;
    this.state.yawRate = 0;
    this.state.lateralAcc = 0;
    this.state.isDamaged = false;
    this.state.isSkidding = false;
    this.state.totalDistance = 0;
    this.tireThermals.reset();
    this.state.tireTemp = this.tireThermals.temperature;
    this.state.tireStatus = this.tireThermals.getStatus();
    this.updatePolygon();
  }
}
