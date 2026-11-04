export interface IDMParameters {
  desiredSpeed: number;     // v0: Free-flow target speed (m/s)
  timeHeadway: number;      // T: Safe time headway gap (seconds, e.g. 1.2s - 1.8s)
  minGap: number;           // s0: Standstill minimum bumper distance (meters, e.g. 2.5m)
  maxAcceleration: number;  // a: Maximum comfortable acceleration (m/s², e.g. 2.0 - 4.0)
  comfortableDecel: number; // b: Comfortable braking deceleration (m/s², e.g. 2.5 - 3.5)
  accelerationExponent: number; // delta: Typically 4
}

export const DEFAULT_IDM_PARAMS: IDMParameters = {
  desiredSpeed: 28.0, // ~100 km/h
  timeHeadway: 1.4,
  minGap: 3.5,
  maxAcceleration: 3.2,
  comfortableDecel: 3.5,
  accelerationExponent: 4,
};

export class IntelligentDriverModel {
  public params: IDMParameters;

  constructor(params: Partial<IDMParameters> = {}) {
    this.params = { ...DEFAULT_IDM_PARAMS, ...params };
  }

  /**
   * Calculates longitudinal acceleration based on current speed and leader distance/speed.
   * @param currentSpeed Ego vehicle speed v (m/s)
   * @param leaderDistance Net bumper distance s to vehicle ahead (m). Pass Infinity if no leader.
   * @param leaderSpeed Speed of vehicle ahead v_lead (m/s).
   */
  public calculateAcceleration(
    currentSpeed: number,
    leaderDistance: number = Infinity,
    leaderSpeed: number = 0
  ): number {
    const v = Math.max(0, currentSpeed);
    const { desiredSpeed, timeHeadway, minGap, maxAcceleration, comfortableDecel, accelerationExponent } = this.params;

    // Free road acceleration term: a * [1 - (v / v0)^delta]
    const freeTerm = 1 - Math.pow(v / Math.max(0.1, desiredSpeed), accelerationExponent);

    // Completely clear road ahead
    if (!isFinite(leaderDistance)) {
      return maxAcceleration * freeTerm;
    }

    // Critical Collision / Penetration: Bumper gap is zero or negative!
    // MUST execute maximum emergency braking, NEVER accelerate into the obstacle!
    if (leaderDistance <= 0.5) {
      return -Math.max(6.0, comfortableDecel * 2.5);
    }

    // Approach rate: deltaV = v - v_lead (positive if ego is closing in on leader)
    const deltaV = v - leaderSpeed;

    // Dynamic desired distance: s*(v, deltaV) = s0 + v*T + (v * deltaV) / (2 * sqrt(a*b))
    const interactionTerm =
      (v * deltaV) / (2 * Math.sqrt(Math.max(0.1, maxAcceleration * comfortableDecel)));
    const desiredGap = minGap + v * timeHeadway + interactionTerm;

    // Braking term: (s* / s)^2
    const safeDistance = Math.max(0.8, leaderDistance);
    const brakeRatio = desiredGap / safeDistance;
    const brakeTerm = Math.pow(brakeRatio, 2);

    const netAccel = maxAcceleration * (freeTerm - brakeTerm);

    // Limit emergency deceleration to vehicle mechanical maximum
    return Math.max(-10.0, Math.min(maxAcceleration, netAccel));
  }
}
