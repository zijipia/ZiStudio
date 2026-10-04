# ZiStudio — Master Implementation Plan

> **Status:** Planning  
> **Target:** Professional non-linear video editor + motion graphics + VFX + compositing + 3D  
> **Core stack:** TypeScript/React + Rust + wgpu/WebGPU + GStreamer + GPAC  
> **Runtime targets:** Web + Desktop  
> **Project format:** `.zproj`

---

## 1. Vision

ZiStudio is a professional media creation application combining:

- Non-linear video editing
- Advanced timeline editing
- Motion graphics
- Complex keyframe animation
- Graph Editor
- Layer compositing
- Masks and mattes
- GPU VFX
- 2D and 3D composition
- Particle systems
- Camera/object tracking
- Color management
- Audio editing
- Node-based compositing
- Scripting and plugins
- Local and browser workflows

The architecture must be designed from the beginning so that the **Web and Desktop applications share the same project model, animation system, render graph, and effect definitions**.

The browser must be a first-class runtime, not merely a simplified demo.

---

# 2. Core Architectural Principles

## 2.1 Separate Editor, Runtime, Media, and Rendering

The application is divided into four major domains:

```text
Editor
  ├── UI
  ├── Timeline
  ├── Selection
  ├── Commands
  └── Workspaces

Runtime
  ├── Project
  ├── Composition
  ├── Layers
  ├── Properties
  ├── Animation
  └── Expressions

Media
  ├── Decode
  ├── Encode
  ├── Demux
  ├── Mux
  ├── Audio
  └── Asset storage

Renderer
  ├── Render Graph
  ├── 2D
  ├── 3D
  ├── Effects
  ├── Particles
  └── Compositing
```

Do not allow React UI code to become the media or rendering engine.

---

# 3. Runtime Architecture

## 3.1 Browser

```text
React / TypeScript
        │
        ▼
Editor Runtime
        │
        ├── WASM Core
        ├── WebGPU
        ├── WebCodecs
        ├── GPAC WASM
        ├── OPFS
        └── Web Workers
```

## 3.2 Desktop

```text
React / TypeScript
        │
        ▼
Native Shell
        │
        ▼
Rust Core
        │
        ├── wgpu
        ├── GStreamer
        ├── GPAC
        ├── Native filesystem
        ├── Native threads
        └── Hardware acceleration
```

## 3.3 Shared API

Both runtimes expose the same conceptual APIs:

```text
Project
Composition
Layer
Property
Keyframe
Effect
RenderGraph
Asset
MediaSource
Timeline
```

---

# 4. Recommended Repository

```text
ZiStudio/
├── apps/
│   ├── studio-web/
│   └── studio-desktop/
│
├── packages/
│   ├── editor-ui/
│   ├── timeline-ui/
│   ├── graph-editor/
│   ├── node-editor/
│   ├── property-editor/
│   ├── asset-browser/
│   ├── viewport-ui/
│   ├── command-system/
│   ├── project-api/
│   └── plugin-sdk/
│
├── crates/
│   ├── core/
│   ├── project/
│   ├── timeline/
│   ├── animation/
│   ├── expression/
│   ├── compositor/
│   ├── render-graph/
│   ├── renderer/
│   ├── renderer-2d/
│   ├── renderer-3d/
│   ├── effects/
│   ├── particles/
│   ├── tracking/
│   ├── media/
│   ├── media-gstreamer/
│   ├── media-gpac/
│   ├── media-web/
│   ├── audio/
│   ├── cache/
│   ├── color/
│   ├── export/
│   └── plugin-runtime/
│
├── shaders/
│   ├── common/
│   ├── composite/
│   ├── color/
│   ├── blur/
│   ├── distortion/
│   ├── particles/
│   ├── 3d/
│   └── postprocess/
│
├── plugins/
├── examples/
├── tests/
├── benchmarks/
└── docs/
```

---

# 5. Technology Stack

## Frontend

- TypeScript
- React
- Vite
- Canvas/WebGPU
- Web Workers
- IndexedDB/OPFS where appropriate

## Native Core

- Rust
- wgpu
- GStreamer
- GPAC
- Tokio only where asynchronous infrastructure is appropriate
- Rayon or custom scheduling for CPU parallelism where appropriate

## GPU

