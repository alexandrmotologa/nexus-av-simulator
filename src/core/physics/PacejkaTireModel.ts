/**
 * Pacejka 'Magic Formula' Non-Linear Tire Dynamics Model.
 * Computes authentic lateral and longitudinal forces based on slip angle (alpha),
 * slip ratio (kappa), vertical normal load (Fz), and compound thermodynamic status.
 *
 * Formula:
 * y(x) = D * sin(C * arctan(B * x - E * (B * x - arctan(B * x))))
 * where:
 *   x = slip angle (alpha) or slip ratio (kappa)
 *   B = Stiffness factor
 *   C = Shape factor
 *   D = Peak force factor (mu * Fz)
 *   E = Curvature factor
 */
export interface PacejkaCoefficients {
  B: number; // Stiffness factor
  C: number; // Shape factor (lateral: ~1.3 - 1.65)
  D: number; // Peak friction coefficient mu
  E: number; // Curvature factor (~ -1.0 to 0.0)
}

export const DEFAULT_LATERAL_PACEJKA: PacejkaCoefficients = {
  B: 10.0,
  C: 1.35,
  D: 1.05,
  E: -0.85,
};

export const DEFAULT_LONGITUDINAL_PACEJKA: PacejkaCoefficients = {
  B: 12.0,
  C: 1.60,
  D: 1.15,
  E: -0.60,
};

export class PacejkaTireModel {
  public lateralCoeffs: PacejkaCoefficients;
  public longitudinalCoeffs: PacejkaCoefficients;

  constructor(
    latCoeffs: Partial<PacejkaCoefficients> = {},
    longCoeffs: Partial<PacejkaCoefficients> = {}
  ) {
    this.lateralCoeffs = { ...DEFAULT_LATERAL_PACEJKA, ...latCoeffs };
    this.longitudinalCoeffs = { ...DEFAULT_LONGITUDINAL_PACEJKA, ...longCoeffs };
  }

  /**
   * Calculates lateral tire force Fy in Newtons.
   * @param slipAngle Slip angle alpha in radians
   * @param normalLoad Vertical load Fz in Newtons
   * @param frictionMultiplier Weather and compound grip modifier [0.3 to 1.2]
   */
  public calculateLateralForce(
    slipAngle: number,
    normalLoad: number,
    frictionMultiplier: number = 1.0
  ): number {
    const { B, C, D, E } = this.lateralCoeffs;
    const peakForce = D * normalLoad * frictionMultiplier;

    // x = slip angle in radians
    const x = slipAngle;
    const Bx = B * x;
    const inner = Bx - Math.atan(Bx);
    const argument = C * Math.atan(Bx - E * inner);
    const force = peakForce * Math.sin(argument);

    return force;
  }

  /**
   * Calculates longitudinal tire force Fx in Newtons.
   * @param slipRatio Longitudinal slip ratio kappa (-1.0 to 1.0)
   * @param normalLoad Vertical load Fz in Newtons
   * @param frictionMultiplier Weather and compound grip modifier
   */
  public calculateLongitudinalForce(
    slipRatio: number,
    normalLoad: number,
    frictionMultiplier: number = 1.0
  ): number {
    const { B, C, D, E } = this.longitudinalCoeffs;
    const peakForce = D * normalLoad * frictionMultiplier;

    const x = Math.max(-1.0, Math.min(1.0, slipRatio));
    const Bx = B * x;
    const inner = Bx - Math.atan(Bx);
    const argument = C * Math.atan(Bx - E * inner);
    const force = peakForce * Math.sin(argument);

    return force;
  }

  /**
   * Evaluates coupled friction ellipse limit (Kamm's Circle constraint)
   * Prevents total tire contact forces from exceeding normal friction boundary.
   */
  public coupleForces(
    Fx: number,
    Fy: number,
    normalLoad: number,
    frictionMultiplier: number = 1.0
  ): { Fx: number; Fy: number; saturation: number } {
    const maxTotalForce = this.lateralCoeffs.D * normalLoad * frictionMultiplier;
    const currentForceNorm = Math.hypot(Fx, Fy);

    if (currentForceNorm <= maxTotalForce || currentForceNorm < 1e-3) {
      return {
        Fx,
        Fy,
        saturation: Math.min(1.0, currentForceNorm / Math.max(1.0, maxTotalForce)),
      };
    }

    const scale = maxTotalForce / currentForceNorm;
    return {
      Fx: Fx * scale,
      Fy: Fy * scale,
      saturation: 1.0,
    };
  }
}
