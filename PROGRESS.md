# ZiStudio — Implementation Progress

> This file is a compact, continuously updated overview of what has actually been implemented. `plan.md` remains the full roadmap.

## Current milestone: Media Runtime (M4: frame pipeline)

**Status:** M0-M4 complete in code and unit tests; M4 is **not yet verified in a real browser** (see Latest Implementation). Next is the rest of the model upgrade (matte/masks/time-remap/proxy) and the first real-browser pass.

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
- [x] PNG export
- [x] Deterministic offline WebM export (composition-resolution render, WebCodecs `VideoEncoder` via mediabunny, exact frame count and duration)
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

- [x] **M0** Test harness: vitest, 56 tests covering animation, commands, media cache/scheduler, media controller, playback runtime
- [x] **M1** Editor runtime refactor: `App.tsx` 1505 -> ~1050 lines, no editor logic left in it (`src/runtime/`)
- [x] **M2** Real asset -> renderer path: `MediaController` -> per-source scheduler/cache -> `FrameProvider` -> `CompositionRenderer`
- [x] Media in-point (`LayerContent.mediaInPoint`) maintained by split and left-trim commands
- [x] **Project format v2**: `Asset.source` (embedded / file / remote), v1 -> v2 migration, session `blob:` URLs never written to `.zproj`
- [x] Asset relink: offline assets are shown (`OFFLINE` badge, `MEDIA OFFLINE` in the viewer), manual `Relink...`, and automatic relink when a file with the same name and size is imported
- [x] **M3** Real video pipeline: `Demuxer` interface (`src/demux/`) -> mediabunny demuxer -> WebCodecs decoder -> `WebCodecsMediaSource` (frame-accurate seek via key packet, forward decode without reset during playback) behind the existing `MediaBackend`
- [x] `WebCodecsMediaBackend` falls back to the browser backend for images, audio, rotated video, unsupported codecs and unreadable containers
- [x] Coverage-based frame selection in the cache (`getCovering`, `getAtOrBefore`) and a settle guard in `MediaController`

### In progress / Next milestones

- [x] Connect imported video/image assets to the composition renderer via `MediaController` (HTMLVideoElement backend)
- [ ] GPAC-WASM `Demuxer` implementation (the interface exists; mediabunny is the first implementation)
- [x] **M4** Frame pipeline: decode-ahead of the playhead, `MediaFrameCache` memory budget, imported audio decode, A/V clock (audio output clock is the transport master)
- [x] Model v3 (v2 -> v3 migration): `Layer.audio {volume, muted}`, `Composition.audio {sampleRate, channels}`, `Composition.colorSpace`
- [ ] Rest of the model upgrade, each together with the code that uses it: Asset proxy/interpretation/cache, Layer time-remap/matte/masks (`parentId` exists but nothing uses it yet), Composition render settings
- [x] Audio decoding for imported audio and for the audio track of video layers (playback only; not mixed into export yet)
- [x] Decode scheduler prefetch and playback integration
- [x] Mix imported audio into the WebM export (offline mix-down, Opus/Vorbis)
- [ ] Master fader/mute, solo and real meters in the mixer panel (still local/simulated)
- [ ] Audio fallback for codecs the WebCodecs `AudioDecoder` lacks (e.g. `decodeAudioData`)
- [ ] wgpu native renderer crate
- [ ] GStreamer native media backend
- [ ] GPAC native container/muxer integration
- [ ] GPU frame upload / zero-copy paths
- [ ] Advanced 3D WebGPU viewport
- [ ] GPU compute particle simulation
- [ ] Node compositor view
- [ ] Optical-flow / planar tracking engine

## Latest Implementation

