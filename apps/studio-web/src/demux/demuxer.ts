/**
 * Container demuxing boundary.
 *
 * A Demuxer turns a container (MP4, WebM, ...) into encoded video packets and
 * knows nothing about decoding. Web uses mediabunny today; GPAC-WASM, or native
 * GPAC/GStreamer behind the same trait, can replace it without touching the
 * decode scheduling above this line.
 */

export interface DemuxedPacket {
  readonly data: Uint8Array;
  /** Presentation time in seconds, in the container's timeline. */
  readonly timestamp: number;
  readonly duration: number;
  readonly isKey: boolean;
  /** Opaque token the owning demuxer uses to find the packet that follows this one. */
  readonly handle: unknown;
}

export interface VideoTrackInfo {
  /** WebCodecs codec string, e.g. `avc1.64001f`, `vp09.00.10.08`. */
  codec: string;
  codedWidth: number;
  codedHeight: number;
  /** Codec-specific extradata (avcC / hvcC / ...), when the codec needs it. */
  description?: Uint8Array;
  duration: number;
  /** Container timestamp of the first frame; subtracted so media time starts at 0. */
  origin: number;
  /** Clockwise degrees the picture must be rotated for display. */
  rotation: number;
}

export interface Demuxer {
  /** Open the container. Resolves null if there is no decodable video track. */
  open(): Promise<VideoTrackInfo | null>;
  /** Last key packet with timestamp <= `time` (or the first packet if `time` precedes it). */
  keyPacketAtOrBefore(time: number): Promise<DemuxedPacket | null>;
  /** The packet after `packet` in decode order, or null at end of stream. */
  nextPacket(packet: DemuxedPacket): Promise<DemuxedPacket | null>;
  dispose(): void;
}
