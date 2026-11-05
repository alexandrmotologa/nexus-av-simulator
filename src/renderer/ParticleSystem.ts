import { Vector2D } from '../core/math/Vector2D';

export interface Particle {
  position: Vector2D;
  velocity: Vector2D;
  radius: number;
  maxRadius: number;
  alpha: number;
  initialAlpha: number;
  life: number;
  maxLife: number;
  color: string;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private maxParticles: number = 220;

  /**
   * Spawns smoke puffs at a world position (typically tire contact patch)
   */
  public emitSmoke(
    pos: Vector2D,
    carVelocity: Vector2D,
    intensity: number = 1.0,
    isWet: boolean = false
  ): void {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift(); // Evict oldest
    }

    const count = Math.min(3, Math.max(1, Math.round(intensity * 2)));
    for (let i = 0; i < count; i++) {
      // Slight randomized scatter around tire contact patch
      const jitter = (Math.random() - 0.5) * 0.4;
      const initialPos = new Vector2D(pos.x + jitter, pos.y + jitter);

      // Inherit 20% of car velocity + random drift
      const speed = carVelocity.magnitude();
      const driftAngle = Math.random() * Math.PI * 2;
      const driftSpeed = 0.5 + Math.random() * 1.2;
      const vx = carVelocity.x * 0.15 + Math.cos(driftAngle) * driftSpeed;
      const vy = carVelocity.y * 0.15 + Math.sin(driftAngle) * driftSpeed;

      const maxLife = 0.5 + Math.random() * 0.4; // 0.5s - 0.9s duration
      const initialAlpha = isWet ? 0.25 : 0.42 * Math.min(1.0, intensity);

      this.particles.push({
        position: initialPos,
        velocity: new Vector2D(vx, vy),
        radius: 0.35 + Math.random() * 0.2,
        maxRadius: 1.2 + Math.random() * 0.6,
        alpha: initialAlpha,
        initialAlpha,
        life: 0,
        maxLife,
        color: isWet ? '186, 230, 253' : '226, 232, 240', // Pale mist spray when wet, pure tire smoke when dry
      });
    }
  }

  /**
   * Advances physics for all particles over timestep dt
   */
  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      const progress = p.life / p.maxLife;

      // Expand radius smoothly as smoke expands into the atmosphere
      p.radius = p.radius + (p.maxRadius - p.radius) * (dt * 3.0);

      // Exponential fade out
      p.alpha = p.initialAlpha * (1.0 - Math.pow(progress, 1.5));

      // Drag friction slows drifting particles down
      p.velocity = p.velocity.scale(Math.max(0, 1.0 - 2.5 * dt));
      p.position = p.position.add(p.velocity.scale(dt));
    }
  }

  /**
   * Renders expanding soft radial smoke puffs onto 2D canvas context
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;

    ctx.save();
    for (const p of this.particles) {
      if (p.alpha <= 0.01) continue;

      const grad = ctx.createRadialGradient(
        p.position.x,
        p.position.y,
        p.radius * 0.1,
        p.position.x,
        p.position.y,
        p.radius
      );
      grad.addColorStop(0, `rgba(${p.color}, ${p.alpha.toFixed(3)})`);
      grad.addColorStop(0.6, `rgba(${p.color}, ${(p.alpha * 0.4).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${p.color}, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.position.x, p.position.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  public clear(): void {
    this.particles = [];
  }
}
