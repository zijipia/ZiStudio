export type ID = string;

export type PropertyValue = number | boolean | string | [number, number] | [number, number, number] | [number, number, number, number];

export interface Keyframe<T extends PropertyValue = PropertyValue> {
  id: ID;
  time: number;
  value: T;
  interpolation: 'hold' | 'linear' | 'bezier';
}

export interface Property<T extends PropertyValue = PropertyValue> {
  id: ID;
  name: string;
  value: T;
  keyframes: Keyframe<T>[];
}

export interface Transform {
  position: Property<[number, number, number]>;
  scale: Property<[number, number, number]>;
  rotation: Property<[number, number, number]>;
  opacity: Property<number>;
}

export type LayerType = 'video' | 'image' | 'text' | 'solid' | 'adjustment' | 'audio';

export interface Layer {
  id: ID;
  name: string;
  type: LayerType;
  start: number;
  duration: number;
  transform: Transform;
  visible: boolean;
  locked: boolean;
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

export interface Project {
  version: 1;
  id: ID;
  name: string;
  compositions: Composition[];
}

export function createProperty<T extends PropertyValue>(id: ID, name: string, value: T): Property<T> {
  return { id, name, value, keyframes: [] };
}

export function createTransform(id: ID): Transform {
  return {
    position: createProperty(`${id}:position`, 'Position', [0, 0, 0]),
    scale: createProperty(`${id}:scale`, 'Scale', [100, 100, 100]),
    rotation: createProperty(`${id}:rotation`, 'Rotation', [0, 0, 0]),
    opacity: createProperty(`${id}:opacity`, 'Opacity', 100),
  };
}

export function createComposition(): Composition {
  return {
    id: crypto.randomUUID(),
    name: 'Main Composition',
    width: 1920,
    height: 1080,
    fps: 60,
    duration: 10,
    layers: [],
  };
}

export function createProject(): Project {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: 'Untitled Project',
    compositions: [createComposition()],
  };
}
