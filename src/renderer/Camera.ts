import { Vector2D } from '../core/math/Vector2D';

export class Camera {
  public position: Vector2D = new Vector2D(0, 0);
  public target: Vector2D = new Vector2D(0, 0);
  public zoom: number = 4.5; // Default close-up view (pixels per meter)
  public targetZoom: number = 4.5;
  public minZoom: number = 0.4;
  public maxZoom: number = 28.0; // High-detail close zoom
  public lerpFactor: number = 0.08;
  public width: number = 800;
  public height: number = 600;
  public isLockedToVehicle: boolean = true;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  public zoomBy(factor: number): void {
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom * factor));
  }

  public zoomIn(): void {
    this.zoomBy(1.3);
  }

  public zoomOut(): void {
    this.zoomBy(0.77);
  }

  public resetZoom(): void {
    this.targetZoom = 4.5;
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  public follow(targetPos: Vector2D, dt: number): void {
    if (!this.isLockedToVehicle) {
      // Free floating / user panned
      this.position = this.position.lerp(this.target, Math.min(1.0, 0.2 * (dt * 60)));
      this.zoom += (this.targetZoom - this.zoom) * Math.min(1.0, 0.1 * (dt * 60));
      return;
    }
    this.target = targetPos.clone();
    this.position = this.position.lerp(this.target, Math.min(1.0, this.lerpFactor * (dt * 60)));
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1.0, 0.1 * (dt * 60));
  }

  public panBy(deltaScreenX: number, deltaScreenY: number): void {
    this.isLockedToVehicle = false;
    const worldDeltaX = deltaScreenX / this.zoom;
    const worldDeltaY = deltaScreenY / this.zoom;
    this.target = new Vector2D(this.target.x - worldDeltaX, this.target.y - worldDeltaY);
    this.position = this.target.clone();
  }

  public lockTo(targetPos: Vector2D): void {
    this.isLockedToVehicle = true;
    this.target = targetPos.clone();
  }

  public worldToScreen(worldPos: Vector2D): Vector2D {
    const screenX = this.width * 0.5 + (worldPos.x - this.position.x) * this.zoom;
    const screenY = this.height * 0.5 + (worldPos.y - this.position.y) * this.zoom;
    return new Vector2D(screenX, screenY);
  }

  public screenToWorld(screenPos: Vector2D): Vector2D {
    const worldX = this.position.x + (screenPos.x - this.width * 0.5) / this.zoom;
    const worldY = this.position.y + (screenPos.y - this.height * 0.5) / this.zoom;
    return new Vector2D(worldX, worldY);
  }

  public applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.width * 0.5, this.height * 0.5);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.position.x, -this.position.y);
  }
}
