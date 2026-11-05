/**
 * Quintic polynomial:
 * x(t) = a0 + a1*t + a2*t^2 + a3*t^3 + a4*t^4 + a5*t^5
 * Solves boundary value problem given:
 * x0, v0, a0 at t=0
 * x1, v1, a1 at t=T
 */
export class QuinticPolynomial {
  public a0: number;
  public a1: number;
  public a2: number;
  public a3: number;
  public a4: number;
  public a5: number;
  public T: number;

  constructor(x0: number, v0: number, a0: number, x1: number, v1: number, a1: number, T: number) {
    this.T = Math.max(0.01, T);
    this.a0 = x0;
    this.a1 = v0;
    this.a2 = 0.5 * a0;

    const T2 = this.T * this.T;
    const T3 = T2 * this.T;
    const T4 = T3 * this.T;
    const T5 = T4 * this.T;

    // Remaining linear system for a3, a4, a5:
    // [ T^3,   T^4,    T^5   ] [ a3 ]   [ x1 - (a0 + a1*T + a2*T^2) ]
    // [ 3*T^2, 4*T^3,  5*T^4 ] [ a4 ] = [ v1 - (a1 + 2*a2*T)        ]
    // [ 6*T,   12*T^2, 20*T^3] [ a5 ]   [ a1_target - 2*a2          ]

    const b0 = x1 - (this.a0 + this.a1 * this.T + this.a2 * T2);
    const b1 = v1 - (this.a1 + 2 * this.a2 * this.T);
    const b2 = a1 - 2 * this.a2;

    // Analytical solution via Cramer's rule / inverted matrix
    // Matrix M:
    // [ T3,   T4,    T5   ]
    // [ 3*T2, 4*T3,  5*T4 ]
    // [ 6*T,  12*T2, 20*T3]
    // det(M) = 2 * T^9
    const det = 2 * T3 * T3 * T3;
    if (Math.abs(det) < 1e-9) {
      this.a3 = 0;
      this.a4 = 0;
      this.a5 = 0;
      return;
    }

    const c00 = 20 * T3 * T3 - 60 * T4 * T2; // (4*T3*20*T3 - 5*T4*12*T2) = 80*T^6 - 60*T^6 = 20*T^6
    const c01 = - (20 * T3 * T4 - 12 * T2 * T5); // -(20*T^7 - 12*T^7) = -8*T^7
    const c02 = 5 * T4 * 6 * T - 4 * T3 * 6 * T; // (30*T^5 - 24*T^5)... wait, let's use direct standard closed form:

    // Standard Frenet quintic coefficients:
    // a3 = (20*b0 - (8*v1 + 12*v0)*T - (3*a0 - a1)*T^2) / (2*T^3)
    this.a3 = (20 * b0 - 8 * b1 * this.T + b2 * T2) / (2 * T3);
    this.a4 = (-30 * b0 + 14 * b1 * this.T - 2 * b2 * T2) / (2 * T4);
    this.a5 = (12 * b0 - 6 * b1 * this.T + b2 * T2) / (2 * T5);
  }

  public calcPoint(t: number): number {
    return this.a0 + this.a1 * t + this.a2 * t * t + this.a3 * Math.pow(t, 3) + this.a4 * Math.pow(t, 4) + this.a5 * Math.pow(t, 5);
  }

  public calcFirstDerivative(t: number): number {
    return this.a1 + 2 * this.a2 * t + 3 * this.a3 * t * t + 4 * this.a4 * Math.pow(t, 3) + 5 * this.a5 * Math.pow(t, 4);
  }

  public calcSecondDerivative(t: number): number {
    return 2 * this.a2 + 6 * this.a3 * t + 12 * this.a4 * t * t + 20 * this.a5 * Math.pow(t, 3);
  }

  public calcThirdDerivative(t: number): number {
    return 6 * this.a3 + 24 * this.a4 * t + 60 * this.a5 * t * t;
  }

  /** Jerk integral: \int_0^T (d'''(t))^2 dt */
  public calcJerkIntegral(): number {
    // d'''(t) = 6*a3 + 24*a4*t + 60*a5*t^2
    // Let c0 = 6*a3, c1 = 24*a4, c2 = 60*a5
    // (c0 + c1*t + c2*t^2)^2 = c0^2 + 2*c0*c1*t + (c1^2 + 2*c0*c2)*t^2 + 2*c1*c2*t^3 + c2^2*t^4
    // Integral from 0 to T:
    const c0 = 6 * this.a3;
    const c1 = 24 * this.a4;
    const c2 = 60 * this.a5;
    const T = this.T;

    return (
      c0 * c0 * T +
      c0 * c1 * T * T +
      (c1 * c1 + 2 * c0 * c2) * (Math.pow(T, 3) / 3) +
      c1 * c2 * (Math.pow(T, 4) / 2) +
      c2 * c2 * (Math.pow(T, 5) / 5)
    );
  }
}

/**
 * Quartic polynomial:
 * x(t) = a0 + a1*t + a2*t^2 + a3*t^3 + a4*t^4
 * Used for longitudinal velocity keeping when final longitudinal position is free:
 * x0, v0, a0 at t=0
 * v1, a1 at t=T
 */
export class QuarticPolynomial {
  public a0: number;
  public a1: number;
  public a2: number;
  public a3: number;
  public a4: number;
  public T: number;

  constructor(x0: number, v0: number, a0: number, v1: number, a1: number, T: number) {
    this.T = Math.max(0.01, T);
    this.a0 = x0;
    this.a1 = v0;
    this.a2 = 0.5 * a0;

    const T2 = this.T * this.T;
    const T3 = T2 * this.T;

    // Remaining 2x2 system for a3, a4:
    // [ 3*T^2, 4*T^3  ] [ a3 ] = [ v1 - (a1 + 2*a2*T) ]
    // [ 6*T,   12*T^2 ] [ a4 ]   [ a1_target - 2*a2   ]
    const b0 = v1 - (this.a1 + 2 * this.a2 * this.T);
    const b1 = a1 - 2 * this.a2;

    const det = 3 * T2 * 12 * T2 - 4 * T3 * 6 * T; // 36*T^4 - 24*T^4 = 12*T^4
    if (Math.abs(det) < 1e-9) {
      this.a3 = 0;
      this.a4 = 0;
      return;
    }

    this.a3 = (12 * T2 * b0 - 4 * T3 * b1) / det;
    this.a4 = (-6 * this.T * b0 + 3 * T2 * b1) / det;
  }

  public calcPoint(t: number): number {
    return this.a0 + this.a1 * t + this.a2 * t * t + this.a3 * Math.pow(t, 3) + this.a4 * Math.pow(t, 4);
  }

  public calcFirstDerivative(t: number): number {
    return this.a1 + 2 * this.a2 * t + 3 * this.a3 * t * t + 4 * this.a4 * Math.pow(t, 3);
  }

  public calcSecondDerivative(t: number): number {
    return 2 * this.a2 + 6 * this.a3 * t + 12 * this.a4 * t * t;
  }

  public calcThirdDerivative(t: number): number {
    return 6 * this.a3 + 24 * this.a4 * t;
  }

  public calcJerkIntegral(): number {
    const c0 = 6 * this.a3;
    const c1 = 24 * this.a4;
    const T = this.T;
    return c0 * c0 * T + c0 * c1 * T * T + (c1 * c1 * Math.pow(T, 3)) / 3;
  }
}
