import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evaluateProperty } from './animation';
import { audioEngine } from './audio';
import {
  AddEffectCommand,
  AddKeyframeCommand,
  AddLayerCommand,
  Command,
  DeleteEffectCommand,
  DeleteKeyframeCommand,
  DeleteLayerCommand,
  MoveKeyframeCommand,
  MoveLayerTimingCommand,
  ReorderLayerCommand,
  SetPropertyValueCommand,
  SplitLayerCommand,
  UpdateEffectPropertyCommand,
  UpdateKeyframeInterpolationCommand,
  UpdateLayerPropertiesCommand,
} from './commands';
import { CommandManager, createEditorState, EditorState, getActiveComposition } from './editor';
import {
  Asset,
  BlendMode,
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

const initialProject = createProject();

export function App() {
  const [editorState, setEditorState] = useState<EditorState>(() => createEditorState(initialProject));
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
  const [isLooping, setIsLooping] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // Layout states
  const [maximizedPanel, setMaximizedPanel] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Export states
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const commandManager = useMemo(() => new CommandManager(), []);
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

  // Audio tone playback
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
          nextTime = isLooping ? 0 : comp.duration;
          if (!isLooping) {
            return { ...prev, currentTime: nextTime, isPlaying: false };
          }
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
  }, [isPlaying, isLooping]);

  // Step frame helper
  const handleStepFrame = useCallback(
    (delta: number) => {
      setEditorState((prev) => {
        const comp = getActiveComposition(prev);
        const nextTime = Math.max(0, Math.min(comp.duration, prev.currentTime + delta / comp.fps));
        return { ...prev, currentTime: nextTime };
      });
    },
    []
  );

  // Jump helpers
  const handleJumpToStart = useCallback(() => {
    setEditorState((prev) => ({ ...prev, currentTime: 0 }));
  }, []);

  const handleJumpToEnd = useCallback(() => {
    setEditorState((prev) => {
      const comp = getActiveComposition(prev);
      return { ...prev, currentTime: comp.duration };
    });
  }, []);

  // Layer creation
  const handleAddLayer = useCallback(
    (type: LayerType) => {
      let layer: Layer;
      const count = composition.layers.length + 1;
      if (type === 'solid') {
        const colors = ['#1e40af', '#065f46', '#991b1b', '#86198f', '#374151'];
        layer = createSolidLayer(`Solid ${count}`, colors[count % colors.length]);
      } else if (type === 'text') {
        layer = createTextLayer(`Text ${count}`, 0, 0);
      } else if (type === 'shape') {
        layer = createShapeLayer(`Shape ${count}`, 'circle');
      } else if (type === 'audio') {
        layer = {
          id: crypto.randomUUID(),
          name: `Audio Track ${count}`,
          type: 'audio',
          start: 0,
          duration: composition.duration,
          transform: createSolidLayer('temp', '#000').transform,
          blendMode: 'source-over',
          effects: [],
          content: { audioFreq: 440 + count * 40 },
          visible: true,
          locked: false,
        };
      } else {
        layer = createSolidLayer(`Adjustment ${count}`, 'transparent');
        layer.type = 'adjustment';
      }
      executeCmd(new AddLayerCommand(layer, 0));
    },
    [composition.duration, composition.layers.length, executeCmd]
  );

  // Split selected layer
  const handleSplitSelectedLayer = useCallback(() => {
    if (!selectedLayer) return;
    executeCmd(new SplitLayerCommand(selectedLayer.id, time));
  }, [selectedLayer, time, executeCmd]);

  // Duplicate selected layer
  const handleDuplicateSelectedLayer = useCallback(() => {
    if (!selectedLayer) return;
    const duplicated: Layer = {
      ...JSON.parse(JSON.stringify(selectedLayer)),
      id: crypto.randomUUID(),
      name: `${selectedLayer.name} (Copy)`,
      start: Math.min(composition.duration - 0.5, selectedLayer.start + 0.2),
    };
    executeCmd(new AddLayerCommand(duplicated, 0));
  }, [selectedLayer, composition.duration, executeCmd]);

  // Delete selected layer
  const handleDeleteSelectedLayer = useCallback(() => {
    if (editorState.selectedLayerId) {
      executeCmd(new DeleteLayerCommand(editorState.selectedLayerId));
    }
  }, [editorState.selectedLayerId, executeCmd]);

  // Keyframe toggle
  const handleToggleKeyframe = useCallback(
    (propertyPath: 'position' | 'scale' | 'rotation' | 'opacity' = 'position') => {
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
    },
    [selectedLayer, time, executeCmd]
  );

  // Navigate keyframes (prev/next)
  const handleNavigateKeyframe = useCallback(
    (propertyPath: 'position' | 'scale' | 'rotation' | 'opacity', direction: -1 | 1) => {
      if (!selectedLayer) return;
      const prop = selectedLayer.transform[propertyPath];
      if (prop.keyframes.length === 0) return;

      const sorted = [...prop.keyframes].sort((a, b) => a.time - b.time);
      if (direction === -1) {
        const prevKfs = sorted.filter((k) => k.time < time - 0.01);
        if (prevKfs.length > 0) {
          setEditorState((prev) => ({ ...prev, currentTime: prevKfs[prevKfs.length - 1].time }));
        }
      } else {
        const nextKfs = sorted.filter((k) => k.time > time + 0.01);
        if (nextKfs.length > 0) {
          setEditorState((prev) => ({ ...prev, currentTime: nextKfs[0].time }));
        }
      }
    },
    [selectedLayer, time]
  );

  // Numeric property changes
  const handleNumericPropertyChange = useCallback(
    (
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
        executeCmd(
          new SetPropertyValueCommand(selectedLayer.id, propertyPath, prop.value, nextValue)
        );
      }
    },
    [selectedLayer, time, executeCmd]
  );

  // Direct viewport translation of layer
  const handleLayerTranslate = useCallback(
    (dx: number, dy: number) => {
      if (!selectedLayer) return;
      const currentPos = evaluateProperty(selectedLayer.transform.position, time);
      const curX = Array.isArray(currentPos) ? currentPos[0] : 0;
      const curY = Array.isArray(currentPos) ? currentPos[1] : 0;
      handleNumericPropertyChange('position', 0, Math.round(curX + dx));
      handleNumericPropertyChange('position', 1, Math.round(curY + dy));
    },
    [selectedLayer, time, handleNumericPropertyChange]
  );

  // Effect management
  const handleAddEffect = useCallback(
    (type: EffectType) => {
      if (!selectedLayer) return;
      executeCmd(new AddEffectCommand(selectedLayer.id, createEffect(type)));
    },
    [selectedLayer, executeCmd]
  );

  const handleDeleteEffect = useCallback(
    (effectId: string) => {
      if (!selectedLayer) return;
      executeCmd(new DeleteEffectCommand(selectedLayer.id, effectId));
    },
    [selectedLayer, executeCmd]
  );

  const handleToggleEffect = useCallback(
    (effectId: string, enabled: boolean) => {
      if (!selectedLayer) return;
      const updatedEffects = selectedLayer.effects.map((e) =>
        e.id === effectId ? { ...e, enabled } : e
      );
      executeCmd(
        new UpdateLayerPropertiesCommand(selectedLayer.id, { effects: selectedLayer.effects }, { effects: updatedEffects })
      );
    },
    [selectedLayer, executeCmd]
  );

  const handleUpdateEffectProp = useCallback(
    (effectId: string, propKey: string, val: number) => {
      if (!selectedLayer) return;
      const effect = selectedLayer.effects.find((e) => e.id === effectId);
      const prevVal = effect?.properties[propKey]?.value;
      executeCmd(new UpdateEffectPropertyCommand(selectedLayer.id, effectId, propKey, prevVal, val));
    },
    [selectedLayer, executeCmd]
  );

  // Layer property updates
  const handleUpdateLayerProps = useCallback(
    (layerId: string, updates: Partial<Layer>) => {
      const layer = composition.layers.find((l) => l.id === layerId);
      if (!layer) return;
      executeCmd(new UpdateLayerPropertiesCommand(layerId, layer, updates));
    },
    [composition.layers, executeCmd]
  );

  // Reorder layer
  const handleReorderLayer = useCallback(
    (fromIndex: number, toIndex: number) => {
      executeCmd(new ReorderLayerCommand(fromIndex, toIndex));
    },
    [executeCmd]
  );

  // Add asset as layer
  const handleAddAssetToComposition = useCallback(
    (asset: Asset) => {
      const isImage = asset.type === 'image';
      const isVideo = asset.type === 'video';
      const isAudio = asset.type === 'audio';

      const newLayer: Layer = {
        id: crypto.randomUUID(),
        name: asset.name,
        type: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'solid',
        start: 0,
        duration: asset.duration || composition.duration,
        transform: createSolidLayer('temp', '#000').transform,
        blendMode: 'source-over',
        effects: [],
        content: { mediaUrl: asset.url, assetId: asset.id },
        visible: true,
        locked: false,
      };
      executeCmd(new AddLayerCommand(newLayer, 0));
    },
    [composition.duration, executeCmd]
  );

  // Import custom media file
  const handleImportMedia = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      const type = isImage ? 'image' : isAudio ? 'audio' : 'video';

      const newAsset: Asset = {
        id: crypto.randomUUID(),
        name: file.name,
        type,
        url,
      };

      setEditorState((prev) => ({
        ...prev,
        project: {
          ...prev.project,
          assets: [newAsset, ...prev.project.assets],
        },
      }));

      // Also create layer for instant preview
      handleAddAssetToComposition(newAsset);
      e.target.value = '';
    },
    [handleAddAssetToComposition]
  );

  // Save .zproj
  const handleSaveProject = useCallback(() => {
    const json = serializeProject(editorState.project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editorState.project.name.toLowerCase().replace(/\s+/g, '-')}.zproj`;
    a.click();
    URL.revokeObjectURL(url);
  }, [editorState.project]);

  // Open .zproj
  const handleOpenProjectFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, []);

  // Export current frame PNG
  const handleExportPNG = useCallback(() => {
    const canvas = document.querySelector('.viewer-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `zistudio-${composition.name.toLowerCase().replace(/\s+/g, '-')}-${time.toFixed(2)}s.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [composition.name, time]);

  // Real WebM Video Export using MediaRecorder
  const handleExportWebMVideo = useCallback(async () => {
    const canvas = document.querySelector('.viewer-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
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
        setEditorState((prev) => ({ ...prev, currentTime: renderTime }));
        setExportProgress(Math.round((f / totalFrames) * 100));
        await new Promise((r) => setTimeout(r, 16));
      }

      recorder.stop();
    } catch (err) {
      console.error('Video export error', err);
      setIsExporting(false);
    }
  }, [composition.name, composition.duration]);

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
        setEditorState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        handleStepFrame(-5);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setEditorState((prev) => ({ ...prev, isPlaying: false }));
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
          action: () => executeCmd(new SplitLayerCommand(layer.id, time)),
        },
        {
          id: 'duplicate',
          label: 'Duplicate Layer',
          shortcut: 'Ctrl+D',
          action: () => {
            const copy: Layer = {
              ...JSON.parse(JSON.stringify(layer)),
              id: crypto.randomUUID(),
              name: `${layer.name} (Copy)`,
              start: Math.min(composition.duration - 0.5, layer.start + 0.2),
            };
            executeCmd(new AddLayerCommand(copy, 0));
          },
        },
        {
          id: 'delete',
          label: 'Delete Layer',
          shortcut: 'Del',
          danger: true,
          action: () => executeCmd(new DeleteLayerCommand(layer.id)),
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
          action: () => executeCmd(new AddEffectCommand(layer.id, createEffect('blur'))),
        },
        {
          id: 'add-glow',
          label: 'Add Glow',
          action: () => executeCmd(new AddEffectCommand(layer.id, createEffect('glow'))),
        },
        {
          id: 'add-vignette',
          label: 'Add Vignette',
          action: () => executeCmd(new AddEffectCommand(layer.id, createEffect('vignette'))),
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
          action: () => setEditorState((prev) => ({ ...prev, pan: [0, 0] })),
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
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: 'bezier',
          label: 'Interpolation: Bezier',
          action: () =>
            executeCmd(
              new UpdateKeyframeInterpolationCommand(
                layer.id,
                'position',
                kf.id,
                kf.interpolation,
                'bezier'
              )
            ),
        },
        {
          id: 'linear',
          label: 'Interpolation: Linear',
          action: () =>
            executeCmd(
              new UpdateKeyframeInterpolationCommand(
                layer.id,
                'position',
                kf.id,
                kf.interpolation,
                'linear'
              )
            ),
        },
        {
          id: 'ease-in-out',
          label: 'Interpolation: Ease In / Out',
          action: () =>
            executeCmd(
              new UpdateKeyframeInterpolationCommand(
                layer.id,
                'position',
                kf.id,
                kf.interpolation,
                'ease-in-out'
              )
            ),
        },
        {
          id: 'hold',
          label: 'Interpolation: Hold',
          action: () =>
            executeCmd(
              new UpdateKeyframeInterpolationCommand(
                layer.id,
                'position',
                kf.id,
                kf.interpolation,
                'hold'
              )
            ),
        },
        { id: 'sep1', label: '', separator: true },
        {
          id: 'del-kf',
          label: 'Delete Keyframe',
          danger: true,
          action: () => executeCmd(new DeleteKeyframeCommand(layer.id, 'position', kf.id)),
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
        run: () => setEditorState((prev) => ({ ...prev, isPlaying: !prev.isPlaying })),
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

  const currentFrame = Math.floor(time * composition.fps);
  const totalFrames = Math.floor(composition.duration * composition.fps);

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
        canUndo={commandManager.canUndo()}
        canRedo={commandManager.canRedo()}
        showGuides={showGuides}
        showGrid={showGrid}
        workspace={workspace}
        onPlayPause={() => setEditorState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))}
        onStepFrame={handleStepFrame}
        onJumpToStart={handleJumpToStart}
        onJumpToEnd={handleJumpToEnd}
        onToggleLoop={() => setIsLooping((prev) => !prev)}
        onToggleMute={() => {
          const muted = audioEngine.toggleMute();
          setIsMuted(muted);
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleGuides={() => setShowGuides((prev) => !prev)}
        onToggleGrid={() => setShowGrid((prev) => !prev)}
        onFitZoom={() => setZoomLevel('fit')}
        onResetPan={() => setEditorState((prev) => ({ ...prev, pan: [0, 0] }))}
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
                onDeleteAsset={(id) => {
                  setEditorState((prev) => ({
                    ...prev,
                    project: {
                      ...prev.project,
                      assets: prev.project.assets.filter((a) => a.id !== id),
                    },
                  }));
                }}
              />
            )}

            {leftTab === 'layers' && (
              <LayerPanel
                layers={composition.layers}
                selectedLayerId={editorState.selectedLayerId}
                onSelectLayer={(id) => setEditorState((prev) => ({ ...prev, selectedLayerId: id }))}
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
                onDeleteLayer={(id) => executeCmd(new DeleteLayerCommand(id))}
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
            onResetPan={() => setEditorState((prev) => ({ ...prev, pan: [0, 0] }))}
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
                    executeCmd(new AddEffectCommand(selectedLayer.id, eff));
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
                onSeek={(targetTime) => setEditorState((prev) => ({ ...prev, currentTime: targetTime }))}
                onSelectLayer={(id) => setEditorState((prev) => ({ ...prev, selectedLayerId: id }))}
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
                  executeCmd(new MoveLayerTimingCommand(id, origStart, origDuration, newStart, newDuration));
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
                onSeek={(targetTime) => setEditorState((prev) => ({ ...prev, currentTime: targetTime }))}
                onSelectPropertyKey={(key) =>
                  setEditorState((prev) => ({ ...prev, selectedPropertyKey: key }))
                }
                onUpdateKeyframeInterpolation={(kfId, interpolation) => {
                  if (!selectedLayer) return;
                  executeCmd(
                    new UpdateKeyframeInterpolationCommand(
                      selectedLayer.id,
                      (editorState.selectedPropertyKey || 'position') as any,
                      kfId,
                      'bezier',
                      interpolation
                    )
                  );
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
