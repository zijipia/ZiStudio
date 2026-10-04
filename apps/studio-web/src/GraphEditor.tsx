import React, { useRef, useEffect } from 'react';
import type { Composition, Keyframe, Property } from './model';

interface GraphEditorProps {
  composition: Composition;
  selectedLayerId: string | null;
  selectedPropertyKey: string;
  currentTime: number;
  onSeek: (time: number) => void;
  onUpdateKeyframeInterpolation: (keyframeId: string, interpolation: Keyframe['interpolation']) => void;
}

export const GraphEditor: React.FC<GraphEditorProps> = ({
  composition,
  selectedLayerId,
  selectedPropertyKey,
  currentTime,
  onSeek,
  onUpdateKeyframeInterpolation,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedLayer = composition.layers.find((l) => l.id === selectedLayerId);
  const transform = selectedLayer?.transform;
  const prop = transform ? (transform as any)[selectedPropertyKey] as Property<any> | undefined : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Background grid
    ctx.fillStyle = '#0d1015';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    const numH = 6;
    for (let i = 0; i <= numH; i++) {
      const y = (i / numH) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Vertical time grid lines (seconds)
    const duration = composition.duration;
    for (let sec = 0; sec <= duration; sec += 1) {
      const x = (sec / duration) * (width - 40) + 20;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(`${sec}s`, x + 3, height - 6);
    }

    if (!prop || !prop.keyframes || prop.keyframes.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `No keyframes on ${prop?.name || selectedPropertyKey}. Click "◇ Keyframe" to create keyframes.`,
        width / 2,
        height / 2
      );
      return;
    }

    // Extract numeric values from keyframes
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

    const toX = (t: number) => (t / duration) * (width - 40) + 20;
    const toY = (v: number) => height - 30 - ((v - minVal) / valRange) * (height - 60);

    // Draw curve
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    const sampleStep = 0.05;
    for (let t = 0; t <= duration; t += sampleStep) {
      // Evaluate value at time t
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
            } else {
              val = l.val + (r.val - l.val) * frac;
            }
            break;
          }
        }
      }

      const x = toX(t);
      const y = toY(val);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw keyframe diamonds and tangents
    for (const kf of numericKfs) {
      const kfX = toX(kf.time);
      const kfY = toY(kf.val);

      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(kfX, kfY - 6);
      ctx.lineTo(kfX + 6, kfY);
      ctx.lineTo(kfX, kfY + 6);
      ctx.lineTo(kfX - 6, kfY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Label with value
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px monospace';
      ctx.fillText(`${kf.val.toFixed(1)} (${kf.interpolation})`, kfX + 8, kfY - 4);
    }

    // Playhead line
    const playheadX = toX(currentTime);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(playheadX - 5, 0);
    ctx.lineTo(playheadX + 5, 0);
    ctx.lineTo(playheadX, 8);
    ctx.closePath();
    ctx.fill();
  }, [composition, selectedLayerId, selectedPropertyKey, currentTime, prop]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const relX = (x - 20) / (canvas.width - 40);
    const targetTime = Math.max(0, Math.min(composition.duration, relX * composition.duration));
    onSeek(targetTime);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0e1117' }}>
      <div style={{ height: '30px', borderBottom: '1px solid #20242b', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '10px', fontSize: '11px', color: '#94a3b8' }}>
        <strong>Graph Editor</strong>
        <span>Curve: {prop?.name || selectedPropertyKey}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {prop?.keyframes?.map((kf, i) => (
            <select
              key={kf.id}
              value={kf.interpolation}
              onChange={(e) => onUpdateKeyframeInterpolation(kf.id, e.target.value as any)}
              style={{ background: '#1e2430', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '3px', fontSize: '10px', padding: '2px 4px' }}
            >
              <option value="linear">KF #{i + 1}: Linear</option>
              <option value="bezier">KF #{i + 1}: Bezier</option>
              <option value="ease-in">KF #{i + 1}: Ease In</option>
              <option value="ease-out">KF #{i + 1}: Ease Out</option>
              <option value="ease-in-out">KF #{i + 1}: Ease In/Out</option>
              <option value="hold">KF #{i + 1}: Hold</option>
            </select>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={180}
          onClick={handleCanvasClick}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
        />
      </div>
    </div>
  );
};
