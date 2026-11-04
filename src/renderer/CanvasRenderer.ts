import { Camera } from './Camera';
import { Track } from '../core/world/Track';
import { VehicleModel } from '../core/physics/VehicleModel';
import { LidarSensor } from '../core/sensors/LidarSensor';
import { Vector2D } from '../core/math/Vector2D';

export interface RenderOptions {
  showLidar: boolean;
  showDividers: boolean;
  showWaypoints: boolean;
  showTrails: boolean;
  activeFollowVehicle: VehicleModel | null;
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public camera: Camera;
  private skidmarks: { p1: Vector2D; p2: Vector2D; alpha: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get 2D canvas context');
    this.ctx = context;
    this.camera = new Camera(canvas.width, canvas.height);
  }

  public resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    this.camera.resize(width, height);
  }

  public clear(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    // Deep tech asphalt background
    this.ctx.fillStyle = '#090d16';
    this.ctx.fillRect(0, 0, w, h);

    // Subtle background grid
    this.drawGrid(w, h);
  }

  private drawGrid(w: number, h: number): void {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
    this.ctx.lineWidth = 1;
    const gridSize = 40;
    const offsetX = (this.camera.position.x * this.camera.zoom) % gridSize;
    const offsetY = (this.camera.position.y * this.camera.zoom) % gridSize;

    this.ctx.beginPath();
    for (let x = -offsetX; x < w; x += gridSize) {
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
    }
    for (let y = -offsetY; y < h; y += gridSize) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  public render(
    track: Track,
    egoVehicles: VehicleModel[],
    trafficVehicles: VehicleModel[],
    lidarSensors: (LidarSensor | null)[],
    options: RenderOptions
  ): void {
    this.clear();

    this.ctx.save();
    this.camera.applyTransform(this.ctx);

    // 1. Render Track (Asphalt surface, curbs, dividers)
    this.renderTrack(track, options);

    // 2. Render Skidmarks
    this.renderSkidmarks();

    // 3. Render NPC Traffic Vehicles
    for (const traffic of trafficVehicles) {
      this.renderVehicle(traffic, false);
    }

    // 4. Render Ego / AI Autonomous Vehicles
    for (let i = 0; i < egoVehicles.length; i++) {
      const vehicle = egoVehicles[i];
      const isLead = vehicle === options.activeFollowVehicle || i === 0;

      // Skip dead/crashed candidates so the starting grid stays clean and visible
      if (vehicle.state.isDamaged && !isLead) {
        continue;
      }

      this.renderVehicle(vehicle, isLead);

      // Render LiDAR for the active follow car
      if (options.showLidar && isLead && lidarSensors[i]) {
        this.renderLidar(lidarSensors[i]!);
      }
    }

    this.ctx.restore();
  }

  private renderTrack(track: Track, options: RenderOptions): void {
    if (track.leftBoundary.length < 2 || track.rightBoundary.length < 2) return;

    this.ctx.save();

    // A. Asphalt road surface polygon
    this.ctx.beginPath();
    // Trace left boundary forward
    this.ctx.moveTo(track.leftBoundary[0].x, track.leftBoundary[0].y);
    for (let i = 1; i < track.leftBoundary.length; i++) {
      this.ctx.lineTo(track.leftBoundary[i].x, track.leftBoundary[i].y);
    }
    // Trace right boundary backward to form a closed ribbon polygon
    for (let i = track.rightBoundary.length - 1; i >= 0; i--) {
      this.ctx.lineTo(track.rightBoundary[i].x, track.rightBoundary[i].y);
    }
    this.ctx.closePath();
    this.ctx.fillStyle = '#1e293b'; // Slate asphalt
    this.ctx.fill();

    // B. Road Margins / Curbs
    this.ctx.strokeStyle = '#f8fafc'; // Crisp white road edge
    this.ctx.lineWidth = 0.45;
    this.renderPolyline(track.leftBoundary);
    this.renderPolyline(track.rightBoundary);

    // Outer rumble strips
    this.ctx.strokeStyle = '#ef4444';
    this.ctx.lineWidth = 0.25;
    this.renderPolyline(track.leftBoundary);
    this.renderPolyline(track.rightBoundary);

    // C. Dashed Lane Dividers
    if (options.showDividers) {
      this.ctx.setLineDash([2.5, 3.5]);
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      this.ctx.lineWidth = 0.22;
      for (const divider of track.laneDividers) {
        this.renderPolyline(divider);
      }
      this.ctx.setLineDash([]);
    }

    // D. Waypoint handles for track editor
    if (options.showWaypoints) {
      for (const wp of track.spline.getWaypoints()) {
        this.ctx.beginPath();
        this.ctx.arc(wp.x, wp.y, 1.2, 0, Math.PI * 2);
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.fill();
        this.ctx.strokeStyle = '#0284c7';
        this.ctx.lineWidth = 0.3;
        this.ctx.stroke();
      }
    }

    this.ctx.restore();
  }

  private renderPolyline(points: Vector2D[]): void {
    if (points.length < 2) return;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.stroke();
  }

  public renderVehicle(vehicle: VehicleModel, isHighlighted: boolean): void {
    const v = vehicle.state;
    this.ctx.save();
    this.ctx.translate(v.position.x, v.position.y);
    this.ctx.rotate(v.heading);

    const length = vehicle.config.length;
    const width = vehicle.config.width;
    const halfL = length * 0.5;
    const halfW = width * 0.5;

    // 1. Headlights Projection Cone
    if (!v.isDamaged) {
      const grad = this.ctx.createRadialGradient(halfL, 0, 1, halfL + 12, 0, 18);
      grad.addColorStop(0, 'rgba(254, 240, 138, 0.35)');
      grad.addColorStop(0.7, 'rgba(254, 240, 138, 0.08)');
      grad.addColorStop(1, 'rgba(254, 240, 138, 0)');

      this.ctx.beginPath();
      this.ctx.moveTo(halfL, -halfW * 0.7);
      this.ctx.lineTo(halfL + 20, -halfW * 2.2);
      this.ctx.lineTo(halfL + 20, halfW * 2.2);
      this.ctx.lineTo(halfL, halfW * 0.7);
      this.ctx.closePath();
      this.ctx.fillStyle = grad;
      this.ctx.fill();
    }

    // 2. Steered Front Wheels
    this.ctx.fillStyle = '#0f172a';
    const wheelL = 0.85;
    const wheelW = 0.3;
    const frontAxleX = halfL * 0.65;
    const rearAxleX = -halfL * 0.65;

    // Front Left Wheel
    this.ctx.save();
    this.ctx.translate(frontAxleX, halfW);
    this.ctx.rotate(v.steerAngle);
    this.ctx.fillRect(-wheelL * 0.5, -wheelW * 0.5, wheelL, wheelW);
    this.ctx.restore();

    // Front Right Wheel
    this.ctx.save();
    this.ctx.translate(frontAxleX, -halfW);
    this.ctx.rotate(v.steerAngle);
    this.ctx.fillRect(-wheelL * 0.5, -wheelW * 0.5, wheelL, wheelW);
    this.ctx.restore();

    // Rear Wheels (fixed)
    this.ctx.fillRect(rearAxleX - wheelL * 0.5, halfW - wheelW * 0.5, wheelL, wheelW);
    this.ctx.fillRect(rearAxleX - wheelL * 0.5, -halfW - wheelW * 0.5, wheelL, wheelW);

    // 3. Vehicle Chassis (Aerodynamic Sports Body)
    this.ctx.beginPath();
    this.ctx.roundRect(-halfL, -halfW, length, width, [0.8, 1.2, 0.4, 0.4]);
    this.ctx.fillStyle = v.isDamaged ? '#334155' : vehicle.config.color;
    this.ctx.fill();

    this.ctx.lineWidth = isHighlighted ? 0.35 : 0.18;
    this.ctx.strokeStyle = isHighlighted ? '#38bdf8' : '#020617';
    this.ctx.stroke();

    // Windshield & Roof
    this.ctx.beginPath();
    this.ctx.roundRect(-halfL * 0.35, -halfW * 0.7, length * 0.55, width * 0.7, 0.3);
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fill();

    // 4. Rear Brake Lights
    this.ctx.fillStyle = v.speed > 0 ? '#ef4444' : '#7f1d1d';
    this.ctx.fillRect(-halfL, -halfW * 0.8, 0.3, 0.4);
    this.ctx.fillRect(-halfL, halfW * 0.4, 0.3, 0.4);

    // Skidmark generation
    if (v.isSkidding) {
      this.ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 0.4, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  public renderLidar(lidar: LidarSensor): void {
    this.ctx.save();
    this.ctx.lineWidth = 0.15;

    for (let i = 0; i < lidar.hits.length; i++) {
      const hit = lidar.hits[i];
      const beam = lidar.beams[i];
      if (!beam) continue;

      this.ctx.beginPath();
      this.ctx.moveTo(beam.start.x, beam.start.y);
      this.ctx.lineTo(hit.point.x, hit.point.y);

      if (hit.hitType === 'vehicle') {
        this.ctx.strokeStyle = '#ef4444'; // Red for vehicle
      } else if (hit.hitType === 'border') {
        this.ctx.strokeStyle = '#f59e0b'; // Amber for road border
      } else {
        this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)'; // Faint cyan for open range
      }
      this.ctx.stroke();

      // Hit point dot
      if (hit.hitType !== 'none') {
        this.ctx.beginPath();
        this.ctx.arc(hit.point.x, hit.point.y, 0.35, 0, Math.PI * 2);
        this.ctx.fillStyle = hit.hitType === 'vehicle' ? '#ef4444' : '#f59e0b';
        this.ctx.fill();
      }
    }
    this.ctx.restore();
  }

  private renderSkidmarks(): void {
    // Renders existing skid marks
  }
}
