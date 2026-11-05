import React, { useRef, useEffect, useState } from 'react';
import { Camera, Eye, Scan, Maximize2, Minimize2, Activity } from 'lucide-react';
import { VisionDetectionResult } from '../core/sensors/VisionProcessor';

interface CameraFeedHUDProps {
  cameraCanvas: HTMLCanvasElement | null;
  visionResult: VisionDetectionResult | null;
}

export const CameraFeedHUD: React.FC<CameraFeedHUDProps> = ({ cameraCanvas, visionResult }) => {
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visionMode, setVisionMode] = useState<'RGB' | 'EDGES' | 'COMBINED'>('COMBINED');
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  useEffect(() => {
    const displayCanvas = displayCanvasRef.current;
    if (!displayCanvas || !cameraCanvas || !visionResult) return;

    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;

    const w = displayCanvas.width;
    const h = displayCanvas.height;

    // 1. Draw base camera image
    if (visionMode === 'EDGES') {
      const edgeImgData = new ImageData(
        visionResult.edgeMagnitudeMap as any,
        visionResult.width,
        visionResult.height
      );
      ctx.putImageData(edgeImgData, 0, 0);
    } else {
      ctx.drawImage(cameraCanvas, 0, 0, w, h);

      if (visionMode === 'COMBINED') {
        // Overlay transparent edge map
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = visionResult.width;
        tempCanvas.height = visionResult.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          const edgeImgData = new ImageData(
            visionResult.edgeMagnitudeMap as any,
            visionResult.width,
            visionResult.height
          );
          tempCtx.putImageData(edgeImgData, 0, 0);
          ctx.globalAlpha = 0.6;
          ctx.drawImage(tempCanvas, 0, 0, w, h);
          ctx.globalAlpha = 1.0;
        }
      }
    }

    // 2. Draw HUD Synthetic Vision Overlays
    const scaleX = w / visionResult.width;
    const scaleY = h / visionResult.height;

    // A. Vanishing Point Crosshair
    const horizonY = h * 0.44;
    const centerX = w * 0.5;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - 8, horizonY);
    ctx.lineTo(centerX + 8, horizonY);
    ctx.moveTo(centerX, horizonY - 8);
    ctx.lineTo(centerX, horizonY + 8);
    ctx.stroke();

    // B. Detected Lane Lines
    ctx.lineWidth = 2;
    if (visionResult.leftLaneX !== null) {
      const lx = visionResult.leftLaneX * scaleX;
      ctx.strokeStyle = '#22c55e'; // Green lane lock
      ctx.beginPath();
      ctx.moveTo(centerX * 0.85, horizonY + 6);
      ctx.lineTo(lx, h);
      ctx.stroke();
    }

    if (visionResult.rightLaneX !== null) {
      const rx = visionResult.rightLaneX * scaleX;
      ctx.strokeStyle = '#22c55e';
      ctx.beginPath();
      ctx.moveTo(centerX * 1.15, horizonY + 6);
      ctx.lineTo(rx, h);
      ctx.stroke();
    }

    // C. Detected Obstacle Bounding Boxes & Distance Tags
    for (const box of visionResult.obstacles) {
      const bx = box.x * scaleX;
      const by = box.y * scaleY;
      const bw = box.width * scaleX;
      const bh = box.height * scaleY;

      ctx.strokeStyle = '#eab308'; // Warning amber bounding box
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, bw, bh);

      // Distance tag
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(bx, by - 12, 42, 11);
      ctx.fillStyle = '#facc15';
      ctx.font = '9px monospace';
      ctx.fillText(`${box.distanceEstimate}m`, bx + 2, by - 3);
    }
  }, [cameraCanvas, visionResult, visionMode]);

  return (
    <div className="absolute bottom-20 right-4 z-30 flex flex-col items-end">
      {/* HUD Header Bar */}
      <div className="flex items-center justify-between w-64 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-t-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-300">
        <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
          <Camera className="w-3.5 h-3.5" />
          <span>FRONT CAMERA</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              setVisionMode((m) => (m === 'RGB' ? 'COMBINED' : m === 'COMBINED' ? 'EDGES' : 'RGB'))
            }
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
              visionMode === 'COMBINED'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : visionMode === 'EDGES'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}
            title="Toggle Vision Mode: RGB / Edge Sobel / Combined"
          >
            {visionMode}
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-0.5 text-slate-400 hover:text-white rounded"
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Camera Video Viewport */}
      {!isMinimized && (
        <div className="relative w-64 bg-slate-950 border-x border-b border-slate-800 rounded-b-lg overflow-hidden shadow-2xl">
          <canvas
            ref={displayCanvasRef}
            width={160}
            height={80}
            className="w-full h-32 object-cover block"
          />

          {/* Real-time CV Metrics Footer */}
          <div className="flex items-center justify-between px-2.5 py-1 bg-slate-900/95 border-t border-slate-800/80 font-mono text-[10px] text-slate-400">
            <div className="flex items-center gap-1">
              <Scan className="w-3 h-3 text-emerald-400" />
              <span>
                CONF: <span className="text-emerald-400 font-bold">{Math.round((visionResult?.laneConfidence || 0) * 100)}%</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span>OFFSET:</span>
              <span
                className={`font-bold ${
                  Math.abs(visionResult?.centerOffset || 0) > 0.35 ? 'text-amber-400' : 'text-slate-200'
                }`}
              >
                {((visionResult?.centerOffset || 0) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
