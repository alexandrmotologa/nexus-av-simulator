import React, { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';

interface GGFrictionCircleProps {
  lateralG: number; // Lateral acceleration in Gs (negative = left, positive = right)
  longitudinalG: number; // Longitudinal acceleration in Gs (positive = accel, negative = braking)
  isSkidding: boolean;
  className?: string;
}

export const GGFrictionCircle: React.FC<GGFrictionCircleProps> = ({
  lateralG,
  longitudinalG,
  isSkidding,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const trailRef = useRef<{ x: number; y: number; alpha: number }[]>([]);

  const size = 130;
  const center = size / 2;
  const maxG = 1.4; // Max visible G scale
  const scale = (center - 12) / maxG;

  // Compute point coordinates
  const px = center + lateralG * scale;
  const py = center - longitudinalG * scale; // SVG y is inverted (up is negative y)
  const totalG = Math.hypot(lateralG, longitudinalG);

  useEffect(() => {
    // Add point to fading trail
    trailRef.current.push({ x: px, y: py, alpha: 1.0 });
    if (trailRef.current.length > 10) trailRef.current.shift();
    // Decay alphas
    for (const t of trailRef.current) {
      t.alpha *= 0.82;
    }
  }, [px, py]);

  const gripColor = isSkidding
    ? '#ef4444' // Red on tire slip / skid
    : totalG > 0.85
    ? '#f59e0b' // Amber at high tire limit
    : '#06b6d4'; // Cyan normal optimal grip

  return (
    <div className={`bg-slate-900/95 border border-slate-800 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden font-mono text-xs text-slate-200 transition-all ${className}`}>
      {/* Header bar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-950/80 hover:bg-slate-900 text-sky-400 font-semibold text-xs border-b border-slate-800 transition-all"
      >
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>KAMM G-G FRICTION CIRCLE</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <span className="text-[10px] text-slate-400 font-normal">
            {totalG.toFixed(2)} G
          </span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Circle Content */}
      {isOpen && (
        <div className="p-2.5 flex flex-col items-center">
          <svg width={size} height={size} className="overflow-visible select-none">
            {/* Background grid concentric G-rings */}
            <circle cx={center} cy={center} r={0.5 * scale} fill="none" stroke="#334155" strokeWidth="0.8" strokeDasharray="3 3" />
            <circle cx={center} cy={center} r={1.0 * scale} fill="none" stroke="#475569" strokeWidth="1" />
            <circle cx={center} cy={center} r={1.2 * scale} fill="rgba(239, 68, 68, 0.05)" stroke="#ef4444" strokeWidth="0.8" strokeDasharray="2 2" />

            {/* Crosshairs */}
            <line x1={12} y1={center} x2={size - 12} y2={center} stroke="#334155" strokeWidth="0.8" />
            <line x1={center} y1={12} x2={center} y2={size - 12} stroke="#334155" strokeWidth="0.8" />

            {/* Axis Labels */}
            <text x={center} y={8} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="bold">ACC</text>
            <text x={center} y={size - 2} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="bold">BRK</text>
            <text x={8} y={center + 3} textAnchor="end" fill="#64748b" fontSize="8" fontWeight="bold">L</text>
            <text x={size - 6} y={center + 3} textAnchor="start" fill="#64748b" fontSize="8" fontWeight="bold">R</text>

            {/* 1.0G Label */}
            <text x={center + 1.0 * scale + 2} y={center - 3} fill="#475569" fontSize="7">1G</text>

            {/* Fading motion trail */}
            {trailRef.current.map((t, idx) => (
              <circle
                key={idx}
                cx={t.x}
                cy={t.y}
                r={2}
                fill={gripColor}
                opacity={t.alpha * 0.4}
              />
            ))}

            {/* Dynamic Active G-Vector Line */}
            <line
              x1={center}
              y1={center}
              x2={px}
              y2={py}
              stroke={gripColor}
              strokeWidth="1.2"
              opacity="0.8"
            />

            {/* Active Friction Dot */}
            <circle
              cx={px}
              cy={py}
              r={4}
              fill={gripColor}
              className="transition-all duration-75"
            />
            <circle
              cx={px}
              cy={py}
              r={7}
              fill="none"
              stroke={gripColor}
              strokeWidth="1"
              opacity="0.5"
            />
          </svg>

          {/* Real-time numerical readouts */}
          <div className="w-full mt-2 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <div>
              Lat: <span className="text-slate-200 font-semibold">{lateralG >= 0 ? `+${lateralG.toFixed(2)}` : lateralG.toFixed(2)} G</span>
            </div>
            <div>
              Long: <span className="text-slate-200 font-semibold">{longitudinalG >= 0 ? `+${longitudinalG.toFixed(2)}` : longitudinalG.toFixed(2)} G</span>
            </div>
            <div className={`font-bold ${isSkidding ? 'text-rose-400' : totalG > 0.85 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {isSkidding ? 'SLIP' : totalG > 0.85 ? 'LIMIT' : 'GRIP'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