- wgpu
- WebGPU
- Vulkan
- DirectX 12
- Metal
- WGSL shaders

## Media

Primary native backend:

```text
GStreamer
```

Container/packaging/streaming:

```text
GPAC
```

Browser:

```text
WebCodecs
GPAC-WASM
WASM codecs where required
```

Optional compatibility backend:

```text
FFmpeg
```

FFmpeg is not the core rendering architecture.

---

# 6. Phase 0 — Foundation

## Goals

Create a minimal executable application and establish architecture boundaries.

### Tasks

- [ ] Create monorepo
- [ ] Configure pnpm workspace
- [ ] Configure Rust workspace
- [ ] Create web application
- [ ] Create desktop application shell
- [ ] Create Rust core crate
- [ ] Create TypeScript ↔ Rust/WASM boundary
- [ ] Define shared project schema
- [ ] Define error model
- [ ] Define logging/tracing
- [ ] Define feature flags
- [ ] Define versioning policy
- [ ] Define compatibility policy
- [ ] Create CI
- [ ] Create development builds
- [ ] Create release builds

### Acceptance

Application launches in:

```text
Web
Desktop
```

Both expose the same empty project.

---

# 7. Phase 1 — Project Model

The project model is the foundation of everything else.

## Entities

```text
Project
 ├── Assets
 ├── Compositions
 ├── Sequences
 ├── Metadata
 └── Settings
```

## Composition

```text
Composition
 ├── Width
 ├── Height
 ├── FPS
 ├── Duration
 ├── Color Space
 └── Layers
```

## Layer

```text
Layer
 ├── ID
 ├── Name
 ├── Type
 ├── Source
 ├── Timing
 ├── Transform
 ├── Properties
 ├── Masks
 ├── Effects
 ├── Parent
 ├── Matte
 ├── Blend Mode
 └── 2D/3D mode
```

### Tasks

- [ ] Define stable IDs
- [ ] Define serialization
- [ ] Define schema version
- [ ] Define migrations
- [ ] Define asset references
- [ ] Define composition references
- [ ] Define layer hierarchy
- [ ] Define parent relationships
- [ ] Define precomposition references

---

# 8. Phase 2 — Property System

Every animatable value must use a common property abstraction.

```text
Property<T>
 ├── Static value
 ├── Keyframes
 ├── Expression
 └── External driver
```

Examples:

```text
Transform.Position
Transform.Scale
Transform.Rotation
Opacity
Blur.Radius
Audio.Volume
Camera.FOV
Light.Intensity
```

### Tasks

- [ ] Generic Property<T>
- [ ] Type system
- [ ] Serialization
- [ ] Property metadata
- [ ] Min/max constraints
- [ ] Units
- [ ] Color values
- [ ] Vector values
- [ ] Boolean values
- [ ] Enum values
- [ ] String values
- [ ] Path values
- [ ] Property groups
- [ ] Parent-child properties

---

# 9. Phase 3 — Animation Engine

Animation is a first-class engine.

## Keyframe

```text
Keyframe
 ├── Time
 ├── Value
 ├── Interpolation
 ├── In Tangent
 ├── Out Tangent
 └── Metadata
```

## Interpolation

- [ ] Constant
- [ ] Linear
- [ ] Bezier
- [ ] Hold
- [ ] Ease In
- [ ] Ease Out
- [ ] Ease In Out
- [ ] Custom curve
- [ ] Spring
- [ ] Bounce
- [ ] Elastic

### Tasks

- [ ] Keyframe evaluation
- [ ] Curve evaluation
- [ ] Tangent editing
- [ ] Roving keyframes
- [ ] Time remapping
- [ ] Multi-property animation
- [ ] Animation caching
- [ ] Deterministic evaluation

---

# 10. Phase 4 — Command and Undo System

Use command-based editing rather than project snapshots.

```text
Command
 ├── execute()
 └── undo()
```

### Commands

- [ ] Add layer
- [ ] Delete layer
- [ ] Move layer
- [ ] Rename layer
- [ ] Set property
- [ ] Add keyframe
- [ ] Delete keyframe
- [ ] Add effect
- [ ] Delete effect
- [ ] Add mask
- [ ] Modify mask
- [ ] Reorder layers
- [ ] Change parent
- [ ] Change blend mode

### Advanced

