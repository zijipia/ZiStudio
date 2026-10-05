export type ID = string;

export type PropertyValue =
  | number
  | boolean
  | string
  | [number, number]
  | [number, number, number]
  | [number, number, number, number];

export interface Keyframe<T extends PropertyValue = PropertyValue> {
  id: ID;
  time: number;
  value: T;
  interpolation: 'hold' | 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out';
  inTangent?: [number, number];
  outTangent?: [number, number];
}

export interface Property<T extends PropertyValue = PropertyValue> {
  id: ID;
  name: string;
  value: T;
  keyframes: Keyframe<T>[];
  min?: number;
  max?: number;
  unit?: string;
}

export interface Transform {
  position: Property<[number, number, number]>;
  scale: Property<[number, number, number]>;
  rotation: Property<[number, number, number]>;
  opacity: Property<number>;
  anchorPoint?: Property<[number, number, number]>;
}

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'lighter'
  | 'difference'
  | 'color-dodge'
  | 'exclusion';

export type EffectType =
  | 'blur'
  | 'brightness-contrast'
  | 'hue-saturation'
  | 'glow'
  | 'vignette'
  | 'invert';

export interface Effect {
  id: ID;
  name: string;
  type: EffectType;
  enabled: boolean;
  properties: Record<string, Property<any>>;
}

export type LayerType = 'video' | 'image' | 'text' | 'solid' | 'adjustment' | 'audio' | 'shape';

export interface LayerContent {
  color?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  shapeType?: 'rect' | 'circle' | 'star' | 'polygon';
  strokeColor?: string;
  strokeWidth?: number;
  assetId?: string;
  mediaUrl?: string;
  /** Seconds into the source media where this layer's first frame comes from. */
  mediaInPoint?: number;
  audioFreq?: number;
}

export interface Layer {
  id: ID;
  name: string;
  type: LayerType;
  start: number;
  duration: number;
  transform: Transform;
  blendMode: BlendMode;
  effects: Effect[];
  content: LayerContent;
  visible: boolean;
  locked: boolean;
  solo?: boolean;
  is3D?: boolean;
  parentId?: string | null;
}

export interface Composition {
  id: ID;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  layers: Layer[];
}

/**
 * Where an asset's bytes live. This decides what is persisted in a `.zproj`:
 *  - `embedded`: the data is in `url` itself (a `data:` URL) and is saved with the project.
 *  - `file`: a user file opened in this session (`blob:` URL). Only the fingerprint is saved;
 *    after reopening, the asset is offline until the file is relinked.
 *  - `remote`: an http(s) URL, saved as-is.
 */
export type AssetSource =
  | { kind: 'embedded' }
  | { kind: 'file'; fileName: string; size: number; lastModified: number }
  | { kind: 'remote' };

export interface Asset {
  id: ID;
  name: string;
  type: 'video' | 'image' | 'audio';
  /** Runtime URL used to open the media. Empty string while the asset is offline. */
  url: string;
  source: AssetSource;
  width?: number;
  height?: number;
  duration?: number;
}

/** An asset is offline when it has no usable URL (e.g. a file asset after reopening a project). */
export function isAssetOffline(asset: Asset): boolean {
  return !asset.url;
}

/** Cheap identity check used to auto-relink a re-imported file to an offline asset. */
export function fileMatchesAsset(file: { name: string; size: number }, asset: Asset): boolean {
  return asset.source.kind === 'file' && asset.source.fileName === file.name && asset.source.size === file.size;
}

export const PROJECT_VERSION = 2;

export interface Project {
  version: 2;
  id: ID;
  name: string;
  compositions: Composition[];
  assets: Asset[];
}

export function createProperty<T extends PropertyValue>(
  id: ID,
  name: string,
  value: T,
  options?: { min?: number; max?: number; unit?: string }
): Property<T> {
  return {
    id,
    name,
    value,
    keyframes: [],
    min: options?.min,
    max: options?.max,
    unit: options?.unit,
  };
}

export function createTransform(id: ID): Transform {
  return {
    position: createProperty(`${id}:position`, 'Position', [0, 0, 0]),
    scale: createProperty(`${id}:scale`, 'Scale', [100, 100, 100]),
    rotation: createProperty(`${id}:rotation`, 'Rotation', [0, 0, 0]),
    opacity: createProperty(`${id}:opacity`, 'Opacity', 100, { min: 0, max: 100, unit: '%' }),
    anchorPoint: createProperty(`${id}:anchor`, 'Anchor Point', [0, 0, 0]),
  };
}