### Audio in export, model v3, real mixer controls
- **Export audio** (`runtime/audio-mixer.ts`, `runtime/export-controller.ts`): `CompositionAudioMixer` decodes every audible layer sequentially and sums it at the layer's timeline position (start, duration, in-point, volume), resamples with linear interpolation to the composition's rate, clamps to [-1, 1] and hands back 1 s blocks, so memory does not grow with the length of the composition. `exportWebM` adds an Opus (or Vorbis) track and writes audio blocks about a second ahead of the video frames. It returns `{ audio: 'included' | 'none' | 'unsupported' }`; the UI alerts when the browser has no audio encoder. Muted layers are not even decoded. A file that fails to decode goes silent from that point; the export continues.
- **Model v3** (`model.ts`): `PROJECT_VERSION = 3`. `Layer.audio {volume (linear gain), muted}`, `Composition.audio {sampleRate, channels}`, `Composition.colorSpace`. `migrateV2toV3` fills defaults (v1 projects go through both migrations); `layerGain()` / `compositionAudio()` supply defaults for objects created without the fields. Only fields that something already uses were added; matte, masks, time-remap and asset proxies wait until the renderer/pipeline can use them.
- **Mixer panel** (`components/AudioMixerPanel.tsx`): faders and mute buttons now edit `Layer.audio` (before they were local state with no effect on sound), and video layers with media get a strip. Fader position 80 is unity; the dB readout matches the gain actually applied.
- **Live changes**: `EditorRuntime.update` calls `AudioController.syncLayers` when the project changes, so volume, mute, hiding or deleting a layer (and their undo) are heard immediately; voices are re-leveled through a per-voice gain with a 10 ms ramp. `AudioController` also prunes finished voices.
- **Undo**: `Command.coalesce` is a new optional hook; `SetLayerAudioCommand` folds edits of one layer within 800 ms, so dragging a fader is one undo step.
- **Tests**: 162 (+34): mixer (levels, placement, in-point, resampling, block-size independence, mute/gain, failures, abort), controller gain, v2->v3 migration, undo coalescing, runtime->audio sync, fader mapping. Mutation checks on the resampler, clamp, block carry-over and coalescing each failed the intended test.
- **Not verified**:
  - Nothing ran in a real browser: `AudioSampleSource` / Opus encoding, the exported file's sync with video, and the fader feel are covered only by fakes. Try: export a clip with sound, play the WebM, compare lip-sync at the end of a long clip; drag a fader while playing.
  - Export mixes at the composition's sample rate; sources are converted with linear interpolation (fine for speech/music preview, not mastering quality).
  - Layer volume range is 0 to 4x (+12 dB) and the fader reaches +10 dB. The master strip, solo, and the VU meters are still simulated.
  - Layer edits other than volume/mute/visibility (move, trim) still apply at the next play or seek.
- **Next step**: a real-browser pass over M3/M4/export; then model fields together with the features that use them (matte/masks first), or GPAC/native paths.

## Previous Implementation (M4, kept for reference)

### M4: decode-ahead, frame memory budget, audio decode, A/V clock
- **Decode-ahead** (`runtime/media-controller.ts`): while playing, each video source decodes the frames after the playhead (default 0.5 s) one at a time through the same per-source chain as on-screen decodes, so an urgent request waits at most one frame. It stops when the lookahead is reached, the budget is full, the media ends, or playback pauses/jumps (seek, scrub, loop wrap). Only sources that declare `supportsPrefetch` take part (`WebCodecsMediaSource` yes; the `HTMLVideoElement` fallback no, it has to seek per frame). `MediaController.setPlaying()` is called by `PlaybackController`.
- **Memory budget** (`media-cache.ts`): `MediaFrameCache` accounts bytes (`width*height*4` unless a frame reports `byteSize`) and evicts LRU past `maxBytes` as well as `maxFrames`. `MediaController` splits one budget (default 256 MiB) evenly between open video sources. Decode-ahead never evicts to make room: it asks `canFit()`, and `evictBefore(playhead)` drops frames the playhead already left, so a full cache of past frames cannot stall lookahead. `getStats()` exposes frames/bytes/budget.
- **Audio decode** (`demux/audio-source.ts`): `AudioBackend`/`AudioClipSource` interface, mediabunny implementation (`AudioBufferSink`). Media time uses the same origin as the video decoder, so A and V line up. Files without audio, or with an undecodable codec, are silent without failing playback.
- **Audio scheduling** (`runtime/audio-controller.ts`): decodes ahead (1 s) and schedules chunks on the Web Audio clock for every visible `audio` layer and for the audio of `video` layers with media; honors layer start, `mediaInPoint` and end. Late chunks are trimmed to what can still be scheduled instead of playing out of sync. `AudioEngine` gained `now()`, `latency`, `state`, `resume()`, `playBuffer()`; the synth tone now only plays for audio layers with no media.
- **A/V clock** (`runtime/playback-controller.ts`): while audio runs, `compTime = anchorComp + (output.now() - latency - anchorOutput)` is the master clock and the playhead is read from it, so the picture follows what is heard. The anchor is reset on play, seek-while-playing and loop wrap (also after a long stall). Without a running audio context the rAF frame clock drives the playhead as before.
- **Bugs found by the new tests and fixed**: decode-ahead did not stop at the end of the media; scheduling dropped the first 10 ms of every play/seek (it trimmed against the clamped playhead instead of the output clock); loop wrap after a long stall did not re-anchor audio.
- **Tests**: `npm run typecheck`, `npm test` (128 tests, +35: cache budget, decode-ahead, audio scheduling/clock, A/V transport), `npm run build` clean.
- **Not verified**:
  - Nothing here ran in a real browser. The audio path (`AudioBufferSink`, `AudioContext` scheduling, output latency) and decode-ahead against the real WebCodecs decoder are covered only by fakes. Please try: play a video with sound in desktop Chrome, scrub while playing, loop wrap, pause/resume.
  - A/V sync is correct by construction (same anchor), but the absolute offset depends on `outputLatency`, which browsers report differently (Bluetooth output especially).
  - Edits to layers during playback (move/trim) are picked up on the next seek or play, not live.
  - Two layers of the same file at different times in the same frame make decode-ahead restart each frame (it sees a jumping playhead); correct but not prefetching.
  - Imported audio is not mixed into the WebM export yet.
