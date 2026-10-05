import { describe, expect, it, vi } from 'vitest';
import type { DemuxedPacket, Demuxer, VideoTrackInfo } from '../demux/demuxer';
import type { MediaBackend, MediaSource } from '../media';
import {
  WebCodecsMediaBackend,
  WebCodecsMediaSource,
  type Picture,
  type PictureDecoder,
} from '../webcodecs-media';

const FPS = 30;
const FRAME = 1 / FPS;

/** N packets at 30fps with a key packet every `gop` frames. Packet i shows frame i. */
function makeStream(count: number, gop: number, origin = 0, quantizeMs = false) {
  const packets: DemuxedPacket[] = Array.from({ length: count }, (_, i) => ({
    data: new Uint8Array([i & 255]),
    timestamp: quantizeMs ? origin + Math.round(i * FRAME * 1000) / 1000 : origin + i * FRAME,
    duration: FRAME,
    isKey: i % gop === 0,
    handle: i,
  }));
  const info: VideoTrackInfo = {
    codec: 'fake',
    codedWidth: 64,
    codedHeight: 36,
    duration: count * FRAME,
    origin,
    rotation: 0,
  };
  const demuxer: Demuxer & { disposed: boolean; keyLookups: number } = {
    disposed: false,
    keyLookups: 0,
    async open() {
      return info;
    },
    async keyPacketAtOrBefore(time) {
      this.keyLookups += 1;
      let best = packets[0];
      for (const p of packets) if (p.isKey && p.timestamp <= time + 1e-9) best = p;
      return best;
    },
    async nextPacket(packet) {
      return packets[(packet.handle as number) + 1] ?? null;
    },
    dispose() {
      this.disposed = true;
    },
  };
  return { packets, info, demuxer };
}

/**
 * Fake decoder. `lag` simulates reordering: a picture is only emitted once `lag` more
 * packets have been fed (flush emits the rest), like a real decoder holding B-frames.
 */
class FakeDecoder implements PictureDecoder {
  fed: number[] = [];
  resets = 0;
  closed = false;
  open = new Set<number>();
  private pending: DemuxedPacket[] = [];
  private ready: Picture[] = [];
  private needsKey = true;

  constructor(private readonly lag = 0) {}

  configure() {}

  decode(packet: DemuxedPacket) {
    if (this.needsKey && !packet.isKey) throw new Error('decoder fed a delta packet without a key packet');
    this.needsKey = false;
    this.fed.push(packet.handle as number);
    this.pending.push(packet);
    while (this.pending.length > this.lag) this.emit(this.pending.shift()!);
  }

  private emit(packet: DemuxedPacket) {
    const id = packet.handle as number;
    this.open.add(id);
    this.ready.push({
      timestamp: packet.timestamp,
      duration: packet.duration,
      width: 64,
      height: 36,
      toMediaFrame: (origin) => ({
        timestamp: packet.timestamp - origin,
        duration: packet.duration,
        width: 64,
        height: 36,
        source: { id } as unknown as CanvasImageSource,
        close: () => {},
      }),
      close: () => {
        this.open.delete(id);
      },
    });
  }

  takePictures() {
    const out = this.ready;
    this.ready = [];
    return out;
  }
  async idle() {}
  async flush() {
    for (const p of this.pending.splice(0)) this.emit(p);
    this.needsKey = true;
  }
  reset() {
    this.resets += 1;
    this.pending = [];
    for (const p of this.ready) p.close();
    this.ready = [];
    this.needsKey = true;
  }
  close() {
    this.closed = true;
    this.reset();
  }
}

const frameId = (f: any) => (f.source as any).id as number;

async function open(count = 100, gop = 10, lag = 0, origin = 0, quantizeMs = false) {
  const { demuxer, info } = makeStream(count, gop, origin, quantizeMs);
  const decoder = new FakeDecoder(lag);
  const source = new WebCodecsMediaSource('x', demuxer, decoder, info);
  return { source, decoder, demuxer };
}

