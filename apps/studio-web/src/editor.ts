import type { Composition, Project, Property } from './model';

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

export function getActiveComposition(state: EditorState): Composition {
  const composition = state.project.compositions.find((item) => item.id === state.activeCompositionId);
  if (!composition) throw new Error('Active composition not found');
  return composition;
}

export function evaluateProperty<T extends Property<any>>(property: T, time: number): T['value'] {
  const keyframes = property.keyframes;
  if (keyframes.length === 0) return property.value;
  if (time <= keyframes[0].time) return keyframes[0].value;
  if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const left = keyframes[index];
    const right = keyframes[index + 1];
    if (time >= left.time && time <= right.time) {
      if (left.interpolation === 'hold' || typeof left.value !== 'number' || typeof right.value !== 'number') {
        return left.value;
      }
      const amount = (time - left.time) / (right.time - left.time);
      return (left.value + (right.value - left.value) * amount) as T['value'];
    }
  }

  return property.value;
}
