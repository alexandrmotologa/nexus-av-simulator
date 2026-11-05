import { Vector2D } from '../math/Vector2D';
import { CatmullRomSpline } from '../math/Spline';
import { FrenetConverter } from '../math/Frenet';
import { RoadSign, RoadSignType } from './RoadSign';

export type LaneDividerType = 'DASHED_WHITE' | 'SOLID_WHITE' | 'DOUBLE_SOLID_YELLOW';

export interface LaneDividerInfo {
  index: number;
  type: LaneDividerType;
  points: Vector2D[];
}

export interface LaneInfo {
  index: number;
  offsetD: number; // Lateral offset from centerline (m)
  width: number;
  isOncoming: boolean;
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
  public isBidirectional: boolean;
  public oncomingLaneCount: number;

  // Cached geometry boundaries for raycasting and collision
  public leftBoundary: Vector2D[] = [];
  public rightBoundary: Vector2D[] = [];
  public laneDividers: Vector2D[][] = [];
  public laneDividerDetails: LaneDividerInfo[] = [];
  public samplePoints: Vector2D[] = [];
  public signs: RoadSign[] = [];

  public get centerLine(): Vector2D[] {
    return this.samplePoints.length > 0 ? this.samplePoints : this.spline.getWaypoints();
  }

  constructor(
    id: string,
    name: string,
    waypoints: Vector2D[],
    laneCount: number = 3,
    laneWidth: number = 3.8,
    closed: boolean = true,
    isBidirectional: boolean = false,
    oncomingLaneCount: number = 0
  ) {
    this.id = id;
    this.name = name;
    this.laneCount = laneCount;
    this.laneWidth = laneWidth;
    this.totalWidth = laneCount * laneWidth;
    this.closed = closed;
    this.isBidirectional = isBidirectional;
    this.oncomingLaneCount = oncomingLaneCount;
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
    this.laneDividerDetails = [];
    this.samplePoints = [];
    this.signs = [];

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

    // Build typed divider details
    for (let l = 1; l < this.laneCount; l++) {
      let dividerType: LaneDividerType = 'DASHED_WHITE';
      if (this.isBidirectional && l === this.oncomingLaneCount) {
        dividerType = 'DOUBLE_SOLID_YELLOW'; // Center median dividing opposing traffic flows
      }
      this.laneDividerDetails.push({
        index: l - 1,
        type: dividerType,
        points: this.laneDividers[l - 1],
      });
    }

    this.generateRoadSigns();
  }

  /**
   * Generates realistic roadside signage along track margins (speed limits, curve warnings, no-overtake).
   */
  private generateRoadSigns(): void {
    const length = this.spline.totalLength;
    if (length < 80) return;

    this.signs = [];
    const roadsideD = -(this.totalWidth * 0.5 + 2.2); // Right side shoulder

    // 1. Initial sector speed limit
    const initialLimit: RoadSignType = this.isBidirectional ? 'SPEED_LIMIT_80' : 'SPEED_LIMIT_90';
    const initialPos = this.frenet.frenetToCartesian(30.0, roadsideD);
    this.signs.push({
      id: 'sign-start-speed',
      type: initialLimit,
      s: 30.0,
      position: initialPos.position,
      heading: initialPos.heading,
      speedValue: this.isBidirectional ? 80 : 90,
    });

    // 2. Sample track curvature to place warning and reduction signs before tight corners
    const interval = 120.0;
    const signCount = Math.floor(length / interval);

    for (let i = 1; i < signCount; i++) {
      const s = i * interval;
      const state = this.spline.evaluateAtDistance(s + 35.0);
      const isSharpCurve = Math.abs(state.curvature) > 0.012;

      const signPos = this.frenet.frenetToCartesian(s, roadsideD);

      if (isSharpCurve) {
        // Warning sign 35m before the curve
        this.signs.push({
          id: `sign-curve-${i}`,
          type: state.curvature > 0 ? 'SHARP_CURVE_LEFT' : 'SHARP_CURVE_RIGHT',
          s,
          position: signPos.position,
          heading: signPos.heading,
        });

        // 50 km/h reduction sign
        const speed50Pos = this.frenet.frenetToCartesian(s + 15.0, roadsideD);
        this.signs.push({
          id: `sign-speed50-${i}`,
          type: 'SPEED_LIMIT_50',
          s: s + 15.0,
          position: speed50Pos.position,
          heading: speed50Pos.heading,
          speedValue: 50,
        });
      } else {
        // High-speed cruise segment
        const limit = (i % 2 === 0) ? 120 : 80;
        this.signs.push({
          id: `sign-speed-${i}`,
          type: limit === 120 ? 'SPEED_LIMIT_120' : 'SPEED_LIMIT_80',
          s,
          position: signPos.position,
          heading: signPos.heading,
          speedValue: limit,
        });
      }
    }
  }

  /**
   * Evaluates the legal speed limit at distance s along the track
   */
  public getSpeedLimitAtDistance(s: number): number {
    const speedSigns = this.signs.filter((sign) => sign.speedValue !== undefined);
    if (speedSigns.length === 0) return 90;

    let activeLimit = speedSigns[0].speedValue || 90;
    let closestPastDist = Infinity;

    for (const sign of speedSigns) {
      let delta = s - sign.s;
      if (this.closed && delta < 0) delta += this.spline.totalLength;
      if (delta >= 0 && delta < closestPastDist) {
        closestPastDist = delta;
        activeLimit = sign.speedValue || 90;
      }
    }

    return activeLimit;
  }

  /** Whether the given lane is on the oncoming side of traffic */
  public isOncomingLane(laneIndex: number): boolean {
    return this.isBidirectional && laneIndex < this.oncomingLaneCount;
  }

  /** Gets the divider type between two adjacent lanes */
  public getDividerTypeBetween(laneA: number, laneB: number): LaneDividerType {
    const minLane = Math.min(laneA, laneB);
    const maxLane = Math.max(laneA, laneB);
    if (maxLane - minLane !== 1) return 'DOUBLE_SOLID_YELLOW';
    const detail = this.laneDividerDetails[minLane];
    return detail ? detail.type : 'DASHED_WHITE';
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

  /**
   * Checks whether the vehicle's tires are riding on outer rumble strips or crossing medians without signaling.
   */
  public checkRumbleContact(pos: Vector2D, carWidth: number, isBlinking: boolean): boolean {
    const closest = this.spline.findClosestPoint(pos);
    const halfRoadWidth = this.totalWidth * 0.5;
    const halfCarWidth = carWidth * 0.5;
    const leftTireD = closest.d + halfCarWidth;
    const rightTireD = closest.d - halfCarWidth;

    // Outer kerb / rumble strip zone (outer 0.9 meters along road edge)
    const isLeftKerb = Math.abs(leftTireD) >= halfRoadWidth - 0.9 && Math.abs(leftTireD) <= halfRoadWidth + 0.5;
    const isRightKerb = Math.abs(rightTireD) >= halfRoadWidth - 0.9 && Math.abs(rightTireD) <= halfRoadWidth + 0.5;
    if (isLeftKerb || isRightKerb) return true;

    // Center median rumble if touching double solid yellow without blinker
    if (this.isBidirectional && !isBlinking) {
      const medianD = halfRoadWidth - this.oncomingLaneCount * this.laneWidth;
      if (Math.abs(closest.d - medianD) < 0.4) {
        return true;
      }
    }

    return false;
  }
}
