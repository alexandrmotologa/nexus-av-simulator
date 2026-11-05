import { Vector2D } from '../math/Vector2D';
import { CatmullRomSpline } from '../math/Spline';
import { FrenetConverter } from '../math/Frenet';
import { RoadSign, RoadSignType } from './RoadSign';

export type LaneDividerType = 'DASHED_WHITE' | 'SOLID_WHITE' | 'DOUBLE_SOLID_YELLOW' | 'WARNING_DASHED_WHITE';

export interface LaneDividerInfo {
  index: number;
  type: LaneDividerType;
  sStart: number;
  sEnd: number;
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

    // 1. Generate road signs first so marking segments can reference them
    this.generateRoadSigns();

    // 2. Build segmented, dynamic lane divider details strictly synchronized with road signage & curvature
    this.laneDividerDetails = [];
    for (let l = 1; l < this.laneCount; l++) {
      const dividerIdx = l - 1;
      let currentSeg: LaneDividerInfo | null = null;

      for (let i = 0; i <= numSteps; i++) {
        const s = (i / numSteps) * length;
        const pt = this.laneDividers[dividerIdx][i];
        if (!pt) continue;

        const type = this.getDividerTypeAt(dividerIdx, s);

        if (!currentSeg || currentSeg.type !== type) {
          if (currentSeg && currentSeg.points.length > 0) {
            // Include boundary point in previous segment for visually continuous lines
            currentSeg.points.push(pt);
            this.laneDividerDetails.push(currentSeg);
          }
          currentSeg = {
            index: dividerIdx,
            type,
            sStart: s,
            sEnd: s,
            points: [pt],
          };
        } else {
          currentSeg.points.push(pt);
          currentSeg.sEnd = s;
        }
      }

      if (currentSeg && currentSeg.points.length > 0) {
        this.laneDividerDetails.push(currentSeg);
      }
    }
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

  /**
   * Evaluates the legal lane divider marking type at distance s for a specific divider index.
   * Strictly enforces traffic rules:
   * - Opposite flow median in bidirectional road -> DOUBLE_SOLID_YELLOW
   * - Sharp curves (|curvature| > 0.009) or hazard/speed-50 sign zone -> SOLID_WHITE (lane change/overtaking strictly prohibited)
   * - Approach transition leading into hazard zone (-35m to -5m) -> WARNING_DASHED_WHITE (denser warning dashes)
   * - Open straight cruise sectors -> DASHED_WHITE (overtaking/lane change allowed)
   */
  public getDividerTypeAt(dividerIndex: number, s: number): LaneDividerType {
    if (this.isBidirectional && (dividerIndex + 1) === this.oncomingLaneCount) {
      return 'DOUBLE_SOLID_YELLOW';
    }

    const length = this.spline.totalLength;
    if (length <= 0) return 'DASHED_WHITE';

    // Sample local path curvature
    const state = this.spline.evaluateAtDistance(s);
    const curvature = Math.abs(state.curvature);

    let isHazardZone = curvature > 0.009;
    let isWarningApproach = false;

    // Check relationship with road signage
    for (const sign of this.signs) {
      if (sign.type === 'SHARP_CURVE_LEFT' || sign.type === 'SHARP_CURVE_RIGHT' || sign.type === 'SPEED_LIMIT_50') {
        let delta = s - sign.s;
        if (this.closed) {
          if (delta < -length * 0.5) delta += length;
          if (delta > length * 0.5) delta -= length;
        }

        // Active hazard zone: 5m before the warning sign through 55m past it
        if (delta >= -5.0 && delta <= 55.0) {
          isHazardZone = true;
          break;
        }

        // Approach warning zone: 35m before sign up to 5m before sign
        if (delta >= -35.0 && delta < -5.0) {
          isWarningApproach = true;
        }
      }
    }

    if (isHazardZone) {
      return 'SOLID_WHITE';
    }
    if (isWarningApproach) {
      return 'WARNING_DASHED_WHITE';
    }

    return 'DASHED_WHITE';
  }

  /**
   * Checks whether lane change or overtaking between laneA and laneB is legally permitted at distance s.
   */
  public isLaneChangeAllowed(laneFrom: number, laneTo: number, s: number): boolean {
    if (laneFrom === laneTo) return true;
    const minLane = Math.min(laneFrom, laneTo);
    const maxLane = Math.max(laneFrom, laneTo);

    if (maxLane - minLane !== 1) return false;

    if (this.isBidirectional && minLane < this.oncomingLaneCount && maxLane >= this.oncomingLaneCount) {
      return false; // Opposing traffic median
    }

    const dividerType = this.getDividerTypeAt(minLane, s);
    return dividerType === 'DASHED_WHITE';
  }

  /** Gets the divider type between two adjacent lanes at distance s */
  public getDividerTypeBetween(laneA: number, laneB: number, s: number = 0): LaneDividerType {
    const minLane = Math.min(laneA, laneB);
    const maxLane = Math.max(laneA, laneB);
    if (maxLane - minLane !== 1) return 'DOUBLE_SOLID_YELLOW';
    return this.getDividerTypeAt(minLane, s);
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
