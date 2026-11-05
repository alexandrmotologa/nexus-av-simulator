import { Vector2D } from '../math/Vector2D';
import { VehicleModel } from '../physics/VehicleModel';
import { Track } from '../world/Track';
import { RoadObstacle } from '../world/Obstacle';

export type WeatherMode = 'DRY' | 'WET' | 'NIGHT' | 'FOG';

export interface CameraFrame {
  canvas: HTMLCanvasElement;
  imageData: ImageData;
  width: number;
  height: number;
}

export class VirtualCamera {
  public readonly width: number;
  public readonly height: number;
  public readonly fov: number; // Field of view in radians (~70 deg)
  public readonly cameraHeight: number = 1.25; // meters above ground
  public readonly nearClip: number = 1.5; // meters
  public readonly farClip: number = 75.0; // meters

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(width: number = 160, height: number = 80, fovDegrees: number = 72) {
    this.width = width;
    this.height = height;
    this.fov = (fovDegrees * Math.PI) / 180;

    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Failed to get 2D context for VirtualCamera offscreen canvas');
    }
    this.ctx = context;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Transforms a 2D world position into normalized camera screen coordinates [x, y, depth]
   * returns null if point is behind the camera or outside clip range.
   */
  public projectPoint(
    point: Vector2D,
    camPos: Vector2D,
    camHeading: number
  ): { x: number; y: number; z: number } | null {
    const dx = point.x - camPos.x;
    const dy = point.y - camPos.y;

    const cosH = Math.cos(camHeading);
    const sinH = Math.sin(camHeading);

    // Forward longitudinal depth along vehicle optical axis
    const z = dx * cosH + dy * sinH;
    if (z < this.nearClip || z > this.farClip) return null;

    // Lateral offset (right is positive)
    const xLocal = -dx * sinH + dy * cosH;

    // Perspective projection
    const tanHalfFov = Math.tan(this.fov * 0.5);
    const screenX = (this.width * 0.5) + (xLocal / (z * tanHalfFov)) * (this.width * 0.5);

    // Road surface is below camera height
    const horizonY = this.height * 0.44;
    const screenY = horizonY + (this.cameraHeight / (z * tanHalfFov)) * (this.height * 0.5);

    return { x: screenX, y: screenY, z };
  }

