import { Vector2D } from '../math/Vector2D';
import { Track } from '../world/Track';
import { RoadObstacle } from '../world/Obstacle';
import { VehicleModel } from '../physics/VehicleModel';
import { QuinticPolynomial, QuarticPolynomial } from '../math/Polynomial';

export interface FrenetTrajectory {
  t: number[];
  d: number[];
  d_d: number[];
  d_dd: number[];
  d_ddd: number[];
  s: number[];
  s_d: number[];
  s_dd: number[];
  s_ddd: number[];
  points: Vector2D[];
  yaws: number[];
  speeds: number[];
  curvatures: number[];
  cd: number; // Lateral cost
  cv: number; // Longitudinal cost
  cf: number; // Final combined cost
  isValid: boolean;
}

export class FrenetTrajectoryPlanner {
  // Cost function weights (Werling et al.)
  public kj: number = 0.1; // Jerk weight
  public kt: number = 0.15; // Time horizon weight
  public kd: number = 1.0; // Lateral deviation from target lane center weight
  public kv: number = 1.2; // Speed target deviation weight
  public klat: number = 1.0; // Total lateral weight
  public klon: number = 1.0; // Total longitudinal weight

  // Physical dynamic feasibility limits
  public maxSpeed: number = 42.0; // ~150 km/h
  public maxAccel: number = 5.5; // m/s^2
  public maxDecel: number = -8.5; // m/s^2
  public maxCurvature: number = 0.25; // 1/m

  /**
   * Plans an optimal, collision-free, comfort-maximizing trajectory in the Frenet frame
   */
  public plan(
    s0: number,
    c_speed: number,
    c_accel: number,
    c_d: number,
    c_d_d: number,
    c_d_dd: number,
    targetSpeed: number,
    track: Track,
    obstacles: RoadObstacle[],
    traffic: VehicleModel[],
    preferredTargetD?: number
  ): { best: FrenetTrajectory | null; candidates: FrenetTrajectory[] } {
    const candidateTrajectories: FrenetTrajectory[] = [];

    // Target lanes (center lateral d coordinates)
    const targetLanes: number[] = [];
    for (let l = 0; l < track.laneCount; l++) {
      targetLanes.push(track.getLaneCenterD(l));
    }

    // Time horizon candidates (seconds)
    const timeHorizons = [2.5, 3.5, 4.5];

    // Target velocity candidates (m/s)
    const targetVelocities = [
      Math.max(5.0, targetSpeed * 0.75),
      targetSpeed,
      Math.min(this.maxSpeed, targetSpeed * 1.15),
    ];

    for (const dTarget of targetLanes) {
      for (const T of timeHorizons) {
        // Lateral quintic polynomial: brings vehicle from current (d, d_d, d_dd) to (dTarget, 0, 0)
        const latQp = new QuinticPolynomial(c_d, c_d_d, c_d_dd, dTarget, 0.0, 0.0, T);

        for (const vTarget of targetVelocities) {
          // Longitudinal quartic polynomial: drives vehicle from current (s0, c_speed, c_accel) to (vTarget, 0)
          const lonQp = new QuarticPolynomial(s0, c_speed, c_accel, vTarget, 0.0, T);

          const traj: FrenetTrajectory = {
            t: [],
            d: [],
            d_d: [],
            d_dd: [],
            d_ddd: [],
            s: [],
            s_d: [],
            s_dd: [],
            s_ddd: [],
            points: [],
            yaws: [],
            speeds: [],
            curvatures: [],
            cd: 0,
            cv: 0,
            cf: 0,
            isValid: true,
          };

          const dt = 0.15;
          const numSteps = Math.floor(T / dt);

          for (let step = 0; step <= numSteps; step++) {
            const t = step * dt;
            traj.t.push(t);
            traj.d.push(latQp.calcPoint(t));
            traj.d_d.push(latQp.calcFirstDerivative(t));
            traj.d_dd.push(latQp.calcSecondDerivative(t));
            traj.d_ddd.push(latQp.calcThirdDerivative(t));

            traj.s.push(lonQp.calcPoint(t));
            traj.s_d.push(lonQp.calcFirstDerivative(t));
            traj.s_dd.push(lonQp.calcSecondDerivative(t));
            traj.s_ddd.push(lonQp.calcThirdDerivative(t));
          }

          // Evaluate costs
          const Jd = latQp.calcJerkIntegral();
          const Js = lonQp.calcJerkIntegral();

          // Square of difference from target speed
          const vDiff = vTarget - targetSpeed;
          // Square of lateral distance to target lane center
          const dDiff = dTarget - c_d;

          // Traffic discipline: heavily penalize candidate trajectories that target or cross divider lines
          let dividerStraddleCost = 0;
          for (let l = 1; l < track.laneCount; l++) {
            const dividerD = (track.totalWidth * 0.5) - l * track.laneWidth;
            if (Math.abs(dTarget - dividerD) < 0.6) {
              dividerStraddleCost += 60.0;
            }
          }

          // Preferred lane target alignment bonus/penalty
          let prefLaneCost = 0;
          if (preferredTargetD !== undefined) {
            prefLaneCost = Math.abs(dTarget - preferredTargetD) * 12.0;
          }

          traj.cd = this.kj * Jd + this.kt * T + this.kd * (dDiff * dDiff) + dividerStraddleCost + prefLaneCost;
          traj.cv = this.kj * Js + this.kt * T + this.kv * (vDiff * vDiff);
          traj.cf = this.klat * traj.cd + this.klon * traj.cv;

          // Convert to Cartesian coordinates and check physical feasibility
          this.convertToCartesianAndValidate(traj, track, obstacles, traffic);

          candidateTrajectories.push(traj);
        }
      }
    }

    // Find the trajectory with lowest cost that satisfies all physical & collision constraints
    let bestTraj: FrenetTrajectory | null = null;
    let minCost = Infinity;

    for (const traj of candidateTrajectories) {
      if (traj.isValid && traj.cf < minCost) {
        minCost = traj.cf;
        bestTraj = traj;
      }
    }

    return {
      best: bestTraj,
      candidates: candidateTrajectories,
    };
  }

