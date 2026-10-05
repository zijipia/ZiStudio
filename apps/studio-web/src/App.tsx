import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from './audio';
import { getActiveComposition } from './editor';
import { createEffect, createProject, Asset, EffectType, Keyframe, Layer, LayerType } from './model';
import { formatTimecode, frameIndex } from './runtime/playback-math';
import type { TransformPath } from './runtime/animation-ops';
import { useEditorRuntime } from './runtime/use-editor-runtime';
import { supportsHardwareVideoDecode, supportsWebCodecs } from './webcodecs';

import { TopMenuBar } from './components/TopMenuBar';
import { CommandPalette, CommandPaletteAction } from './components/CommandPalette';
import { ContextMenu, ContextMenuState } from './components/ContextMenu';
import { DockablePanel } from './components/DockablePanel';
import { ViewerPanel } from './components/ViewerPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { GraphEditorPanel } from './components/GraphEditorPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { LayerPanel } from './components/LayerPanel';
import { AssetBrowser } from './components/AssetBrowser';
import { EffectsBrowser } from './components/EffectsBrowser';
import { AudioMixerPanel } from './components/AudioMixerPanel';
import { ColorScopesPanel } from './components/ColorScopesPanel';
import './styles.css';

/**
 * App is UI composition + dependency wiring only.
 * All editor logic lives in the EditorRuntime (see ./runtime).
 */
