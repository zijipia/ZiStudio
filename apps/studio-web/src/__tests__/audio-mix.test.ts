import { afterEach, describe, expect, it, vi } from 'vitest';
import { faderToGain, gainToFader } from '../components/AudioMixerPanel';
import { getActiveComposition } from '../editor';
import { createProject, layerGain } from '../model';
import type { AudioController } from '../runtime/audio-controller';
import { EditorRuntime } from '../runtime/editor-runtime';
import type { MediaController } from '../runtime/media-controller';

const stubMedia = { setPlaying() {}, reset() {}, dispose() {}, release() {}, resolve() {}, prefetch: async () => {} } as unknown as MediaController;

function setup() {
  const syncs: unknown[] = [];
  const audio = {
    clockTime: () => null,
    start() {},
    stop() {},
    sync() {},
    syncLayers: (c: unknown) => syncs.push(c),
    reset() {},
    release() {},
    dispose() {},
  } as unknown as AudioController;
  const runtime = new EditorRuntime(createProject(), { media: stubMedia, audio });
  const comp = () => getActiveComposition(runtime.getState());
  const layer = comp().layers.find((l) => l.type === 'audio')!;
  const current = () => comp().layers.find((l) => l.id === layer.id)!;
  return { runtime, syncs, layer, current };
}

let now = 1_000_000;
afterEach(() => vi.restoreAllMocks());
const at = (ms: number) => vi.spyOn(Date, 'now').mockReturnValue((now = ms));

describe('layer mix settings in the runtime', () => {
  it('sets volume and mute, defaulting the rest', () => {
    const { runtime, layer, current } = setup();
    expect(layerGain(current())).toBe(1);
    runtime.composition.setLayerAudio(layer.id, { volume: 0.5 });
    expect(current().audio).toEqual({ volume: 0.5, muted: false });
    runtime.composition.setLayerAudio(layer.id, { muted: true });
    expect(current().audio).toEqual({ volume: 0.5, muted: true });
    expect(layerGain(current())).toBe(0);
  });

  it('creates the setting for a layer that has none (older layers)', () => {
    const { runtime, layer, current } = setup();
    runtime.loadProject({
      ...runtime.getState().project,
      compositions: runtime.getState().project.compositions.map((c) => ({
        ...c,
        layers: c.layers.map((l) => ({ ...l, audio: undefined })),
      })),
    });
    runtime.composition.setLayerAudio(layer.id, { volume: 2 });
    expect(current().audio).toEqual({ volume: 2, muted: false });
  });

  it('ignores unknown layers and edits that change nothing (no history entry)', () => {
    const { runtime, layer } = setup();
    runtime.composition.setLayerAudio('missing', { volume: 0.1 });
    runtime.composition.setLayerAudio(layer.id, { volume: 1, muted: false });
    expect(runtime.commands.canUndo()).toBe(false);
  });

  it('folds a fader drag into one undo step, restoring the state before the drag', () => {
    const { runtime, layer, current } = setup();
    at(1000);
    runtime.composition.setLayerAudio(layer.id, { volume: 0.9 });
    at(1100);
    runtime.composition.setLayerAudio(layer.id, { volume: 0.6 });
    at(1200);
    runtime.composition.setLayerAudio(layer.id, { volume: 0.3 });
    expect(current().audio?.volume).toBe(0.3);
    runtime.undo();
    expect(current().audio).toEqual({ volume: 1, muted: false });
    expect(runtime.commands.canUndo()).toBe(false); // nothing else was left behind in the history
    runtime.redo();
    expect(current().audio?.volume).toBe(0.3);
  });

  it('keeps edits that are far apart as separate undo steps', () => {
    const { runtime, layer, current } = setup();
    at(1000);
    runtime.composition.setLayerAudio(layer.id, { volume: 0.5 });
    at(5000);
    runtime.composition.setLayerAudio(layer.id, { volume: 0.2 });
    runtime.undo();
    expect(current().audio?.volume).toBe(0.5);
    runtime.undo();
    expect(current().audio?.volume).toBe(1);
  });

  it('does not fold edits of different layers, nor unrelated commands', () => {
    const { runtime, layer, current } = setup();
    const other = getActiveComposition(runtime.getState()).layers.find((l) => l.id !== layer.id)!;
    at(1000);
    runtime.composition.setLayerAudio(layer.id, { volume: 0.5 });
    runtime.composition.setLayerAudio(other.id, { volume: 0.4 });
    runtime.undo();
    expect(current().audio?.volume).toBe(0.5);
  });

  it('pushes mix changes to the audio engine (and their undo), but not playhead movement', () => {
    const { runtime, syncs, layer } = setup();
    const before = syncs.length;
    runtime.playback.seek(2);
    expect(syncs.length).toBe(before); // time only: nothing to re-level
    runtime.composition.setLayerAudio(layer.id, { muted: true });
    expect(syncs.length).toBe(before + 1);
    runtime.undo();
    expect(syncs.length).toBe(before + 2); // undoing a mute is heard immediately too
  });
});

describe('mixer fader mapping', () => {
  it('puts unity at position 80 and silence at 0', () => {
    expect(faderToGain(80)).toBeCloseTo(1);
    expect(gainToFader(1)).toBe(80);
    expect(faderToGain(0)).toBe(0);
    expect(gainToFader(0)).toBe(0);
    expect(faderToGain(100)).toBeCloseTo(10 ** 0.5, 5); // +10 dB, as the readout says
  });

  it('round-trips every fader position', () => {
    for (let p = 0; p <= 100; p += 1) expect(gainToFader(faderToGain(p))).toBe(p);
  });

  it('stays within the fader range for any gain', () => {
    expect(gainToFader(1000)).toBe(100);
    expect(gainToFader(1e-9)).toBe(0);
  });
});
