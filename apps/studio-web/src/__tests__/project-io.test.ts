import { describe, expect, it } from 'vitest';
import {
  createProject,
  deserializeProject,
  fileMatchesAsset,
  isAssetOffline,
  serializeProject,
  type Asset,
  type Layer,
} from '../model';
import { EditorRuntime } from '../runtime/editor-runtime';
import type { MediaController } from '../runtime/media-controller';
import { createLayerFromAsset } from '../runtime/layer-factory';

const fileAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'a1',
  name: 'clip.mp4',
  type: 'video',
  url: 'blob:http://x/123',
  source: { kind: 'file', fileName: 'clip.mp4', size: 1000, lastModified: 5 },
  width: 640,
  height: 360,
  duration: 4,
  ...overrides,
});

function projectWith(asset: Asset) {
  const project = createProject();
  const comp = project.compositions[0];
  project.assets = [asset, ...project.assets];
  comp.layers = [createLayerFromAsset(asset, comp), ...comp.layers];
  return project;
}

describe('project serialization', () => {
  it('never writes blob URLs to disk (assets or layers)', () => {
    const json = serializeProject(projectWith(fileAsset()));
    expect(json).not.toContain('blob:');
    const back = deserializeProject(json);
    const a = back.assets.find((x) => x.id === 'a1')!;
    expect(isAssetOffline(a)).toBe(true);
    expect(a.source).toEqual({ kind: 'file', fileName: 'clip.mp4', size: 1000, lastModified: 5 });
    expect(a.duration).toBe(4);
  });

  it('keeps the layer-to-asset link so the layer can be revived by relinking', () => {
    const back = deserializeProject(serializeProject(projectWith(fileAsset())));
    const layer = back.compositions[0].layers[0];
    expect(layer.content.assetId).toBe('a1');
    expect(layer.content.mediaUrl).toBeUndefined();
  });

  it('keeps embedded (data:) assets usable after a round trip', () => {
    const back = deserializeProject(serializeProject(createProject()));
    const bg = back.assets.find((a) => a.id === 'asset-sample-bg')!;
    expect(bg.url.startsWith('data:')).toBe(true);
    expect(isAssetOffline(bg)).toBe(false);
  });

  it('does not mutate the in-memory project when saving', () => {
    const project = projectWith(fileAsset());
    serializeProject(project);
    expect(project.assets[0].url).toBe('blob:http://x/123');
  });

  it('migrates v1 projects: blob assets go offline, data/remote assets keep their URL', () => {
    const v1 = {
      version: 1,
      id: 'p',
      name: 'old',
      compositions: [
        {
          id: 'c', name: 'c', width: 1920, height: 1080, fps: 30, duration: 5,
          layers: [{ id: 'l', type: 'video', content: { assetId: 'v', mediaUrl: 'blob:old' } }],
        },
      ],
      assets: [
        { id: 'v', name: 'v.mp4', type: 'video', url: 'blob:old' },
        { id: 'i', name: 'i.png', type: 'image', url: 'data:image/png;base64,AAA' },
        { id: 'r', name: 'r.mp4', type: 'video', url: 'https://example.com/r.mp4' },
      ],
    };
    const p = deserializeProject(JSON.stringify(v1));
    expect(p.version).toBe(2);
    const [v, i, r] = p.assets;
    expect(isAssetOffline(v)).toBe(true);
    expect(v.source.kind).toBe('file');
    expect(i.source.kind).toBe('embedded');
    expect(i.url).toBe('data:image/png;base64,AAA');
    expect(r.source.kind).toBe('remote');
    expect(p.compositions[0].layers[0].content.mediaUrl).toBeUndefined();
  });

  it('rejects garbage and projects from the future', () => {
    expect(() => deserializeProject('not json')).toThrow(/valid JSON/);
    expect(() => deserializeProject('{"version":2}')).toThrow(/schema/);
    expect(() => deserializeProject(JSON.stringify({ version: 99, compositions: [] }))).toThrow(/newer/);
  });
});

describe('asset fingerprint', () => {
  it('matches by name and size only for file assets', () => {
    expect(fileMatchesAsset({ name: 'clip.mp4', size: 1000 }, fileAsset())).toBe(true);
    expect(fileMatchesAsset({ name: 'clip.mp4', size: 999 }, fileAsset())).toBe(false);
    expect(fileMatchesAsset({ name: 'other.mp4', size: 1000 }, fileAsset())).toBe(false);
    expect(fileMatchesAsset({ name: 'x', size: 1 }, fileAsset({ source: { kind: 'embedded' } }))).toBe(false);
  });
});

describe('relink', () => {
  const media = {
    reset() {}, dispose() {}, release() {},
    probe: async () => ({ kind: 'video' as const, width: 1280, height: 720, duration: 8 }),
  } as unknown as MediaController;

  // jsdom-free: stub the object URL API used by the controller
  (globalThis as any).URL.createObjectURL = () => 'blob:http://x/new';
  (globalThis as any).URL.revokeObjectURL = () => {};

  const reopened = () => {
    const rt = new EditorRuntime(deserializeProject(serializeProject(projectWith(fileAsset()))), { media });
    return rt;
  };
  const fakeFile = (name: string, size: number) => ({ name, size, lastModified: 9, type: 'video/mp4' }) as unknown as File;

  it('relinking revives the asset and every layer that references it', async () => {
    const rt = reopened();
    await rt.composition.relinkAsset('a1', fakeFile('moved.mp4', 1234));
    const state = rt.getState();
    const a = state.project.assets.find((x) => x.id === 'a1')!;
    expect(isAssetOffline(a)).toBe(false);
    expect(a.width).toBe(1280);
    expect(a.source).toMatchObject({ fileName: 'moved.mp4', size: 1234 });
    const layer = state.project.compositions[0].layers.find((l: Layer) => l.content.assetId === 'a1')!;
    expect(layer.content.mediaUrl).toBe('blob:http://x/new');
  });

  it('importing a file with the same name+size relinks instead of duplicating', async () => {
    const rt = reopened();
    const before = rt.getState().project.assets.length;
    const layersBefore = rt.getState().project.compositions[0].layers.length;
    const { relinked } = await rt.composition.importFile(fakeFile('clip.mp4', 1000));
    expect(relinked).toBe(true);
    expect(rt.getState().project.assets).toHaveLength(before);
    expect(rt.getState().project.compositions[0].layers).toHaveLength(layersBefore);
  });

  it('importing a different file creates a new asset and layer', async () => {
    const rt = reopened();
    const before = rt.getState().project.assets.length;
    const { relinked } = await rt.composition.importFile(fakeFile('new.mp4', 5));
    expect(relinked).toBe(false);
    expect(rt.getState().project.assets).toHaveLength(before + 1);
  });

  it('a failed probe leaves the asset offline and surfaces an error', async () => {
    const bad = { ...media, probe: async () => { throw new Error('nope'); } } as unknown as MediaController;
    const rt = new EditorRuntime(deserializeProject(serializeProject(projectWith(fileAsset()))), { media: bad });
    await expect(rt.composition.relinkAsset('a1', fakeFile('x.txt', 1))).rejects.toThrow(/could not be opened/);
    expect(isAssetOffline(rt.getState().project.assets.find((a) => a.id === 'a1')!)).toBe(true);
  });
});