- [ ] Transactions
- [ ] Nested transactions
- [ ] Coalescing
- [ ] History limits
- [ ] Autosave checkpoints
- [ ] Crash recovery

---

# 11. Phase 5 — Media Abstraction

Do not couple the project model to GStreamer.

```text
MediaBackend
 ├── probe()
 ├── open()
 ├── decode()
 ├── seek()
 ├── encode()
 └── mux()
```

Implement:

```text
NativeMediaBackend
BrowserMediaBackend
```

Native backend:

```text
GStreamer
GPAC
```

Browser backend:

```text
WebCodecs
GPAC-WASM
WASM codecs
```

Optional:

```text
FFmpeg compatibility backend
```

---

# 12. Phase 6 — Asset System

## Asset types

- [ ] Video
- [ ] Audio
- [ ] Image
- [ ] SVG
- [ ] Image sequence
- [ ] Font
- [ ] LUT
- [ ] 3D model
- [ ] Texture
- [ ] Project
- [ ] Effect preset

## Asset lifecycle

```text
Import
  ↓
Probe
  ↓
Index
  ↓
Cache
  ↓
Preview
  ↓
Use
```

### Tasks

- [ ] Asset database
- [ ] Asset IDs
- [ ] Metadata extraction
- [ ] Thumbnail generation
- [ ] Waveform generation
- [ ] Proxy generation
- [ ] Missing asset detection
- [ ] Relink
- [ ] Import folders
- [ ] Drag/drop
- [ ] Asset search

---

# 13. Phase 7 — GPU Renderer

Build the renderer before implementing complex VFX.

## Renderer abstraction

```text
Renderer
 ├── Device
 ├── Queue
 ├── Texture
 ├── Buffer
 ├── Pipeline
 ├── Shader
 ├── RenderPass
 └── ComputePass
```

### Tasks

- [ ] wgpu initialization
- [ ] WebGPU initialization
- [ ] Texture manager
- [ ] Buffer manager
- [ ] Shader manager
- [ ] Pipeline cache
- [ ] GPU resource lifetime
- [ ] Texture pooling
- [ ] GPU synchronization
- [ ] Debug GPU labels
- [ ] GPU profiling

---

# 14. Phase 8 — Render Graph

The render graph converts composition state into executable GPU passes.

```text
Composition
   ↓
Evaluation
   ↓
Dependency Graph
   ↓
Render Graph
   ↓
GPU Passes
```

### Pass types

- [ ] Upload
- [ ] Decode surface import
- [ ] Transform
- [ ] Mask
- [ ] Matte
- [ ] Blend
- [ ] Effect
- [ ] Composite
- [ ] 3D
- [ ] Color
- [ ] Output

### Optimization

- [ ] Pass merging
- [ ] Resource aliasing
- [ ] Texture pooling
- [ ] Dead pass elimination
- [ ] Dependency scheduling
- [ ] Async compute where appropriate
- [ ] GPU/CPU synchronization minimization

---

# 15. Phase 9 — Basic 2D Renderer

Implement:

- [ ] Images
- [ ] Video frames
- [ ] Solid layers
- [ ] SVG
- [ ] Text
- [ ] Shapes
- [ ] Transform
- [ ] Opacity
- [ ] Blend modes

### Acceptance

Render:

```text
Video
+
Image
+
Text
+
Shape
```

in one composition.

---

# 16. Phase 10 — Timeline UI

Timeline should not depend on DOM elements for every frame/keyframe.

Use:

```text
DOM
 ├── Toolbar
 ├── Track controls
 └── Context menus

Canvas
 ├── Clips
 ├── Keyframes
 ├── Markers
 ├── Playhead
 └── Guides
```

### Features

- [ ] Track creation
- [ ] Track deletion
- [ ] Track reorder
- [ ] Clip move
- [ ] Clip trim
- [ ] Split
- [ ] Ripple
- [ ] Roll
- [ ] Slip
- [ ] Slide
- [ ] Snapping
- [ ] Markers
- [ ] Zoom
- [ ] Scroll
- [ ] Selection
- [ ] Multi-selection
- [ ] Track locking
- [ ] Track visibility
- [ ] Track solo/mute

---

# 17. Phase 11 — Graph Editor

Implement:

