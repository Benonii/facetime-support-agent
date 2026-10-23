import {
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Room,
  RoomEvent,
  TrackKind,
  VideoBufferType,
  type VideoFrame,
  VideoRotation,
  VideoStream,
} from '@livekit/rtc-node';
import sharp from 'sharp';

// Chert's bridge publishes the caller's camera under this name. The dev phone page uses it too.
export const CALLER_VIDEO_TRACK = 'facetime-remote-video';

/**
 * Keeps only the newest decoded frame from the caller's camera.
 * Grab a JPEG on demand (tool call) instead of streaming video into the model.
 */
export class FrameGrabber {
  private latest?: { frame: VideoFrame; rotation: VideoRotation; at: number };
  private stream?: VideoStream;

  constructor(private room: Room) {
    room.on(RoomEvent.TrackSubscribed, this.onTrack);
    // Tracks that were already subscribed before we attached.
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.track) this.onTrack(pub.track, pub, p);
      }
    }
  }

  private onTrack = (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
    if (track.kind !== TrackKind.KIND_VIDEO) return;
    // Prefer the named FaceTime track, but accept any caller video (dev page, other bridges).
    if (this.stream && pub.name !== CALLER_VIDEO_TRACK) return;
    console.log(`[frames] reading video "${pub.name}" from ${p.identity}`);
    this.stream?.cancel().catch(() => {});
    const stream = new VideoStream(track);
    this.stream = stream;
    (async () => {
      for await (const ev of stream) {
        this.latest = { frame: ev.frame, rotation: ev.rotation, at: Date.now() };
      }
    })().catch((e) => console.warn('[frames] stream ended', e?.message ?? e));
  };

  get hasVideo() {
    return !!this.latest && Date.now() - this.latest.at < 3000;
  }

  /** Waits briefly so the caller's hand settles, then returns the newest frame as JPEG. */
  async grabJpeg(opts: { settleMs?: number; maxSide?: number; quality?: number } = {}): Promise<Buffer | null> {
    const { settleMs = 400, maxSide = 1280, quality = 85 } = opts;
    await new Promise((r) => setTimeout(r, settleMs));
    if (!this.hasVideo || !this.latest) return null;
    const { frame, rotation } = this.latest;
    const rgba = frame.convert(VideoBufferType.RGBA);
    const deg = { [VideoRotation.VIDEO_ROTATION_0]: 0, [VideoRotation.VIDEO_ROTATION_90]: 90, [VideoRotation.VIDEO_ROTATION_180]: 180, [VideoRotation.VIDEO_ROTATION_270]: 270 }[rotation] ?? 0;
    return sharp(Buffer.from(rgba.data), { raw: { width: rgba.width, height: rgba.height, channels: 4 } })
      .rotate(deg)
      .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
  }

  close() {
    this.room.off(RoomEvent.TrackSubscribed, this.onTrack);
    this.stream?.cancel().catch(() => {});
  }
}

export async function thumb(jpeg: Buffer, side = 320) {
  const small = await sharp(jpeg).resize(side, side, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
  return `data:image/jpeg;base64,${small.toString('base64')}`;
}
