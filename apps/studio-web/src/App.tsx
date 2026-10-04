import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evaluateProperty, evaluateTransform } from './animation';
import { audioEngine } from './audio';
import {
  AddEffectCommand,
  AddKeyframeCommand,
  AddLayerCommand,
  Command,
  DeleteEffectCommand,
  DeleteKeyframeCommand,
  DeleteLayerCommand,
  MoveLayerTimingCommand,
  SetPropertyValueCommand,
  SplitLayerCommand,
} from './commands';
import { CommandManager, createEditorState, EditorState, getActiveComposition } from './editor';
import { GraphEditor } from './GraphEditor';
import {
  createComposition,
  createEffect,
  createProject,
  createShapeLayer,
  createSolidLayer,
  createTextLayer,
  deserializeProject,
  EffectType,
  Keyframe,
  Layer,
  LayerType,
  Project,
  serializeProject,
} from './model';
import { CompositionRenderer } from './renderer';
import './styles.css';

const initialProject = createProject();

export function App() {
  const [editorState, setEditorState] = useState<EditorState>(() => createEditorState(initialProject));
  const [workspace, setWorkspace] = useState('Edit');
  const [timelineMode, setTimelineMode] = useState<'timeline' | 'graph'>('timeline');
  const [showGuides, setShowGuides] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<number | 'fit'>('fit');
  const [isMuted, setIsMuted] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const commandManager = useMemo(() => new CommandManager(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CompositionRenderer | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const composition = getActiveComposition(editorState);
  const time = editorState.currentTime;
  const isPlaying = editorState.isPlaying;

  // Selected layer
  const selectedLayer = composition.layers.find((l) => l.id === editorState.selectedLayerId) || null;

  // Execute command helper
  const executeCmd = useCallback(
    (cmd: Command) => {
      setEditorState((prev) => commandManager.execute(cmd, prev));
    },
    [commandManager]
  );

  // Undo / Redo helpers
  const handleUndo = useCallback(() => {
    if (commandManager.canUndo()) {
      setEditorState((prev) => commandManager.undo(prev));
    }
  }, [commandManager]);

  const handleRedo = useCallback(() => {
    if (commandManager.canRedo()) {
      setEditorState((prev) => commandManager.redo(prev));
    }
  }, [commandManager]);

  // Viewport zoom calculation
  const calculatedZoom = useMemo(() => {
    if (zoomLevel !== 'fit') return zoomLevel;
    // Calculate fit based on typical viewport aspect
    return 0.38;
  }, [zoomLevel]);

  // Initialize renderer
  useEffect(() => {
    if (canvasRef.current) {
      rendererRef.current = new CompositionRenderer(canvasRef.current);
    }
  }, []);

  // Render frame to canvas whenever relevant state changes
  useEffect(() => {
    if (!rendererRef.current || !canvasRef.current) return;
    rendererRef.current.render(composition, time, calculatedZoom, editorState.pan, {
      showGuides,
      selectedLayerId: editorState.selectedLayerId,
      interactiveGizmo: true,
    });
  }, [composition, time, calculatedZoom, editorState.pan, showGuides, editorState.selectedLayerId]);

  // Audio tone playback when playing or scrubbing audio layer
  useEffect(() => {
    if (isPlaying) {
      const activeAudio = composition.layers.find(
        (l) => l.type === 'audio' && l.visible && time >= l.start && time <= l.start + l.duration
      );
      if (activeAudio) {
        audioEngine.playTone(activeAudio.content.audioFreq || 440, 0.08);
      }
    }
  }, [isPlaying, Math.floor(time * 8), composition.layers]);

  // Animation playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    lastPlayTimeRef.current = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastPlayTimeRef.current) / 1000;
      lastPlayTimeRef.current = now;

      setEditorState((prev) => {
        const comp = getActiveComposition(prev);
        let nextTime = prev.currentTime + dt;
        if (nextTime >= comp.duration) {
          nextTime = 0; // loop
        }
        return { ...prev, currentTime: nextTime };
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying]);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setEditorState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setEditorState((prev) => ({ ...prev, currentTime: Math.max(0, prev.currentTime - 1 / composition.fps) }));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setEditorState((prev) => ({ ...prev, currentTime: Math.min(composition.duration, prev.currentTime + 1 / composition.fps) }));
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editorState.selectedLayerId) {
          e.preventDefault();
          executeCmd(new DeleteLayerCommand(editorState.selectedLayerId));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [composition.fps, composition.duration, editorState.selectedLayerId, executeCmd, handleUndo, handleRedo]);

  // SMPTE Timecode generator
  const formattedTimecode = useMemo(() => {
    const totalFrames = Math.floor(time * composition.fps);
    const frames = totalFrames % composition.fps;
    const totalSeconds = Math.floor(time);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
  }, [time, composition.fps]);

  // Playhead percentage for ruler / scrubber
  const playheadPercent = `${Math.min(100, (time / composition.duration) * 100)}%`;

  // Layer manipulation handlers
  const handleAddLayer = (type: LayerType) => {
    let layer: Layer;
    if (type === 'solid') {
      const colors = ['#1e40af', '#065f46', '#991b1b', '#86198f', '#374151'];
      layer = createSolidLayer(`Solid ${composition.layers.length + 1}`, colors[composition.layers.length % colors.length]);
    } else if (type === 'text') {
      layer = createTextLayer(`Text ${composition.layers.length + 1}`, 0, 0);
    } else if (type === 'shape') {
      layer = createShapeLayer(`Shape ${composition.layers.length + 1}`, 'circle');
    } else if (type === 'audio') {
      layer = {
        id: crypto.randomUUID(),
        name: `Audio Track ${composition.layers.length + 1}`,
        type: 'audio',
        start: 0,
        duration: composition.duration,
        transform: selectedLayer?.transform || (createSolidLayer('temp', '#000').transform),
        blendMode: 'source-over',
        effects: [],
        content: { audioFreq: 520 },
        visible: true,
        locked: false,
      };
    } else {
      layer = createSolidLayer(`Adjustment ${composition.layers.length + 1}`, 'transparent');
      layer.type = 'adjustment';
    }
    executeCmd(new AddLayerCommand(layer, 0));
  };

  const handleSplitSelectedLayer = () => {
    if (!selectedLayer) return;
    executeCmd(new SplitLayerCommand(selectedLayer.id, time));
  };

  const handleDuplicateSelectedLayer = () => {
    if (!selectedLayer) return;
    const duplicated: Layer = {
      ...JSON.parse(JSON.stringify(selectedLayer)),
      id: crypto.randomUUID(),
      name: `${selectedLayer.name} (Copy)`,
      start: Math.min(composition.duration - 1, selectedLayer.start + 0.5),
    };
    executeCmd(new AddLayerCommand(duplicated, 0));
  };

  const handleToggleKeyframe = (propertyPath: 'position' | 'scale' | 'rotation' | 'opacity') => {
    if (!selectedLayer) return;
    const prop = selectedLayer.transform[propertyPath];
    const existing = prop.keyframes.find((k) => Math.abs(k.time - time) < 0.05);

    if (existing) {
      executeCmd(new DeleteKeyframeCommand(selectedLayer.id, propertyPath, existing.id));
    } else {
      const currentVal = evaluateProperty(prop as any, time);
      const newKf: Keyframe<any> = {
        id: crypto.randomUUID(),
        time,
        value: currentVal,
        interpolation: 'bezier',
      };
      executeCmd(new AddKeyframeCommand(selectedLayer.id, propertyPath, newKf));
    }
  };

  // Property value changes
  const handleNumericPropertyChange = (
    propertyPath: 'position' | 'scale' | 'rotation' | 'opacity',
    axisIndex: number | null,
    val: number
  ) => {
    if (!selectedLayer) return;
    const prop = selectedLayer.transform[propertyPath];
    let nextValue: any;

    if (axisIndex !== null && Array.isArray(prop.value)) {
      const copy = [...prop.value];
      copy[axisIndex] = val;
      nextValue = copy;
    } else {
      nextValue = val;
    }

    // If keyframes exist, also create/update keyframe at current time
    if (prop.keyframes.length > 0) {
      const existing = prop.keyframes.find((k) => Math.abs(k.time - time) < 0.05);
      const kf: Keyframe<any> = {
        id: existing ? existing.id : crypto.randomUUID(),
        time,
        value: nextValue,
        interpolation: existing ? existing.interpolation : 'bezier',
      };
      executeCmd(new AddKeyframeCommand(selectedLayer.id, propertyPath, kf));
    } else {
      executeCmd(new SetPropertyValueCommand(selectedLayer.id, propertyPath, prop.value, nextValue));
    }
  };

  // Direct dragging of layers in the Viewer viewport
  const handleViewerMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedLayer || selectedLayer.locked || !selectedLayer.visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const currentPos = evaluateProperty(selectedLayer.transform.position, time);
    const initialPos = Array.isArray(currentPos) ? [...currentPos] : [0, 0, 0];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startX) / calculatedZoom;
      const dy = (moveEvent.clientY - startY) / calculatedZoom;
      const nextX = Math.round(initialPos[0] + dx);
      const nextY = Math.round(initialPos[1] + dy);
      handleNumericPropertyChange('position', 0, nextX);
      handleNumericPropertyChange('position', 1, nextY);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Export current frame as PNG
  const handleExportPNG = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `zistudio-frame-${time.toFixed(2)}s.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  // Export project as .zproj file
  const handleSaveProject = () => {
    const json = serializeProject(editorState.project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editorState.project.name.toLowerCase().replace(/\s+/g, '-')}.zproj`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Open .zproj file
  const handleOpenProjectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const project = deserializeProject(text);
        setEditorState(createEditorState(project));
      } catch (err) {
        console.error('Failed to load .zproj', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Import custom media file (image/video)
  const handleImportMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const isImage = file.type.startsWith('image/');
    const newLayer: Layer = {
      id: crypto.randomUUID(),
      name: file.name.slice(0, 18),
      type: isImage ? 'image' : 'video',
      start: 0,
      duration: composition.duration,
      transform: createSolidLayer('temp', '#000').transform,
      blendMode: 'source-over',
      effects: [],
      content: { mediaUrl: url },
      visible: true,
      locked: false,
    };
    executeCmd(new AddLayerCommand(newLayer, 0));
    e.target.value = '';
  };

  // Real WebM Video Export using Canvas MediaRecorder API
  const handleExportWebMVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !rendererRef.current) return;
    setIsExporting(true);
    setExportProgress(0);

    try {
      const stream = canvas.captureStream(60);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${composition.name.toLowerCase().replace(/\s+/g, '-')}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsExporting(false);
      };

      recorder.start();

      const totalFrames = Math.floor(composition.duration * 30);
      for (let f = 0; f < totalFrames; f++) {
        const renderTime = (f / totalFrames) * composition.duration;
        rendererRef.current.render(composition, renderTime, calculatedZoom, editorState.pan, {
          showGuides: false,
          interactiveGizmo: false,
        });
        setExportProgress(Math.round((f / totalFrames) * 100));
        await new Promise((r) => setTimeout(r, 16));
      }

      recorder.stop();
    } catch (err) {
      console.error('Video export error', err);
      setIsExporting(false);
    }
  };

  return (
    <div className="app-shell">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleOpenProjectFile}
        accept=".zproj,application/json"
        style={{ display: 'none' }}
      />
      <input
        type="file"
        ref={mediaInputRef}
        onChange={handleImportMedia}
        accept="image/*,video/*,audio/*"
        style={{ display: 'none' }}
      />

      {/* TOPBAR */}
      <header className="topbar">
        <div className="brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          ZiStudio
        </div>

        <nav className="menu">
          <button className="menu-btn" onClick={handleSaveProject} title="Save project to .zproj">
            File ▾
          </button>
          <button
            className="menu-btn"
            onClick={handleUndo}
            disabled={!commandManager.canUndo()}
            style={{ opacity: commandManager.canUndo() ? 1 : 0.4 }}
            title="Undo (Ctrl+Z)"
          >
            ↩ Undo
          </button>
          <button
            className="menu-btn"
            onClick={handleRedo}
            disabled={!commandManager.canRedo()}
            style={{ opacity: commandManager.canRedo() ? 1 : 0.4 }}
            title="Redo (Ctrl+Y)"
          >
            ↪ Redo
          </button>
          <button className="menu-btn" onClick={() => setShowGuides(!showGuides)}>
            {showGuides ? '✓ Guides' : 'Guides'}
          </button>
        </nav>

        <div className="transport">
          <button onClick={() => setEditorState((prev) => ({ ...prev, currentTime: 0 }))} title="Jump to start">
            |◀
          </button>
          <button
            onClick={() =>
              setEditorState((prev) => ({ ...prev, currentTime: Math.max(0, prev.currentTime - 1 / composition.fps) }))
            }
            title="Step Back 1 Frame"
          >
            ◀
          </button>
          <button
            className={isPlaying ? 'active' : ''}
            onClick={() => setEditorState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))}
            title="Play/Pause (Space)"
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <button
            onClick={() =>
              setEditorState((prev) => ({
                ...prev,
                currentTime: Math.min(composition.duration, prev.currentTime + 1 / composition.fps),
              }))
            }
            title="Step Forward 1 Frame"
          >
            ▶|
          </button>
          <button
            onClick={() => {
              const muted = audioEngine.toggleMute();
              setIsMuted(muted);
            }}
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            style={{ color: isMuted ? '#f43f5e' : '#cbd5e1' }}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          <div className="timecode">{formattedTimecode}</div>
        </div>
      </header>

      {/* WORKSPACE NAVIGATION */}
      <div className="workspace-tabs">
        {['Edit', 'Motion', 'VFX', '3D', 'Color', 'Audio'].map((item) => (
          <button
            key={item}
            className={workspace === item ? 'active' : ''}
            onClick={() => {
              setWorkspace(item);
              if (item === 'Motion') setTimelineMode('graph');
              else setTimelineMode('timeline');
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {/* MAIN GRID */}
      <main className="main-grid">
        {/* PROJECT PANEL */}
        <aside className="panel project-panel">
          <PanelTitle title="Project" right={`${composition.layers.length} Layers`} />
          <div className="project-scroll">
            <div>
              <div className="project-section-title">Compositions</div>
              <div className="asset-tree">
                <div className="asset-item active">
                  <span>🎬</span>
                  <span>{composition.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#64748b' }}>
                    {composition.fps} FPS
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="project-section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Assets</span>
                <button
                  onClick={() => mediaInputRef.current?.click()}
                  style={{ color: '#38bdf8', fontSize: '10px', textTransform: 'none' }}
                >
                  + Import
                </button>
              </div>
              <div className="asset-tree">
                {editorState.project.assets.map((asset) => (
                  <div key={asset.id} className="asset-item" onClick={() => handleAddLayer('image')}>
                    <span>🖼</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {asset.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div className="project-section-title">Project File & Export</div>
              <button className="btn-secondary" onClick={handleSaveProject}>
                💾 Save .zproj
              </button>
              <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                📂 Open .zproj
              </button>
              <button className="btn-secondary" onClick={handleExportPNG}>
                📸 Export Frame (PNG)
              </button>
              <button
                className="btn-secondary"
                onClick={handleExportWebMVideo}
                disabled={isExporting}
                style={{ background: isExporting ? '#0369a1' : undefined }}
              >
                {isExporting ? `Rendering Video... ${exportProgress}%` : '🎥 Render Video (WebM)'}
              </button>
            </div>
          </div>
        </aside>

        {/* VIEWER PANEL */}
        <section className="panel viewer-panel">
          <PanelTitle
            title="Viewer"
            right={`${composition.width} × ${composition.height} · ${Math.round(calculatedZoom * 100)}% View`}
          />
          <div className="viewer-container">
            <div className="viewer-bar">
              <span>Zoom:</span>
              <select
                value={zoomLevel}
                onChange={(e) => setZoomLevel(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}
              >
                <option value="fit">Fit</option>
                <option value="0.25">25%</option>
                <option value="0.38">38%</option>
                <option value="0.5">50%</option>
                <option value="1.0">100%</option>
              </select>

              <button className={showGuides ? 'active' : ''} onClick={() => setShowGuides(!showGuides)}>
                Guides
              </button>

              <button
                onClick={() => setEditorState((prev) => ({ ...prev, pan: [0, 0] }))}
                title="Reset Viewport Pan"
              >
                Reset View
              </button>

              <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#64748b' }}>
                Drag in viewer to translate layer
              </span>
            </div>

            <div className="viewer-canvas-wrap">
              <canvas
                ref={canvasRef}
                className="viewer-canvas"
                width={860}
                height={484}
                onMouseDown={handleViewerMouseDown}
              />
            </div>
          </div>
        </section>

        {/* INSPECTOR PANEL */}
        <aside className="panel inspector-panel">
          <PanelTitle title="Inspector" right={selectedLayer ? selectedLayer.type.toUpperCase() : 'NO SELECTION'} />
          <div className="inspector-scroll">
            {selectedLayer ? (
              <>
                {/* Layer Identification */}
                <div className="inspector-card">
                  <div className="inspector-card-header">
                    <span>{selectedLayer.name}</span>
                    <span style={{ fontSize: '10px', color: '#38bdf8' }}>{selectedLayer.type}</span>
                  </div>
                  <div className="prop-control">
                    <span className="prop-label">Timing</span>
                    <code>
                      {selectedLayer.start.toFixed(2)}s - {(selectedLayer.start + selectedLayer.duration).toFixed(2)}s
                    </code>
                  </div>
                  <div className="prop-control">
                    <span className="prop-label">Blend Mode</span>
                    <select
                      value={selectedLayer.blendMode}
                      onChange={(e) => {
                        const nextLayers = composition.layers.map((l) =>
                          l.id === selectedLayer.id ? { ...l, blendMode: e.target.value as any } : l
                        );
                        setEditorState((prev) => ({
                          ...prev,
                          project: {
                            ...prev.project,
                            compositions: prev.project.compositions.map((c) =>
                              c.id === composition.id ? { ...c, layers: nextLayers } : c
                            ),
                          },
                        }));
                      }}
                      style={{ background: '#0b0e14', color: '#cbd5e1', border: '1px solid #29303d', fontSize: '11px', borderRadius: '3px', padding: '2px' }}
                    >
                      <option value="source-over">Normal</option>
                      <option value="multiply">Multiply</option>
                      <option value="screen">Screen</option>
                      <option value="overlay">Overlay</option>
                      <option value="lighter">Add</option>
                      <option value="difference">Difference</option>
                      <option value="exclusion">Exclusion</option>
                    </select>
                  </div>
                </div>

                {/* Transform Properties */}
                <div className="inspector-card">
                  <div className="inspector-card-header">
                    <span>Transform</span>
                  </div>

                  {/* Position */}
                  <div className="prop-control">
                    <div className="prop-label">
                      <span
                        className={`kf-diamond ${selectedLayer.transform.position.keyframes.length > 0 ? 'has-kf' : ''}`}
                        onClick={() => handleToggleKeyframe('position')}
                        title="Toggle Keyframe"
                      >
                        ◇
                      </span>
                      <span>Position</span>
                    </div>
                    <div className="prop-inputs">
                      {['X', 'Y'].map((axis, i) => {
                        const cur = evaluateProperty(selectedLayer.transform.position, time);
                        const val = Array.isArray(cur) ? Math.round(cur[i] ?? 0) : 0;
                        return (
                          <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <span style={{ fontSize: '9px', color: '#64748b' }}>{axis}</span>
                            <input
                              type="number"
                              className="prop-input-num"
                              value={val}
                              onChange={(e) =>
                                handleNumericPropertyChange('position', i, Number(e.target.value))
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Scale */}
                  <div className="prop-control">
                    <div className="prop-label">
                      <span
                        className={`kf-diamond ${selectedLayer.transform.scale.keyframes.length > 0 ? 'has-kf' : ''}`}
                        onClick={() => handleToggleKeyframe('scale')}
                        title="Toggle Keyframe"
                      >
                        ◇
                      </span>
                      <span>Scale (%)</span>
                    </div>
                    <div className="prop-inputs">
                      {['X', 'Y'].map((axis, i) => {
                        const cur = evaluateProperty(selectedLayer.transform.scale, time);
                        const val = Array.isArray(cur) ? Math.round(cur[i] ?? 100) : 100;
                        return (
                          <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <span style={{ fontSize: '9px', color: '#64748b' }}>{axis}</span>
                            <input
                              type="number"
                              className="prop-input-num"
                              value={val}
                              onChange={(e) => handleNumericPropertyChange('scale', i, Number(e.target.value))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rotation */}
                  <div className="prop-control">
                    <div className="prop-label">
                      <span
                        className={`kf-diamond ${selectedLayer.transform.rotation.keyframes.length > 0 ? 'has-kf' : ''}`}
                        onClick={() => handleToggleKeyframe('rotation')}
                        title="Toggle Keyframe"
                      >
                        ◇
                      </span>
                      <span>Rotation</span>
                    </div>
                    <div className="prop-inputs">
                      {(() => {
                        const cur = evaluateProperty(selectedLayer.transform.rotation, time);
                        const val = Array.isArray(cur) ? Math.round(cur[0] ?? 0) : 0;
                        return (
                          <input
                            type="number"
                            className="prop-input-num"
                            value={val}
                            onChange={(e) =>
                              handleNumericPropertyChange('rotation', 0, Number(e.target.value))
                            }
                          />
                        );
                      })()}
                      <span style={{ fontSize: '10px', color: '#64748b' }}>°</span>
                    </div>
                  </div>

                  {/* Opacity */}
                  <div className="prop-control">
                    <div className="prop-label">
                      <span
                        className={`kf-diamond ${selectedLayer.transform.opacity.keyframes.length > 0 ? 'has-kf' : ''}`}
                        onClick={() => handleToggleKeyframe('opacity')}
                        title="Toggle Keyframe"
                      >
                        ◇
                      </span>
                      <span>Opacity</span>
                    </div>
                    <div className="prop-inputs">
                      {(() => {
                        const cur = evaluateProperty(selectedLayer.transform.opacity, time);
                        const val = Math.round(typeof cur === 'number' ? cur : 100);
                        return (
                          <>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              className="prop-input-range"
                              value={val}
                              onChange={(e) =>
                                handleNumericPropertyChange('opacity', null, Number(e.target.value))
                              }
                            />
                            <span style={{ width: '28px', textAlign: 'right', fontSize: '10px' }}>{val}%</span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Layer Content Properties */}
                {selectedLayer.type === 'text' && (
                  <div className="inspector-card">
                    <div className="inspector-card-header">
                      <span>Text Settings</span>
                    </div>
                    <div className="prop-control">
                      <span>Content</span>
                      <input
                        type="text"
                        value={selectedLayer.content.text || ''}
                        onChange={(e) => {
                          const nextLayers = composition.layers.map((l) =>
                            l.id === selectedLayer.id
                              ? { ...l, content: { ...l.content, text: e.target.value } }
                              : l
                          );
                          setEditorState((prev) => ({
                            ...prev,
                            project: {
                              ...prev.project,
                              compositions: prev.project.compositions.map((c) =>
                                c.id === composition.id ? { ...c, layers: nextLayers } : c
                              ),
                            },
                          }));
                        }}
                        style={{ width: '130px', background: '#0b0e14', border: '1px solid #29303d', borderRadius: '3px', color: '#fff', padding: '2px 4px', fontSize: '11px' }}
                      />
                    </div>
                    <div className="prop-control">
                      <span>Font Size</span>
                      <input
                        type="number"
                        className="prop-input-num"
                        value={selectedLayer.content.fontSize || 48}
                        onChange={(e) => {
                          const nextLayers = composition.layers.map((l) =>
                            l.id === selectedLayer.id
                              ? { ...l, content: { ...l.content, fontSize: Number(e.target.value) } }
                              : l
                          );
                          setEditorState((prev) => ({
                            ...prev,
                            project: {
                              ...prev.project,
                              compositions: prev.project.compositions.map((c) =>
                                c.id === composition.id ? { ...c, layers: nextLayers } : c
                              ),
                            },
                          }));
                        }}
                      />
                    </div>
                  </div>
                )}

                {(selectedLayer.type === 'solid' || selectedLayer.type === 'shape') && (
                  <div className="inspector-card">
                    <div className="inspector-card-header">
                      <span>Appearance</span>
                    </div>
                    <div className="prop-control">
                      <span>Color</span>
                      <input
                        type="color"
                        value={selectedLayer.content.color || '#3b82f6'}
                        onChange={(e) => {
                          const nextLayers = composition.layers.map((l) =>
                            l.id === selectedLayer.id
                              ? { ...l, content: { ...l.content, color: e.target.value } }
                              : l
                          );
                          setEditorState((prev) => ({
                            ...prev,
                            project: {
                              ...prev.project,
                              compositions: prev.project.compositions.map((c) =>
                                c.id === composition.id ? { ...c, layers: nextLayers } : c
                              ),
                            },
                          }));
                        }}
                        style={{ width: '32px', height: '24px', padding: 0, border: '0', background: 'none', cursor: 'pointer' }}
                      />
                    </div>
                    {selectedLayer.type === 'shape' && (
                      <div className="prop-control">
                        <span>Shape</span>
                        <select
                          value={selectedLayer.content.shapeType || 'circle'}
                          onChange={(e) => {
                            const nextLayers = composition.layers.map((l) =>
                              l.id === selectedLayer.id
                                ? { ...l, content: { ...l.content, shapeType: e.target.value as any } }
                                : l
                            );
                            setEditorState((prev) => ({
                              ...prev,
                              project: {
                                ...prev.project,
                                compositions: prev.project.compositions.map((c) =>
                                  c.id === composition.id ? { ...c, layers: nextLayers } : c
                                ),
                              },
                            }));
                          }}
                          style={{ background: '#0b0e14', color: '#cbd5e1', border: '1px solid #29303d', fontSize: '11px', borderRadius: '3px', padding: '2px' }}
                        >
                          <option value="circle">Circle</option>
                          <option value="rect">Rectangle</option>
                          <option value="star">Star</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* VFX Effects Stack */}
                <div className="inspector-card">
                  <div className="inspector-card-header">
                    <span>VFX Effects ({selectedLayer.effects.length})</span>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          executeCmd(new AddEffectCommand(selectedLayer.id, createEffect(e.target.value as EffectType)));
                          e.target.value = '';
                        }
                      }}
                      style={{ background: '#0b0e14', color: '#38bdf8', border: '1px solid #29303d', fontSize: '10px', borderRadius: '3px', padding: '2px' }}
                    >
                      <option value="">+ Add Effect</option>
                      <option value="blur">Gaussian Blur</option>
                      <option value="brightness-contrast">Brightness & Contrast</option>
                      <option value="hue-saturation">Hue & Saturation</option>
                      <option value="glow">Glow</option>
                      <option value="vignette">Vignette</option>
                      <option value="invert">Invert</option>
                    </select>
                  </div>

                  {selectedLayer.effects.map((effect) => (
                    <div key={effect.id} className="effect-row">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="checkbox"
                            checked={effect.enabled}
                            onChange={(e) => {
                              const nextEffects = selectedLayer.effects.map((ef) =>
                                ef.id === effect.id ? { ...ef, enabled: e.target.checked } : ef
                              );
                              const nextLayers = composition.layers.map((l) =>
                                l.id === selectedLayer.id ? { ...l, effects: nextEffects } : l
                              );
                              setEditorState((prev) => ({
                                ...prev,
                                project: {
                                  ...prev.project,
                                  compositions: prev.project.compositions.map((c) =>
                                    c.id === composition.id ? { ...c, layers: nextLayers } : c
                                  ),
                                },
                              }));
                            }}
                          />
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#f1f5f9' }}>{effect.name}</span>
                        </div>
                        <button
                          onClick={() => executeCmd(new DeleteEffectCommand(selectedLayer.id, effect.id))}
                          style={{ color: '#ef4444', fontSize: '12px' }}
                        >
                          ✕
                        </button>
                      </div>

                      {/* Effect properties */}
                      {Object.entries(effect.properties).map(([k, prop]) => {
                        const curVal = evaluateProperty(prop, time);
                        return (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', margin: '4px 0' }}>
                            <span>{prop.name}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <input
                                type="range"
                                min={prop.min ?? 0}
                                max={prop.max ?? 100}
                                value={typeof curVal === 'number' ? curVal : 0}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  const updatedProp = { ...prop, value: val };
                                  const updatedEffect = {
                                    ...effect,
                                    properties: { ...effect.properties, [k]: updatedProp },
                                  };
                                  const nextEffects = selectedLayer.effects.map((ef) =>
                                    ef.id === effect.id ? updatedEffect : ef
                                  );
                                  const nextLayers = composition.layers.map((l) =>
                                    l.id === selectedLayer.id ? { ...l, effects: nextEffects } : l
                                  );
                                  setEditorState((prev) => ({
                                    ...prev,
                                    project: {
                                      ...prev.project,
                                      compositions: prev.project.compositions.map((c) =>
                                        c.id === composition.id ? { ...c, layers: nextLayers } : c
                                      ),
                                    },
                                  }));
                                }}
                                style={{ width: '60px', accentColor: '#38bdf8' }}
                              />
                              <span style={{ width: '28px', textAlign: 'right' }}>{Math.round(curVal)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="inspector-note">
                Select a layer in the timeline or viewer to edit transform, properties, and VFX effects.
              </div>
            )}
          </div>
        </aside>

        {/* TIMELINE / GRAPH EDITOR PANEL */}
        <section className="panel timeline-panel">
          <PanelTitle
            title={timelineMode === 'timeline' ? 'Timeline' : 'Graph Editor'}
            right={`${time.toFixed(2)}s / ${composition.duration.toFixed(2)}s`}
          />

          <div className="timeline-toolbar">
            <button onClick={() => handleAddLayer('text')}>＋ Text</button>
            <button onClick={() => handleAddLayer('solid')}>＋ Solid</button>
            <button onClick={() => handleAddLayer('shape')}>＋ Shape</button>
            <button onClick={() => handleAddLayer('audio')}>＋ Audio</button>

            <span style={{ borderLeft: '1px solid #20242b', height: '18px', margin: '0 4px' }} />

            <button
              onClick={() => handleToggleKeyframe('position')}
              disabled={!selectedLayer}
              title="Add / Remove keyframe at playhead"
            >
              ◇ Keyframe
            </button>
            <button onClick={handleSplitSelectedLayer} disabled={!selectedLayer} title="Split layer at playhead">
              ✂ Split
            </button>
            <button onClick={handleDuplicateSelectedLayer} disabled={!selectedLayer} title="Duplicate layer">
              ⧉ Duplicate
            </button>
            <button
              onClick={() => selectedLayer && executeCmd(new DeleteLayerCommand(selectedLayer.id))}
              disabled={!selectedLayer}
              title="Delete layer"
            >
              🗑 Delete
            </button>

            <span className="spacer" />

            <button
              className={timelineMode === 'timeline' ? 'active' : ''}
              onClick={() => setTimelineMode('timeline')}
            >
              Timeline
            </button>
            <button
              className={timelineMode === 'graph' ? 'active' : ''}
              onClick={() => setTimelineMode('graph')}
            >
              Graph Editor
            </button>
          </div>

          {timelineMode === 'timeline' ? (
            <div className="timeline-wrap">
              {/* Ruler Header */}
              <div className="timeline-header-row">
                <div className="track-header-col-title">Tracks ({composition.layers.length})</div>
                <div
                  className="ruler"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    setEditorState((prev) => ({ ...prev, currentTime: frac * composition.duration }));
                  }}
                >
                  {Array.from({ length: Math.ceil(composition.duration) + 1 }, (_, i) => (
                    <div key={i} className="ruler-tick" style={{ left: `${(i / composition.duration) * 100}%` }}>
                      <span>{i}s</span>
                    </div>
                  ))}
                  <div className="playhead-line" style={{ left: playheadPercent }}>
                    <div className="playhead-head" />
                  </div>
                </div>
              </div>

              {/* Tracks List */}
              <div className="timeline-tracks-scroll">
                {composition.layers.map((layer) => {
                  const isSelected = layer.id === editorState.selectedLayerId;
                  const leftPercent = (layer.start / composition.duration) * 100;
                  const widthPercent = (layer.duration / composition.duration) * 100;

                  // Find keyframes on this layer's transform
                  const allKfs = [
                    ...layer.transform.position.keyframes,
                    ...layer.transform.scale.keyframes,
                    ...layer.transform.rotation.keyframes,
                    ...layer.transform.opacity.keyframes,
                  ];

                  return (
                    <div className="track-row" key={layer.id}>
                      <div
                        className={`track-control ${isSelected ? 'selected' : ''}`}
                        onClick={() => setEditorState((prev) => ({ ...prev, selectedLayerId: layer.id }))}
                      >
                        <button
                          className={`track-icon-btn ${layer.visible ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextLayers = composition.layers.map((l) =>
                              l.id === layer.id ? { ...l, visible: !l.visible } : l
                            );
                            setEditorState((prev) => ({
                              ...prev,
                              project: {
                                ...prev.project,
                                compositions: prev.project.compositions.map((c) =>
                                  c.id === composition.id ? { ...c, layers: nextLayers } : c
                                ),
                              },
                            }));
                          }}
                          title="Toggle Visibility"
                        >
                          {layer.visible ? '👁' : '─'}
                        </button>
                        <button
                          className={`track-icon-btn ${layer.locked ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextLayers = composition.layers.map((l) =>
                              l.id === layer.id ? { ...l, locked: !l.locked } : l
                            );
                            setEditorState((prev) => ({
                              ...prev,
                              project: {
                                ...prev.project,
                                compositions: prev.project.compositions.map((c) =>
                                  c.id === composition.id ? { ...c, layers: nextLayers } : c
                                ),
                              },
                            }));
                          }}
                          title="Toggle Lock"
                        >
                          {layer.locked ? '🔒' : '🔓'}
                        </button>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {layer.name}
                        </span>
                      </div>

                      <div
                        className="track-lane"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                          setEditorState((prev) => ({ ...prev, currentTime: frac * composition.duration }));
                        }}
                      >
                        {/* Clip block */}
                        <div
                          className={`clip-block ${layer.type} ${isSelected ? 'selected' : ''}`}
                          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditorState((prev) => ({ ...prev, selectedLayerId: layer.id }));
                          }}
                          onMouseDown={(e) => {
                            if (layer.locked) return;
                            e.stopPropagation();
                            setEditorState((prev) => ({ ...prev, selectedLayerId: layer.id }));
                            const startClientX = e.clientX;
                            const origStart = layer.start;
                            const origDuration = layer.duration;
                            const lane = e.currentTarget.parentElement;
                            if (!lane) return;
                            const laneWidth = lane.getBoundingClientRect().width;

                            const onMove = (moveEv: MouseEvent) => {
                              const dt = ((moveEv.clientX - startClientX) / laneWidth) * composition.duration;
                              const newStart = Math.max(0, Math.min(composition.duration - origDuration, origStart + dt));
                              executeCmd(new MoveLayerTimingCommand(layer.id, origStart, origDuration, newStart, origDuration));
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
                            className="clip-handle clip-handle-left"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              const startClientX = e.clientX;
                              const origStart = layer.start;
                              const origDur = layer.duration;
                              const lane = (e.currentTarget.parentElement?.parentElement);
                              if (!lane) return;
                              const laneWidth = lane.getBoundingClientRect().width;

                              const onMove = (moveEv: MouseEvent) => {
                                const dt = ((moveEv.clientX - startClientX) / laneWidth) * composition.duration;
                                const maxStart = origStart + origDur - 0.2;
                                const newStart = Math.max(0, Math.min(maxStart, origStart + dt));
                                const newDur = origDur - (newStart - origStart);
                                executeCmd(new MoveLayerTimingCommand(layer.id, origStart, origDur, newStart, newDur));
                              };
                              const onUp = () => {
                                window.removeEventListener('mousemove', onMove);
                                window.removeEventListener('mouseup', onUp);
                              };
                              window.addEventListener('mousemove', onMove);
                              window.addEventListener('mouseup', onUp);
                            }}
                          />

                          <span>{layer.name}</span>

                          {/* Keyframe diamonds on timeline clip */}
                          {allKfs.map((kf) => {
                            const kfRelTime = kf.time - layer.start;
                            if (kfRelTime < 0 || kfRelTime > layer.duration) return null;
                            const kfPercent = (kfRelTime / layer.duration) * 100;
                            return (
                              <div
                                key={kf.id}
                                className="kf-tick"
                                style={{ left: `${kfPercent}%` }}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setEditorState((prev) => ({ ...prev, currentTime: kf.time, selectedLayerId: layer.id }));
                                }}
                                title={`Keyframe at ${kf.time.toFixed(2)}s (${kf.interpolation})`}
                              />
                            );
                          })}

                          {/* Right Trim Handle */}
                          <div
                            className="clip-handle clip-handle-right"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              const startClientX = e.clientX;
                              const origDur = layer.duration;
                              const origStart = layer.start;
                              const lane = (e.currentTarget.parentElement?.parentElement);
                              if (!lane) return;
                              const laneWidth = lane.getBoundingClientRect().width;

                              const onMove = (moveEv: MouseEvent) => {
                                const dt = ((moveEv.clientX - startClientX) / laneWidth) * composition.duration;
                                const newDur = Math.max(0.2, Math.min(composition.duration - origStart, origDur + dt));
                                executeCmd(new MoveLayerTimingCommand(layer.id, origStart, origDur, origStart, newDur));
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

                        {/* Playhead indicator over lane */}
                        <div className="playhead-line" style={{ left: playheadPercent }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Master Scrubber Slider */}
              <input
                className="scrubber"
                type="range"
                min="0"
                max={composition.duration}
                step={1 / composition.fps}
                value={time}
                onChange={(event) =>
                  setEditorState((prev) => ({ ...prev, currentTime: Number(event.target.value) }))
                }
                aria-label="Timeline position"
              />
            </div>
          ) : (
            <GraphEditor
              composition={composition}
              selectedLayerId={editorState.selectedLayerId}
              selectedPropertyKey={editorState.selectedPropertyKey || 'position'}
              currentTime={time}
              onSeek={(targetTime) => setEditorState((prev) => ({ ...prev, currentTime: targetTime }))}
              onUpdateKeyframeInterpolation={(kfId, interpolation) => {
                if (!selectedLayer) return;
                const propKey = (editorState.selectedPropertyKey || 'position') as any;
                const prop = selectedLayer.transform[propKey as 'position'];
                const nextKfs = prop.keyframes.map((k) => (k.id === kfId ? { ...k, interpolation } : k));
                const transform = { ...selectedLayer.transform, [propKey]: { ...prop, keyframes: nextKfs } };
                const nextLayers = composition.layers.map((l) =>
                  l.id === selectedLayer.id ? { ...l, transform } : l
                );
                setEditorState((prev) => ({
                  ...prev,
                  project: {
                    ...prev.project,
                    compositions: prev.project.compositions.map((c) =>
                      c.id === composition.id ? { ...c, layers: nextLayers } : c
                    ),
                  },
                }));
              }}
            />
          )}
        </section>
      </main>

      {/* STATUSBAR */}
      <footer className="statusbar">
        <div className="statusbar-item">
          <span className="status-pill" />
          <span>ZiStudio Engine Ready</span>
        </div>
        <div>
          <span>
            {composition.name} · {composition.width}x{composition.height} @ {composition.fps} FPS ·{' '}
            {composition.duration}s
          </span>
        </div>
        <div>
          <span>{workspace} Workspace · 2D/3D & VFX Pipeline Active</span>
        </div>
      </footer>
    </div>
  );
}

function PanelTitle({ title, right }: { title: string; right?: string }) {
  return (
    <div className="panel-title">
      <strong>{title}</strong>
      {right && <span>{right}</span>}
    </div>
  );
}