- [ ] Value graph
- [ ] Speed graph
- [ ] Keyframe selection
- [ ] Bezier handles
- [ ] Tangent editing
- [ ] Multi-property editing
- [ ] Auto easing
- [ ] Custom curves
- [ ] Zoom/pan
- [ ] Snapping

Graph evaluation must be shared with the core animation engine.

---

# 18. Phase 12 — Masks and Mattes

## Mask

```text
Mask
 ├── Path
 ├── Feather
 ├── Expansion
 ├── Opacity
 ├── Mode
 └── Invert
```

### Modes

- [ ] Add
- [ ] Subtract
- [ ] Intersect
- [ ] Difference

### Tasks

- [ ] Bezier paths
- [ ] Path animation
- [ ] Feather
- [ ] Expansion
- [ ] Mask rendering
- [ ] Track matte
- [ ] Alpha matte
- [ ] Luma matte

---

# 19. Phase 13 — Compositing

Implement:

- [ ] Alpha compositing
- [ ] Premultiplied alpha
- [ ] Straight alpha
- [ ] Blend modes
- [ ] Adjustment layers
- [ ] Precompositions
- [ ] Track mattes
- [ ] Nested compositions

Blend modes:

- [ ] Normal
- [ ] Multiply
- [ ] Screen
- [ ] Overlay
- [ ] Add
- [ ] Subtract
- [ ] Darken
- [ ] Lighten
- [ ] Difference
- [ ] Color modes

---

# 20. Phase 14 — VFX Engine

Effect API:

```text
Effect
 ├── schema
 ├── properties
 ├── prepare()
 ├── evaluate()
 └── render()
```

## Initial effects

### Blur

- [ ] Gaussian
- [ ] Box
- [ ] Directional
- [ ] Radial

### Color

- [ ] Exposure
- [ ] Brightness
- [ ] Contrast
- [ ] Saturation
- [ ] Hue
- [ ] Gamma
- [ ] Curves
- [ ] LUT

### Distortion

- [ ] Displacement
- [ ] Turbulence
- [ ] Ripple
- [ ] Lens
- [ ] Bulge
- [ ] Pinch

### Stylization

- [ ] Glow
- [ ] Bloom
- [ ] Grain
- [ ] Noise
- [ ] Sharpen
- [ ] Pixelate
- [ ] RGB split

---

# 21. Phase 15 — Text and Motion Graphics

## Text engine

- [ ] Font loading
- [ ] Font fallback
- [ ] Unicode
- [ ] Shaping
- [ ] Tracking
- [ ] Leading
- [ ] Kerning
- [ ] Fill
- [ ] Stroke
- [ ] Shadow
- [ ] Text on path

## Text animation

- [ ] Character range
- [ ] Word range
- [ ] Line range
- [ ] Position
- [ ] Rotation
- [ ] Scale
- [ ] Opacity
- [ ] Tracking
- [ ] Blur
- [ ] Fill color

---

# 22. Phase 16 — Expression Engine

Do not use raw JavaScript `eval()`.

Create a sandboxed expression runtime.

```text
Expression
 ├── Time
 ├── Layer
 ├── Property
 ├── Math
 ├── Random
 └── User functions
```

Examples:

```text
wiggle()
clamp()
linear()
ease()
valueAtTime()
```

### Tasks

- [ ] Parser
- [ ] AST
- [ ] Sandbox
- [ ] Deterministic evaluation
- [ ] Dependency tracking
- [ ] Cycle detection
- [ ] Expression errors
- [ ] Expression caching

---

# 23. Phase 17 — Audio Engine

## Features

- [ ] Audio decode
- [ ] Waveform
- [ ] Multi-track audio
- [ ] Volume
- [ ] Pan
- [ ] Gain
- [ ] Automation
- [ ] EQ
- [ ] Compressor
- [ ] Limiter
- [ ] Audio meters
- [ ] Scrubbing
- [ ] Sync

Audio properties use the same property/keyframe system.

---

# 24. Phase 18 — Time and Speed

Implement:

- [ ] Playback rate
- [ ] Reverse
- [ ] Freeze frame
- [ ] Time remapping
- [ ] Speed curves
- [ ] Frame interpolation
- [ ] Optical-flow abstraction
- [ ] Variable frame rate handling

---

# 25. Phase 19 — 3D Engine

3D is a separate subsystem built on the same render graph.

