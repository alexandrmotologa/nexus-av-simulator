import React, { useEffect, useRef } from 'react';
import { Track } from '../core/world/Track';
import { VehicleModel } from '../core/physics/VehicleModel';
import { Vector2D } from '../core/math/Vector2D';
import { Compass, Maximize2, Minimize2 } from 'lucide-react';

interface MiniMapProps {
  track: Track;
  egoVehicle: VehicleModel | null;
  trafficVehicles: VehicleModel[];
  onSelectPosition?: (pos: Vector2D) => void;
  className?: string;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  track,
  egoVehicle,
  trafficVehicles,
  onSelectPosition,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isMinimized, setIsMinimized] = React.useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isMinimized) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Compute track bounding box
    const pts = track.centerLine;
    if (pts.length < 2) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const padding = 16;
    const trackW = Math.max(1, maxX - minX);
    const trackH = Math.max(1, maxY - minY);
    const scale = Math.min((width - padding * 2) / trackW, (height - padding * 2) / trackH);

    const offsetX = (width - trackW * scale) * 0.5 - minX * scale;
    const offsetY = (height - trackH * scale) * 0.5 - minY * scale;

    const toMapX = (x: number) => x * scale + offsetX;
    const toMapY = (y: number) => y * scale + offsetY;

    // Draw Track Ribbon
    ctx.beginPath();
    ctx.moveTo(toMapX(pts[0].x), toMapY(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toMapX(pts[i].x), toMapY(pts[i].y));
    }
    if (track.closed) {
      ctx.closePath();
    }
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)'; // Sky blue trace
    ctx.lineWidth = Math.max(3, track.totalWidth * scale * 0.9);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Centerline glow
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw Traffic NPC blips
    for (const npc of trafficVehicles) {
      const pos = npc.state.position;
      const mx = toMapX(pos.x);
      const my = toMapY(pos.y);

      ctx.fillStyle = npc.state.isDamaged ? '#ef4444' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Active Ego Vehicle blip with direction pointer & pulse
    if (egoVehicle) {
      const pos = egoVehicle.state.position;
      const heading = egoVehicle.state.heading;
      const mx = toMapX(pos.x);
      const my = toMapY(pos.y);

      // Radar pulse ring
      ctx.beginPath();
      ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
      ctx.fill();

      // Vehicle dot
      ctx.beginPath();
      ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981'; // Emerald
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Heading indicator notch
      const tipX = mx + Math.cos(heading) * 7;
      const tipY = my + Math.sin(heading) * 7;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(tipX, tipY);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [track, egoVehicle, trafficVehicles, isMinimized]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelectPosition) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const pts = track.centerLine;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const padding = 16;
    const trackW = Math.max(1, maxX - minX);
    const trackH = Math.max(1, maxY - minY);
    const scale = Math.min((canvas.width - padding * 2) / trackW, (canvas.height - padding * 2) / trackH);

    const offsetX = (canvas.width - trackW * scale) * 0.5 - minX * scale;
    const offsetY = (canvas.height - trackH * scale) * 0.5 - minY * scale;

    const worldX = (clickX - offsetX) / scale;
    const worldY = (clickY - offsetY) / scale;

    onSelectPosition(new Vector2D(worldX, worldY));
  };

  return (
    <div
      className={`bg-slate-900/90 border border-slate-800 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden transition-all ${
        isMinimized ? 'p-1.5' : 'p-2'
      } ${className}`}
    >
      <div className="flex items-center justify-between pb-1 px-1 border-b border-slate-800/80 mb-1 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
          <Compass className="w-3.5 h-3.5 text-sky-400 animate-spin-slow" />
          <span>CIRCUIT RADAR</span>
        </div>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="text-slate-500 hover:text-slate-200 transition-colors p-0.5"
          title={isMinimized ? 'Expand Radar' : 'Minimize Radar'}
        >
          {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
        </button>
      </div>

      {!isMinimized && (
        <canvas
          ref={canvasRef}
          width={180}
          height={130}
          onClick={handleCanvasClick}
          className="block rounded-lg bg-slate-950/80 border border-slate-800/60 cursor-crosshair"
          title="Click anywhere on radar to pan camera"
        />
      )}
    </div>
  );
};