export function createEffect(type: EffectType): Effect {
  const id = crypto.randomUUID();
  switch (type) {
    case 'blur':
      return {
        id,
        name: 'Gaussian Blur',
        type,
        enabled: true,
        properties: {
          radius: createProperty(`${id}:radius`, 'Radius', 12, { min: 0, max: 100, unit: 'px' }),
        },
      };
    case 'brightness-contrast':
      return {
        id,
        name: 'Brightness & Contrast',
        type,
        enabled: true,
        properties: {
          brightness: createProperty(`${id}:brightness`, 'Brightness', 10, { min: -100, max: 100, unit: '%' }),
          contrast: createProperty(`${id}:contrast`, 'Contrast', 15, { min: -100, max: 100, unit: '%' }),
        },
      };
    case 'hue-saturation':
      return {
        id,
        name: 'Hue & Saturation',
        type,
        enabled: true,
        properties: {
          hue: createProperty(`${id}:hue`, 'Hue', 0, { min: -180, max: 180, unit: '°' }),
          saturation: createProperty(`${id}:saturation`, 'Saturation', 20, { min: -100, max: 100, unit: '%' }),
        },
      };
    case 'glow':
      return {
        id,
        name: 'Glow Effect',
        type,
        enabled: true,
        properties: {
          intensity: createProperty(`${id}:intensity`, 'Intensity', 1.5, { min: 0, max: 5 }),
          radius: createProperty(`${id}:radius`, 'Radius', 16, { min: 0, max: 50, unit: 'px' }),
        },
      };
    case 'vignette':
      return {
        id,
        name: 'Vignette',
        type,
        enabled: true,
        properties: {
          amount: createProperty(`${id}:amount`, 'Amount', 45, { min: 0, max: 100, unit: '%' }),
        },
      };
    case 'invert':
      return {
        id,
        name: 'Color Invert',
        type,
        enabled: true,
        properties: {},
      };
  }
}

export function createSolidLayer(name: string, color: string, width = 1920, height = 1080): Layer {
  const id = crypto.randomUUID();
  return {
    id,
    name,
    type: 'solid',
    start: 0,
    duration: 10,
    transform: createTransform(id),
    blendMode: 'source-over',
    effects: [],
    content: { color },
    visible: true,
    locked: false,
  };
}

export function createTextLayer(text: string, x = 0, y = 0): Layer {
  const id = crypto.randomUUID();
  const transform = createTransform(id);
  transform.position.value = [x, y, 0];
  return {
    id,
    name: text.slice(0, 16) || 'Text Layer',
    type: 'text',
    start: 0,
    duration: 10,
    transform,
    blendMode: 'source-over',
    effects: [],
    content: {
      text,
      fontSize: 54,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontColor: '#ffffff',
    },
    visible: true,
    locked: false,
  };
}

export function createShapeLayer(name: string, shapeType: 'rect' | 'circle' | 'star' = 'circle'): Layer {
  const id = crypto.randomUUID();
  return {
    id,
    name,
    type: 'shape',
    start: 0,
    duration: 10,
    transform: createTransform(id),
    blendMode: 'source-over',
    effects: [],
    content: {
      shapeType,
      color: '#3b82f6',
      strokeColor: '#60a5fa',
      strokeWidth: 4,
    },
    visible: true,
    locked: false,
  };
}

export function createComposition(): Composition {
  const compId = crypto.randomUUID();

  // Create initial demo layers for a rich default project
  const background = createSolidLayer('Deep Space Solid', '#0b111e');
  background.start = 0;
  background.duration = 10;

  const shape = createShapeLayer('Glow Ring', 'circle');
  shape.start = 0;
  shape.duration = 9;
  shape.content.color = '#38bdf8';
  shape.transform.scale.value = [70, 70, 100];
  shape.transform.position.value = [0, -30, 0];
  shape.effects = [createEffect('glow')];

  // Animated keyframes for the shape
  shape.transform.position.keyframes = [
    { id: crypto.randomUUID(), time: 0, value: [0, -50, 0], interpolation: 'bezier' },
    { id: crypto.randomUUID(), time: 3, value: [120, 40, 0], interpolation: 'bezier' },
    { id: crypto.randomUUID(), time: 6, value: [-120, 20, 0], interpolation: 'bezier' },
    { id: crypto.randomUUID(), time: 9, value: [0, -50, 0], interpolation: 'bezier' },
  ];

  const title = createTextLayer('ZiStudio Pro', 0, 80);
  title.start = 0.5;
  title.duration = 8.5;
  title.content.fontSize = 68;
  title.content.fontColor = '#f8fafc';
  title.transform.opacity.keyframes = [
    { id: crypto.randomUUID(), time: 0.5, value: 0, interpolation: 'linear' },
    { id: crypto.randomUUID(), time: 1.5, value: 100, interpolation: 'linear' },
    { id: crypto.randomUUID(), time: 8.0, value: 100, interpolation: 'linear' },
    { id: crypto.randomUUID(), time: 9.0, value: 0, interpolation: 'linear' },
  ];

  const audio = {
    id: crypto.randomUUID(),
    name: 'Master Audio (Synth)',
    type: 'audio' as const,
    start: 0,
    duration: 10,
    transform: createTransform(crypto.randomUUID()),
    blendMode: 'source-over' as const,
    effects: [],
    content: { audioFreq: 440 },
    visible: true,
    locked: false,
  };

  return {
    id: compId,
    name: 'Main Composition',
    width: 1920,
    height: 1080,
    fps: 60,
    duration: 10,
    layers: [title, shape, background, audio],
  };
}

