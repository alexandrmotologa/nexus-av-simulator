import { IntelligentDriverModel } from './IDM';

export interface MOBILParameters {
  politeness: number;          // p: In [0, 1]. 0 = completely selfish, 1 = altruistic
  thresholdAccel: number;      // delta_a_th: Minimum acceleration advantage required (e.g. 0.3 m/s²)
  maxSafeDecel: number;        // b_safe: Max acceptable deceleration forced on new follower (e.g. 4.0 m/s²)
}

export const DEFAULT_MOBIL_PARAMS: MOBILParameters = {
  politeness: 0.25,
  thresholdAccel: 0.35,
  maxSafeDecel: 4.0,
};

export class MOBILLaneChanger {
  public params: MOBILParameters;

  constructor(params: Partial<MOBILParameters> = {}) {
    this.params = { ...DEFAULT_MOBIL_PARAMS, ...params };
  }

  /**
   * Evaluates if changing to target lane satisfies safety and incentive criteria.
   */
  public shouldChangeLane(
    idm: IntelligentDriverModel,
    egoSpeed: number,
    currentLeaderDist: number,
    currentLeaderSpeed: number,
    targetLeaderDist: number,
    targetLeaderSpeed: number,
    targetFollowerDist: number,
    targetFollowerSpeed: number
  ): boolean {
    // 1. Safety Check: Will moving into target lane force dangerous braking on new follower?
    if (isFinite(targetFollowerDist)) {
      const followerAccelNew = idm.calculateAcceleration(
        targetFollowerSpeed,
        targetFollowerDist,
        egoSpeed
      );
      if (followerAccelNew < -this.params.maxSafeDecel) {
        return false; // Violates safety criterion
      }
    }

    // 2. Incentive Check: Acceleration gained by ego driver vs inconvenience to others
    const egoAccelCurrent = idm.calculateAcceleration(
      egoSpeed,
      currentLeaderDist,
      currentLeaderSpeed
    );
    const egoAccelTarget = idm.calculateAcceleration(
      egoSpeed,
      targetLeaderDist,
      targetLeaderSpeed
    );

    const egoAdvantage = egoAccelTarget - egoAccelCurrent;
    return egoAdvantage > this.params.thresholdAccel;
  }
}
