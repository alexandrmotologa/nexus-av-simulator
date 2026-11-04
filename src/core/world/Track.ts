import { Vector2D } from '../math/Vector2D';
import { CatmullRomSpline } from '../math/Spline';
import { FrenetConverter } from '../math/Frenet';

export interface LaneInfo {
  index: number;
  offsetD: number; // Lateral offset from centerline (m)
  width: number;
}

export class Track {
  public id: string;
  public name: string;
  public spline: CatmullRomSpline;
  public frenet: FrenetConverter;
  public laneCount: number;
  public laneWidth: number;
  public totalWidth: number;
  public closed: boolean;

  // Cached geometry boundaries for raycasting and collision
  public leftBoundary: Vector2D[] = [];
  public rightBoundary: Vector2D[] = [];
  public laneDividers: Vector2D[][] = [];
  public samplePoints: Vector2D[] = [];

  public get centerLine(): Vector2D[] {
    return this.samplePoints.length > 0 ? this.samplePoints : this.spline.getWaypoints();
  }

  constructor(
    id: string,
    name: string,
    waypoints: Vector2D[],
    laneCount: number = 3,
    laneWidth: number = 3.8,
    closed: boolean = true
  ) {
    this.id = id;
    this.name = name;
    this.laneCount = laneCount;
    this.laneWidth = laneWidth;
    this.totalWidth = laneCount * laneWidth;
    this.closed = closed;
    this.spline = new CatmullRomSpline(waypoints, closed);
    this.frenet = new FrenetConverter(this.spline);
    this.generateBoundaries();
  }

  public updateWaypoints(waypoints: Vector2D[]): void {
    this.spline.setWaypoints(waypoints);
    this.frenet.setReferencePath(this.spline);
    this.generateBoundaries();
  }

  private generateBoundaries(): void {
    const step = 2.0; // Distance step (m) for boundary polygon discretization
    const length = this.spline.totalLength;
    if (length === 0) return;

    this.leftBoundary = [];
    this.rightBoundary = [];
    this.laneDividers = [];
    this.samplePoints = [];

    for (let l = 1; l < this.laneCount; l++) {
      this.laneDividers.push([]);
    }

    const halfTotalWidth = this.totalWidth * 0.5;
    const numSteps = Math.ceil(length / step);

    for (let i = 0; i <= numSteps; i++) {
      const s = (i / numSteps) * length;
      const state = this.spline.evaluateAtDistance(s);
      this.samplePoints.push(state.position);

      // Left boundary (positive normal)
      const leftPt = state.position.add(state.normal.scale(halfTotalWidth));
      this.leftBoundary.push(leftPt);

      // Right boundary (negative normal)
      const rightPt = state.position.add(state.normal.scale(-halfTotalWidth));
      this.rightBoundary.push(rightPt);

      // Lane dividers
      for (let l = 1; l < this.laneCount; l++) {
        const laneOffsetD = halfTotalWidth - l * this.laneWidth;
        const dividerPt = state.position.add(state.normal.scale(laneOffsetD));
        this.laneDividers[l - 1].push(dividerPt);
      }
    }
  }

  /** Gets the lateral d coordinate for the center of a given lane index (0 to laneCount-1) */
  public getLaneCenterD(laneIndex: number): number {
    const halfWidth = this.totalWidth * 0.5;
    // Lane 0 is leftmost, Lane (N-1) is rightmost
    return halfWidth - (laneIndex + 0.5) * this.laneWidth;
  }

  /** Gets lane index from lateral offset d */
  public getLaneIndex(d: number): number {
    const halfWidth = this.totalWidth * 0.5;
    const distFromLeft = halfWidth - d;
    const index = Math.floor(distFromLeft / this.laneWidth);
    return Math.max(0, Math.min(this.laneCount - 1, index));
  }

  /** Checks if a point is within road margins */
  public isPointOnRoad(pos: Vector2D): boolean {
    const closest = this.spline.findClosestPoint(pos);
    const halfWidth = this.totalWidth * 0.5;
    return Math.abs(closest.d) <= halfWidth;
  }
}