  private convertToCartesianAndValidate(
    traj: FrenetTrajectory,
    track: Track,
    obstacles: RoadObstacle[],
    traffic: VehicleModel[]
  ): void {
    const halfWidth = track.totalWidth * 0.5;

    for (let i = 0; i < traj.t.length; i++) {
      const s = traj.s[i];
      const d = traj.d[i];

      // 1. Boundary check: must stay within asphalt margins
      if (Math.abs(d) >= halfWidth - 0.9) {
        traj.isValid = false;
        return;
      }

      // 2. Kinematic limits: speed and acceleration
      const speed = traj.s_d[i];
      const accel = traj.s_dd[i];

      if (speed < 0 || speed > this.maxSpeed) {
        traj.isValid = false;
        return;
      }
      if (accel < this.maxDecel || accel > this.maxAccel) {
        traj.isValid = false;
        return;
      }

      // Convert Frenet (s, d) to Cartesian (x, y, heading)
      const cartesian = track.frenet.frenetToCartesian(s, d);
      traj.points.push(cartesian.position);
      traj.yaws.push(cartesian.heading);
      traj.speeds.push(speed);

      // Curvature check
      const state = track.spline.evaluateAtDistance(s);
      const kappa = Math.abs(state.curvature);
      traj.curvatures.push(kappa);
      if (kappa > this.maxCurvature) {
        traj.isValid = false;
        return;
      }

      // 3. Collision check with static obstacles (cones & barriers)
      for (const obs of obstacles) {
        if (cartesian.position.distance(obs.position) < obs.radius + 1.6) {
          traj.isValid = false;
          return;
        }
      }

      // 4. Collision check with surrounding dynamic traffic
      // Safety bubble around other cars
      const safetyRadius = 3.6;
      for (const other of traffic) {
        if (cartesian.position.distance(other.state.position) < safetyRadius) {
          traj.isValid = false;
          return;
        }
      }
    }
  }
}
