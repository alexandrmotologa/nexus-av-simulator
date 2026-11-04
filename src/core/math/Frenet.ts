import { Vector2D } from './Vector2D';
import { CatmullRomSpline, SplinePoint } from './Spline';

export interface FrenetState {
  s: number;    // Longitudinal distance along track centerline
  d: number;    // Lateral offset from centerline (positive = left, negative = right)
  s_d: number;  // Longitudinal velocity
  d_d: number;  // Lateral velocity
}

export class FrenetConverter {
  constructor(private referencePath: CatmullRomSpline) {}

  setReferencePath(path: CatmullRomSpline): void {
    this.referencePath = path;
  }

  /** Converts Cartesian state (x, y, heading, speed) to Frenet state (s, d, s_d, d_d) */
  cartesianToFrenet(pos: Vector2D, heading: number, speed: number): FrenetState {
    const closest = this.referencePath.findClosestPoint(pos);
    const splineState = this.referencePath.evaluateAtDistance(closest.s);

    const velocityVec = Vector2D.fromAngle(heading, speed);
    const s_d = velocityVec.dot(splineState.tangent);
    const d_d = velocityVec.dot(splineState.normal);

    return {
      s: closest.s,
      d: closest.d,
      s_d,
      d_d,
    };
  }

  /** Converts Frenet position (s, d) to Cartesian (x, y) */
  frenetToCartesian(s: number, d: number): { position: Vector2D; tangent: Vector2D; normal: Vector2D; heading: number } {
    const splineState = this.referencePath.evaluateAtDistance(s);
    const cartesianPos = splineState.position.add(splineState.normal.scale(d));
    const heading = Math.atan2(splineState.tangent.y, splineState.tangent.x);

    return {
      position: cartesianPos,
      tangent: splineState.tangent,
      normal: splineState.normal,
      heading,
    };
  }
}