  /**
   * Renders the forward driver perspective view into the internal canvas.
   */
  public render(
    ego: VehicleModel,
    track: Track,
    obstacles: RoadObstacle[],
    traffic: VehicleModel[],
    weather: WeatherMode
  ): CameraFrame {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const horizonY = h * 0.44;

    // 1. Camera Mount Position (Front bumper of ego car)
    const bumperDist = ego.config.length * 0.48;
    const camPos = new Vector2D(
      ego.state.position.x + Math.cos(ego.state.heading) * bumperDist,
      ego.state.position.y + Math.sin(ego.state.heading) * bumperDist
    );
    const camHeading = ego.state.heading;

    // 2. Clear Sky & Horizon Atmosphere
    const isNight = weather === 'NIGHT';
    const isWet = weather === 'WET';

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    if (isNight) {
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(1, '#090d16');
    } else if (isWet) {
      skyGrad.addColorStop(0, '#1e293b');
      skyGrad.addColorStop(1, '#334155');
    } else {
      skyGrad.addColorStop(0, '#0369a1');
      skyGrad.addColorStop(1, '#38bdf8');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // Ground / Grass Terrain below horizon
    ctx.fillStyle = isNight ? '#050c14' : isWet ? '#0f291e' : '#143823';
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // 3. Render Projected Road Tarmac Frustum
    this.renderRoadSurface(track, camPos, camHeading, isNight, isWet);

    // 4. Render Projected Lane Markings
    this.renderLaneMarkings(track, camPos, camHeading, isNight, isWet);

    // 5. Render Projected Obstacles (Cones & Barriers)
    this.renderObstacles(obstacles, camPos, camHeading);

    // 6. Render Projected Traffic Vehicles
    this.renderVehicles(traffic, ego, camPos, camHeading);

    // 7. Atmospheric Vignette & Windshield Glare
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    return {
      canvas: this.canvas,
      imageData,
      width: w,
      height: h,
    };
  }

  private renderRoadSurface(
    track: Track,
    camPos: Vector2D,
    camHeading: number,
    isNight: boolean,
    isWet: boolean
  ): void {
    const ctx = this.ctx;
    const leftProj: { x: number; y: number; z: number }[] = [];
    const rightProj: { x: number; y: number; z: number }[] = [];

    // Project visible left and right boundaries
    for (let i = 0; i < track.leftBoundary.length; i++) {
      const pL = this.projectPoint(track.leftBoundary[i], camPos, camHeading);
      if (pL) leftProj.push(pL);

      const pR = this.projectPoint(track.rightBoundary[i], camPos, camHeading);
      if (pR) rightProj.push(pR);
    }

    if (leftProj.length < 2 || rightProj.length < 2) return;

    // Draw asphalt polygon
    ctx.fillStyle = isNight ? '#0b1120' : isWet ? '#111827' : '#1e293b';
    ctx.beginPath();

    ctx.moveTo(leftProj[0].x, leftProj[0].y);
    for (let i = 1; i < leftProj.length; i++) {
      ctx.lineTo(leftProj[i].x, leftProj[i].y);
    }
    for (let i = rightProj.length - 1; i >= 0; i--) {
      ctx.lineTo(rightProj[i].x, rightProj[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Road Red/White Kerbs
    ctx.strokeStyle = isNight ? '#06b6d4' : '#ef4444';
    ctx.lineWidth = 1.2;
    this.drawProjectedPolyline(leftProj);
    this.drawProjectedPolyline(rightProj);
  }

  private renderLaneMarkings(
    track: Track,
    camPos: Vector2D,
    camHeading: number,
    isNight: boolean,
    isWet: boolean
  ): void {
    const ctx = this.ctx;

    for (const segment of track.laneDividerDetails) {
      const projPoints: { x: number; y: number; z: number }[] = [];
      for (const pt of segment.points) {
        const proj = this.projectPoint(pt, camPos, camHeading);
        if (proj) projPoints.push(proj);
      }

      if (projPoints.length < 2) continue;

      if (segment.type === 'DOUBLE_SOLID_YELLOW') {
        ctx.setLineDash([]);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.4;
        this.drawProjectedPolyline(projPoints);
      } else if (segment.type === 'SOLID_WHITE') {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.0;
        this.drawProjectedPolyline(projPoints);
      } else if (segment.type === 'WARNING_DASHED_WHITE') {
        ctx.setLineDash([6, 3]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 0.9;
        this.drawProjectedPolyline(projPoints);
      } else {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 0.8;
        this.drawProjectedPolyline(projPoints);
      }
    }
    ctx.setLineDash([]);
  }

  private renderObstacles(obstacles: RoadObstacle[], camPos: Vector2D, camHeading: number): void {
    const ctx = this.ctx;

    for (const obs of obstacles) {
      const proj = this.projectPoint(obs.position, camPos, camHeading);
      if (!proj) continue;

      // Scale based on depth z
      const scale = Math.max(0.2, (18.0 / proj.z));
      const r = Math.max(1.5, obs.radius * scale * 2.2);

      if (obs.type === 'cone') {
        // Orange cone triangle
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(proj.x, proj.y - r * 2.0);
        ctx.lineTo(proj.x - r, proj.y);
        ctx.lineTo(proj.x + r, proj.y);
        ctx.closePath();
        ctx.fill();

        // White band
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(proj.x - r * 0.5, proj.y - r * 1.1, r, r * 0.35);
      } else {
        // Hazard barrier
        const bw = 12 * scale;
        const bh = 5 * scale;
        ctx.fillStyle = '#eab308';
        ctx.fillRect(proj.x - bw * 0.5, proj.y - bh, bw, bh);
        ctx.strokeStyle = '#0f172a';
        ctx.strokeRect(proj.x - bw * 0.5, proj.y - bh, bw, bh);
      }
    }
  }

  private renderVehicles(
    traffic: VehicleModel[],
    ego: VehicleModel,
    camPos: Vector2D,
    camHeading: number
  ): void {
    const ctx = this.ctx;

    for (const v of traffic) {
      if (v === ego) continue;

      const proj = this.projectPoint(v.state.position, camPos, camHeading);
      if (!proj) continue;

      const scale = Math.max(0.15, (22.0 / proj.z));
      const boxW = v.config.width * scale * 4.0;
      const boxH = 1.4 * scale * 4.0;

      // Vehicle body box
      ctx.fillStyle = v.state.isDamaged ? '#475569' : v.config.color;
      ctx.fillRect(proj.x - boxW * 0.5, proj.y - boxH, boxW, boxH);

      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(proj.x - boxW * 0.5, proj.y - boxH, boxW, boxH);

      // Red Taillights
      ctx.fillStyle = v.state.isBraking ? '#ef4444' : '#b91c1c';
      ctx.fillRect(proj.x - boxW * 0.45, proj.y - boxH * 0.55, boxW * 0.22, boxH * 0.28);
      ctx.fillRect(proj.x + boxW * 0.23, proj.y - boxH * 0.55, boxW * 0.22, boxH * 0.28);
    }
  }

  private drawProjectedPolyline(points: { x: number; y: number; z: number }[]): void {
    if (points.length < 2) return;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.stroke();
  }
}
