import {
  AddEffectCommand,
  AddLayerCommand,
  MoveLayerTimingCommand,
  DeleteEffectCommand,
  DeleteLayerCommand,
  ReorderLayerCommand,
  SplitLayerCommand,
  UpdateEffectPropertyCommand,
  UpdateLayerPropertiesCommand,
} from '../commands';
import { getActiveComposition } from '../editor';
import {
  createEffect,
  fileMatchesAsset,
  isAssetOffline,
  rebindAssetLayers,
  type Asset, type Effect, type EffectType, type Layer, type LayerType } from '../model';
import type { EditorRuntime } from './editor-runtime';
import { createLayerFromAsset, createLayerOfType, duplicateLayer } from './layer-factory';

function assetTypeForFile(file: File): Asset['type'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'video';
}

/** Layer, effect and asset operations on the active composition. */
export class CompositionController {
  constructor(private readonly runtime: EditorRuntime) {}

  private get composition() {
    return getActiveComposition(this.runtime.getState());
  }

  // --- layers ---
  addLayer(type: LayerType): void {
    this.runtime.execute(new AddLayerCommand(createLayerOfType(type, this.composition), 0));
  }

  splitSelected(): void {
    const layer = this.runtime.selection.getSelectedLayer();
    if (layer) this.runtime.execute(new SplitLayerCommand(layer.id, this.runtime.getState().currentTime));
  }

  splitLayer(layerId: string): void {
    this.runtime.execute(new SplitLayerCommand(layerId, this.runtime.getState().currentTime));
  }

  duplicate(layer: Layer): void {
    this.runtime.execute(new AddLayerCommand(duplicateLayer(layer, this.composition), 0));
  }

  duplicateSelected(): void {
    const layer = this.runtime.selection.getSelectedLayer();
    if (layer) this.duplicate(layer);
  }

  deleteLayer(layerId: string): void {
    this.runtime.execute(new DeleteLayerCommand(layerId));
  }

  deleteSelected(): void {
    const id = this.runtime.selection.selectedLayerId;
    if (id) this.deleteLayer(id);
  }

  updateLayer(layerId: string, updates: Partial<Layer>): void {
    const layer = this.composition.layers.find((l) => l.id === layerId);
    if (layer) this.runtime.execute(new UpdateLayerPropertiesCommand(layerId, layer, updates));
  }

  reorder(fromIndex: number, toIndex: number): void {
    this.runtime.execute(new ReorderLayerCommand(fromIndex, toIndex));
  }

  // --- effects (act on the selected layer unless a layer id is given) ---
  addEffect(type: EffectType, layerId?: string): void {
    const id = layerId ?? this.runtime.selection.selectedLayerId;
    if (id) this.runtime.execute(new AddEffectCommand(id, createEffect(type)));
  }

  /** Add an already-configured effect instance to the selected layer. */
  addEffectInstance(effect: Effect): void {
    const id = this.runtime.selection.selectedLayerId;
    if (id) this.runtime.execute(new AddEffectCommand(id, effect));
  }

  setLayerTiming(layerId: string, prevStart: number, prevDuration: number, nextStart: number, nextDuration: number): void {
    this.runtime.execute(new MoveLayerTimingCommand(layerId, prevStart, prevDuration, nextStart, nextDuration));
  }

  deleteEffect(effectId: string): void {
    const id = this.runtime.selection.selectedLayerId;
    if (id) this.runtime.execute(new DeleteEffectCommand(id, effectId));
  }

  toggleEffect(effectId: string, enabled: boolean): void {
    const layer = this.runtime.selection.getSelectedLayer();
    if (!layer) return;
    const effects = layer.effects.map((e) => (e.id === effectId ? { ...e, enabled } : e));
    this.runtime.execute(new UpdateLayerPropertiesCommand(layer.id, { effects: layer.effects }, { effects }));
  }

