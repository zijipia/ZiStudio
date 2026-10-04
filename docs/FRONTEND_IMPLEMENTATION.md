# ZiStudio Frontend Implementation Form

> Use this document as the implementation form/checklist for the next frontend milestones. It describes what the web editor should become before wiring the full media/rendering backend.

## 1. Frontend Goal

Build a professional desktop-class web editor UI that can host the shared ZiStudio runtime without putting media/rendering logic into React.

Target interaction model:

```text
Editor Shell
├── Menu / Command Bar
├── Workspace Bar
├── Project / Assets
├── Viewer
├── Inspector
├── Timeline
├── Graph Editor
├── Effects / Properties
└── Status / Performance
```

React owns UI state and interaction. The editor runtime owns project state, commands, animation evaluation, media scheduling, and rendering.

---

## 2. UI Architecture

### App shell

- [ ] `AppShell`
- [ ] `TopBar`
- [ ] `WorkspaceBar`
- [ ] `StatusBar`
- [ ] Global command palette
- [ ] Global shortcut handling

### Docking

- [ ] Resizable panels
- [ ] Split panes
- [ ] Tabs
- [ ] Collapsible panels
- [ ] Fullscreen viewer
- [ ] Saved workspace layouts

Do not introduce a heavy docking dependency until the panel model is stable.

---

## 3. Viewer

The Viewer is the primary visual workspace.

### Controls

- [ ] Fit
- [ ] 25 / 50 / 100 / 200%
- [ ] Zoom
- [ ] Pan
- [ ] Center
- [ ] Safe areas
- [ ] Guides
- [ ] Grid
- [ ] Transparency checkerboard
- [ ] Fullscreen
- [ ] Playback resolution
- [ ] Draft / Full quality

### Overlay

- [ ] Selected layer bounds
- [ ] Transform gizmo
- [ ] Anchor point
- [ ] Mask handles
- [ ] Bezier handles
- [ ] 3D gizmos later

### Runtime boundary

```text
Viewer UI
   ↓
ViewerController
   ↓
CompositionRenderer
   ↓
Render Graph
```

The React component must not directly allocate GPU resources.

---

## 4. Timeline

The timeline should be optimized for thousands of clips/keyframes.

### Header

- [ ] Timecode
- [ ] Play/stop
- [ ] Loop
- [ ] FPS
- [ ] Timeline zoom
- [ ] Snapping
- [ ] Marker controls

### Track list

- [ ] Video track
- [ ] Audio track
- [ ] Adjustment track
- [ ] Precomposition track
- [ ] Visibility
- [ ] Lock
- [ ] Solo
- [ ] Mute
- [ ] Track color

### Editing

- [ ] Select
- [ ] Multi-select
- [ ] Move
- [ ] Trim
- [ ] Ripple trim
- [ ] Split
- [ ] Duplicate
- [ ] Delete
- [ ] Snap
- [ ] Drag preview

### Performance

Use canvas/virtualized rendering for the timeline body. Do not create one DOM node per keyframe or clip when the timeline becomes large.

---

## 5. Inspector

Inspector is schema-driven.

```text
Selected Layer
├── Transform
│   ├── Position
│   ├── Scale
│   ├── Rotation
│   └── Anchor
├── Opacity
├── Blending
├── Masks
└── Effects
```

Each property row needs:

- [ ] Label
- [ ] Value editor
- [ ] Unit
- [ ] Reset
- [ ] Keyframe button
- [ ] Expression button
- [ ] Animation state

Property editors must consume the shared `Property<T>` model instead of maintaining duplicate animation state.

---

## 6. Asset Browser

### Asset cards

- [ ] Thumbnail
- [ ] Name
- [ ] Type
- [ ] Duration
- [ ] Resolution
- [ ] FPS
- [ ] Audio channels
- [ ] Proxy state

### Interactions

- [ ] Import
- [ ] Drag to timeline
- [ ] Search
- [ ] Filter
- [ ] Sort
- [ ] Folder tree
- [ ] Relink missing asset
- [ ] Generate thumbnail

### Media state

```text
Asset
 ↓
MediaSource
 ↓
MediaBackend
 ↓
FrameScheduler
 ↓
Viewer / Timeline
```

---

## 7. Graph Editor

### Modes

- [ ] Value graph
- [ ] Speed graph
- [ ] Combined property view

### Editing

- [ ] Select keyframes
- [ ] Move keyframes
- [ ] Bezier handles
- [ ] Auto easing
- [ ] Linear
- [ ] Hold
- [ ] Copy/paste animation
- [ ] Scale animation in time

The graph editor must use the same evaluator as playback. Never implement a second curve algorithm in the UI.

---

## 8. Effects Panel

### Categories

```text
Blur
Color
Distortion
Stylize
Keying
Compositing
Audio
3D
```

### Effect card

- [ ] Enable/disable
- [ ] Reorder
- [ ] Delete
- [ ] Preset
- [ ] Reset
- [ ] Search
- [ ] Animated properties

Effects are metadata-driven so new effects do not require a new React component for every parameter.

---

## 9. Command System

All user actions should map to command IDs.

Examples:

```text
project.save
project.open
asset.import
timeline.split
timeline.rippleDelete
layer.duplicate
layer.precompose
property.set
keyframe.add
keyframe.delete
viewer.fit
render.start
```