```text
Scene
 ├── Camera
 ├── Lights
 ├── Meshes
 ├── Materials
 ├── Textures
 └── Environment
```

### Features

- [ ] 3D layer
- [ ] Position XYZ
- [ ] Rotation XYZ
- [ ] Scale XYZ
- [ ] Parent hierarchy
- [ ] Perspective camera
- [ ] Orthographic camera
- [ ] FOV
- [ ] Near/far plane
- [ ] Basic lighting
- [ ] Shadows
- [ ] PBR material
- [ ] Texture mapping
- [ ] Depth buffer

---

# 26. Phase 20 — 3D Viewport

UI:

```text
Viewport
 ├── Orbit
 ├── Pan
 ├── Zoom
 ├── Select
 ├── Move
 ├── Rotate
 ├── Scale
 ├── Camera
 └── Gizmos
```

### Scene panel

- [ ] Hierarchy
- [ ] Visibility
- [ ] Lock
- [ ] Camera
- [ ] Light
- [ ] Material

---

# 27. Phase 21 — Particle System

Use GPU compute where appropriate.

```text
ParticleSystem
 ├── Emitter
 ├── Simulation
 ├── Forces
 ├── Collision
 ├── Lifetime
 └── Renderer
```

## Emitters

- [ ] Point
- [ ] Sphere
- [ ] Box
- [ ] Cone
- [ ] Mesh
- [ ] Mask

## Forces

- [ ] Gravity
- [ ] Wind
- [ ] Noise
- [ ] Turbulence
- [ ] Attractor
- [ ] Repeller

---

# 28. Phase 22 — Tracking

Implement in stages.

## Point tracking

- [ ] Feature detection
- [ ] Tracking
- [ ] Confidence
- [ ] Keyframe generation

## Planar tracking

- [ ] Homography
- [ ] Perspective transform
- [ ] Stabilization

## Camera tracking

- [ ] Feature extraction
- [ ] Camera solve
- [ ] 3D points
- [ ] Camera reconstruction

## Object tracking

- [ ] Bounding box
- [ ] Motion model
- [ ] Keyframe export

---

# 29. Phase 23 — Rotoscoping

Later-stage subsystem.

- [ ] Advanced masks
- [ ] Mask tracking
- [ ] Edge refinement
- [ ] Matte generation
- [ ] Matte cleanup
- [ ] Segmentation integration
- [ ] Temporal consistency

AI/ML features must remain optional and modular.

---

# 30. Phase 24 — Node Compositor

Node types:

```text
Input
Output
Transform
Merge
Mask
Matte
Blur
Color
Composite
Key
3D
Particle
Noise
Displacement
```

Example:

```text
Video
  │
  ▼
Color
  │
  ├────► Blur
  │
  └────► Glow
            │
            ▼
         Composite
            │
            ▼
          Output
```

### Tasks

- [ ] Node graph data model
- [ ] Node editor
- [ ] Connections
- [ ] Ports
- [ ] Typed sockets
- [ ] Graph validation
- [ ] Cycle detection
- [ ] Graph-to-render conversion
- [ ] Node presets

---

# 31. Phase 25 — Color Management

Color must be designed into the renderer.

Support:

- [ ] sRGB
- [ ] Rec.709
- [ ] Display P3
- [ ] Rec.2020
- [ ] HDR
- [ ] PQ
- [ ] HLG
- [ ] Linear working space
- [ ] RGBA16F
- [ ] LUT
- [ ] Tone mapping

---

# 32. Phase 26 — Preview and Cache

Three levels:

```text
RAM Cache
   ↓
VRAM Cache
   ↓
Disk Cache
```

### Tasks

- [ ] Frame cache
- [ ] Texture cache
- [ ] Decode cache
- [ ] Proxy cache
- [ ] Effect cache
- [ ] Cache invalidation
- [ ] Cache hashing
- [ ] Background caching
- [ ] Cache size management

Cache keys must account for:

```text
composition
layer
frame
effect parameters
quality
color settings
```

---

# 33. Phase 27 — Proxy System

Support:

```text
Original
1/2
1/4
Proxy
Draft
```

Proxy generation must be backgrounded.

Timeline should allow:

```text
Full
Half
Quarter
Proxy
```

without changing project data.

---

# 34. Phase 28 — Export

Export pipeline:

