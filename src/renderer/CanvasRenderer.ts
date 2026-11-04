import { Camera } from './Camera';
import { Track } from '../core/world/Track';
import { VehicleModel } from '../core/physics/VehicleModel';
import { LidarSensor } from '../core/sensors/LidarSensor';
import { Vector2D } from '../core/math/Vector2D';
import { RoadObstacle } from '../core/world/Obstacle';

export interface RenderOptions {
  showLidar: boolean;
  showDividers: boolean;
  showWaypoints: boolean;
  showTrails: boolean;
  activeFollowVehicle: VehicleModel | null;
  obstacles?: RoadObstacle[];
  weather?: 'DRY' | 'WET' | 'NIGHT' | 'FOG';
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public camera: Camera;
  private skidmarks: { p1: Vector2D; p2: Vector2D; alpha: number }[] = [];
  private rainDrops: { x: number; y: number; l: number; s: number }[] = [];

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
      this.renderVehicle(traffic, false, options.weather);
    }

    // 4. Render Ego / AI Autonomous Vehicles
    const isMultiFleet = egoVehicles.length > 1;
    for (let i = 0; i < egoVehicles.length; i++) {
      const vehicle = egoVehicles[i];
      const isLead = vehicle === options.activeFollowVehicle || (options.activeFollowVehicle === null && i === 0);

      // Skip dead/crashed candidates so the track stays clean
      if (vehicle.state.isDamaged && !isLead) {
        continue;
      }

      this.ctx.save();
      if (isMultiFleet && !isLead) {
        this.ctx.globalAlpha = 0.32; // Clean semi-transparent ghost fleet runner
      }

      this.renderVehicle(vehicle, isLead, options.weather);
      this.ctx.restore();

      // Render LiDAR for the active follow car
      if (options.showLidar && isLead && lidarSensors[i]) {
        this.renderLidar(lidarSensors[i]!);
      }
    }

    // 5. Render Dynamic Sandbox Hazards (Cones & Barriers)
    if (options.obstacles) {
      for (const obs of options.obstacles) {
        this.renderObstacle(obs);
      }
    }

    this.ctx.restore();

    // 6. Weather Screen Effects (Rain Streaks / Fog Clouds)
    if (options.weather === 'WET') {
      this.renderRainEffect();
    } else if (options.weather === 'FOG') {
      this.renderFogEffect();
    }
  }

  private renderObstacle(obs: RoadObstacle): void {
    this.ctx.save();
    this.ctx.translate(obs.position.x, obs.position.y);

    if (obs.type === 'cone') {
      // Traffic Cone: Drop shadow
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      this.ctx.beginPath();
      this.ctx.ellipse(0.3, 0.3, obs.radius * 1.1, obs.radius * 0.7, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Outer orange base
      this.ctx.fillStyle = '#ea580c';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = '#c2410c';
      this.ctx.lineWidth = 0.2;
      this.ctx.stroke();

      // Middle reflective white band
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, obs.radius * 0.65, 0, Math.PI * 2);
      this.ctx.fill();

      // Inner orange cone tip
      this.ctx.fillStyle = '#f97316';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, obs.radius * 0.35, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      // Heavy Concrete / Hazard Barrier
      this.ctx.rotate(obs.heading);
      const w = 4.2;
      const h = 1.6;
      this.ctx.fillStyle = '#eab308'; // Warning yellow
      this.ctx.fillRect(-w * 0.5, -h * 0.5, w, h);

      // Black hazard diagonal stripes
      this.ctx.strokeStyle = '#0f172a';
      this.ctx.lineWidth = 0.5;
      for (let x = -w * 0.5 + 0.4; x < w * 0.5; x += 0.8) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, -h * 0.5);
        this.ctx.lineTo(x + 0.4, h * 0.5);
        this.ctx.stroke();
      }

      this.ctx.strokeStyle = '#ca8a04';
      this.ctx.lineWidth = 0.15;
      this.ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
    }

    this.ctx.restore();
  }

  private renderRainEffect(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    if (this.rainDrops.length < 90) {
      for (let i = 0; i < 90; i++) {
        this.rainDrops.push({
          x: Math.random() * w,
          y: Math.random() * h,
          l: 12 + Math.random() * 18,
          s: 16 + Math.random() * 14,
        });
      }
    }

    this.ctx.save();
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Screen space
    this.ctx.strokeStyle = 'rgba(186, 230, 253, 0.28)';
    this.ctx.lineWidth = 1.2;

    this.ctx.beginPath();
    for (const drop of this.rainDrops) {
      drop.y += drop.s;
      drop.x -= drop.s * 0.25;
      if (drop.y > h) {
        drop.y = -20;
        drop.x = Math.random() * (w + 100);
      }
      this.ctx.moveTo(drop.x, drop.y);
      this.ctx.lineTo(drop.x - drop.l * 0.25, drop.y + drop.l);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  private renderFogEffect(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    this.fogOffset += 0.4;

    this.ctx.save();
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Screen space

    // Translucent cool fog mist layer
    this.ctx.fillStyle = 'rgba(148, 163, 184, 0.24)';
    this.ctx.fillRect(0, 0, w, h);

    // Drifting atmospheric aerosol fog clouds
    this.ctx.fillStyle = 'rgba(241, 245, 249, 0.08)';
    for (let i = 0; i < 7; i++) {
      const cx = ((i * 260 + this.fogOffset * 1.8) % (w + 400)) - 200;
      const cy = (i * 110 + Math.sin(this.fogOffset * 0.015 + i) * 60) % h;
      this.ctx.beginPath();
      this.ctx.ellipse(cx, cy, 240, 100, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  private renderTrack(track: Track, options: RenderOptions): void {
    if (track.leftBoundary.length < 2 || track.rightBoundary.length < 2) return;

    this.ctx.save();

    const isNight = options.weather === 'NIGHT';
    const isWet = options.weather === 'WET';

    // A. Asphalt road surface polygon
    this.ctx.beginPath();
    this.ctx.moveTo(track.leftBoundary[0].x, track.leftBoundary[0].y);
    for (let i = 1; i < track.leftBoundary.length; i++) {
      this.ctx.lineTo(track.leftBoundary[i].x, track.leftBoundary[i].y);
    }
    for (let i = track.rightBoundary.length - 1; i >= 0; i--) {
      this.ctx.lineTo(track.rightBoundary[i].x, track.rightBoundary[i].y);
    }
    this.ctx.closePath();
    this.ctx.fillStyle = isNight ? '#0a0e1a' : isWet ? '#111827' : '#1e293b';
    this.ctx.fill();

    // B. Road Margins / Curbs
    this.ctx.strokeStyle = isNight ? '#38bdf8' : '#f8fafc';
    this.ctx.lineWidth = 0.45;
    this.renderPolyline(track.leftBoundary);
    this.renderPolyline(track.rightBoundary);

    // Outer rumble strips
    this.ctx.strokeStyle = isNight ? '#06b6d4' : '#ef4444';
    this.ctx.lineWidth = 0.25;
    this.renderPolyline(track.leftBoundary);
    this.renderPolyline(track.rightBoundary);

    // C. Realistic Highway & Street Road Markings (Dashed White, Solid White, Double Solid Yellow)
    if (options.showDividers) {
      const details = track.laneDividerDetails.length > 0
        ? track.laneDividerDetails
        : track.laneDividers.map((pts, i) => ({ index: i, type: 'DASHED_WHITE' as const, points: pts }));

      for (const item of details) {
        if (item.type === 'DOUBLE_SOLID_YELLOW') {
          // Double Solid Yellow Line (Two parallel continuous yellow stripes dividing opposing traffic)
          this.ctx.setLineDash([]);
          // Outer yellow band
          this.ctx.strokeStyle = '#facc15';
          this.ctx.lineWidth = 0.48;
          this.renderPolyline(item.points);
          // Inner asphalt divider gap
          this.ctx.strokeStyle = isNight ? '#0a0e1a' : isWet ? '#111827' : '#1e293b';
          this.ctx.lineWidth = 0.16;
          this.renderPolyline(item.points);
        } else if (item.type === 'SOLID_WHITE') {
          // Solid White Line (Lane discipline / no overtaking)
          this.ctx.setLineDash([]);
          this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          this.ctx.lineWidth = 0.24;
          this.renderPolyline(item.points);
        } else {
          // Standard Dashed White Line (Overtaking / lane changes permitted)
          this.ctx.setLineDash([3.0, 3.2]);
          this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          this.ctx.lineWidth = 0.22;
          this.renderPolyline(item.points);
        }
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

  private fogOffset: number = 0;

  public renderVehicle(
    vehicle: VehicleModel,
    isHighlighted: boolean,
    weather: 'DRY' | 'WET' | 'NIGHT' | 'FOG' = 'DRY'
  ): void {
    const v = vehicle.state;
    this.ctx.save();
    this.ctx.translate(v.position.x, v.position.y);
    this.ctx.rotate(v.heading);

    const length = vehicle.config.length;
    const width = vehicle.config.width;
    const halfL = length * 0.5;
    const halfW = width * 0.5;

    // 1. Dynamic Weather-Sensitive Headlights
    // Distance and beam spread are scaled according to atmospheric visibility
    const shouldDrawHeadlights =
      !v.isDamaged &&
      (isHighlighted ||
        vehicle.config.id.startsWith('traffic-') ||
        !vehicle.config.id.startsWith('ai-agent-'));

    if (shouldDrawHeadlights) {
      let beamLength = 22.0;
      let beamSpread = 2.2;
      let beamAlpha = 0.35;

      if (weather === 'FOG') {
        beamLength = 11.0; // Fog aerosol particles absorb & diffuse headlight beam
        beamSpread = 3.4; // Wide short diffuse halo
        beamAlpha = 0.58;
      } else if (weather === 'WET') {
        beamLength = 17.0; // Rain scatter and dark asphalt absorption
        beamSpread = 2.5;
        beamAlpha = 0.3;
      } else if (weather === 'NIGHT') {
        beamLength = 26.0; // Sharp high-contrast forward penetration through dark night
        beamSpread = 2.0;
        beamAlpha = 0.45;
      }

      const grad = this.ctx.createRadialGradient(halfL, 0, 1, halfL + beamLength * 0.6, 0, beamLength);
      grad.addColorStop(0, `rgba(254, 240, 138, ${beamAlpha})`);
      grad.addColorStop(0.7, `rgba(254, 240, 138, ${beamAlpha * 0.25})`);
      grad.addColorStop(1, 'rgba(254, 240, 138, 0)');

      this.ctx.beginPath();
      this.ctx.moveTo(halfL, -halfW * 0.7);
      this.ctx.lineTo(halfL + beamLength, -halfW * beamSpread);
      this.ctx.lineTo(halfL + beamLength, halfW * beamSpread);
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
