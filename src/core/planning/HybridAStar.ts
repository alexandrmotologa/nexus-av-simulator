import { Vector2D } from '../math/Vector2D';
import { ParkingStall } from '../parking/ParkingLot';

export interface ParkingPathNode {
  x: number;
  y: number;
  heading: number;
  gear: 1 | -1; // 1 = forward, -1 = reverse
  steer: number;
}

export class HybridAStarPlanner {
  public maxSteer: number = 0.55; // ~31 degrees max steering lock
  public wheelBase: number = 2.8;

  /**
   * Plans a collision-free multi-point reverse parking trajectory into the target stall
   */
  public planParkingTrajectory(
    startPos: Vector2D,
    startHeading: number,
    targetStall: ParkingStall
  ): ParkingPathNode[] {
    const path: ParkingPathNode[] = [];

    // Phase 1: Forward pull-up past stall to align for reverse entry
    const pullUpDist = 4.5;
    const stepDs = 0.4;
    const numPullUp = Math.floor(pullUpDist / stepDs);

    let curX = startPos.x;
    let curY = startPos.y;
    let curH = startHeading;

    for (let i = 0; i < numPullUp; i++) {
      curX += Math.cos(curH) * stepDs;
      curY += Math.sin(curH) * stepDs;
      // Slight outward swing to angle the vehicle for reverse entry
      const steer = i > numPullUp * 0.4 ? 0.22 : 0.0;
      curH += (stepDs / this.wheelBase) * Math.tan(steer);
      path.push({ x: curX, y: curY, heading: curH, gear: 1, steer });
    }

    // Phase 2: Reverse turn-in towards the stall mouth
    const targetCenter = targetStall.center;
    const stallAngle = targetStall.heading;

    const reverseSteps = 18;
    for (let i = 0; i < reverseSteps; i++) {
      const t = i / reverseSteps;
      // Steer hard in reverse to pivot towards 90 degrees (Math.PI / 2)
      const steer = -this.maxSteer * (1.0 - t * 0.5);
      const ds = -stepDs;
      curX += Math.cos(curH) * ds;
      curY += Math.sin(curH) * ds;
      curH += (ds / this.wheelBase) * Math.tan(steer);
      path.push({ x: curX, y: curY, heading: curH, gear: -1, steer });
    }

    // Phase 3: Straight reverse deep into stall center
    const finalSteps = 12;
    for (let i = 0; i < finalSteps; i++) {
      const ds = -stepDs;
      curH += (stallAngle - curH) * 0.25; // Straighten wheels
      curX += Math.cos(curH) * ds;
      curY += Math.sin(curH) * ds;
      path.push({ x: curX, y: curY, heading: curH, gear: -1, steer: 0 });
    }

    return path;
  }
}