export function App() {
  const { runtime, state: editorState } = useEditorRuntime(createProject);

  const [workspace, setWorkspace] = useState<'Edit' | 'Motion' | 'VFX' | '3D' | 'Color' | 'Audio'>('Edit');
  const [timelineMode, setTimelineMode] = useState<'timeline' | 'graph'>('timeline');

  // Left & Right tab selection
  const [leftTab, setLeftTab] = useState<string>('project');
  const [rightTab, setRightTab] = useState<string>('inspector');

  // Viewer options
  const [zoomLevel, setZoomLevel] = useState<number | 'fit'>('fit');
  const [resolution, setResolution] = useState<number>(1);
  const [showGuides, setShowGuides] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [channelMode, setChannelMode] = useState<'rgb' | 'red' | 'green' | 'blue' | 'alpha'>('rgb');

  // Timeline options
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // Layout states
  const [maximizedPanel, setMaximizedPanel] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Export states
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const relinkInputRef = useRef<HTMLInputElement>(null);
  const relinkTargetRef = useRef<string | null>(null);

  const composition = getActiveComposition(editorState);
  const time = editorState.currentTime;
  const isPlaying = editorState.isPlaying;
  const isLooping = editorState.isLooping;
  const selectedLayer = composition.layers.find((l) => l.id === editorState.selectedLayerId) || null;

  // Audio tone playback (placeholder synth until real audio decoding lands)
  useEffect(() => {
    if (isPlaying && !isMuted) {
      const activeAudio = composition.layers.find(
        (l) => l.type === 'audio' && l.visible && time >= l.start && time <= l.start + l.duration
      );
      if (activeAudio) {
        audioEngine.playTone(activeAudio.content.audioFreq || 440, 0.08);
      }
    }
  }, [isPlaying, isMuted, Math.floor(time * 8), composition.layers]);

  // --- thin delegates to the runtime (stable identities) ---------------------
  const handleUndo = useCallback(() => runtime.undo(), [runtime]);
  const handleRedo = useCallback(() => runtime.redo(), [runtime]);
  const handleStepFrame = useCallback((delta: number) => runtime.playback.stepFrames(delta), [runtime]);
  const handleJumpToStart = useCallback(() => runtime.playback.jumpToStart(), [runtime]);
  const handleJumpToEnd = useCallback(() => runtime.playback.jumpToEnd(), [runtime]);

  const handleAddLayer = useCallback((type: LayerType) => runtime.composition.addLayer(type), [runtime]);
  const handleSplitSelectedLayer = useCallback(() => runtime.composition.splitSelected(), [runtime]);
  const handleDuplicateSelectedLayer = useCallback(() => runtime.composition.duplicateSelected(), [runtime]);
  const handleDeleteSelectedLayer = useCallback(() => runtime.composition.deleteSelected(), [runtime]);
  const handleUpdateLayerProps = useCallback(
    (layerId: string, updates: Partial<Layer>) => runtime.composition.updateLayer(layerId, updates),
    [runtime]
  );
  const handleReorderLayer = useCallback(
    (from: number, to: number) => runtime.composition.reorder(from, to),
    [runtime]
  );
  const handleAddAssetToComposition = useCallback(
    (asset: Asset) => runtime.composition.addAssetToComposition(asset),
    [runtime]
  );

  const handleToggleKeyframe = useCallback(
    (path: TransformPath = 'position') => runtime.animation.toggleKeyframe(path),
    [runtime]
  );
  const handleNavigateKeyframe = useCallback(
    (path: TransformPath, direction: -1 | 1) => runtime.animation.navigateKeyframe(path, direction),
    [runtime]
  );
  const handleNumericPropertyChange = useCallback(
    (path: TransformPath, axisIndex: number | null, value: number) =>
      runtime.animation.setTransformValue(path, axisIndex, value),
    [runtime]
  );
  const handleLayerTranslate = useCallback(
    (dx: number, dy: number) => runtime.animation.translateSelected(dx, dy),
    [runtime]
  );

  const handleAddEffect = useCallback((type: EffectType) => runtime.composition.addEffect(type), [runtime]);
  const handleDeleteEffect = useCallback((id: string) => runtime.composition.deleteEffect(id), [runtime]);
  const handleToggleEffect = useCallback(
    (id: string, enabled: boolean) => runtime.composition.toggleEffect(id, enabled),
    [runtime]
  );
  const handleUpdateEffectProp = useCallback(
    (id: string, key: string, value: number) => runtime.composition.updateEffectProperty(id, key, value),
    [runtime]
  );

  // --- project / media / export ----------------------------------------------
  const handleImportMedia = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) void runtime.composition.importFile(file);
    },
    [runtime]
  );

  const handleRelinkPicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const assetId = relinkTargetRef.current;
      e.target.value = '';
      relinkTargetRef.current = null;
      if (!file || !assetId) return;
      runtime.composition.relinkAsset(assetId, file).catch((err) => window.alert(String(err.message ?? err)));
    },
    [runtime]
  );

  const handleSaveProject = useCallback(() => runtime.exporter.saveProject(), [runtime]);

  const handleOpenProjectFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      runtime.exporter.openProject(file).catch((err) => console.error('Failed to load .zproj', err));
    },
    [runtime]
  );

  const viewerCanvas = () => document.querySelector('.viewer-canvas') as HTMLCanvasElement | null;

  const handleExportPNG = useCallback(() => {
    const canvas = viewerCanvas();
    if (canvas) runtime.exporter.exportPNG(canvas);
  }, [runtime]);

  const handleExportWebMVideo = useCallback(async () => {
    setIsExporting(true);
    setExportProgress(0);
    try {
      await runtime.exporter.exportWebM({ onProgress: setExportProgress });
    } catch (err) {
      console.error('Video export error', err);
      window.alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExporting(false);
    }
  }, [runtime]);

  // Keyboard navigation & global shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea/select
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;

      if (cmdKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.code === 'Space') {
        e.preventDefault();
        runtime.playback.toggle();
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        handleStepFrame(-5);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        runtime.playback.pause();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleStepFrame(5);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleStepFrame(e.shiftKey ? -10 : -1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStepFrame(e.shiftKey ? 10 : 1);
      } else if (e.code === 'Home') {
        e.preventDefault();
        handleJumpToStart();
      } else if (e.code === 'End') {
        e.preventDefault();
        handleJumpToEnd();
      } else if (cmdKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (cmdKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (cmdKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateSelectedLayer();
      } else if (e.key === 's' || e.key === 'S') {
        if (!cmdKey) {
          e.preventDefault();
          handleSplitSelectedLayer();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setZoomLevel('fit');
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setTimelineMode((prev) => (prev === 'timeline' ? 'graph' : 'timeline'));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editorState.selectedLayerId) {
          e.preventDefault();
          handleDeleteSelectedLayer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleStepFrame,
    handleJumpToStart,
    handleJumpToEnd,
    handleUndo,
    handleRedo,
    handleDuplicateSelectedLayer,
    handleSplitSelectedLayer,
    handleDeleteSelectedLayer,
    editorState.selectedLayerId,
    runtime,
  ]);

  // Context menu actions
  const openLayerContextMenu = (e: React.MouseEvent, layer: Layer) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: 'split',
          label: 'Split at Playhead',
          shortcut: 'S',
          action: () => runtime.composition.splitLayer(layer.id),
        },
        {
          id: 'duplicate',
          label: 'Duplicate Layer',
          shortcut: 'Ctrl+D',
          action: () => runtime.composition.duplicate(layer),
        },
        {
          id: 'delete',
          label: 'Delete Layer',
          shortcut: 'Del',
          danger: true,
          action: () => runtime.composition.deleteLayer(layer.id),
        },
        { id: 'sep1', label: '', separator: true },
        {
          id: 'toggle-vis',
          label: layer.visible ? 'Hide Layer' : 'Show Layer',
          action: () => handleUpdateLayerProps(layer.id, { visible: !layer.visible }),
        },
        {
          id: 'toggle-lock',
          label: layer.locked ? 'Unlock Layer' : 'Lock Layer',
          action: () => handleUpdateLayerProps(layer.id, { locked: !layer.locked }),
        },
        { id: 'sep2', label: '', separator: true },
        {
          id: 'add-blur',
          label: 'Add Gaussian Blur',
          action: () => runtime.composition.addEffect('blur', layer.id),
        },
        {
          id: 'add-glow',
          label: 'Add Glow',
          action: () => runtime.composition.addEffect('glow', layer.id),
        },
        {
          id: 'add-vignette',
          label: 'Add Vignette',
          action: () => runtime.composition.addEffect('vignette', layer.id),
        },
      ],
    });
  };

  const openViewerContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { id: 'fit', label: 'Fit to View', shortcut: 'F', action: () => setZoomLevel('fit') },
        { id: '100', label: 'Actual Size (100%)', action: () => setZoomLevel(1.0) },
        {
          id: 'reset-pan',
          label: 'Reset Viewport Pan',
          action: () => runtime.selection.setPan([0, 0]),
        },
        { id: 'sep1', label: '', separator: true },
        {
          id: 'toggle-guides',
          label: showGuides ? 'Hide Safe Guides' : 'Show Safe Guides',
          action: () => setShowGuides((prev) => !prev),
        },
        {
          id: 'toggle-grid',
          label: showGrid ? 'Hide Composition Grid' : 'Show Composition Grid',
          action: () => setShowGrid((prev) => !prev),
        },
      ],
    });
  };

  const openKeyframeContextMenu = (e: React.MouseEvent, layer: Layer, kf: Keyframe) => {
    const interpolation = (id: string, label: string, value: Keyframe['interpolation']) => ({
      id,
      label,
      action: () => runtime.animation.setInterpolation(layer, kf, value),
    });
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        interpolation('bezier', 'Interpolation: Bezier', 'bezier'),
        interpolation('linear', 'Interpolation: Linear', 'linear'),
        interpolation('ease-in-out', 'Interpolation: Ease In / Out', 'ease-in-out'),
        interpolation('hold', 'Interpolation: Hold', 'hold'),
        { id: 'sep1', label: '', separator: true },
        {
          id: 'del-kf',
          label: 'Delete Keyframe',
          danger: true,
          action: () => runtime.animation.deleteKeyframe(layer, kf),
        },
      ],
    });
  };

  // Command palette actions catalog
  const commandPaletteActions: CommandPaletteAction[] = useMemo(() => {
    return [
      {
        id: 'new-text',
        category: 'Layer',
        title: 'New Text Layer',
        description: 'Creates animated text clip',
        run: () => handleAddLayer('text'),
      },
      {
        id: 'new-solid',
        category: 'Layer',
        title: 'New Solid Layer',
        description: 'Creates background color plane',
        run: () => handleAddLayer('solid'),
      },
      {
        id: 'new-shape',
        category: 'Layer',
        title: 'New Shape Layer (Circle / Star / Rect)',
        description: 'Creates vector shape',
        run: () => handleAddLayer('shape'),
      },
      {
        id: 'new-audio',
        category: 'Layer',
        title: 'New Audio Track',
        description: 'Adds synthesis audio waveform',
        run: () => handleAddLayer('audio'),
      },
      {
        id: 'split-layer',
        category: 'Layer',
        title: 'Split Selected Layer at Playhead',
        shortcut: 'S',
        run: handleSplitSelectedLayer,
      },
      {
        id: 'duplicate-layer',
        category: 'Layer',
        title: 'Duplicate Selected Layer',
        shortcut: 'Ctrl+D',
        run: handleDuplicateSelectedLayer,
      },
      {
        id: 'delete-layer',
        category: 'Layer',
        title: 'Delete Selected Layer',
        shortcut: 'Del',
        run: handleDeleteSelectedLayer,
      },
      {
        id: 'toggle-play',
        category: 'Playback',
        title: 'Play / Pause Composition',
        shortcut: 'Space',
        run: () => runtime.playback.toggle(),
      },
      {
        id: 'step-forward',
        category: 'Playback',
        title: 'Step Forward 1 Frame',
        shortcut: '→',
        run: () => handleStepFrame(1),
      },
      {
        id: 'step-backward',
        category: 'Playback',
        title: 'Step Backward 1 Frame',
        shortcut: '←',
        run: () => handleStepFrame(-1),
      },
      {
        id: 'jump-start',
        category: 'Playback',
        title: 'Jump to Beginning',
        shortcut: 'Home',
        run: handleJumpToStart,
      },
      {
        id: 'jump-end',
        category: 'Playback',
        title: 'Jump to End',
        shortcut: 'End',
        run: handleJumpToEnd,
      },
      {
        id: 'add-kf',
        category: 'Edit',
        title: 'Toggle Keyframe on Position',
        run: () => handleToggleKeyframe('position'),
      },
      {
        id: 'undo',
        category: 'Edit',
        title: 'Undo Last Action',
        shortcut: 'Ctrl+Z',
        run: handleUndo,
      },
      {
        id: 'redo',
        category: 'Edit',
        title: 'Redo Last Action',
        shortcut: 'Ctrl+Y',
        run: handleRedo,
      },
      {
        id: 'ws-edit',
        category: 'Workspace',
        title: 'Switch to Edit Workspace',
        run: () => {
          setWorkspace('Edit');
          setTimelineMode('timeline');
          setLeftTab('project');
        },
      },
      {
        id: 'ws-motion',
        category: 'Workspace',
        title: 'Switch to Motion Workspace',
        run: () => {
          setWorkspace('Motion');
          setTimelineMode('graph');
          setLeftTab('layers');
        },
      },
      {
        id: 'ws-vfx',
        category: 'Workspace',
        title: 'Switch to VFX Workspace',
        run: () => {
          setWorkspace('VFX');
          setTimelineMode('timeline');
          setLeftTab('effects');
        },
      },
      {
        id: 'ws-3d',
        category: 'Workspace',
        title: 'Switch to 3D Workspace',
        run: () => {
          setWorkspace('3D');
          setTimelineMode('timeline');
          setLeftTab('layers');
        },
      },
      {
        id: 'ws-color',
        category: 'Workspace',
        title: 'Switch to Color Workspace',
        run: () => {
          setWorkspace('Color');
          setTimelineMode('timeline');
        },
      },
      {
        id: 'ws-audio',
        category: 'Workspace',
        title: 'Switch to Audio Workspace',
        run: () => {
          setWorkspace('Audio');
          setTimelineMode('timeline');
        },
      },
      {
        id: 'export-png',
        category: 'Project',
        title: 'Export Frame as PNG',
        run: handleExportPNG,
      },
      {
        id: 'export-video',
        category: 'Project',
        title: 'Render Video (WebM)',
        shortcut: 'Ctrl+M',
        run: handleExportWebMVideo,
      },
      {
        id: 'save-proj',
        category: 'Project',
        title: 'Save Project (.zproj)',
        shortcut: 'Ctrl+S',
        run: handleSaveProject,
      },
      {
        id: 'toggle-guides',
        category: 'View',
        title: 'Toggle Safe Area Guides',
        run: () => setShowGuides((prev) => !prev),
      },
      {
        id: 'toggle-grid',
        category: 'View',
        title: 'Toggle Rule-of-Thirds Grid',
        run: () => setShowGrid((prev) => !prev),
      },
      {
        id: 'fit-zoom',
        category: 'View',
        title: 'Fit Viewport to Screen',
        shortcut: 'F',
        run: () => setZoomLevel('fit'),
      },
      {
        id: 'add-blur',
        category: 'Effects',
        title: 'Apply Gaussian Blur',
        run: () => handleAddEffect('blur'),
      },
      {
        id: 'add-glow',
        category: 'Effects',
        title: 'Apply Glow Effect',
        run: () => handleAddEffect('glow'),
      },
      {
        id: 'add-vignette',
        category: 'Effects',
        title: 'Apply Vignette',
        run: () => handleAddEffect('vignette'),
      },
    ];
  }, [
    handleAddLayer,
    handleSplitSelectedLayer,
    handleDuplicateSelectedLayer,
    handleDeleteSelectedLayer,
    handleStepFrame,
    handleJumpToStart,
    handleJumpToEnd,
    handleToggleKeyframe,
    handleUndo,
    handleRedo,
    handleExportPNG,
    handleExportWebMVideo,
    handleSaveProject,
    handleAddEffect,
  ]);

  const formattedTimecode = useMemo(() => formatTimecode(time, composition.fps), [time, composition.fps]);

  const currentFrame = frameIndex(time, composition.fps);
  const totalFrames = frameIndex(composition.duration, composition.fps);

  // Left Panel tabs configuration based on active workspace
  const leftTabs = useMemo(() => {
    if (workspace === 'Motion' || workspace === '3D') {
      return [
        { id: 'layers', label: 'Layers', badge: composition.layers.length },
        { id: 'project', label: 'Project' },
        { id: 'assets', label: 'Assets', badge: editorState.project.assets.length },
      ];
    }
    if (workspace === 'VFX') {
      return [
        { id: 'effects', label: 'VFX Library' },
        { id: 'layers', label: 'Layers', badge: composition.layers.length },
        { id: 'project', label: 'Project' },
      ];
    }
    return [
      { id: 'project', label: 'Project' },
      { id: 'assets', label: 'Asset Browser', badge: editorState.project.assets.length },
      { id: 'layers', label: 'Layers', badge: composition.layers.length },
    ];
  }, [workspace, composition.layers.length, editorState.project.assets.length]);

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
        ref={relinkInputRef}
        onChange={handleRelinkPicked}
        accept="image/*,video/*,audio/*"
        style={{ display: 'none' }}
      />
      <input
        type="file"
        ref={mediaInputRef}
        onChange={handleImportMedia}
        accept="image/*,video/*,audio/*"
        style={{ display: 'none' }}
      />

      {/* TOP MENU BAR & TRANSPORT */}
      <TopMenuBar
        timecode={formattedTimecode}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        fps={composition.fps}
        isPlaying={isPlaying}
        isLooping={isLooping}
        isMuted={isMuted}
        canUndo={runtime.commands.canUndo()}
        canRedo={runtime.commands.canRedo()}
        showGuides={showGuides}
        showGrid={showGrid}
        workspace={workspace}
        onPlayPause={() => runtime.playback.toggle()}
        onStepFrame={handleStepFrame}
        onJumpToStart={handleJumpToStart}
        onJumpToEnd={handleJumpToEnd}
        onToggleLoop={() => runtime.playback.toggleLoop()}
        onToggleMute={() => {
          const muted = audioEngine.toggleMute();
          setIsMuted(muted);
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleGuides={() => setShowGuides((prev) => !prev)}
        onToggleGrid={() => setShowGrid((prev) => !prev)}
        onFitZoom={() => setZoomLevel('fit')}
        onResetPan={() => runtime.selection.setPan([0, 0])}
        onSaveProject={handleSaveProject}
        onOpenProject={() => fileInputRef.current?.click()}
        onImportMedia={() => mediaInputRef.current?.click()}
        onExportPNG={handleExportPNG}
        onExportVideo={handleExportWebMVideo}
        onAddLayer={handleAddLayer}
        onAddEffect={handleAddEffect}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* WORKSPACE PRESETS SWITCHER */}
      <div className="workspace-tabs">
        {(['Edit', 'Motion', 'VFX', '3D', 'Color', 'Audio'] as const).map((item) => (
          <button
            key={item}
            className={workspace === item ? 'active' : ''}
            onClick={() => {
              setWorkspace(item);
              if (item === 'Motion') {
                setTimelineMode('graph');
                setLeftTab('layers');
              } else if (item === 'VFX') {
                setTimelineMode('timeline');
                setLeftTab('effects');
              } else if (item === '3D') {
                setTimelineMode('timeline');
                setLeftTab('layers');
              } else {
                setTimelineMode('timeline');
                setLeftTab('project');
              }
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {/* MAIN DOCKABLE GRID */}
      <main className="main-grid">
        {/* LEFT DOCKABLE PANEL (Project, Assets, Layers, or Effects) */}
        <aside className="panel project-panel">
          <DockablePanel
            id="left"
            tabs={leftTabs}
            activeTab={leftTab}
            onTabChange={setLeftTab}
            isMaximized={maximizedPanel === 'left'}
            onToggleMaximize={() => setMaximizedPanel((prev) => (prev === 'left' ? null : 'left'))}
          >
            {leftTab === 'project' && (
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
                  <div
                    className="project-section-title"
                    style={{ display: 'flex', justifyContent: 'space-between' }}
                  >
                    <span>Assets ({editorState.project.assets.length})</span>
                    <button
                      onClick={() => mediaInputRef.current?.click()}
                      style={{ color: '#38bdf8', fontSize: '10px', textTransform: 'none' }}
                    >
                      + Import
                    </button>
                  </div>
                  <div className="asset-tree">
                    {editorState.project.assets.map((asset) => (
                      <div
                        key={asset.id}
                        className="asset-item"
                        onClick={() => handleAddAssetToComposition(asset)}
                        title="Click to add as layer"
                      >
                        <span>{asset.type === 'video' ? '🎬' : asset.type === 'image' ? '🖼️' : '🎵'}</span>
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
            )}

            {leftTab === 'assets' && (
              <AssetBrowser
                assets={editorState.project.assets}
                onImportClick={() => mediaInputRef.current?.click()}
                onAddAssetToComposition={handleAddAssetToComposition}
                onDeleteAsset={(id) => runtime.composition.removeAsset(id)}
                onRelinkAsset={(id) => {
                  relinkTargetRef.current = id;
                  relinkInputRef.current?.click();
                }}
              />
            )}

            {leftTab === 'layers' && (
              <LayerPanel
                layers={composition.layers}
                selectedLayerId={editorState.selectedLayerId}
                onSelectLayer={(id) => runtime.selection.selectLayer(id)}
                onToggleVisibility={(id) => {
                  const l = composition.layers.find((item) => item.id === id);
                  if (l) handleUpdateLayerProps(id, { visible: !l.visible });
                }}
                onToggleLock={(id) => {
                  const l = composition.layers.find((item) => item.id === id);
                  if (l) handleUpdateLayerProps(id, { locked: !l.locked });
                }}
                onToggleSolo={(id) => {
                  const l = composition.layers.find((item) => item.id === id);
                  if (l) handleUpdateLayerProps(id, { solo: !l.solo });
                }}
                onToggle3D={(id) => {
                  const l = composition.layers.find((item) => item.id === id);
                  if (l) handleUpdateLayerProps(id, { is3D: !l.is3D });
                }}
                onChangeBlendMode={(id, mode) => handleUpdateLayerProps(id, { blendMode: mode })}
                onChangeParent={(id, parentId) => handleUpdateLayerProps(id, { parentId })}
                onRenameLayer={(id, newName) => handleUpdateLayerProps(id, { name: newName })}
                onReorderLayer={handleReorderLayer}
                onDuplicateLayer={handleDuplicateSelectedLayer}
                onSplitLayer={handleSplitSelectedLayer}
                onDeleteLayer={(id) => runtime.composition.deleteLayer(id)}
                onContextMenu={openLayerContextMenu}
              />
            )}

            {leftTab === 'effects' && (
              <EffectsBrowser
                selectedLayerName={selectedLayer?.name}
                onApplyEffect={handleAddEffect}
              />
            )}
          </DockablePanel>
        </aside>

        {/* CENTER VIEWPORT (Composition Viewer) */}
        <section className="panel viewer-panel">
          <ViewerPanel
            composition={composition}
            frameProvider={runtime.media}
            currentTime={time}
            selectedLayerId={editorState.selectedLayerId}
            pan={editorState.pan}
            showGuides={showGuides}
            showGrid={showGrid}
            isPlaying={isPlaying}
            zoomLevel={zoomLevel}
            resolution={resolution}
            channelMode={channelMode}
            isMaximized={maximizedPanel === 'viewer'}
            onZoomChange={setZoomLevel}
            onResolutionChange={setResolution}
            onChannelModeChange={setChannelMode}
            onToggleGuides={() => setShowGuides((prev) => !prev)}
            onToggleGrid={() => setShowGrid((prev) => !prev)}
            onResetPan={() => runtime.selection.setPan([0, 0])}
            onToggleMaximize={() =>
              setMaximizedPanel((prev) => (prev === 'viewer' ? null : 'viewer'))
            }
            onLayerTranslate={handleLayerTranslate}
            onContextMenu={openViewerContextMenu}
          />
        </section>

        {/* RIGHT DOCKABLE PANEL (Inspector / Properties or Specialty Tools) */}
        <aside className="panel inspector-panel">
          <DockablePanel
            id="right"
            title={workspace === 'Color' ? 'Color Scopes' : workspace === 'Audio' ? 'Audio Inspector' : 'Inspector'}
            rightMeta={selectedLayer ? selectedLayer.type.toUpperCase() : 'NO SELECTION'}
            isMaximized={maximizedPanel === 'right'}
            onToggleMaximize={() => setMaximizedPanel((prev) => (prev === 'right' ? null : 'right'))}
          >
            {workspace === 'Color' ? (
              <ColorScopesPanel
                composition={composition}
                selectedLayer={selectedLayer}
                onApplyColorGrade={(b, c, s) => {
                  if (!selectedLayer) return;
                  // If Brightness & Contrast exists, update it
                  const bc = selectedLayer.effects.find((e) => e.type === 'brightness-contrast');
                  if (bc) {
                    handleUpdateEffectProp(bc.id, 'brightness', b);
                    handleUpdateEffectProp(bc.id, 'contrast', c);
                  } else {
                    const eff = createEffect('brightness-contrast');
                    eff.properties.brightness.value = b;
                    eff.properties.contrast.value = c;
                    runtime.composition.addEffectInstance(eff);
                  }
                }}
              />
            ) : (
              <InspectorPanel
                layer={selectedLayer}
                currentTime={time}
                onNumericPropertyChange={handleNumericPropertyChange}
                onToggleKeyframe={handleToggleKeyframe}
                onNavigateKeyframe={handleNavigateKeyframe}
                onUpdateContent={(updates) => {
                  if (!selectedLayer) return;
                  handleUpdateLayerProps(selectedLayer.id, {
                    content: { ...selectedLayer.content, ...updates },
                  });
                }}
                onUpdateBlendMode={(mode) => {
                  if (!selectedLayer) return;
                  handleUpdateLayerProps(selectedLayer.id, { blendMode: mode });
                }}
                onAddEffect={handleAddEffect}
                onToggleEffect={handleToggleEffect}
                onDeleteEffect={handleDeleteEffect}
                onUpdateEffectProp={handleUpdateEffectProp}
              />
            )}
          </DockablePanel>
        </aside>

        {/* BOTTOM PANEL (Timeline or Graph Editor or Audio Mixer) */}
        <section className="panel timeline-panel">
          <DockablePanel
            id="bottom"
            title={
              workspace === 'Audio'
                ? 'Audio Console'
                : timelineMode === 'timeline'
                ? 'Timeline'
                : 'Graph Editor'
            }
            rightMeta={`${time.toFixed(2)}s / ${composition.duration.toFixed(2)}s`}
            isMaximized={maximizedPanel === 'bottom'}
            onToggleMaximize={() =>
              setMaximizedPanel((prev) => (prev === 'bottom' ? null : 'bottom'))
            }
          >
            {workspace === 'Audio' ? (
              <AudioMixerPanel
                composition={composition}
                isPlaying={isPlaying}
                onUpdateFrequency={(layerId, freq) => {
                  handleUpdateLayerProps(layerId, { content: { audioFreq: freq } });
                }}
              />
            ) : timelineMode === 'timeline' ? (
              <TimelinePanel
                composition={composition}
                currentTime={time}
                selectedLayerId={editorState.selectedLayerId}
                timelineZoom={timelineZoom}
                snappingEnabled={snappingEnabled}
                onSeek={(targetTime) => runtime.playback.seek(targetTime)}
                onSelectLayer={(id) => runtime.selection.selectLayer(id)}
                onToggleVisibility={(id) => {
                  const l = composition.layers.find((item) => item.id === id);
                  if (l) handleUpdateLayerProps(id, { visible: !l.visible });
                }}
                onToggleLock={(id) => {
                  const l = composition.layers.find((item) => item.id === id);
                  if (l) handleUpdateLayerProps(id, { locked: !l.locked });
                }}
                onToggleSolo={(id) => {
                  const l = composition.layers.find((item) => item.id === id);
                  if (l) handleUpdateLayerProps(id, { solo: !l.solo });
                }}
                onMoveLayerTiming={(id, origStart, origDuration, newStart, newDuration) => {
                  runtime.composition.setLayerTiming(id, origStart, origDuration, newStart, newDuration);
                }}
                onAddLayer={handleAddLayer}
                onSplitLayer={handleSplitSelectedLayer}
                onDuplicateLayer={handleDuplicateSelectedLayer}
                onDeleteLayer={handleDeleteSelectedLayer}
                onToggleKeyframe={() => handleToggleKeyframe('position')}
                onTimelineZoomChange={setTimelineZoom}
                onToggleSnapping={() => setSnappingEnabled((prev) => !prev)}
                onSwitchToGraph={() => setTimelineMode('graph')}
                onKeyframeContextMenu={openKeyframeContextMenu}
                onTrackContextMenu={openLayerContextMenu}
              />
            ) : (
              <GraphEditorPanel
                composition={composition}
                selectedLayerId={editorState.selectedLayerId}
                selectedPropertyKey={editorState.selectedPropertyKey || 'position'}
                currentTime={time}
                onSeek={(targetTime) => runtime.playback.seek(targetTime)}
                onSelectPropertyKey={(key) => runtime.selection.selectProperty(key)}
                onUpdateKeyframeInterpolation={(kfId, interpolation) => {
                  if (!selectedLayer) return;
                  const path = (editorState.selectedPropertyKey || 'position') as TransformPath;
                  const keyframe = selectedLayer.transform[path]?.keyframes.find((k) => k.id === kfId);
                  if (keyframe) runtime.animation.setInterpolation(selectedLayer, keyframe, interpolation);
                }}
                onSwitchToTimeline={() => setTimelineMode('timeline')}
              />
            )}
          </DockablePanel>
        </section>
      </main>

      {/* STATUS BAR */}
      <footer className="statusbar">
        <div className="statusbar-item">
          <span className="status-pill" />
          <span>ZiStudio Web Runtime</span>
          <span style={{ opacity: 0.5 }}>|</span>
          <span>WebCodecs: {supportsWebCodecs() ? 'Enabled' : 'Emulated'}</span>
          <span>HW Decode: {supportsHardwareVideoDecode() ? 'Accelerated' : 'Standard'}</span>
        </div>
        <div>
          <span>
            {composition.name} · {composition.width}×{composition.height} @ {composition.fps} FPS ·{' '}
            {composition.duration}s ({totalFrames} frames)
          </span>
        </div>
        <div>
          <span>{workspace} Workspace Active</span>
        </div>
      </footer>

      {/* COMMAND PALETTE (Ctrl+K / Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        actions={commandPaletteActions}
      />

      {/* FLOATING CONTEXT MENU */}
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
}