```text
Composition
    ↓
Frame Evaluation
    ↓
Render Graph
    ↓
Color Conversion
    ↓
Encoder
    ↓
Muxer
```

Initial formats:

- [ ] MP4
- [ ] MOV
- [ ] WebM
- [ ] Image sequence
- [ ] WAV
- [ ] PNG
- [ ] JPEG
- [ ] EXR where appropriate

Professional codecs can be added progressively.

---

# 35. Phase 29 — Native Hardware Acceleration

Support hardware paths where available:

```text
NVIDIA
AMD
Intel
Apple
Linux VAAPI/Vulkan
Windows Media Foundation
```

The abstraction must not leak hardware-specific APIs into the editor model.

---

# 36. Phase 30 — Browser Runtime

Implement:

- [ ] WebGPU renderer
- [ ] WebCodecs media backend
- [ ] GPAC WASM integration
- [ ] WASM core
- [ ] Web Workers
- [ ] SharedArrayBuffer where available
- [ ] OPFS cache
- [ ] Browser project storage
- [ ] File System Access API where available
- [ ] Browser export

Graceful fallback:

```text
WebGPU unavailable
    ↓
Reduced preview mode

WebCodecs unavailable
    ↓
WASM/software fallback
```

---

# 37. Phase 31 — Desktop Runtime

Implement:

- [ ] Native shell
- [ ] Native filesystem
- [ ] Native GStreamer
- [ ] Native GPAC
- [ ] wgpu
- [ ] Native workers
- [ ] Hardware decode
- [ ] Hardware encode
- [ ] Native background rendering
- [ ] Crash recovery
- [ ] System notifications

---

# 38. Phase 32 — Workspace System

Initial workspaces:

```text
Edit
Motion
VFX
3D
Color
Audio
```

Each workspace defines:

```text
Panel layout
Toolbar
Shortcuts
Default selection
Relevant inspectors
```

Users can customize layouts.

---

# 39. Phase 33 — Docking System

Support:

- [ ] Dock
- [ ] Undock
- [ ] Split
- [ ] Tab
- [ ] Resize
- [ ] Float
- [ ] Maximize panel
- [ ] Restore layout
- [ ] Save workspace layout

---

# 40. Phase 34 — Professional UI

Required panels:

```text
Project
Media Browser
Viewer
Inspector
Timeline
Graph Editor
Node Editor
Effects
Properties
Scene
Materials
Audio Mixer
Scopes
Console
Render Queue
```

---

# 41. Phase 35 — Keyboard and Interaction System

Create centralized command IDs.

Examples:

```text
editor.undo
editor.redo
timeline.split
timeline.rippleDelete
layer.precompose
layer.duplicate
keyframe.add
keyframe.delete
viewer.fit
viewer.zoomIn
render.start
```

Support:

- [ ] Keyboard shortcuts
- [ ] Shortcut customization
- [ ] Context actions
- [ ] Command palette
- [ ] Mouse gestures where useful
- [ ] Tablet/stylus input where applicable

---

# 42. Phase 36 — Plugin System

Plugin categories:

```text
Effect
Importer
Exporter
Codec
Panel
Tool
Renderer
Script
```

Plugin manifest:

```text
plugin.json
```

Must define:

```text
ID
Name
Version
Runtime compatibility
Permissions
Entry points
Resources
```

Security boundaries are required before third-party plugins are supported.

---

# 43. Phase 37 — Scripting API

Expose safe automation APIs.

Example conceptual API:

```ts
const composition = project.createComposition({
  width: 3840,
  height: 2160,
  fps: 60
});

const layer = composition.addVideo(asset);

layer.position.setKeyframe(0, [0, 0, 0]);
layer.position.setKeyframe(2, [1000, 500, 0]);

layer.addEffect("blur", {
  radius: 20
});
```

Potential scripting runtimes:

```text
TypeScript/JavaScript sandbox
WASM scripting
```

Do not expose unrestricted native filesystem access to project scripts.

---

# 44. Phase 38 — Performance Architecture

Performance targets should be explicit.

## UI

- [ ] No blocking render on main thread
- [ ] Timeline remains interactive during background work
- [ ] Virtualized lists
- [ ] Canvas-based large timeline regions
- [ ] Incremental updates

## Renderer

