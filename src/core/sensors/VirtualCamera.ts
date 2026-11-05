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

  public getContext(): CanvasRenderingContext2D {
    return this.ctx;
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

  /**
   * Renders the rear backup camera perspective with dynamic trajectory guidelines.
   */
  public renderRear(
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

    const bumperDist = ego.config.length * 0.48;
    const camHeading = ego.state.heading + Math.PI;
    const camPos = new Vector2D(
      ego.state.position.x - Math.cos(ego.state.heading) * bumperDist,
      ego.state.position.y - Math.sin(ego.state.heading) * bumperDist
    );

    const isNight = weather === 'NIGHT';
    const isWet = weather === 'WET';
    const isFog = weather === 'FOG';

    ctx.fillStyle = isNight ? '#030712' : isFog ? '#94a3b8' : '#38bdf8';
    ctx.fillRect(0, 0, w, horizonY);

    ctx.fillStyle = isNight ? '#0b0f19' : isWet ? '#1e293b' : '#334155';
    ctx.fillRect(0, horizonY, w, h - horizonY);

    this.renderRoadSurface(track, camPos, camHeading, isNight, isWet);
    this.renderLaneMarkings(track, camPos, camHeading, isNight, isWet);
    this.renderObstacles(obstacles, camPos, camHeading);
    this.renderVehicles(traffic, ego, camPos, camHeading);

    // Dynamic Backup Trajectory Guidelines
    const steer = ego.state.steerAngle;
    const curveCurvature = Math.tan(steer) / Math.max(1.0, ego.config.wheelbase);
    const halfWidthM = 1.0;

    ctx.lineWidth = 1.5;
    for (const side of [-halfWidthM, halfWidthM]) {
      ctx.beginPath();
      for (let dist = 1.8; dist <= 14.0; dist += 0.9) {
        const lateralArc = side - 0.5 * curveCurvature * dist * dist;
        const ptLocal = new Vector2D(-dist, -lateralArc);
        const cosH = Math.cos(ego.state.heading);
        const sinH = Math.sin(ego.state.heading);
        const worldPt = new Vector2D(
          ego.state.position.x + ptLocal.x * cosH - ptLocal.y * sinH,
          ego.state.position.y + ptLocal.x * sinH + ptLocal.y * cosH
        );
        const proj = this.projectPoint(worldPt, camPos, camHeading);
        if (proj) {
          if (dist === 1.8) ctx.moveTo(proj.x, proj.y);
          else ctx.lineTo(proj.x, proj.y);
        }
      }
      ctx.strokeStyle = '#22c55e';
      ctx.stroke();
    }

    // Distance cross-bars (Red at 2m, Yellow at 4m, Green at 7m)
    for (const [dist, color] of [[2.0, '#ef4444'], [4.0, '#eab308'], [7.0, '#22c55e']] as const) {
      const lateralArcL = -halfWidthM - 0.5 * curveCurvature * dist * dist;
      const lateralArcR = halfWidthM - 0.5 * curveCurvature * dist * dist;
      const cosH = Math.cos(ego.state.heading);
      const sinH = Math.sin(ego.state.heading);
      const wL = new Vector2D(
        ego.state.position.x - dist * cosH + lateralArcL * sinH,
        ego.state.position.y - dist * sinH - lateralArcL * cosH
      );
      const wR = new Vector2D(
        ego.state.position.x - dist * cosH + lateralArcR * sinH,
        ego.state.position.y - dist * sinH - lateralArcR * cosH
      );
      const pL = this.projectPoint(wL, camPos, camHeading);
      const pR = this.projectPoint(wR, camPos, camHeading);
      if (pL && pR) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pL.x, pL.y);
        ctx.lineTo(pR.x, pR.y);
        ctx.stroke();
      }
    }

    const imageData = ctx.getImageData(0, 0, w, h);
    return { canvas: this.canvas, imageData, width: w, height: h };
  }

  /**
   * Renders the Bird's Eye View (BEV) 360° sensor occupancy grid.
   */
  public renderBEV(
    ego: VehicleModel,
    track: Track,
    obstacles: RoadObstacle[],
    traffic: VehicleModel[],
    lidarHits: Vector2D[]
  ): CameraFrame {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, w, h);

    const centerX = w * 0.5;
    const centerY = h * 0.55;
    const pixelsPerMeter = 3.2;

    // Polar Radar Distance Rings (10m, 20m, 30m)
    ctx.lineWidth = 0.8;
    for (const rM of [10, 20, 30]) {
      const rPx = rM * pixelsPerMeter;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.22)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, rPx, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(6, 182, 212, 0.45)';
      ctx.font = '7px monospace';
      ctx.fillText(`${rM}m`, centerX + 2, centerY - rPx + 8);
    }

    ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, h);
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.stroke();

    const uForward = Vector2D.fromAngle(ego.state.heading);
    const uRight = new Vector2D(-uForward.y, uForward.x);
    const egoPos = ego.state.position;

    const toBEV = (worldPt: Vector2D): { x: number; y: number } => {
      const d = worldPt.sub(egoPos);
      const xLocal = d.dot(uRight);
      const yLocal = -d.dot(uForward);
      return {
        x: centerX + xLocal * pixelsPerMeter,
        y: centerY + yLocal * pixelsPerMeter,
      };
    };

    // Render LiDAR laser hits
    ctx.fillStyle = '#10b981';
    for (const hit of lidarHits) {
      const p = toBEV(hit);
      if (p.x >= 0 && p.x < w && p.y >= 0 && p.y < h) {
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
    }

    // Render Obstacles in BEV
    for (const obs of obstacles) {
      const p = toBEV(obs.position);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, obs.radius * pixelsPerMeter), 0, Math.PI * 2);
      ctx.fill();
    }

    // Render Traffic Vehicles in BEV
    for (const t of traffic) {
      if (t === ego) continue;
      const p = toBEV(t.state.position);
      if (p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) continue;

      ctx.save();
      ctx.translate(p.x, p.y);
      const relHeading = t.state.heading - ego.state.heading - Math.PI * 0.5;
      ctx.rotate(relHeading);
      ctx.fillStyle = t.config.color || '#94a3b8';
      ctx.fillRect(
        -t.config.width * 0.5 * pixelsPerMeter,
        -t.config.length * 0.5 * pixelsPerMeter,
        t.config.width * pixelsPerMeter,
        t.config.length * pixelsPerMeter
      );
      ctx.restore();
    }

    // Render Ego Vehicle in center (Cyan sports silhouette)
    ctx.save();
    ctx.translate(centerX, centerY);
    const halfW = ego.config.width * 0.5 * pixelsPerMeter;
    const halfL = ego.config.length * 0.5 * pixelsPerMeter;
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfL, halfW * 2, halfL * 2, 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.beginPath();
    ctx.moveTo(0, -halfL);
    ctx.lineTo(-w * 0.35, -h * 0.45);
    ctx.lineTo(w * 0.35, -h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, w, h);
    return { canvas: this.canvas, imageData, width: w, height: h };
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
