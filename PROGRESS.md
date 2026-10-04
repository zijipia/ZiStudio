# ZiStudio — Implementation Progress

> This file is a compact, continuously updated overview of what has actually been implemented. `plan.md` remains the full roadmap.

## Current milestone: Foundation Runtime & Web Editor Engine

**Status:** Completed & Operational

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
- [x] Command & Undo/Redo infrastructure (`CommandManager`, `SetPropertyValueCommand`, `AddKeyframeCommand`, `DeleteKeyframeCommand`, `AddLayerCommand`, `DeleteLayerCommand`, `SplitLayerCommand`, `MoveLayerTimingCommand`, `AddEffectCommand`, `DeleteEffectCommand`, Ctrl+Z / Ctrl+Y)
- [x] Property & Keyframe animation evaluator (`animation.ts` supporting scalar & vector `[x,y,z]` evaluation, Bezier cubic curves, Ease In, Ease Out, Ease In/Out, Linear, Hold)
- [x] Real-time Canvas / GPU viewport renderer (`CompositionRenderer` with layer transformation, anchor points, blend modes, filters, checkerboard background, interactive transform gizmo & safe-area guides)
- [x] Real video/motion graphics playback transport (60 FPS playback clock, play/pause, step frame backward/forward, loop toggle, SMPTE timecode `HH:MM:SS:FF`)
- [x] Interactive multi-track timeline (layer creation for Solid, Text, Shape, Audio, Adjustment; clip dragging & left/right trim handles; split clip at playhead; duplicate clip; keyframe diamond markers)
- [x] Graph Editor (`GraphEditor.tsx`) for visual curve inspection, value/time grids, keyframe handles, and interpolation selection
- [x] VFX Effects Engine (Gaussian Blur, Brightness & Contrast, Hue & Saturation, Glow, Vignette, Invert)
- [x] Inspector panel with transform numeric controls, sliders, keyframe toggle diamonds, blend mode selection, and effect parameter sliders
- [x] Audio engine abstraction (`audio.ts` with Web Audio API, volume, mute toggle, and waveform visualization)
- [x] Export pipeline (PNG single-frame export + real-time Canvas WebM video recording)

### In progress / Next milestones

- [ ] WebCodecs hardware accelerated decoding for large external video files
- [ ] wgpu native desktop pipeline bindings
- [ ] GStreamer native desktop pipeline
- [ ] GPAC native container muxer/demuxer
- [ ] Advanced 3D WebGL/WebGPU mesh viewport
- [ ] GPU compute particle simulation
- [ ] Node compositor view
- [ ] Optical-flow / planar tracking engine

## Architecture rule

The UI is not the media engine and React does not own frame rendering. Project data, animation, media, and rendering remain separate layers so the same project model can be used by Web and Desktop runtimes.
