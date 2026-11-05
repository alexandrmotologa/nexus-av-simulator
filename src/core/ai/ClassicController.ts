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

    // 2. Lateral Control: Curvature-Compensated Stanley Path Tracking (No Corner-Cutting)
    const laneStart = track.isBidirectional ? track.oncomingLaneCount : 0;
    const forwardLanes = Math.max(1, track.laneCount - laneStart);
    const targetLane = Math.max(laneStart, Math.min(track.laneCount - 1, this.config.targetLaneIndex));
    const targetD = track.getLaneCenterD(targetLane);

    const roadState = track.spline.evaluateAtDistance(frenet.s);
    const roadHeading = Math.atan2(roadState.tangent.y, roadState.tangent.x);
    let headingError = ego.state.heading - roadHeading;
    while (headingError > Math.PI) headingError -= 2 * Math.PI;
    while (headingError < -Math.PI) headingError += 2 * Math.PI;

    // Curvature feedforward: follows curve without cutting inner chord
    const curveFeedforward = Math.atan(roadState.curvature * ego.config.wheelbase);

    // Cross-track error (+d is along normal, pointing to vehicle's right side)
    const lateralOffset = frenet.d - targetD;
    const crossTrackSteer = -Math.atan((0.95 * lateralOffset) / Math.max(1.5, ego.state.speed * 0.85 + 1.2));
    const headingCorrection = -0.85 * headingError;

    // Turn signal discipline: activate blinkers ONLY when executing a lane change between different lanes
    const currentPhysicalLane = track.getLaneIndex(frenet.d);
    if (targetLane > currentPhysicalLane) {
      ego.state.isBlinkingRight = true;
      ego.state.isBlinkingLeft = false;
    } else if (targetLane < currentPhysicalLane) {
      ego.state.isBlinkingLeft = true;
      ego.state.isBlinkingRight = false;
    } else {
      // Vehicle is inside its target lane: NEVER blink for following curves or lane centering
      ego.state.isBlinkingLeft = false;
      ego.state.isBlinkingRight = false;
    }

    // Physical boundary clamp: leftmost lane never signals left, rightmost never signals right
    if (currentPhysicalLane === 0) {
      ego.state.isBlinkingLeft = false;
    }
    if (currentPhysicalLane === track.laneCount - 1) {
      ego.state.isBlinkingRight = false;
    }

    const totalSteerAngle = curveFeedforward + crossTrackSteer + headingCorrection;
    const steer = Math.max(-1.0, Math.min(1.0, totalSteerAngle / ego.config.maxSteerAngle));

    return { throttle, brake, steer };
  }
}
