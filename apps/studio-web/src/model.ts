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

export interface Asset {
  id: ID;
  name: string;
  type: 'video' | 'image' | 'audio';
  url: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface Project {
  version: 1;
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
    version: 1,
    id: crypto.randomUUID(),
    name: 'ZiStudio Master Project',
    compositions: [createComposition()],
    assets: [
      {
        id: 'asset-sample-bg',
        name: 'Space Gradient 4K',
        type: 'image',
        url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%230f172a"/><stop offset="100%" stop-color="%230284c7"/></linearGradient></defs><rect width="100%" height="100%" fill="url(%23g)"/></svg>',
        width: 1920,
        height: 1080,
      },
    ],
  };
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function deserializeProject(json: string): Project {
  const parsed = JSON.parse(json);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.compositions)) {
    throw new Error('Invalid ZiStudio project (.zproj) schema format.');
  }
  return parsed as Project;
}