- [ ] GPU resource pooling
- [ ] Avoid CPU↔GPU copies
- [ ] Render pass reuse
- [ ] Texture aliasing
- [ ] Async resource uploads
- [ ] GPU profiling

## Media

- [ ] Hardware decode
- [ ] Hardware encode
- [ ] Zero-copy where possible
- [ ] Frame prefetch
- [ ] Decode scheduling

---

# 45. Phase 39 — Zero-Copy Media Pipeline

Target:

```text
Hardware Decoder
      ↓
GPU Surface
      ↓
Render Graph
      ↓
VFX
      ↓
Composite
      ↓
Hardware Encoder
```

Avoid:

```text
GPU
 ↓
CPU
 ↓
CPU processing
 ↓
GPU
```

unless explicitly required.

This is one of the highest-priority performance goals.

---

# 46. Phase 40 — Testing

## Unit tests

- [ ] Project serialization
- [ ] Project migration
- [ ] Property evaluation
- [ ] Keyframe evaluation
- [ ] Expressions
- [ ] Commands
- [ ] Render graph
- [ ] Cache
- [ ] Color conversion

## Integration tests

- [ ] Import video
- [ ] Edit timeline
- [ ] Render composition
- [ ] Export video
- [ ] Reopen project
- [ ] Proxy workflow
- [ ] Web runtime
- [ ] Desktop runtime

## Golden image tests

Render deterministic compositions and compare output images.

## Performance tests

- [ ] 1080p
- [ ] 4K
- [ ] 4K60
- [ ] 8K where hardware permits
- [ ] many layers
- [ ] many keyframes
- [ ] heavy effects
- [ ] particle stress
- [ ] large node graph

---

# 47. Phase 41 — Crash Recovery

The editor must survive:

- [ ] GPU device loss
- [ ] Decode failure
- [ ] Missing media
- [ ] Plugin crash
- [ ] Export failure
- [ ] Out-of-memory conditions
- [ ] Browser tab reload
- [ ] Application crash

Implement:

```text
Autosave
+
Recovery Project
+
Command Journal
```

---

# 48. Phase 42 — Accessibility and Internationalization

Support:

- [ ] Keyboard navigation
- [ ] High contrast
- [ ] UI scaling
- [ ] Localization
- [ ] Unicode
- [ ] RTL text
- [ ] Japanese
- [ ] Vietnamese
- [ ] CJK fonts
- [ ] Font fallback

---

# 49. Phase 43 — Collaboration

Not part of MVP.

Possible architecture:

```text
Project
   ↓
Operation Log
   ↓
CRDT / Collaborative Model
   ↓
Remote Project State
```

Potential future features:

- [ ] Cloud projects
- [ ] Shared assets
- [ ] Comments
- [ ] Version history
- [ ] Multiplayer editing
- [ ] Review mode

---

# 50. Phase 44 — Cloud and Render Farm

Optional future subsystem:

```text
Local Project
      ↓
Render Job
      ↓
Render Queue
      ↓
Remote Worker
      ↓
Rendered Output
```

Workers may use the same Rust render core.

Do not make cloud rendering a dependency of local editing.

---

# 51. Phase 45 — Documentation

Required documentation:

```text
docs/
├── architecture.md
├── project-format.md
├── animation.md
├── render-graph.md
├── media.md
├── effects.md
├── 3d.md
├── particles.md
├── tracking.md
├── plugin-sdk.md
├── scripting.md
├── web-runtime.md
└── desktop-runtime.md
```

---

# 52. MVP Definition

The first production-quality milestone should NOT attempt the entire roadmap.

MVP must support:

```text
Import video
        ↓
Composition
        ↓
Multiple layers
        ↓
Transform
        ↓
Opacity
        ↓
Keyframes
        ↓
Bezier interpolation
        ↓
Mask
        ↓
Blend mode
        ↓
Basic effects
        ↓
GPU preview
        ↓
Export
```

Minimum supported layers:

```text
Video
Image
Text
Solid
Adjustment
```

---

# 53. MVP Acceptance Test

The following project must work:

```text
Composition: 3840×2160 @ 60 FPS

Layer 1
  Background

Layer 2
  4K Video
  ├── Mask
  ├── Blur
  └── Color

Layer 3
  Character PNG
  ├── Position keyframes
  ├── Rotation keyframes
  └── Glow

Layer 4
  Text
  └── Opacity animation
```

