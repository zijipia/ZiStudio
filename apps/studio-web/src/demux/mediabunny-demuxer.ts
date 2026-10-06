import {
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
  Input,
  UrlSource,
  type EncodedPacket,
  type InputVideoTrack,
} from 'mediabunny';
import type { DemuxedPacket, Demuxer, VideoTrackInfo } from './demuxer';

function wrap(packet: EncodedPacket): DemuxedPacket {
  return {
    data: packet.data,
    timestamp: packet.timestamp,
    duration: packet.duration,
    isKey: packet.type === 'key',
    handle: packet,
  };
}

export async function createSource(url: string) {
  if (/^https?:/i.test(url)) return new UrlSource(url);
  // blob: and data: URLs are same-origin and cheap to turn back into a (lazy) Blob.
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to read media (${response.status}).`);
  return new BlobSource(await response.blob());
}

export class MediabunnyDemuxer implements Demuxer {
  private input: Input | null = null;
  private track: InputVideoTrack | null = null;
  private sink: EncodedPacketSink | null = null;

  constructor(private readonly url: string) {}

  async open(): Promise<VideoTrackInfo | null> {
    const input = new Input({ source: await createSource(this.url), formats: ALL_FORMATS });
    this.input = input;

    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const config = await track.getDecoderConfig();
    if (!config) return null; // unknown codec

    this.track = track;
    this.sink = new EncodedPacketSink(track);

    const origin = await track.getFirstTimestamp();
    const end = await input.computeDuration([track]);

    return {
      codec: config.codec,
      codedWidth: config.codedWidth ?? track.codedWidth,
      codedHeight: config.codedHeight ?? track.codedHeight,
      description: config.description ? new Uint8Array(config.description as ArrayBuffer) : undefined,
      duration: Math.max(0, end - origin),
      origin,
      rotation: track.rotation,
    };
  }

  async keyPacketAtOrBefore(time: number): Promise<DemuxedPacket | null> {
    const sink = this.requireSink();
    const key = (await sink.getKeyPacket(time)) ?? (await sink.getFirstPacket());
    return key ? wrap(key) : null;
  }

  async nextPacket(packet: DemuxedPacket): Promise<DemuxedPacket | null> {
    const next = await this.requireSink().getNextPacket(packet.handle as EncodedPacket);
    return next ? wrap(next) : null;
  }

  dispose(): void {
    this.input?.dispose();
    this.input = null;
    this.sink = null;
    this.track = null;
  }

  private requireSink(): EncodedPacketSink {
    if (!this.sink) throw new Error('Demuxer is not open.');
    return this.sink;
  }
}
