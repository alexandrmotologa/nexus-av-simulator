export class Vector2D {
  constructor(public x: number = 0, public y: number = 0) {}

  clone(): Vector2D {
    return new Vector2D(this.x, this.y);
  }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  add(v: Vector2D): Vector2D {
    return new Vector2D(this.x + v.x, this.y + v.y);
  }

  sub(v: Vector2D): Vector2D {
    return new Vector2D(this.x - v.x, this.y - v.y);
  }

  scale(s: number): Vector2D {
    return new Vector2D(this.x * s, this.y * s);
  }

  dot(v: Vector2D): number {
    return this.x * v.x + this.y * v.y;
  }

  /** 2D cross product: Returns scalar z-component of 3D cross product */
  cross(v: Vector2D): number {
    return this.x * v.y - this.y * v.x;
  }

  magnitudeSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  magnitude(): number {
    return Math.sqrt(this.magnitudeSq());
  }

  normalize(): Vector2D {
    const mag = this.magnitude();
    if (mag < 1e-9) {
      return new Vector2D(0, 0);
    }
    return new Vector2D(this.x / mag, this.y / mag);
  }

  distanceSq(v: Vector2D): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  distance(v: Vector2D): number {
    return Math.sqrt(this.distanceSq(v));
  }

  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  rotate(radians: number): Vector2D {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new Vector2D(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  lerp(v: Vector2D, t: number): Vector2D {
    return new Vector2D(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t
    );
  }

  perpendicular(): Vector2D {
    return new Vector2D(-this.y, this.x);
  }

  static fromAngle(radians: number, length: number = 1): Vector2D {
    return new Vector2D(Math.cos(radians) * length, Math.sin(radians) * length);
  }

  static zero(): Vector2D {
    return new Vector2D(0, 0);
  }
}