  updateEffectProperty(effectId: string, key: string, value: number): void {
    const layer = this.runtime.selection.getSelectedLayer();
    if (!layer) return;
    const previous = layer.effects.find((e) => e.id === effectId)?.properties[key]?.value;
    this.runtime.execute(new UpdateEffectPropertyCommand(layer.id, effectId, key, previous, value));
  }

  // --- assets ---
  addAssetToComposition(asset: Asset): void {
    this.runtime.execute(new AddLayerCommand(createLayerFromAsset(asset, this.composition), 0));
  }

  /**
   * Import a user file. If it matches an offline asset (same file name and size) it is
   * relinked to that asset instead of creating a duplicate, so reopening a project and
   * re-importing the same footage "just works".
   */
  async importFile(file: File): Promise<{ asset: Asset; relinked: boolean }> {
    const offlineMatch = this.runtime
      .getState()
      .project.assets.find((a) => isAssetOffline(a) && fileMatchesAsset(file, a));
    if (offlineMatch) {
      const asset = await this.relinkAsset(offlineMatch.id, file);
      return { asset, relinked: true };
    }

    const url = URL.createObjectURL(file);
    const type = assetTypeForFile(file);
    const asset: Asset = {
      id: crypto.randomUUID(),
      name: file.name,
      type,
      url,
      source: { kind: 'file', fileName: file.name, size: file.size, lastModified: file.lastModified },
    };

    try {
      const meta = await this.runtime.media.probe(url, type);
      asset.width = meta.width;
      asset.height = meta.height;
      asset.duration = meta.duration;
    } catch (error) {
      // Keep the asset (it will show as offline in the viewer) but say why.
      console.warn(`Could not probe "${file.name}":`, error);
    }

    this.runtime.update((s) => ({
      ...s,
      project: { ...s.project, assets: [asset, ...s.project.assets] },
    }));
    this.addAssetToComposition(asset);
    return { asset, relinked: false };
  }

  /** Point an (offline or moved) asset at a new file and revive every layer that uses it. */
  async relinkAsset(assetId: string, file: File): Promise<Asset> {
    const existing = this.runtime.getState().project.assets.find((a) => a.id === assetId);
    if (!existing) throw new Error('Asset not found.');

    const url = URL.createObjectURL(file);
    let meta;
    try {
      meta = await this.runtime.media.probe(url, existing.type);
    } catch (error) {
      this.runtime.media.release(url);
      URL.revokeObjectURL(url);
      throw new Error(`"${file.name}" could not be opened as ${existing.type}.`);
    }

    const relinked: Asset = {
      ...existing,
      url,
      source: { kind: 'file', fileName: file.name, size: file.size, lastModified: file.lastModified },
      width: meta.width ?? existing.width,
      height: meta.height ?? existing.height,
      duration: meta.duration ?? existing.duration,
    };

    this.runtime.update((s) => {
      const assets = s.project.assets.map((a) => (a.id === assetId ? relinked : a));
      return { ...s, project: rebindAssetLayers({ ...s.project, assets }) };
    });

    if (existing.url && existing.url !== url) {
      this.runtime.media.release(existing.url);
      if (existing.url.startsWith('blob:')) URL.revokeObjectURL(existing.url);
    }
    return relinked;
  }

  removeAsset(assetId: string): void {
    const asset = this.runtime.getState().project.assets.find((a) => a.id === assetId);
    this.runtime.update((s) => ({
      ...s,
      project: { ...s.project, assets: s.project.assets.filter((a) => a.id !== assetId) },
    }));
    if (asset && !this.runtime.getState().project.assets.some((a) => a.url === asset.url)) {
      // Layers still referencing the URL keep working until the cache is rebuilt; only release when unused.
      const stillUsed = this.runtime
        .getState()
        .project.compositions.some((c) => c.layers.some((l) => l.content.mediaUrl === asset.url));
      if (!stillUsed) this.runtime.media.release(asset.url);
    }
  }
}
