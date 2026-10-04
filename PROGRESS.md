# ZiStudio — Implementation Progress

> This file is a compact, continuously updated overview of what has actually been implemented. `plan.md` remains the full roadmap.

## Current milestone: Media Runtime

**Status:** In progress

### Implemented

- [x] Git repository foundation
- [x] Monorepo npm workspace configuration (standardized for Node.js 22 runtime)
- [x] Web application package (`apps/studio-web`)
- [x] Vite + React entry point with TypeScript Bundler resolution
- [x] Professional editor shell (Topbar, Workspace navigation, Main Grid layout)
- [x] Workspace navigation: Edit / Motion (Graph Editor) / VFX / 3D / Color / Audio
- [x] Rust core crate (`crates/core`) with serializable project schema
- [x] Serializable project schema foundation & `.zproj` project format
- [x] Persistent project serialization & deserialization (`.zproj` file export & import)
- [x] Command & Undo/Redo infrastructure
- [x] Property & Keyframe animation evaluator
- [x] Canvas composition renderer and editor viewport
- [x] Playback transport and SMPTE timecode
- [x] Interactive multi-track timeline
- [x] Graph Editor
- [x] Initial VFX effects engine
- [x] Inspector controls and animated properties
- [x] Web Audio abstraction
- [x] PNG/WebM export
- [x] Browser media backend abstraction (`apps/studio-web/src/media.ts`)
- [x] Browser media source lifecycle: load, metadata probe, seek, frame acquisition and disposal
- [x] AbortSignal-aware browser media loading
- [x] Native Rust media crate boundary (`crates/media`)
- [x] Shared native `MediaBackend`, `MediaSource`, `MediaFrame` and metadata/error contracts
- [x] Bounded LRU decoded-frame cache with explicit `VideoFrame.close()` ownership
- [x] Timeline-aware media frame scheduler with stale-request suppression
- [x] WebCodecs capability detection
- [x] WebCodecs video decoder boundary for encoded chunks
- [x] Professional dockable panel layout with tabbed navigation, minimize, and maximize toggles
- [x] Dynamic workspace presets: Edit, Motion, VFX, 3D, Color, Audio
- [x] Searchable Command Palette (`Ctrl+K` / `Cmd+K`) with keyboard navigation
- [x] Multi-target context menu system (layers, timeline clips, keyframes, viewer)
- [x] Desktop-grade Viewer shell with live FPS calculation, resolution scaling (Full, Half, Quarter), safe area guides (Action 93%, Title 90%), rule-of-thirds grid, and channel inspection (RGB, Red, Green, Blue, Alpha)
- [x] Dedicated Asset Browser with search, Grid / List view toggle, media type filtering (Video, Audio, Image), metadata badges, and composition insertion
- [x] Dedicated Layer Stack panel with visibility, lock, solo, 2D/3D switches, blend modes, parent layer hierarchies, inline rename, and drag-and-drop reordering committed via CommandManager
- [x] Reusable Property Inspector with animatable inputs (Number, Slider, Vector2/3, Angle, Color, Dropdown, Text), keyframe toggle diamonds, and previous/next keyframe navigation
- [x] VFX Effects Browser catalog (Blur, Stylize, Distortion, Color) with instant application to selected layers
- [x] Professional Timeline with snapping magnet, timeline zoom, clip trimming handles, keyframe diamonds, track solo/mute, and playhead scrubbing
- [x] Graph Editor Panel with Value Graph & Speed Graph modes, Bezier curves, tangent inspection, and interpolation controls (Linear, Bezier, Ease In/Out, Hold)
- [x] Audio Console Mixer with channel strips, simulated stereo VU meters, volume faders, dB readouts, and tone generator frequency controls
- [x] Color Scopes Panel with real-time RGB Parade and Luma Waveform scope simulation, and 3-way color grading controls (Lift, Gamma, Gain)
- [x] Undoable commands: `ReorderLayerCommand`, `UpdateLayerPropertiesCommand`, `UpdateKeyframeInterpolationCommand`, `MoveKeyframeCommand`, `UpdateEffectPropertyCommand`

