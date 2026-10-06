import {
  createShapeLayer,
  createSolidLayer,
  createTextLayer,
  createTransform,
  defaultLayerAudio,
  type Asset,
  type Composition,
  type Layer,
  type LayerType,
} from '../model';

const SOLID_PALETTE = ['#1e40af', '#065f46', '#991b1b', '#86198f', '#374151'];

/** Create a new layer of the given type for a composition (no side effects). */
export function createLayerOfType(type: LayerType, composition: Composition): Layer {
  const count = composition.layers.length + 1;
  switch (type) {
    case 'solid':
      return createSolidLayer(`Solid ${count}`, SOLID_PALETTE[count % SOLID_PALETTE.length]);
    case 'text':
      return createTextLayer(`Text ${count}`, 0, 0);
    case 'shape':
      return createShapeLayer(`Shape ${count}`, 'circle');
    case 'audio': {
      const id = crypto.randomUUID();
      return {
        id,
        name: `Audio Track ${count}`,
        type: 'audio',
        start: 0,
        duration: composition.duration,
        transform: createTransform(id),
        blendMode: 'source-over',
        effects: [],
        content: { audioFreq: 440 + count * 40 },
        visible: true,
        locked: false,
        audio: defaultLayerAudio(),
      };
    }
    default: {
      const layer = createSolidLayer(`Adjustment ${count}`, 'transparent');
      layer.type = 'adjustment';
      return layer;
    }
  }
}

/** Deep-clone a layer under a new identity (including new transform property ids). */
export function duplicateLayer(layer: Layer, composition: Composition): Layer {
  const id = crypto.randomUUID();
  const copy: Layer = JSON.parse(JSON.stringify(layer));
  return {
    ...copy,
    id,
    name: `${layer.name} (Copy)`,
    start: Math.max(0, Math.min(composition.duration - 0.5, layer.start + 0.2)),
  };
}

/** Create a media layer that references an asset. */
export function createLayerFromAsset(asset: Asset, composition: Composition): Layer {
  const id = crypto.randomUUID();
  const type: Layer['type'] = asset.type === 'image' ? 'image' : asset.type === 'audio' ? 'audio' : 'video';
  return {
    id,
    name: asset.name,
    type,
    start: 0,
    duration: asset.duration || composition.duration,
    transform: createTransform(id),
    blendMode: 'source-over',
    effects: [],
    content: { mediaUrl: asset.url || undefined, assetId: asset.id, mediaInPoint: 0 },
    visible: true,
    locked: false,
    ...(type === 'image' ? {} : { audio: defaultLayerAudio() }),
  };
}
