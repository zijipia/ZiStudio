import { getActiveComposition } from '../editor';
import type { Layer } from '../model';
import type { EditorRuntime } from './editor-runtime';

export class SelectionController {
  constructor(private readonly runtime: EditorRuntime) {}

  get selectedLayerId(): string | null {
    return this.runtime.getState().selectedLayerId;
  }

  getSelectedLayer(): Layer | null {
    const state = this.runtime.getState();
    const id = state.selectedLayerId;
    if (!id) return null;
    return getActiveComposition(state).layers.find((l) => l.id === id) ?? null;
  }

  selectLayer(id: string | null): void {
    this.runtime.update((s) => (s.selectedLayerId === id ? s : { ...s, selectedLayerId: id }));
  }

  selectProperty(key: string | null): void {
    this.runtime.update((s) => (s.selectedPropertyKey === key ? s : { ...s, selectedPropertyKey: key }));
  }

  setPan(pan: [number, number]): void {
    this.runtime.update((s) => ({ ...s, pan }));
  }
}
