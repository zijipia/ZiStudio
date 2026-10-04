# ZiStudio — Implementation Progress

> This file is a compact, continuously updated overview of what has actually been implemented. `plan.md` remains the full roadmap.

## Current milestone: Media Abstraction

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

### In progress / Next milestones

- [ ] Connect imported video/image assets to the composition renderer
- [ ] WebCodecs backend for hardware-accelerated video decode
- [ ] Frame scheduling and decoded-frame cache
- [ ] wgpu native renderer crate
- [ ] GStreamer native media backend
- [ ] GPAC native container/muxer integration
- [ ] Advanced 3D WebGPU viewport
- [ ] GPU compute particle simulation
- [ ] Node compositor view
- [ ] Optical-flow / planar tracking engine

## Architecture rule

The UI is not the media engine and React does not own frame rendering. Project data, animation, media, and rendering remain separate layers so the same project model can be used by Web and Desktop runtimes.