- **Next step**: model v3 upgrade (Asset proxy/interpretation, Layer time-remap/matte/masks, Composition settings), then audio in export.

## Previous Implementation

### Model v2 (asset identity + relink) and M3 (demux -> WebCodecs)
- **Model**: `Project.version` is now 2. `Asset.source` says where the bytes live. `serializeProject` writes only what survives a reload (file assets are saved as a name/size/mtime fingerprint with an empty URL); `deserializeProject` migrates v1, rejects newer versions, and re-binds layer media URLs from their assets. Relinking (manual or by re-importing the same file) updates the asset and every layer that references it.
- **Pipeline**: `Demuxer` (`demux/demuxer.ts`) -> `MediabunnyDemuxer` -> `WebCodecsPictureDecoder` (`webcodecs.ts`) -> `WebCodecsMediaSource` (`webcodecs-media.ts`). The source keeps a small window of decoded pictures: playback continues decoding forward; a backward or far-forward seek resets at the key packet; only the pictures it still needs stay alive. Everything is injectable, so the algorithm is tested with a fake demuxer and a fake decoder that simulates B-frame reordering.
- **`WebCodecsVideoDecoder.reset()`** now reconfigures the decoder (a reset WebCodecs decoder is unconfigured), and exposes `waitForProgress()` / `takeAllFrames()`.
- **Bugs found by testing the above and fixed**:
  - The controller treated a cached frame as current only if its timestamp was within 1/48s of the wanted time. A frame-accurate source returns the frame that *covers* the time, which can start up to a full frame earlier, so the controller re-requested forever and froze the page. Selection is now coverage-based and a time that has already been decoded is never requested again.
  - Container timestamps are quantized (Matroska: whole ms), so a request exactly on a frame boundary selected the previous frame. A shared 1 ms epsilon fixes this for WebM and MP4.
  - The `F n/600` frame counter used `floor(t * fps)` and could show the previous frame (`4.9999` -> 4).
- **Verified in headless Chromium** (videos whose picture encodes the frame index as black/white blocks, so lossy compression cannot blur the check):
  - VP8/WebM and VP9/MP4, 40 positions each (single steps, forward jumps, backward jumps, return to start): **40/40 exact** on the WebCodecs path (`VideoDecoder.decode` calls observed).
  - Continuous playback: 23 distinct frames in 1.5s at real 30fps speed, monotonic, no freeze.
  - Offline export (uses the same decoder): 1920x1080, 600 frames, exactly 10.000s, 12/12 sampled frames decode to the correct source frame; 10.5s wall time (22.8s before).
  - Save -> reload page -> open `.zproj` -> assets `OFFLINE` -> re-import same file -> relinked (no duplicate asset). Image import via the fallback backend.
  - `npm run typecheck`, `npm test` (93 tests), `npm run build`: clean.
