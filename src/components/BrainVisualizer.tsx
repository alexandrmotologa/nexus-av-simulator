import React, { useEffect, useRef } from 'react';
import { NeuralNetwork } from '../core/ai/NeuralNetwork';

interface BrainVisualizerProps {
  brain: NeuralNetwork | null;
  className?: string;
}

export const BrainVisualizer: React.FC<BrainVisualizerProps> = ({ brain, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !brain || brain.layers.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Deep tech background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    const layerCount = brain.layers.length + 1; // Inputs + hidden/outputs
    const layerSpacing = width / layerCount;

    // Calculate node coordinates for each layer
    const layerNodes: { x: number; y: number; val: number }[][] = [];

    // 1. Input Layer
    const inputLayer = brain.layers[0];
    const inCount = Math.min(28, inputLayer.inputsCount);
    const inNodes: { x: number; y: number; val: number }[] = [];
    const inYSpacing = height / (inCount + 1);

    for (let i = 0; i < inCount; i++) {
      inNodes.push({
        x: layerSpacing * 0.6,
        y: inYSpacing * (i + 1),
        val: inputLayer.lastInputs[i] || 0,
      });
    }
    layerNodes.push(inNodes);

    // 2. Hidden & Output Layers
    for (let l = 0; l < brain.layers.length; l++) {
      const layer = brain.layers[l];
      const count = layer.outputsCount;
      const ySpacing = height / (count + 1);
      const nodes: { x: number; y: number; val: number }[] = [];

      for (let o = 0; o < count; o++) {
        nodes.push({
          x: layerSpacing * (l + 1.6),
          y: ySpacing * (o + 1),
          val: layer.lastOutputs[o] || 0,
        });
      }
      layerNodes.push(nodes);
    }

    // 3. Render Synaptic Connections (Weights)
    for (let l = 0; l < brain.layers.length; l++) {
      const layer = brain.layers[l];
      const prevNodes = layerNodes[l];
      const nextNodes = layerNodes[l + 1];

      for (let o = 0; o < nextNodes.length; o++) {
        const offset = o * layer.inputsCount;
        for (let i = 0; i < prevNodes.length; i++) {
          const weight = layer.weights[offset + i] || 0;
          const absW = Math.min(2.5, Math.abs(weight));

          ctx.beginPath();
          ctx.moveTo(prevNodes[i].x, prevNodes[i].y);
          ctx.lineTo(nextNodes[o].x, nextNodes[o].y);

          // Green for positive excitation, Orange/Red for inhibitory
          if (weight > 0) {
            ctx.strokeStyle = `rgba(16, 185, 129, ${Math.min(0.8, absW * 0.4)})`;
          } else {
            ctx.strokeStyle = `rgba(239, 68, 68, ${Math.min(0.8, absW * 0.4)})`;
          }
          ctx.lineWidth = Math.max(0.5, absW * 0.8);
          ctx.stroke();
        }
      }
    }

    // 4. Render Neurons
    for (let l = 0; l < layerNodes.length; l++) {
      const nodes = layerNodes[l];
      const isOutput = l === layerNodes.length - 1;
      const isInput = l === 0;

      for (let n = 0; n < nodes.length; n++) {
        const node = nodes[n];
        const activation = Math.max(-1, Math.min(1, node.val));

        ctx.beginPath();
        ctx.arc(node.x, node.y, isOutput ? 6 : isInput ? 3.5 : 4.5, 0, Math.PI * 2);

        if (activation > 0) {
          ctx.fillStyle = `rgba(56, 189, 248, ${0.3 + activation * 0.7})`;
        } else {
          ctx.fillStyle = `rgba(148, 163, 184, 0.4)`;
        }
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Output Labels
    const outputLabels = ['THR', 'BRK', 'STR'];
    const outNodes = layerNodes[layerNodes.length - 1];
    ctx.font = '9px monospace';
    ctx.fillStyle = '#94a3b8';
    for (let o = 0; o < outNodes.length; o++) {
      ctx.fillText(outputLabels[o] || `O${o}`, outNodes[o].x + 9, outNodes[o].y + 3);
    }
  }, [brain]);

  return (
    <div className={`flex flex-col bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 shadow-xl backdrop-blur-md ${className}`}>
      <div className="flex items-center justify-between mb-1.5 text-xs font-mono text-slate-300">
        <span className="font-semibold flex items-center gap-1.5 text-sky-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          NEURAL SYNAPSE MONITOR
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          {brain && brain.layers.length > 0
            ? `${brain.layers[0].inputsCount} In → ${brain.layers.map((l) => l.outputsCount).join(' → ')} Out`
            : '26 In → 20 → 14 → 3 Out'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={240}
        height={150}
        className="w-full rounded bg-slate-950 border border-slate-800/80"
      />
    </div>
  );
};
