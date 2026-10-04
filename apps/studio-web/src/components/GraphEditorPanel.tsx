import React, { useRef, useEffect, useState } from 'react';
import type { Composition, Keyframe, Property } from '../model';

interface GraphEditorPanelProps {
  composition: Composition;
  selectedLayerId: string | null;
  selectedPropertyKey: string;
  currentTime: number;
  onSeek: (time: number) => void;
  onSelectPropertyKey: (key: string) => void;
  onUpdateKeyframeInterpolation: (
    keyframeId: string,
    interpolation: Keyframe['interpolation']
  ) => void;
  onSwitchToTimeline: () => void;
}

export const GraphEditorPanel: React.FC<GraphEditorPanelProps> = ({
  composition,
  selectedLayerId,
  selectedPropertyKey,
  currentTime,
  onSeek,
  onSelectPropertyKey,
  onUpdateKeyframeInterpolation,
  onSwitchToTimeline,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [graphMode, setGraphMode] = useState<'value' | 'speed'>('value');
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);

  const selectedLayer = composition.layers.find((l) => l.id === selectedLayerId);
  const transform = selectedLayer?.transform;
  const prop = transform
    ? ((transform as any)[selectedPropertyKey] as Property<any> | undefined)
    : undefined;

  // Render graph curve on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Dark background
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, width, height);

    // Horizontal grid lines
    ctx.strokeStyle = '#181e28';
    ctx.lineWidth = 1;
    const numH = 6;
    for (let i = 0; i <= numH; i++) {
      const y = (i / numH) * (height - 30) + 15;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Vertical time grid lines
    const duration = composition.duration;
    for (let sec = 0; sec <= duration; sec += 1) {
      const x = (sec / duration) * (width - 60) + 30;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(`${sec}s`, x + 4, height - 8);
    }

    if (!prop || !prop.keyframes || prop.keyframes.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `No keyframes on ${prop?.name || selectedPropertyKey}. Toggle "◇ Keyframe" to inspect curves.`,
        width / 2,
        height / 2
      );
      return;
    }

    // Extract numeric values
    const keyframes = [...prop.keyframes].sort((a, b) => a.time - b.time);
    const numericKfs = keyframes.map((k) => {
      let val = 0;
      if (typeof k.value === 'number') val = k.value;
      else if (Array.isArray(k.value)) val = Number(k.value[0]) || 0;
      return { time: k.time, val, interpolation: k.interpolation, id: k.id };
    });

    const values = numericKfs.map((k) => k.val);
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    if (minVal === maxVal) {
      minVal -= 10;
      maxVal += 10;
    }
    const valRange = maxVal - minVal;

    const toX = (t: number) => (t / duration) * (width - 60) + 30;
    const toY = (v: number) => height - 35 - ((v - minVal) / valRange) * (height - 70);

    // Value or Speed Curve
    ctx.strokeStyle = graphMode === 'value' ? '#38bdf8' : '#eab308';
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    const sampleStep = 0.04;
    let prevVal = numericKfs[0].val;

    for (let t = 0; t <= duration; t += sampleStep) {
      let val = values[0];
      if (t <= keyframes[0].time) {
        val = numericKfs[0].val;
      } else if (t >= keyframes[keyframes.length - 1].time) {
        val = numericKfs[numericKfs.length - 1].val;
      } else {
        for (let i = 0; i < numericKfs.length - 1; i++) {
          const l = numericKfs[i];
          const r = numericKfs[i + 1];
          if (t >= l.time && t <= r.time) {
            const dt = r.time - l.time;
            const frac = dt > 0 ? (t - l.time) / dt : 0;
            if (l.interpolation === 'hold') {
              val = l.val;
            } else if (l.interpolation === 'ease-in-out') {
              // Smooth cubic Hermite curve
              const smooth = frac * frac * (3 - 2 * frac);
              val = l.val + (r.val - l.val) * smooth;
            } else if (l.interpolation === 'ease-in') {
              val = l.val + (r.val - l.val) * (frac * frac);
            } else if (l.interpolation === 'ease-out') {
              val = l.val + (r.val - l.val) * (1 - (1 - frac) * (1 - frac));
            } else {
              val = l.val + (r.val - l.val) * frac;
            }
            break;
          }
        }
      }

      const displayVal = graphMode === 'value' ? val : Math.abs(val - prevVal) / sampleStep;
      prevVal = val;

      const x = toX(t);
      const y = toY(displayVal);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Keyframe handles & markers
    for (const kf of numericKfs) {
      const kfX = toX(kf.time);
      const kfY = toY(kf.val);
      const isSelected = kf.id === selectedKeyframeId;

      ctx.fillStyle = isSelected ? '#38bdf8' : '#f59e0b';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = isSelected ? 2 : 1.5;

      ctx.beginPath();
      ctx.moveTo(kfX, kfY - 7);
      ctx.lineTo(kfX + 7, kfY);
      ctx.lineTo(kfX, kfY + 7);
      ctx.lineTo(kfX - 7, kfY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Label with value
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px monospace';
      ctx.fillText(`${kf.val.toFixed(1)}`, kfX + 10, kfY - 3);
    }

    // Playhead indicator line
    const playheadX = toX(currentTime);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(playheadX - 6, 0);
    ctx.lineTo(playheadX + 6, 0);
    ctx.lineTo(playheadX, 10);
    ctx.closePath();
    ctx.fill();
  }, [
    composition,
    selectedLayerId,
    selectedPropertyKey,
    currentTime,
    prop,
    graphMode,
    selectedKeyframeId,
  ]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const relX = (x - 30) / (canvas.width - 60);
    const targetTime = Math.max(0, Math.min(composition.duration, relX * composition.duration));
    onSeek(targetTime);

    // Check if clicked near keyframe
    if (prop?.keyframes) {
      const nearest = prop.keyframes.find((k) => Math.abs(k.time - targetTime) < 0.2);
      if (nearest) setSelectedKeyframeId(nearest.id);
    }
  };

  const selectedKeyframe = prop?.keyframes?.find((k) => k.id === selectedKeyframeId);

  return (
    <div className="graph-editor-panel">
      {/* Top Toolbar */}
      <div className="graph-toolbar">
        <div className="graph-tool-group">
          <span className="graph-label">Curve:</span>
          <select
            className="graph-select"
            value={selectedPropertyKey}
            onChange={(e) => onSelectPropertyKey(e.target.value)}
          >
            <option value="position">Position</option>
            <option value="scale">Scale</option>
            <option value="rotation">Rotation</option>
            <option value="opacity">Opacity</option>
          </select>
        </div>

        <div className="graph-tool-group">
          <button
            className={`graph-btn ${graphMode === 'value' ? 'active' : ''}`}
            onClick={() => setGraphMode('value')}
          >
            Value Graph
          </button>
          <button
            className={`graph-btn ${graphMode === 'speed' ? 'active' : ''}`}
            onClick={() => setGraphMode('speed')}
          >
            Speed Graph
          </button>
        </div>

        {/* Interpolation buttons */}
        <div className="graph-tool-group">
          <span className="graph-label">Interpolation:</span>
          {(['linear', 'bezier', 'ease-in', 'ease-out', 'ease-in-out', 'hold'] as const).map(
            (mode) => (
              <button
                key={mode}
                className={`graph-btn ${
                  selectedKeyframe?.interpolation === mode ? 'active' : ''
                }`}
                disabled={!selectedKeyframeId}
                onClick={() => {
                  if (selectedKeyframeId) {
                    onUpdateKeyframeInterpolation(selectedKeyframeId, mode);
                  }
                }}
                title={`Set interpolation to ${mode}`}
              >
                {mode}
              </button>
            )
          )}
        </div>

        <div className="graph-spacer" />

        <button className="graph-btn switch-view-btn" onClick={onSwitchToTimeline}>
          ◀ Switch to Timeline
        </button>
      </div>

      {/* Canvas Viewport */}
      <div className="graph-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="graph-canvas"
          width={960}
          height={240}
          onClick={handleCanvasClick}
        />
      </div>
    </div>
  );
};
