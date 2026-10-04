# ZiStudio

ZiStudio is a professional media creation application focused on non-linear editing, motion graphics, VFX, compositing, and 3D.

## Foundation milestone

The first implementation establishes the permanent boundaries for the editor:

- React/TypeScript UI
- Shared project model
- Property/keyframe data model
- Command-based editor state
- Rust core workspace
- Web runtime shell
- Timeline/viewer/inspector workspace

The media and GPU layers will be added behind stable interfaces rather than coupling them directly to the UI.

## Development

```bash
pnpm install
pnpm dev
```

Rust core:

```bash
cargo check --workspace
```

See [`plan.md`](./plan.md) for the complete roadmap.
