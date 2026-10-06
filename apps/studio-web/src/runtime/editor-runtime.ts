import { CommandManager, createEditorState, type Command, type EditorState } from '../editor';
import type { Project } from '../model';
import { getActiveComposition } from '../editor';
import { AudioController } from './audio-controller';
import { AnimationController } from './animation-controller';
import { CompositionController } from './composition-controller';
import { ExportController } from './export-controller';
import { MediaController } from './media-controller';
import { createBrowserClock, PlaybackController, type FrameClock } from './playback-controller';
import { SelectionController } from './selection-controller';

export interface EditorRuntimeOptions {
  media?: MediaController;
  audio?: AudioController;
  clock?: FrameClock;
}

type Listener = () => void;

/**
 * Framework-agnostic editor runtime.
 *
 * Owns the editor state, the command history and the controllers. React only
 * subscribes to it (see use-editor-runtime.ts); nothing in here imports React.
 */
export class EditorRuntime {
  readonly commands = new CommandManager();
  readonly media: MediaController;
  readonly audio: AudioController;
  readonly playback: PlaybackController;
  readonly selection: SelectionController;
  readonly animation: AnimationController;
  readonly composition: CompositionController;
  readonly exporter: ExportController;

  private state: EditorState;
  private readonly listeners = new Set<Listener>();

  constructor(project: Project, options: EditorRuntimeOptions = {}) {
    this.state = createEditorState(project);
    this.media = options.media ?? new MediaController();
    this.audio = options.audio ?? new AudioController();
    this.playback = new PlaybackController(this, options.clock ?? createBrowserClock());
    this.selection = new SelectionController(this);
    this.animation = new AnimationController(this);
    this.composition = new CompositionController(this);
    this.exporter = new ExportController(this);
  }

  // --- store API (useSyncExternalStore-compatible) ---
  readonly getState = (): EditorState => this.state;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Apply a state transition. Returning the same object is a no-op. */
  update(updater: (state: EditorState) => EditorState): void {
    const previous = this.state;
    const next = updater(previous);
    if (next === previous) return;
    this.state = next;
    // Volume / mute edits (and their undo) must be heard while playing, not on the next play.
    if (next.project !== previous.project) this.audio.syncLayers(getActiveComposition(next));
    for (const listener of this.listeners) listener();
  }

  // --- history ---
  execute(command: Command): void {
    this.update((s) => this.commands.execute(command, s));
  }

  undo(): void {
    if (this.commands.canUndo()) this.update((s) => this.commands.undo(s));
  }

  redo(): void {
    if (this.commands.canRedo()) this.update((s) => this.commands.redo(s));
  }

  // --- project lifecycle ---
  loadProject(project: Project): void {
    this.playback.pause();
    this.commands.clear();
    this.media.reset();
    this.audio.reset();
    this.update(() => createEditorState(project));
  }

  dispose(): void {
    this.playback.dispose();
    this.media.dispose();
    this.audio.dispose();
    this.listeners.clear();
  }
}
