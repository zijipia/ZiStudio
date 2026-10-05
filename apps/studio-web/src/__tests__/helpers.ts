import { createEditorState, type EditorState } from '../editor';
import { createProject, createSolidLayer, type Layer } from '../model';

export function makeState(layerCount = 2): { state: EditorState; layers: Layer[] } {
  const project = createProject();
  const comp = project.compositions[0];
  const layers: Layer[] = [];
  for (let i = 0; i < layerCount; i += 1) {
    const layer = createSolidLayer(`Test ${i}`, '#123456');
    layer.start = 0;
    layer.duration = 4;
    layers.push(layer);
  }
  comp.layers = layers;
  return { state: createEditorState(project), layers };
}

export function activeLayers(state: EditorState): Layer[] {
  const comp = state.project.compositions.find((c) => c.id === state.activeCompositionId)!;
  return comp.layers;
}
