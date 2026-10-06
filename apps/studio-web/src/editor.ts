import type { Composition, Project } from './model';
import { evaluateProperty as evalProp } from './animation';
import type { Command } from './commands';

export type { Command } from './commands';

export interface EditorState {
  project: Project;
  activeCompositionId: string;
  selectedLayerId: string | null;
  currentTime: number;
  zoom: number; // Viewport zoom (1 = 100%)
  pan: [number, number]; // Viewport pan
  isPlaying: boolean;
  isLooping: boolean;
  selectedPropertyKey?: string | null;
}

export function createEditorState(project: Project): EditorState {
  return {
    project,
    activeCompositionId: project.compositions[0]?.id ?? '',
    selectedLayerId: project.compositions[0]?.layers[0]?.id ?? null,
    currentTime: 0,
    zoom: 1,
    pan: [0, 0],
    isPlaying: false,
    isLooping: true,
    selectedPropertyKey: 'position',
  };
}

export function getActiveComposition(state: EditorState): Composition {
  const composition = state.project.compositions.find((item) => item.id === state.activeCompositionId);
  if (!composition) {
    if (state.project.compositions.length > 0) {
      return state.project.compositions[0];
    }
    throw new Error('Active composition not found');
  }
  return composition;
}

export const evaluateProperty = evalProp;

export class CommandManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory = 50;

  execute(command: Command, state: EditorState): EditorState {
    const nextState = command.execute(state);
    // A command that changed nothing must not pollute the undo history.
    if (nextState === state) return state;
    // Continuous edits (dragging a fader) fold into one undo step.
    const last = this.undoStack[this.undoStack.length - 1];
    const merged = last?.coalesce?.(command) ?? null;
    if (merged) this.undoStack[this.undoStack.length - 1] = merged;
    else this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    return nextState;
  }

  undo(state: EditorState): EditorState {
    const cmd = this.undoStack.pop();
    if (!cmd) return state;
    const nextState = cmd.undo(state);
    this.redoStack.push(cmd);
    return nextState;
  }

  redo(state: EditorState): EditorState {
    const cmd = this.redoStack.pop();
    if (!cmd) return state;
    const nextState = cmd.execute(state);
    this.undoStack.push(cmd);
    return nextState;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getUndoLabel(): string | null {
    const last = this.undoStack[this.undoStack.length - 1];
    return last ? last.label : null;
  }

  getRedoLabel(): string | null {
    const last = this.redoStack[this.redoStack.length - 1];
    return last ? last.label : null;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
