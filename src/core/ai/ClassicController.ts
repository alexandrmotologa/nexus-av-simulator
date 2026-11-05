import { ControlInput } from '../physics/VehicleState';
import { VehicleModel } from '../physics/VehicleModel';
import { Track } from '../world/Track';
import { RadarSensor } from '../sensors/RadarSensor';
import { IntelligentDriverModel } from '../traffic/IDM';

export interface ClassicControllerConfig {
  targetSpeed: number;     // Desired cruising speed (m/s)
  lookaheadRatio: number;  // Lookahead distance per m/s speed (e.g. 0.85s)
  minLookahead: number;    // Minimum lookahead distance (m)
  targetLaneIndex: number; // Target lane to follow (0 to laneCount - 1)
}

export class ClassicController {
  public config: ClassicControllerConfig;
  private idm: IntelligentDriverModel;

  constructor(config: Partial<ClassicControllerConfig> = {}) {
    this.config = {
      targetSpeed: 30.0, // ~108 km/h
      lookaheadRatio: 0.9,
      minLookahead: 8.0,
      targetLaneIndex: 1, // Middle lane by default
      ...config,
    };
    this.idm = new IntelligentDriverModel({
      desiredSpeed: this.config.targetSpeed,
      timeHeadway: 1.5,
      minGap: 3.5,
      maxAcceleration: 4.0,
      comfortableDecel: 3.5,
    });
  }

  /**
   * Generates steering and longitudinal control inputs for ego vehicle.
   */
  public compute(
    ego: VehicleModel,
    track: Track,
    radar: RadarSensor
  ): ControlInput {
    if (ego.state.isDamaged) {
      return { throttle: 0, brake: 1, steer: 0 };
    }

    const frenet = track.frenet.cartesianToFrenet(
      ego.state.position,
      ego.state.heading,
      ego.state.speed
    );

    // 1. Longitudinal Control (ACC + Legal Speed Limit + Curvature Safety Adaptation)
    const legalLimitKmh = track.getSpeedLimitAtDistance(frenet.s);
    const legalLimitMps = legalLimitKmh / 3.6;

    // Anticipate upcoming curve and calculate maximum lateral adhesion entry speed: v = sqrt(a_lat / curvature)
    const aheadState = track.spline.evaluateAtDistance(frenet.s + 20.0);
    const curvAhead = Math.abs(aheadState.curvature);
    const curveSafeSpeed = curvAhead > 0.0035
      ? Math.sqrt((7.5 * 0.85) / curvAhead)
      : legalLimitMps;

    const dynamicTargetSpeed = Math.min(this.config.targetSpeed, legalLimitMps, curveSafeSpeed);
    this.idm.params.desiredSpeed = dynamicTargetSpeed;

    let leaderDistance = Infinity;
    let leaderSpeed = 0;

    if (radar.target && radar.target.distance > 0) {
      leaderDistance = radar.target.distance;
      leaderSpeed = ego.state.speed + radar.target.relativeSpeed;
    }

    // Safety AEB (Autonomous Emergency Braking) check
    if (leaderDistance < 6.0 && ego.state.speed > 5.0) {
      return { throttle: 0, brake: 1.0, steer: 0 };
    }

    const accel = this.idm.calculateAcceleration(ego.state.speed, leaderDistance, leaderSpeed);
    let throttle = 0;
    let brake = 0;

    if (accel >= 0) {
      throttle = Math.min(1.0, accel / ego.config.acceleration);
    } else {
      brake = Math.min(1.0, Math.abs(accel) / ego.config.brakeDecel);
    }

    // 2. Lateral Control: Pure Pursuit Path Tracking
    const lookahead = Math.max(
      this.config.minLookahead,
      ego.state.speed * this.config.lookaheadRatio
    );
    const targetS = frenet.s + lookahead;
    const targetD = track.getLaneCenterD(this.config.targetLaneIndex);

    const goalCartesian = track.frenet.frenetToCartesian(targetS, targetD);
    const toGoal = goalCartesian.position.sub(ego.state.position);

    // Angle from car heading to target waypoint
    const targetAngle = toGoal.angle();
    let alpha = targetAngle - ego.state.heading;
    while (alpha > Math.PI) alpha -= 2 * Math.PI;
    while (alpha < -Math.PI) alpha += 2 * Math.PI;

    // Pure Pursuit curvature: 2 * sin(alpha) / Ld
    const Ld = toGoal.magnitude();
    const curvature = Ld > 1e-3 ? (2 * Math.sin(alpha)) / Ld : 0;
    const steerAngle = Math.atan(curvature * ego.config.wheelbase);

    // Normalize to [-1, 1] relative to vehicle's max steering angle
    const steer = Math.max(-1.0, Math.min(1.0, steerAngle / ego.config.maxSteerAngle));

    return { throttle, brake, steer };
  }
}