### In progress / Next milestones

- [ ] Connect imported video/image assets to the composition renderer via MediaSource/MediaFrameScheduler
- [ ] Container demuxing for WebCodecs input (GPAC-WASM or browser demuxer)
- [ ] Decode scheduler prefetch and playback integration
- [ ] wgpu native renderer crate
- [ ] GStreamer native media backend
- [ ] GPAC native container/muxer integration
- [ ] GPU frame upload / zero-copy paths
- [ ] Advanced 3D WebGPU viewport
- [ ] GPU compute particle simulation
- [ ] Node compositor view
- [ ] Optical-flow / planar tracking engine

## Latest Implementation

### Web Editor Shell & Professional Workflow Foundation
- **Milestone**: Professional Web Editor Shell
- **What changed**:
  - Modularized and implemented complete desktop-class editor shell components in `apps/studio-web/src/components/`:
    - `TopMenuBar.tsx`: Brand header, File/Edit/View/Layer/Effects menus, transport controls, loop toggle, audio mute, and SMPTE timecode clock.
    - `CommandPalette.tsx`: Global `Ctrl+K` searchable command palette with keyboard arrow navigation and action execution.
    - `ContextMenu.tsx`: Floating context menu for layers, timeline clips, keyframes, and viewer viewport.
    - `DockablePanel.tsx`: Flexible panel container with tabbed headers, maximize/restore, and collapse toggles.
    - `ViewerPanel.tsx`: Composition viewer with live FPS calculation, resolution scaling (100%, 50%, 25%), safe area overlays, rule-of-thirds grid, and channel inspection.
    - `AssetBrowser.tsx`: Asset manager with search, Grid & List views, media kind filters, metadata badges, and import flow.
    - `EffectsBrowser.tsx`: Categorized VFX library (Blur, Color, Stylize, Distortion) with one-click layer application.
    - `LayerPanel.tsx`: Hierarchical layer stack with visibility, lock, solo, 2D/3D layer switches, blend mode dropdown, inline rename, and reordering.
    - `InspectorPanel.tsx`: Reusable animatable property editor with keyframe navigation (`◂ ◇ ▸`), text/shape/solid content editors, and VFX effects stack with sliders.
    - `TimelinePanel.tsx`: Multi-track timeline with clip trimming, clip dragging with snapping magnet, zoom in/out, keyframe markers, and track headers.
    - `GraphEditorPanel.tsx`: Value & Speed graph curve editor with cubic Bezier curves and interpolation tools.
    - `AudioMixerPanel.tsx`: Audio workspace console with stereo VU meters, channel faders, and tone oscillator frequency controls.
    - `ColorScopesPanel.tsx`: Color workspace RGB Parade and Luma Waveform scope simulation with Lift, Gamma, Gain primary color grading.
  - Expanded command infrastructure (`commands.ts`) with `ReorderLayerCommand`, `UpdateLayerPropertiesCommand`, `UpdateKeyframeInterpolationCommand`, `MoveKeyframeCommand`, and `UpdateEffectPropertyCommand`.
  - Added `showGrid`, `showSafeAreas`, image caching, and channel modes to `CompositionRenderer` in `renderer.ts`.
- **Architecture changes**:
  - Decoupled editor panels into modular components with clean prop interfaces while retaining centralized command execution through `CommandManager`.
  - Separated project state from transient editor UI state (workspace layout, maximized panels, zoom level, resolution, and palette modals).
  - Maintained zero-poll, requestAnimationFrame-driven rendering loops and WebCodecs capability detection.
- **Tests**:
  - `npm run typecheck` / TypeScript 5.8: Passed with zero errors.
  - `npm run build`: Production bundle built successfully.
- **Next step**:
  - Connect media frames acquired via `MediaSource` and `MediaFrameScheduler` directly into the `CompositionRenderer` for live asset decoding during playback.

## Architecture rule

The UI is not the media engine and React does not own frame rendering. Project data, animation, media, and rendering remain separate layers so the same project model can be used by Web and Desktop runtimes.
