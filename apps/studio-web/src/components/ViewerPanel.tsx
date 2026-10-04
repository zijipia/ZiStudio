import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { Composition } from '../model';
import { CompositionRenderer } from '../renderer';

interface ViewerPanelProps {
  composition: Composition;
  currentTime: number;
  selectedLayerId: string | null;
  pan: [number, number];
  showGuides: boolean;
  showGrid: boolean;
  isPlaying: boolean;
  zoomLevel: number | 'fit';
  resolution: number;
  channelMode: 'rgb' | 'red' | 'green' | 'blue' | 'alpha';
  isMaximized: boolean;
  onZoomChange: (zoom: number | 'fit') => void;
  onResolutionChange: (res: number) => void;
  onChannelModeChange: (mode: 'rgb' | 'red' | 'green' | 'blue' | 'alpha') => void;
  onToggleGuides: () => void;
  onToggleGrid: () => void;
  onResetPan: () => void;
  onToggleMaximize: () => void;
  onLayerTranslate: (dx: number, dy: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const ViewerPanel: React.FC<ViewerPanelProps> = ({
  composition,
  currentTime,
  selectedLayerId,
  pan,
  showGuides,
  showGrid,
  isPlaying,
  zoomLevel,
  resolution,
  channelMode,
  isMaximized,
  onZoomChange,
  onResolutionChange,
  onChannelModeChange,
  onToggleGuides,
  onToggleGrid,
  onResetPan,
  onToggleMaximize,
  onLayerTranslate,
  onContextMenu,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CompositionRenderer | null>(null);

  // Dynamic FPS measurement
  const [currentFps, setCurrentFps] = useState<number>(composition.fps);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());

  // Calculate actual zoom factor
  const calculatedZoom = useMemo(() => {
    if (zoomLevel !== 'fit') return zoomLevel;
    return 0.38;
  }, [zoomLevel]);

  // Initialize renderer
  useEffect(() => {
    if (canvasRef.current) {
      rendererRef.current = new CompositionRenderer(canvasRef.current);
    }
  }, []);

  // Update canvas size according to container dimensions
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          canvas.width = Math.floor(width);
          canvas.height = Math.floor(height);
          // Re-render immediately
          if (rendererRef.current) {
            rendererRef.current.render(composition, currentTime, calculatedZoom, pan, {
              showGuides,
              showGrid,
              selectedLayerId,
              interactiveGizmo: true,
              resolution,
              channelMode,
            });
          }
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [composition, currentTime, calculatedZoom, pan, showGuides, showGrid, selectedLayerId, resolution, channelMode]);

  // Frame rendering on state change
  useEffect(() => {
    if (!rendererRef.current || !canvasRef.current) return;
    rendererRef.current.render(composition, currentTime, calculatedZoom, pan, {
      showGuides,
      showGrid,
      selectedLayerId,
      interactiveGizmo: true,
      resolution,
      channelMode,
    });

    // FPS calculation when playing
    frameCountRef.current += 1;
    const now = performance.now();
    const elapsed = now - lastFpsTimeRef.current;
    if (elapsed >= 500) {
      const calculated = Math.round((frameCountRef.current * 1000) / elapsed);
      setCurrentFps(isPlaying ? calculated : composition.fps);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }
  }, [
    composition,
    currentTime,
    calculatedZoom,
    pan,
    showGuides,
    showGrid,
    selectedLayerId,
    isPlaying,
    resolution,
    channelMode,
  ]);

  // Direct interactive dragging of selected layer
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Only left click
    if (!selectedLayerId) return;

    let startX = e.clientX;
    let startY = e.clientY;

    const onMouseMove = (moveEv: MouseEvent) => {
      const dx = (moveEv.clientX - startX) / calculatedZoom;
      const dy = (moveEv.clientY - startY) / calculatedZoom;
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
        onLayerTranslate(Math.round(dx), Math.round(dy));
        startX = moveEv.clientX;
        startY = moveEv.clientY;
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className={`viewer-panel-container ${isMaximized ? 'maximized' : ''}`}>
      {/* Top Toolbar */}
      <div className="viewer-toolbar">
        {/* Zoom selector */}
        <div className="viewer-tool-group">
          <span className="viewer-label">Zoom:</span>
          <select
            className="viewer-select"
            value={zoomLevel}
            onChange={(e) =>
              onZoomChange(e.target.value === 'fit' ? 'fit' : Number(e.target.value))
            }
          >
            <option value="fit">Fit ({Math.round(calculatedZoom * 100)}%)</option>
            <option value="0.25">25%</option>
            <option value="0.38">38%</option>
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1.0">100%</option>
            <option value="2.0">200%</option>
          </select>
        </div>

        {/* Resolution selector */}
        <div className="viewer-tool-group">
          <span className="viewer-label">Res:</span>
          <select
            className="viewer-select"
            value={resolution}
            onChange={(e) => onResolutionChange(Number(e.target.value))}
          >
            <option value="1">Full (100%)</option>
            <option value="0.5">Half (50%)</option>
            <option value="0.25">Quarter (25%)</option>
          </select>
        </div>

        {/* Channel view */}
        <div className="viewer-tool-group">
          <select
            className="viewer-select"
            value={channelMode}
            onChange={(e) => onChannelModeChange(e.target.value as any)}
          >
            <option value="rgb">RGB Color</option>
            <option value="red">Red Channel</option>
            <option value="green">Green Channel</option>
            <option value="blue">Blue Channel</option>
            <option value="alpha">Alpha Matte</option>
          </select>
        </div>

        <div className="viewer-tool-separator" />

        {/* Guides & Grid toggles */}
        <button
          className={`viewer-btn ${showGuides ? 'active' : ''}`}
          onClick={onToggleGuides}
          title="Toggle Safe Area Guides (Action 93%, Title 90%)"
        >
          Guides
        </button>

        <button
          className={`viewer-btn ${showGrid ? 'active' : ''}`}
          onClick={onToggleGrid}
          title="Toggle Rule-of-Thirds Grid"
        >
          Grid
        </button>

        <button className="viewer-btn" onClick={onResetPan} title="Reset Pan (0, 0)">
          Reset Pan
        </button>

        {/* Performance & Status pill */}
        <div className="viewer-stats">
          <span className={`fps-pill ${currentFps >= composition.fps * 0.9 ? 'good' : 'warning'}`}>
            {currentFps} FPS
          </span>
          <span className="dim-info">
            {composition.width}×{composition.height}
          </span>
        </div>

        {/* Maximize Button */}
        <button
          className={`viewer-btn maximize-btn ${isMaximized ? 'active' : ''}`}
          onClick={onToggleMaximize}
          title={isMaximized ? 'Restore Viewport Size' : 'Maximize Viewport'}
        >
          {isMaximized ? '⤢' : '⤢'}
        </button>
      </div>

      {/* Canvas Viewport */}
      <div className="viewer-canvas-wrap" ref={containerRef} onContextMenu={onContextMenu}>
        <canvas
          ref={canvasRef}
          className="viewer-canvas"
          onMouseDown={handleMouseDown}
        />
      </div>
    </div>
  );
};