- **Not verified**:
  - H.264/HEVC/AAC. The headless Chromium used for testing has no proprietary codecs, so only VP8/VP9 ran end to end. H.264 depends on the avcC `description` supplied by the demuxer and on the browser's decoder; it is covered only by the unit-level fakes and the `isConfigSupported` fallback. Please try an H.264 MP4 in desktop Chrome.
  - Audio from imported media is still not decoded (audio layers play a synth tone).
  - `mediabunny` (MPL-2.0) was added as a dependency for demuxing and for WebM muxing in export.
- **Next step**: M4, decode prefetch ahead of the playhead and a frame-cache memory budget, then audio decode and an A/V clock.

## Earlier (M0-M2)

### M0 + M1 + M2: Test harness, Editor Runtime, Real media in the viewer
- **What changed**:
  - `src/runtime/` introduced. Nothing in it (except `use-editor-runtime.ts`) imports React.
    - `editor-runtime.ts`: owns `EditorState`, `CommandManager` and controllers; `useSyncExternalStore`-compatible (`getState` / `subscribe`). A no-op `update` does not notify.
    - `playback-controller.ts`: rAF loop behind an injectable `FrameClock`; play/pause/seek/step/loop.
    - `selection-controller.ts`, `animation-controller.ts` (`toggleKeyframe`, `setTransformValue`, `translateSelected`, `setInterpolation`, ...), `composition-controller.ts` (layers, effects, assets, import), `export-controller.ts`.
    - Pure helpers: `playback-math.ts`, `animation-ops.ts`, `layer-factory.ts`, `media-time.ts`.
    - `media-controller.ts` + `frame-provider.ts`: the renderer asks a synchronous `FrameProvider` for the best available frame; decoding is async, latest-wins per source, and subscribers are notified when a better frame lands.
  - `App.tsx` is now UI composition + dependency wiring.
  - `CompositionRenderer` takes an optional `FrameProvider`, draws real video/image frames at their native size, and shows `LOADING MEDIA` / `MEDIA OFFLINE` placeholders. `exportMode` renders only the composition at 1:1.
  - Asset import now probes real width/height/duration through the media backend.
- **Bugs fixed along the way**:
  - Video layers were never drawn (the renderer loaded video URLs with `new Image()`); media stack was not wired in at all.
  - `MediaFrameCache` is keyed by time only, so one shared scheduler would return another clip's frame; each source now has its own scheduler/cache.
  - Split and left-trim did not advance the media in-point, so the clip would slide against its timing. Both now maintain `mediaInPoint` (undo restores it).
  - `CommandManager` recorded commands that changed nothing (e.g. split outside the clip) into the undo history.
  - Editing one axis of an animated property reset the other axes to the static base value instead of the value evaluated at the playhead.
  - Viewport drag issued two commands (two undo steps) per move; it is now one.
  - Timecode used `floor(t * fps)` and could read one frame early (`29.999...`); now epsilon-safe. Playing from the last frame with looping off restarts from 0.
  - WebM export recorded the viewer canvas in real time: wrong resolution (panel size, with guides), and a 10s composition produced a 41.6s file. Now offline: 1920x1080, 600 frames, 10.000s, verified with ffprobe.
- **Verified**:
  - `npm run typecheck`: clean. `npm test`: 56 passed. `npm run build`: OK.
  - Headless Chromium: imported a 640x360 VP8 clip; seeking to 0s / 0.33s / 0.83s showed burned-in frame numbers 0 / 10 / 25 (frame-accurate); 8 distinct frames during 1.4s of playback; split + undo; no console errors; exported file decoded frame 30 at 1s and frame 90 at 3s.
- **Known limitations** (as of M2; the first two are resolved by the section above):
  - `HTMLVideoElement` seeking was the temporary backend (now only the fallback).
  - Blob URLs were not persisted in `.zproj` (now handled by asset relink).
  - Export has no cancel button yet (the controller already accepts an `AbortSignal`); imported audio is not mixed into the export.
- **Next step**: M3, define a `Demuxer` interface and put a real demux -> WebCodecs decode path behind the existing `MediaBackend`.

## Earlier Implementation

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
