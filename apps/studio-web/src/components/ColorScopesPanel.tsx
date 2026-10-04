import React, { useRef, useEffect, useState } from 'react';
import type { Composition, Layer } from '../model';

interface ColorScopesPanelProps {
  composition: Composition;
  selectedLayer: Layer | null;
  onApplyColorGrade?: (brightness: number, contrast: number, saturation: number) => void;
}

export const ColorScopesPanel: React.FC<ColorScopesPanelProps> = ({
  composition,
  selectedLayer,
  onApplyColorGrade,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scopeMode, setScopeMode] = useState<'parade' | 'waveform'>('parade');
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);

  // Render RGB Parade / Waveform scope
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#080a0e';
    ctx.fillRect(0, 0, w, h);

    // Reference graticule lines (0 IRE, 50 IRE, 100 IRE)
    ctx.strokeStyle = '#1e2430';
    ctx.lineWidth = 1;
    [0.1, 0.5, 0.9].forEach((frac) => {
      const y = h * frac;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = '8px monospace';
      ctx.fillText(`${Math.round((1 - frac) * 100)} IRE`, 4, y - 2);
    });

    if (scopeMode === 'parade') {
      // Red, Green, Blue columns
      const colW = w / 3;
      const channels = [
        { name: 'RED', color: '#ef4444', x: 0 },
        { name: 'GREEN', color: '#22c55e', x: colW },
        { name: 'BLUE', color: '#38bdf8', x: colW * 2 },
      ];

      channels.forEach((ch, idx) => {
        ctx.fillStyle = ch.color;
        ctx.font = '9px Inter, sans-serif';
        ctx.fillText(ch.name, ch.x + 8, 14);

        // Draw simulated waveform traces
        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.65;
        ctx.beginPath();

        const samples = 48;
        for (let s = 0; s < samples; s++) {
          const sx = ch.x + (s / samples) * (colW - 8) + 4;
          const baseline = h * 0.5 - (brightness / 100) * (h * 0.2);
          const spread = (h * 0.35 * (100 + contrast)) / 100;
          const wave =
            Math.sin(s * 0.4 + idx * 1.5) * Math.cos(s * 0.2) * (spread * 0.4);
          const sy = Math.max(10, Math.min(h - 10, baseline + wave));

          if (s === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Column divider
        if (idx < 2) {
          ctx.strokeStyle = '#1e2430';
          ctx.beginPath();
          ctx.moveTo(ch.x + colW, 0);
          ctx.lineTo(ch.x + colW, h);
          ctx.stroke();
        }
      });
    } else {
      // Luminance Waveform
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();

      const samples = 120;
      for (let s = 0; s < samples; s++) {
        const sx = (s / samples) * (w - 20) + 10;
        const baseline = h * 0.5 - (brightness / 100) * (h * 0.2);
        const wave = Math.sin(s * 0.15) * (h * 0.3 * (1 + contrast / 100));
        const sy = Math.max(10, Math.min(h - 10, baseline + wave));

        if (s === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }, [scopeMode, brightness, contrast]);

  const handleUpdate = (b: number, c: number, s: number) => {
    setBrightness(b);
    setContrast(c);
    setSaturation(s);
    if (onApplyColorGrade) {
      onApplyColorGrade(b, c, s);
    }
  };

  return (
    <div className="color-scopes-container">
      {/* Scope Toolbar */}
      <div className="scopes-header">
        <strong>Video Scopes & Color Grading</strong>
        <div className="scopes-toggle">
          <button
            className={`scope-mode-btn ${scopeMode === 'parade' ? 'active' : ''}`}
            onClick={() => setScopeMode('parade')}
          >
            RGB Parade
          </button>
          <button
            className={`scope-mode-btn ${scopeMode === 'waveform' ? 'active' : ''}`}
            onClick={() => setScopeMode('waveform')}
          >
            Luma Waveform
          </button>
        </div>
      </div>

      {/* Scope Canvas */}
      <div className="scope-canvas-wrap">
        <canvas ref={canvasRef} width={640} height={140} className="scope-canvas" />
      </div>

      {/* Color Wheels / Primary Grading Sliders */}
      <div className="primary-color-controls">
        <div className="grade-control-card">
          <span className="grade-title">Lift (Shadows)</span>
          <input
            type="range"
            min="-50"
            max="50"
            value={brightness}
            className="grade-slider"
            onChange={(e) => handleUpdate(Number(e.target.value), contrast, saturation)}
          />
          <span className="grade-val">{brightness}</span>
        </div>

        <div className="grade-control-card">
          <span className="grade-title">Gamma (Midtones)</span>
          <input
            type="range"
            min="-50"
            max="50"
            value={contrast}
            className="grade-slider"
            onChange={(e) => handleUpdate(brightness, Number(e.target.value), saturation)}
          />
          <span className="grade-val">{contrast}</span>
        </div>

        <div className="grade-control-card">
          <span className="grade-title">Gain (Highlights)</span>
          <input
            type="range"
            min="-50"
            max="50"
            value={saturation}
            className="grade-slider"
            onChange={(e) => handleUpdate(brightness, contrast, Number(e.target.value))}
          />
          <span className="grade-val">{saturation}</span>
        </div>
      </div>
    </div>
  );
};
