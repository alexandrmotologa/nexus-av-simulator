import React, { useRef, useEffect, useState } from 'react';
import { Camera, Eye, Scan, Maximize2, Minimize2, Activity } from 'lucide-react';
import { VisionDetectionResult } from '../core/sensors/VisionProcessor';

interface CameraFeedHUDProps {
  cameraCanvas: HTMLCanvasElement | null;
  visionResult: VisionDetectionResult | null;
  cameraViewMode: 'FRONT' | 'REAR' | 'BEV';
  onSelectCameraViewMode: (mode: 'FRONT' | 'REAR' | 'BEV') => void;
}

export const CameraFeedHUD: React.FC<CameraFeedHUDProps> = ({
  cameraCanvas,
  visionResult,
  cameraViewMode,
  onSelectCameraViewMode,
}) => {
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visionMode, setVisionMode] = useState<'RGB' | 'EDGES' | 'COMBINED'>('COMBINED');
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  useEffect(() => {
    let animId: number;

    const renderFrame = () => {
      const displayCanvas = displayCanvasRef.current;
      if (displayCanvas && cameraCanvas) {
        const ctx = displayCanvas.getContext('2d');
        if (ctx) {
          const w = displayCanvas.width;
          const h = displayCanvas.height;

          // 1. Draw base camera image
          if (cameraViewMode === 'FRONT' && visionResult && visionMode === 'EDGES') {
            const edgeImgData = new ImageData(
              visionResult.edgeMagnitudeMap as any,
              visionResult.width,
              visionResult.height
            );
            ctx.putImageData(edgeImgData, 0, 0);
          } else {
            ctx.drawImage(cameraCanvas, 0, 0, w, h);

            if (cameraViewMode === 'FRONT' && visionResult && visionMode === 'COMBINED') {
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

          // 2. Synthetic Vision Overlays (Front Mode Only)
          if (cameraViewMode === 'FRONT' && visionResult) {
            const scaleX = w / visionResult.width;
            const scaleY = h / visionResult.height;

            // Vanishing Point Crosshair
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

            // Detected Lane Lines
            ctx.lineWidth = 2;
            if (visionResult.leftLaneX !== null) {
              const lx = visionResult.leftLaneX * scaleX;
              ctx.strokeStyle = '#22c55e';
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

            // Detected Obstacle Bounding Boxes & Distance Tags
            for (const box of visionResult.obstacles) {
              const bx = box.x * scaleX;
              const by = box.y * scaleY;
              const bw = box.width * scaleX;
              const bh = box.height * scaleY;

              ctx.strokeStyle = '#eab308';
              ctx.lineWidth = 1.5;
              ctx.strokeRect(bx, by, bw, bh);

              ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
              ctx.fillRect(bx, by - 12, 42, 11);
              ctx.fillStyle = '#facc15';
              ctx.font = '9px monospace';
              ctx.fillText(`${box.distanceEstimate}m`, bx + 2, by - 3);
            }
          }
        }
      }
      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [cameraCanvas, visionResult, visionMode, cameraViewMode]);

  return (
    <div className="absolute bottom-20 right-4 z-30 flex flex-col items-end">
      {/* HUD Header Bar */}
      <div className="flex items-center justify-between w-72 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-t-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-300 shadow-xl">
        {/* Surround View Mode Selector */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded border border-slate-800 text-[10px]">
          {(['FRONT', 'REAR', 'BEV'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onSelectCameraViewMode(mode)}
              className={`px-1.5 py-0.5 rounded font-bold transition-all ${
                cameraViewMode === mode
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {cameraViewMode === 'FRONT' && (
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
          )}

          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-0.5 text-slate-400 hover:text-white rounded"
            title={isMinimized ? 'Expand Camera HUD' : 'Minimize Camera HUD'}
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Camera Video Viewport */}
      {!isMinimized && (
        <div className="relative w-72 bg-slate-950 border-x border-b border-slate-800 rounded-b-lg overflow-hidden shadow-2xl">
          <canvas
            ref={displayCanvasRef}
            width={160}
            height={80}
            className="w-full h-36 object-cover block"
          />

          {/* Real-time CV Metrics Footer */}
          <div className="flex items-center justify-between px-2.5 py-1 bg-slate-900/95 border-t border-slate-800/80 font-mono text-[10px] text-slate-400">
            {cameraViewMode === 'FRONT' ? (
              <>
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
              </>
            ) : cameraViewMode === 'REAR' ? (
              <div className="flex items-center justify-between w-full text-emerald-400 font-semibold">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 animate-pulse" /> BACKUP TRAJECTORY ACTIVE
                </span>
                <span className="text-slate-400 text-[9px]">PDC LIVE</span>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full text-cyan-400 font-semibold">
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" /> 360° LIDAR OCCUPANCY
                </span>
                <span className="text-slate-400 text-[9px]">50M POLAR GRID</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
