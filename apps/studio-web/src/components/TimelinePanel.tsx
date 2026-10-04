import React, { useRef } from 'react';
import type { Composition, Keyframe, Layer } from '../model';

interface TimelinePanelProps {
  composition: Composition;
  currentTime: number;
  selectedLayerId: string | null;
  timelineZoom: number; // 1 = standard, 2 = 200%, etc.
  snappingEnabled: boolean;
  onSeek: (time: number) => void;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onToggleSolo: (layerId: string) => void;
  onMoveLayerTiming: (
    layerId: string,
    origStart: number,
    origDuration: number,
    newStart: number,
    newDuration: number
  ) => void;
  onAddLayer: (type: 'text' | 'solid' | 'shape' | 'audio') => void;
  onSplitLayer: () => void;
  onDuplicateLayer: () => void;
  onDeleteLayer: () => void;
  onToggleKeyframe: () => void;
  onTimelineZoomChange: (newZoom: number) => void;
  onToggleSnapping: () => void;
  onSwitchToGraph: () => void;
  onKeyframeContextMenu: (e: React.MouseEvent, layer: Layer, keyframe: Keyframe) => void;
  onTrackContextMenu: (e: React.MouseEvent, layer: Layer) => void;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  composition,
  currentTime,
  selectedLayerId,
  timelineZoom,
  snappingEnabled,
  onSeek,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onToggleSolo,
  onMoveLayerTiming,
  onAddLayer,
  onSplitLayer,
  onDuplicateLayer,
  onDeleteLayer,
  onToggleKeyframe,
  onTimelineZoomChange,
  onToggleSnapping,
  onSwitchToGraph,
  onKeyframeContextMenu,
  onTrackContextMenu,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const selectedLayer = composition.layers.find((l) => l.id === selectedLayerId);

  // Playhead percentage for ruler
  const playheadPercent = `${Math.min(100, Math.max(0, (currentTime / composition.duration) * 100))}%`;

  // Snapping helper
  const snapTime = (targetTime: number): number => {
    if (!snappingEnabled) return targetTime;
    const snapThreshold = 0.15; // seconds
    // Snap to 0 or composition duration
    if (Math.abs(targetTime) < snapThreshold) return 0;
    if (Math.abs(targetTime - composition.duration) < snapThreshold) return composition.duration;
    // Snap to current playhead
    if (Math.abs(targetTime - currentTime) < snapThreshold) return currentTime;
    // Snap to other layer boundaries
    for (const l of composition.layers) {
      if (Math.abs(targetTime - l.start) < snapThreshold) return l.start;
      if (Math.abs(targetTime - (l.start + l.duration)) < snapThreshold) return l.start + l.duration;
    }
    return targetTime;
  };

