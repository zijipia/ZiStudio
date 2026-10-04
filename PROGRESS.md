# ZiStudio — Implementation Progress

> This file is a compact, continuously updated overview of what has actually been implemented. `plan.md` remains the full roadmap.

## Current milestone: Foundation Runtime

**Status:** In progress

### Implemented

- [x] Git repository foundation
- [x] pnpm workspace configuration
- [x] Web application package
- [x] Vite + React entry point
- [x] Initial professional editor shell
- [x] Workspace navigation: Edit / Motion / VFX / 3D / Color / Audio
- [x] Project panel placeholder
- [x] GPU Viewer placeholder boundary
- [x] Inspector placeholder
- [x] Timeline track shell
- [x] Rust workspace
- [x] `zistudio-core` crate
- [x] Stable project ID type
- [x] `Project` model
- [x] `Composition` model
- [x] `Layer` model
- [x] Layer kinds
- [x] Generic `Property<T>` abstraction
- [x] Basic `Keyframe<T>` abstraction
- [x] Transform property model
- [x] Basic animated-property evaluation boundary

### Not implemented yet

- [ ] Persistent project serialization
- [ ] Project migrations
- [ ] Command/undo system
- [ ] Real media backend
- [ ] GStreamer integration
- [ ] GPAC integration
- [ ] WebCodecs integration
- [ ] wgpu/WebGPU renderer
- [ ] Render graph
- [ ] Real video playback
- [ ] Real timeline editing
- [ ] Graph Editor
- [ ] Masks/compositing
- [ ] VFX effects
- [ ] Audio engine
- [ ] 3D renderer
- [ ] Particle system
- [ ] Tracking
- [ ] Node compositor
- [ ] Export pipeline
- [ ] Desktop runtime

## Next implementation sequence

1. Complete project schema and serialization.
2. Implement command + undo/redo infrastructure.
3. Add a proper animation evaluator with interpolation.
4. Define the media backend interfaces.
5. Add the first native media backend using GStreamer.
6. Establish the wgpu renderer and GPU resource abstractions.
7. Build the render graph.
8. Replace the Viewer placeholder with a real GPU viewport.
9. Connect decoded video frames to the render graph.
10. Add the first end-to-end video preview path.

## Architecture rule

The UI is not the media engine and React does not own frame rendering. Project data, animation, media, and rendering remain separate layers so the same project model can be used by Web and Desktop runtimes.
