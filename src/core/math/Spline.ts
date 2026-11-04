import { Vector2D } from './Vector2D';

export interface SplinePoint {
  position: Vector2D;
  tangent: Vector2D;
  normal: Vector2D;
  curvature: number;
  distance: number;
}

export class CatmullRomSpline {
  private waypoints: Vector2D[] = [];
  private closed: boolean = false;
  private arcLengthSamples: { s: number; t: number; point: Vector2D }[] = [];
  public totalLength: number = 0;

  constructor(waypoints: Vector2D[], closed: boolean = true) {
    this.waypoints = waypoints;
    this.closed = closed;
    this.recalculate();
  }

  setWaypoints(waypoints: Vector2D[]): void {
    this.waypoints = waypoints;
    this.recalculate();
  }

  getWaypoints(): Vector2D[] {
    return this.waypoints;
  }

  isClosed(): boolean {
    return this.closed;
  }

  private recalculate(): void {
    if (this.waypoints.length < 3) {
      this.totalLength = 0;
      this.arcLengthSamples = [];
      return;
    }

    const samplesPerSegment = 20;
    const n = this.closed ? this.waypoints.length : this.waypoints.length - 1;
    this.arcLengthSamples = [];
    this.totalLength = 0;

    let prevPoint = this.getPointRaw(0);
    this.arcLengthSamples.push({ s: 0, t: 0, point: prevPoint });

    const totalSteps = n * samplesPerSegment;
    for (let i = 1; i <= totalSteps; i++) {
      const t = (i / totalSteps) * n;
      const currPoint = this.getPointRaw(t);
      const ds = prevPoint.distance(currPoint);
      this.totalLength += ds;
      this.arcLengthSamples.push({ s: this.totalLength, t, point: currPoint });
      prevPoint = currPoint;
    }
  }

  /** Gets raw position for parameter t [0, N] */
  private getPointRaw(t: number): Vector2D {
    const n = this.waypoints.length;
    if (n === 0) return new Vector2D(0, 0);
    if (n === 1) return this.waypoints[0].clone();

    let p0: Vector2D, p1: Vector2D, p2: Vector2D, p3: Vector2D;

    if (this.closed) {
      const rawIdx = Math.floor(t);
      const idx = ((rawIdx % n) + n) % n;
      const segT = t - rawIdx;
      p1 = this.waypoints[idx];
      p2 = this.waypoints[(idx + 1) % n];
      p0 = this.waypoints[(idx - 1 + n) % n];
      p3 = this.waypoints[(idx + 2) % n];
      return this.catmullRomInterpolate(p0, p1, p2, p3, segT);
    } else {
      const clampedT = Math.max(0, Math.min(n - 1.0001, t));
      const idx = Math.floor(clampedT);
      const segT = clampedT - idx;
      p1 = this.waypoints[idx];
      p2 = this.waypoints[Math.min(idx + 1, n - 1)];
      p0 = this.waypoints[Math.max(idx - 1, 0)];
      p3 = this.waypoints[Math.min(idx + 2, n - 1)];
      return this.catmullRomInterpolate(p0, p1, p2, p3, segT);
    }
  }

  private catmullRomInterpolate(
    p0: Vector2D,
    p1: Vector2D,
    p2: Vector2D,
    p3: Vector2D,
    t: number
  ): Vector2D {
    const t2 = t * t;
    const t3 = t2 * t;

    const x =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

    return new Vector2D(x, y);
  }

  /** Converts arc-length distance s into spline parameter t */
  public getTFromDistance(s: number): number {
    if (this.arcLengthSamples.length === 0) return 0;
    if (this.totalLength === 0) return 0;

    let targetS = s;
    if (this.closed) {
      targetS = ((s % this.totalLength) + this.totalLength) % this.totalLength;
    } else {
      targetS = Math.max(0, Math.min(this.totalLength, s));
    }

    // Binary search in sampled arc-lengths
    let low = 0;
    let high = this.arcLengthSamples.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.arcLengthSamples[mid].s < targetS) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const idx = Math.max(0, Math.min(this.arcLengthSamples.length - 2, low - 1));
    const s0 = this.arcLengthSamples[idx].s;
    const s1 = this.arcLengthSamples[idx + 1].s;
    const t0 = this.arcLengthSamples[idx].t;
    const t1 = this.arcLengthSamples[idx + 1].t;

    const factor = s1 > s0 ? (targetS - s0) / (s1 - s0) : 0;
    return t0 + (t1 - t0) * factor;
  }

  /**
   * Evaluates complete spline state at arc-length s:
   * position, unit tangent, unit normal, curvature.
   */
  public evaluateAtDistance(s: number): SplinePoint {
    const t = this.getTFromDistance(s);
    const eps = 0.002;
    const pPrev = this.getPointRaw(t - eps);
    const pCurr = this.getPointRaw(t);
    const pNext = this.getPointRaw(t + eps);

    const tangent = pNext.sub(pPrev).normalize();
    const normal = new Vector2D(-tangent.y, tangent.x);

    // Curvature approximation: d(tangent_angle) / ds
    const anglePrev = Math.atan2(pCurr.y - pPrev.y, pCurr.x - pPrev.x);
    const angleNext = Math.atan2(pNext.y - pCurr.y, pNext.x - pCurr.x);
    let dTheta = angleNext - anglePrev;
    while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    while (dTheta < -Math.PI) dTheta += 2 * Math.PI;

    const dsApprox = pNext.distance(pPrev);
    const curvature = dsApprox > 1e-6 ? dTheta / dsApprox : 0;

    return {
      position: pCurr,
      tangent,
      normal,
      curvature,
      distance: s,
    };
  }

  /** Finds nearest arc-length s and lateral distance d to a given point (x, y) */
  public findClosestPoint(pt: Vector2D): { s: number; d: number; point: Vector2D } {
    let closestDistSq = Infinity;
    let closestSampleIdx = 0;

    for (let i = 0; i < this.arcLengthSamples.length; i++) {
      const dSq = this.arcLengthSamples[i].point.distanceSq(pt);
      if (dSq < closestDistSq) {
        closestDistSq = dSq;
        closestSampleIdx = i;
      }
    }

    const baseS = this.arcLengthSamples[closestSampleIdx].s;
    let bestS = baseS;
    let bestDistSq = closestDistSq;

    // Local refinement search around the closest sample
    const searchWindow = 20; // units along s
    const step = 0.5;
    for (let ds = -searchWindow; ds <= searchWindow; ds += step) {
      const testS = baseS + ds;
      const evalPt = this.evaluateAtDistance(testS);
      const dSq = evalPt.position.distanceSq(pt);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestS = testS;
      }
    }

    const match = this.evaluateAtDistance(bestS);
    const offset = pt.sub(match.position);
    // Lateral distance d: positive if to the left of tangent, negative if to the right
    const lateralD = offset.dot(match.normal);

    return {
      s: match.distance,
      d: lateralD,
      point: match.position,
    };
  }
}