describe('WebCodecsMediaSource', () => {
  it('exposes metadata from the track', async () => {
    const { source } = await open(90);
    expect(source.metadata).toMatchObject({ kind: 'video', width: 64, height: 36, videoCodec: 'fake' });
    expect(source.metadata!.duration).toBeCloseTo(3);
  });

  for (const lag of [0, 2]) {
    it(`returns the exact frame for random access (reorder lag ${lag})`, async () => {
      const { source } = await open(100, 10, lag);
      for (const frame of [0, 7, 10, 33, 99, 12, 50, 49, 3]) {
        const got = await source.getFrame(frame * FRAME + FRAME * 0.3);
        expect(frameId(got), `frame ${frame}`).toBe(frame);
      }
    });
  }

  it('plays forward sequentially without resetting or re-feeding packets', async () => {
    const { source, decoder } = await open(100, 50, 0);
    for (let i = 0; i < 60; i += 1) {
      const got = await source.getFrame(i * FRAME + 0.001);
      expect(frameId(got)).toBe(i);
    }
    expect(decoder.resets).toBe(1); // only the initial restart at t=0
    expect(new Set(decoder.fed).size).toBe(decoder.fed.length); // no packet fed twice
    expect(decoder.fed.length).toBeLessThanOrEqual(62);
  });

  it('jumping back restarts from the key packet; jumping far ahead skips earlier GOPs', async () => {
    const { source, decoder } = await open(200, 20, 0);
    await source.getFrame(45 * FRAME + 0.001);
    const resetsBefore = decoder.resets;
    expect(frameId(await source.getFrame(5 * FRAME + 0.001))).toBe(5);
    expect(decoder.resets).toBe(resetsBefore + 1);

    decoder.fed.length = 0;
    expect(frameId(await source.getFrame(150 * FRAME + 0.001))).toBe(150);
    expect(Math.min(...decoder.fed)).toBe(140); // started at the key packet of that GOP
  });

  it('holds the last frame past the end and clamps before the start', async () => {
    const { source } = await open(30, 10, 2);
    expect(frameId(await source.getFrame(999))).toBe(29);
    expect(frameId(await source.getFrame(1000))).toBe(29);
    expect(frameId(await source.getFrame(-5))).toBe(0);
  });

  it('can seek back into the stream after reaching the end (decoder needs a key packet again)', async () => {
    const { source } = await open(30, 10, 2);
    await source.getFrame(999);
    expect(frameId(await source.getFrame(12 * FRAME + 0.001))).toBe(12);
  });

  it('honours the container origin (first timestamp != 0)', async () => {
    const { source } = await open(60, 10, 0, 1.5);
    const got = await source.getFrame(20 * FRAME + 0.001);
    expect(frameId(got)).toBe(20);
    expect(got!.timestamp).toBeCloseTo(20 * FRAME);
  });

  it('selects the right frame on exact frame boundaries when the container rounds timestamps to ms (WebM)', async () => {
    const { source } = await open(100, 10, 0, 0, true);
    for (const frame of [2, 4, 7, 10, 20, 34, 64, 99, 3, 2]) {
      expect(frameId(await source.getFrame(frame / FPS)), `frame ${frame}`).toBe(frame);
    }
  });

  it('serializes overlapping requests and answers each correctly', async () => {
    const { source } = await open(100, 10, 2);
    const results = await Promise.all([40, 3, 77, 41].map((f) => source.getFrame(f * FRAME + 0.001)));
    expect(results.map(frameId)).toEqual([40, 3, 77, 41]);
  });

  it('keeps few pictures alive while decoding a long GOP, and frees all on dispose', async () => {
    const { source, decoder, demuxer } = await open(300, 300, 2);
    await source.getFrame(250 * FRAME + 0.001);
    expect(decoder.open.size).toBeLessThanOrEqual(3);
    source.dispose();
    expect(decoder.open.size).toBe(0);
    expect(decoder.closed).toBe(true);
    expect(demuxer.disposed).toBe(true);
    expect(await source.getFrame(1)).toBeNull();
  });

  it('rejects when aborted', async () => {
    const { source } = await open(100, 10, 0);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(source.getFrame(1, ctrl.signal)).rejects.toThrow(/aborted/);
  });
});

describe('WebCodecsMediaBackend', () => {
  const fakeSource = { id: 'fb' } as unknown as MediaSource;
  const fallback = (): MediaBackend & { open: ReturnType<typeof vi.fn> } => ({
    name: 'fb',
    supportsHardwareDecode: false,
    open: vi.fn(async () => fakeSource),
  });

  const backendFor = (opts: Partial<ConstructorParameters<typeof WebCodecsMediaBackend>[0]> & { info?: VideoTrackInfo | null; openError?: Error }) => {
    const fb = fallback();
    const { demuxer, info } = makeStream(10, 5);
    const d = {
      ...demuxer,
      open: async () => {
        if (opts.openError) throw opts.openError;
        return opts.info === undefined ? info : opts.info;
      },
    } as Demuxer & { disposed: boolean };
    const backend = new WebCodecsMediaBackend({
      fallback: fb,
      createDemuxer: () => d,
      createDecoder: () => new FakeDecoder(),
      isConfigSupported: async () => true,
      available: () => true,
      ...opts,
    });
    return { backend, fb, d };
  };

  it('uses the WebCodecs source for decodable video', async () => {
    const { backend, fb } = backendFor({});
    const source = await backend.open('a.mp4', 'video');
    expect(source).toBeInstanceOf(WebCodecsMediaSource);
    expect(fb.open).not.toHaveBeenCalled();
  });

  it('falls back for images and audio without touching the demuxer', async () => {
    const { backend, fb } = backendFor({});
    expect(await backend.open('a.png', 'image')).toBe(fakeSource);
    expect(await backend.open('a.mp3', 'audio')).toBe(fakeSource);
    expect(fb.open).toHaveBeenCalledTimes(2);
  });

  it('falls back when WebCodecs is unavailable', async () => {
    const { backend } = backendFor({ available: () => false });
    expect(await backend.open('a.mp4', 'video')).toBe(fakeSource);
  });

  it('falls back (and disposes the demuxer) when there is no video track, the codec is unsupported, the video is rotated, or opening throws', async () => {
    const cases: Array<Parameters<typeof backendFor>[0]> = [
      { info: null },
      { isConfigSupported: async () => false },
      { info: { ...makeStream(1, 1).info, rotation: 90 } },
      { openError: new Error('bad container') },
    ];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const c of cases) {
      const { backend, d } = backendFor(c);
      expect(await backend.open('a.mp4', 'video')).toBe(fakeSource);
      expect(d.disposed).toBe(true);
    }
  });
});
