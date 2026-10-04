import type { Project } from './model';

export interface EditorState {
  project: Project;
  activeCompositionId: string;
  selectedLayerId: string | null;
  currentTime: number;
}

export interface Command {
  label: string;
  execute(state: EditorState): EditorState;
  undo(state: EditorState): EditorState;
}

export function createEditorState(project: Project): EditorState {
  return {
    project,
    activeCompositionId: project.compositions[0]?.id ?? '',
    selectedLayerId: null,
    currentTime: 0,
  };
}