export function createProject(): Project {
  return {
    version: 2,
    id: crypto.randomUUID(),
    name: 'ZiStudio Master Project',
    compositions: [createComposition()],
    assets: [
      {
        id: 'asset-sample-bg',
        name: 'Space Gradient 4K',
        type: 'image',
        source: { kind: 'embedded' },
        url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%230f172a"/><stop offset="100%" stop-color="%230284c7"/></linearGradient></defs><rect width="100%" height="100%" fill="url(%23g)"/></svg>',
        width: 1920,
        height: 1080,
      },
    ],
  };
}

/** Layers that reference an asset take their runtime media URL from it. */
function bindLayerMedia(project: Project): Project {
  const byId = new Map(project.assets.map((a) => [a.id, a]));
  return {
    ...project,
    compositions: project.compositions.map((comp) => ({
      ...comp,
      layers: comp.layers.map((layer) => {
        const asset = layer.content.assetId ? byId.get(layer.content.assetId) : undefined;
        if (!asset) return layer;
        const mediaUrl = asset.url || undefined;
        return layer.content.mediaUrl === mediaUrl ? layer : { ...layer, content: { ...layer.content, mediaUrl } };
      }),
    })),
  };
}

/** Re-sync every asset-backed layer's `mediaUrl` with its asset (after import/relink). */
export function rebindAssetLayers(project: Project): Project {
  return bindLayerMedia(project);
}

function isSessionUrl(url: string | undefined): boolean {
  return !!url && url.startsWith('blob:');
}

/** What is actually written to disk: session-only URLs never leave the browser. */
export function toPersistedProject(project: Project): Project {
  const assets = project.assets.map((a) => (a.source.kind === 'file' || isSessionUrl(a.url) ? { ...a, url: '' } : a));
  const compositions = project.compositions.map((comp) => ({
    ...comp,
    layers: comp.layers.map((layer) =>
      isSessionUrl(layer.content.mediaUrl) ? { ...layer, content: { ...layer.content, mediaUrl: undefined } } : layer
    ),
  }));
  return { ...project, assets, compositions };
}

export function serializeProject(project: Project): string {
  return JSON.stringify(toPersistedProject(project), null, 2);
}

/** v1 -> v2: assets gain a `source`; session blob URLs are dropped (the asset becomes offline). */
function migrateV1toV2(raw: any): any {
  const assets = (raw.assets ?? []).map((a: any) => {
    const url: string = a.url ?? '';
    if (url.startsWith('blob:')) {
      return { ...a, url: '', source: { kind: 'file', fileName: a.name, size: -1, lastModified: 0 } };
    }
    return { ...a, source: url.startsWith('data:') ? { kind: 'embedded' } : { kind: 'remote' } };
  });
  const compositions = (raw.compositions ?? []).map((comp: any) => ({
    ...comp,
    layers: (comp.layers ?? []).map((layer: any) =>
      isSessionUrl(layer.content?.mediaUrl) ? { ...layer, content: { ...layer.content, mediaUrl: undefined } } : layer
    ),
  }));
  return { ...raw, version: 2, assets, compositions };
}

export function deserializeProject(json: string): Project {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid ZiStudio project (.zproj): not valid JSON.');
  }
  if (!parsed || typeof parsed.version !== 'number' || !Array.isArray(parsed.compositions)) {
    throw new Error('Invalid ZiStudio project (.zproj) schema format.');
  }
  if (parsed.version > PROJECT_VERSION) {
    throw new Error(`This project was saved by a newer ZiStudio (format v${parsed.version}).`);
  }
  if (parsed.version === 1) parsed = migrateV1toV2(parsed);
  return bindLayerMedia(parsed as Project);
}