  return (
    <div className="timeline-container">
      {/* Timeline Toolbar */}
      <div className="timeline-toolbar">
        <div className="timeline-tool-group">
          <button className="timeline-btn" onClick={() => onAddLayer('text')} title="Add Text Layer">
            ＋ Text
          </button>
          <button className="timeline-btn" onClick={() => onAddLayer('solid')} title="Add Solid Layer">
            ＋ Solid
          </button>
          <button className="timeline-btn" onClick={() => onAddLayer('shape')} title="Add Shape Layer">
            ＋ Shape
          </button>
          <button className="timeline-btn" onClick={() => onAddLayer('audio')} title="Add Audio Track">
            ＋ Audio
          </button>
        </div>

        <div className="timeline-tool-separator" />

        <div className="timeline-tool-group">
          <button
            className="timeline-btn"
            onClick={onToggleKeyframe}
            disabled={!selectedLayer}
            title="Toggle Keyframe at Playhead"
          >
            ◇ Keyframe
          </button>
          <button
            className="timeline-btn"
            onClick={onSplitLayer}
            disabled={!selectedLayer}
            title="Split Selected Clip at Playhead (S)"
          >
            ✂ Split
          </button>
          <button
            className="timeline-btn"
            onClick={onDuplicateLayer}
            disabled={!selectedLayer}
            title="Duplicate Selected Clip (Ctrl+D)"
          >
            ⧉ Duplicate
          </button>
          <button
            className="timeline-btn danger"
            onClick={onDeleteLayer}
            disabled={!selectedLayer}
            title="Delete Selected Clip (Del)"
          >
            🗑 Delete
          </button>
        </div>

        <div className="timeline-tool-separator" />

        <div className="timeline-tool-group">
          <button
            className={`timeline-btn ${snappingEnabled ? 'active' : ''}`}
            onClick={onToggleSnapping}
            title={snappingEnabled ? 'Snapping Enabled (Magnet)' : 'Snapping Disabled'}
          >
            🧲 Snap
          </button>
          <button
            className="timeline-btn"
            onClick={() => onTimelineZoomChange(Math.max(0.5, timelineZoom - 0.25))}
            title="Zoom Out Timeline"
          >
            🔍 -
          </button>
          <span className="timeline-zoom-level">{Math.round(timelineZoom * 100)}%</span>
          <button
            className="timeline-btn"
            onClick={() => onTimelineZoomChange(Math.min(4, timelineZoom + 0.25))}
            title="Zoom In Timeline"
          >
            🔍 +
          </button>
        </div>

        <div className="timeline-spacer" />

        <div className="timeline-tool-group">
          <button className="timeline-mode-btn active">Timeline</button>
          <button className="timeline-mode-btn" onClick={onSwitchToGraph}>
            Graph Editor
          </button>
        </div>
      </div>

      {/* Main Tracks Area */}
      <div className="timeline-body">
        {/* Ruler Row */}
        <div className="timeline-ruler-row">
          <div className="ruler-header-col">
            <span>TRACKS ({composition.layers.length})</span>
          </div>

          <div
            ref={rulerRef}
            className="timeline-ruler"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeek(frac * composition.duration);
            }}
          >
            {Array.from({ length: Math.ceil(composition.duration) + 1 }, (_, i) => (
              <div
                key={i}
                className="ruler-second-mark"
                style={{ left: `${(i / composition.duration) * 100}%` }}
              >
                <span className="ruler-time-label">{i}s</span>
              </div>
            ))}

            {/* Playhead indicator on ruler */}
            <div className="playhead-ruler-head" style={{ left: playheadPercent }}>
              <div className="playhead-flag" />
            </div>
          </div>
        </div>

        {/* Tracks List */}
        <div className="timeline-tracks-list">
          {composition.layers.map((layer) => {
            const isSelected = layer.id === selectedLayerId;
            const leftPercent = (layer.start / composition.duration) * 100;
            const widthPercent = (layer.duration / composition.duration) * 100;

            const allKeyframes: Keyframe[] = [
              ...layer.transform.position.keyframes,
              ...layer.transform.scale.keyframes,
              ...layer.transform.rotation.keyframes,
              ...layer.transform.opacity.keyframes,
            ];

            return (
              <div
                key={layer.id}
                className={`timeline-track-row ${isSelected ? 'selected' : ''}`}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onSelectLayer(layer.id);
                  onTrackContextMenu(e, layer);
                }}
              >
                {/* Track Header Controls */}
                <div
                  className={`track-header ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectLayer(layer.id)}
                >
                  <button
                    className={`track-btn-toggle ${layer.visible ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(layer.id);
                    }}
                    title="Toggle Visibility"
                  >
                    {layer.visible ? '👁' : '─'}
                  </button>
                  <button
                    className={`track-btn-toggle ${layer.locked ? 'active-lock' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLock(layer.id);
                    }}
                    title="Toggle Lock"
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>
                  <button
                    className={`track-btn-toggle ${layer.solo ? 'active-solo' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSolo(layer.id);
                    }}
                    title="Toggle Solo"
                  >
                    ★
                  </button>

                  <span className="track-name" title={layer.name}>
                    {layer.name}
                  </span>
                </div>

                {/* Track Lane / Clip */}
                <div
                  className="track-lane"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    onSeek(frac * composition.duration);
                  }}
                >
                  {/* Clip Block */}
                  <div
                    className={`clip-element ${layer.type} ${isSelected ? 'selected' : ''} ${
                      layer.locked ? 'locked' : ''
                    }`}
                    style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectLayer(layer.id);
                    }}
                    onMouseDown={(e) => {
                      if (layer.locked) return;
                      e.stopPropagation();
                      onSelectLayer(layer.id);

                      const startClientX = e.clientX;
                      const origStart = layer.start;
                      const origDuration = layer.duration;
                      const lane = e.currentTarget.parentElement;
                      if (!lane) return;
                      const laneWidth = lane.getBoundingClientRect().width;

                      const onMove = (moveEv: MouseEvent) => {
                        const dt =
                          ((moveEv.clientX - startClientX) / laneWidth) * composition.duration;
                        const targetStart = origStart + dt;
                        const snapped = snapTime(targetStart);
                        const newStart = Math.max(
                          0,
                          Math.min(composition.duration - origDuration, snapped)
                        );
                        onMoveLayerTiming(
                          layer.id,
                          origStart,
                          origDuration,
                          newStart,
                          origDuration
                        );
                      };

                      const onUp = () => {
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                      };

                      window.addEventListener('mousemove', onMove);
                      window.addEventListener('mouseup', onUp);
                    }}
                  >
                    {/* Left Trim Handle */}
                    <div
                      className="trim-handle trim-left"
                      onMouseDown={(e) => {
                        if (layer.locked) return;
                        e.stopPropagation();
                        const startClientX = e.clientX;
                        const origStart = layer.start;
                        const origDur = layer.duration;
                        const lane = e.currentTarget.parentElement?.parentElement;
                        if (!lane) return;
                        const laneWidth = lane.getBoundingClientRect().width;

                        const onMove = (moveEv: MouseEvent) => {
                          const dt =
                            ((moveEv.clientX - startClientX) / laneWidth) * composition.duration;
                          const rawNewStart = origStart + dt;
                          const snapped = snapTime(rawNewStart);
                          const maxStart = origStart + origDur - 0.2;
                          const newStart = Math.max(0, Math.min(maxStart, snapped));
                          const newDur = origDur - (newStart - origStart);
                          onMoveLayerTiming(layer.id, origStart, origDur, newStart, newDur);
                        };

                        const onUp = () => {
                          window.removeEventListener('mousemove', onMove);
                          window.removeEventListener('mouseup', onUp);
                        };

                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                      }}
                    />

                    {/* Clip Title and Type */}
                    <div className="clip-label-wrap">
                      <span className="clip-label">{layer.name}</span>
                    </div>

                    {/* Keyframe Markers on Clip */}
                    {allKeyframes.map((kf) => {
                      const relTime = kf.time - layer.start;
                      if (relTime < 0 || relTime > layer.duration) return null;
                      const kfPercent = (relTime / layer.duration) * 100;

                      return (
                        <div
                          key={kf.id}
                          className="clip-kf-marker"
                          style={{ left: `${kfPercent}%` }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onSeek(kf.time);
                            onSelectLayer(layer.id);
                          }}
                          onContextMenu={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            onKeyframeContextMenu(ev, layer, kf);
                          }}
                          title={`Keyframe at ${kf.time.toFixed(2)}s (${kf.interpolation})`}
                        />
                      );
                    })}

                    {/* Right Trim Handle */}
                    <div
                      className="trim-handle trim-right"
                      onMouseDown={(e) => {
                        if (layer.locked) return;
                        e.stopPropagation();
                        const startClientX = e.clientX;
                        const origDur = layer.duration;
                        const origStart = layer.start;
                        const lane = e.currentTarget.parentElement?.parentElement;
                        if (!lane) return;
                        const laneWidth = lane.getBoundingClientRect().width;

                        const onMove = (moveEv: MouseEvent) => {
                          const dt =
                            ((moveEv.clientX - startClientX) / laneWidth) * composition.duration;
                          const rawDur = origDur + dt;
                          const snappedEnd = snapTime(origStart + rawDur);
                          const newDur = Math.max(
                            0.2,
                            Math.min(composition.duration - origStart, snappedEnd - origStart)
                          );
                          onMoveLayerTiming(layer.id, origStart, origDur, origStart, newDur);
                        };

                        const onUp = () => {
                          window.removeEventListener('mousemove', onMove);
                          window.removeEventListener('mouseup', onUp);
                        };

                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                      }}
                    />
                  </div>

                  {/* Playhead vertical line through lane */}
                  <div className="track-playhead-line" style={{ left: playheadPercent }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Master Scrubber Range at bottom of timeline */}
        <div className="timeline-scrubber-row">
          <input
            type="range"
            min="0"
            max={composition.duration}
            step={1 / composition.fps}
            value={currentTime}
            className="master-scrubber"
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Master Timeline Scrubber"
          />
        </div>
      </div>
    </div>
  );
};