Frontend buttons call commands rather than mutating the project object directly.

---

## 10. Frontend State Model

Separate state into three groups:

### Project state

```text
Project
Composition
Layer
Property
Keyframe
Asset
```

### Editor state

```text
Selection
Current time
Playback
Workspace
Panel layout
Viewer zoom
Viewer pan
```

### Runtime state

```text
Media loading
Decode queue
Render status
GPU status
Cache status
Export progress
Errors
```

Do not put runtime handles such as `VideoFrame`, `GPUTexture`, or decoder instances into serialized project state.

---

## 11. Web Media UX

The frontend should expose media states explicitly:

```text
idle
loading
ready
seeking
decoding
error
unsupported
```

### Timeline behavior

- [ ] Scrub requests are cancellable
- [ ] Stale frames are ignored
- [ ] Current frame remains visible while seeking
- [ ] Loading indicator does not block the editor
- [ ] Decode errors appear on the affected asset/layer

---

## 12. Responsive Strategy

ZiStudio is a desktop-class editor, so it should not attempt to become a phone UI.

Minimum target:

```text
1280 × 720
```

Recommended:

```text
1920 × 1080+
```

At smaller widths:

- [ ] Collapse secondary panels
- [ ] Keep Viewer + Timeline usable
- [ ] Move Inspector/Assets into tabs

---

## 13. Design System

Create a small internal design system before the UI grows.

### Components

- [ ] Button
- [ ] IconButton
- [ ] Toggle
- [ ] Select
- [ ] NumberInput
- [ ] Slider
- [ ] Scrubber
- [ ] PropertyRow
- [ ] Panel
- [ ] Tabs
- [ ] ContextMenu
- [ ] Tooltip
- [ ] Modal
- [ ] CommandPalette

### Rules

- Dense professional UI
- Consistent 4px/8px spacing rhythm
- Keyboard-first interactions
- Avoid excessive rounded cards
- Avoid dashboard-style layouts
- Panels should visually communicate hierarchy

---

## 14. Frontend Milestones

### F1 — Shell

- [ ] AppShell
- [ ] Workspace bar
- [ ] Dock layout
- [ ] Viewer
- [ ] Timeline
- [ ] Inspector

### F2 — Timeline UX

- [ ] Real clip interaction
- [ ] Selection
- [ ] Dragging
- [ ] Trimming
- [ ] Snapping
- [ ] Markers

### F3 — Property UX

- [ ] Schema-driven Inspector
- [ ] Keyframe buttons
- [ ] Animated property indicators
- [ ] Property search

### F4 — Graph UX

- [ ] Canvas graph
- [ ] Keyframe manipulation
- [ ] Bezier handles
- [ ] Curve tools

### F5 — Media UX

- [ ] Asset browser
- [ ] Import state
- [ ] Media metadata
- [ ] Decode state
- [ ] Video preview

### F6 — Professional UI

- [ ] Effects browser
- [ ] Node editor shell
- [ ] Color scopes shell
- [ ] Audio mixer shell
- [ ] Render queue

---

## 15. Immediate Implementation Order

The next frontend work should be:

```text
1. Extract AppShell
       ↓
2. Extract reusable Panel components
       ↓
3. Build PropertyRow system
       ↓
4. Build Asset Browser
       ↓
5. Upgrade Timeline rendering
       ↓
6. Upgrade Viewer controls
       ↓
7. Connect MediaFrameScheduler
       ↓
8. Add real video preview
       ↓
9. Build Graph Editor interaction
       ↓
10. Add command palette
```

---

## 16. Definition of Done — Frontend Milestone

The frontend milestone is complete when a user can:

1. Open ZiStudio.
2. Import an image/video.
3. See it in the Asset Browser.
4. Drag it to the Timeline.
5. Select the layer.
6. Edit Transform in Inspector.
7. Add keyframes.
8. Scrub the timeline.
9. See the selected frame in Viewer.
10. Edit animation in Graph Editor.
11. Undo/redo all edits.
12. Save/reopen the `.zproj` project.

The UI must remain responsive while media decoding/rendering happens in the background.

---

## 17. Current Status

### Already available

- [x] React/Vite editor shell
- [x] Viewer canvas
- [x] Timeline
- [x] Inspector foundation
- [x] Graph Editor foundation
- [x] Project model
- [x] Command/undo system
- [x] Animation evaluator
- [x] Media abstraction
- [x] Web media frame cache
- [x] Web media scheduler
- [x] WebCodecs decoder boundary

### Next

- [ ] Componentize current `App.tsx`
- [ ] Build schema-driven Inspector
- [ ] Build Asset Browser
- [ ] Connect real media frames to Viewer
- [ ] Improve timeline virtualization
- [ ] Improve Graph Editor interaction
- [ ] Add command palette

---

## 18. Architecture Constraint

The frontend is an editor client, not the media engine.

```text
React UI
   │
   ├── Commands
   ├── Editor State
   └── View Controllers
            │
            ▼
       Core Runtime
            │
       ┌────┴────┐
       │         │
    Media     Renderer
       │         │
   WebCodecs   WebGPU
       │         │
       └────┬────┘
            ▼
       Composition
```

This boundary must remain intact when GStreamer, GPAC, wgpu, 3D, VFX, and native desktop rendering are introduced.