The user must be able to:

1. Import assets.
2. Arrange layers.
3. Animate properties.
4. Edit curves.
5. Apply masks.
6. Apply effects.
7. Preview through GPU.
8. Save project.
9. Close application.
10. Reopen project.
11. Render/export.
12. Reproduce the same result.

---

# 54. Suggested Development Order

The actual implementation order should be:

```text
1. Repository
      ↓
2. Project Model
      ↓
3. Property System
      ↓
4. Animation Engine
      ↓
5. Command/Undo
      ↓
6. Media Abstraction
      ↓
7. GStreamer Backend
      ↓
8. GPAC Integration
      ↓
9. wgpu Renderer
      ↓
10. Render Graph
      ↓
11. Basic 2D Renderer
      ↓
12. Timeline
      ↓
13. Viewer
      ↓
14. Keyframe UI
      ↓
15. Graph Editor
      ↓
16. Masks
      ↓
17. Compositing
      ↓
18. VFX
      ↓
19. Text/Motion Graphics
      ↓
20. Audio
      ↓
21. Proxy/Cache
      ↓
22. Export
      ↓
23. Web Runtime
      ↓
24. Desktop Runtime
      ↓
25. 3D
      ↓
26. Particles
      ↓
27. Tracking
      ↓
28. Node Compositor
      ↓
29. Plugin SDK
      ↓
30. Scripting
      ↓
31. Professional features
```

---

# 55. What Must Not Be Done Early

Avoid these until the core is stable:

- [ ] Full AI editor
- [ ] Cloud-first architecture
- [ ] Multiplayer editing
- [ ] Mobile application
- [ ] Large plugin marketplace
- [ ] Complex ML rotoscoping
- [ ] Distributed rendering
- [ ] Full NLE feature parity
- [ ] Full Blender-class 3D engine

The priority is the **composition/rendering foundation**.

---

# 56. Architecture Rules

These rules should be enforced during development.

### Rule 1

React must not own frame rendering.

### Rule 2

Timeline UI must not directly manipulate GPU resources.

### Rule 3

Project data must not depend on GStreamer.

### Rule 4

Effects must not directly depend on React.

### Rule 5

Renderer must not depend on UI.

### Rule 6

Media backends must implement a stable abstraction.

### Rule 7

Web and native runtimes must share the project model.

### Rule 8

All animatable values use the Property system.

### Rule 9

All edits go through commands.

### Rule 10

Rendering must be deterministic where practical.

### Rule 11

Avoid CPU↔GPU copies.

### Rule 12

GPU resource lifetime must be explicit.

### Rule 13

Every serialized format needs a version.

### Rule 14

Long-running work must never block the UI thread.

### Rule 15

Optional features must not become hard dependencies of the core.

---

# 57. Long-Term Architecture

The final system should converge toward:

```text
                              ZiStudio
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
              Editor UI                     Editor Runtime
                  │                               │
        ┌─────────┼──────────┐          ┌─────────┼─────────┐
        │         │          │          │         │         │
      Timeline  Graph      Nodes      Project  Animation  Expr
        │         │          │          │         │         │
        └─────────┴──────────┴──────────┴─────────┴─────────┘
                                  │
                           Composition Graph
                                  │
                           Render Graph Builder
                                  │
                 ┌────────────────┼────────────────┐
                 │                │                │
                 ▼                ▼                ▼
                2D               3D               VFX
                 │                │                │
                 └────────────────┼────────────────┘
                                  │
                              Compositor
                                  │
                            Color Pipeline
                                  │
                 ┌────────────────┴────────────────┐
                 │                                 │
            Native Runtime                    Web Runtime
                 │                                 │
             GStreamer                         WebCodecs
             GPAC                              GPAC-WASM
             wgpu                              WebGPU
                 │                                 │
                 └────────────────┬────────────────┘
                                  │
                              Output Media
```

---

# 58. Final Product Goal

ZiStudio should ultimately behave as:

```text
Premiere
   +
After Effects
   +
Fusion
   +
basic Blender-style 3D
   +
GPU compositor
   +
programmable media engine
```

while maintaining a single project format and shared runtime model between Web and Desktop.

The most important engineering decision is to treat **Composition + Property + Animation + Render Graph + Media Abstraction** as the permanent foundation. Everything else should be layered on top of these systems.
