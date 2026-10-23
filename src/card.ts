import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { LocalVideoTrack, type Room, TrackPublishOptions, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';
import type { CallState } from './types.js';

// Portrait, because the caller is on an iPhone.
const W = 720;
const H = 1280;
const FPS = 10;
const BRAND = process.env.BRAND_NAME ?? 'Lumen Fiber';

const C = { bg: '#0b0f14', panel: '#151b23', text: '#e8edf2', dim: '#8b98a5', accent: '#3ddc97', ring: '#ffd23f', bad: '#ff5d5d' };
const LED: Record<string, string> = { green: '#3ddc97', white: '#f2f2f2', blue: '#4ea8ff', amber: '#ffb020', red: '#ff5d5d', purple: '#b57bff', off: '#3a434d', other: '#8b98a5' };

/**
 * The agent's "face" on FaceTime: the customer's own device, frozen, with the part to touch circled,
 * plus the current step in big type. Two frames alternate so the circle blinks.
 */
export class GuideCard {
  private source = new VideoSource(W, H);
  private canvas = createCanvas(W, H);
  private frames: VideoFrame[] = [];
  private tick = 0;
  private timer?: NodeJS.Timeout;
  private snap?: Image;
  private snapSrc?: string;

  async publish(room: Room) {
    const track = LocalVideoTrack.createVideoTrack('agent-guide-card', this.source);
    const opts = new TrackPublishOptions();
    opts.source = TrackSource.SOURCE_CAMERA;
    await room.localParticipant!.publishTrack(track, opts);
    // VideoSource wants a steady stream of frames; alternate the two renders (~2 blinks/s).
    this.timer = setInterval(() => {
      this.tick++;
      const f = this.frames.at(Math.floor(this.tick / 3) % this.frames.length);
      if (f) this.source.captureFrame(f);
    }, 1000 / FPS);
  }

  async render(s: CallState) {
    if (s.lastSnapshot && s.lastSnapshot !== this.snapSrc) {
      this.snapSrc = s.lastSnapshot;
      this.snap = await loadImage(Buffer.from(s.lastSnapshot.split(',')[1], 'base64'));
    }
    this.frames = [this.draw(s, true), this.draw(s, false)];
    this.source.captureFrame(this.frames[0]);
  }

  private draw(s: CallState, ringOn: boolean): VideoFrame {
    const g = this.canvas.getContext('2d');
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);

    g.fillStyle = C.accent;
    g.font = 'bold 40px sans-serif';
    g.fillText(`${BRAND} Support`, 40, 90);
    g.fillStyle = C.dim;
    g.font = '28px sans-serif';
    g.fillText(STAGE_LABEL[s.stage], 40, 136);

    // The customer's device as we last saw it, with the target circled.
    const box = { x: 40, y: 170, w: W - 80, h: 620 };
    roundRect(g, box.x, box.y, box.w, box.h, 28, C.panel);
    if (this.snap) {
      const scale = Math.min((box.w - 32) / this.snap.width, (box.h - 32) / this.snap.height);
      const w = this.snap.width * scale, h = this.snap.height * scale;
      const ix = box.x + (box.w - w) / 2, iy = box.y + (box.h - h) / 2;
      g.drawImage(this.snap, ix, iy, w, h);
      const t = s.observation?.target;
      if (t && t.box.length === 4 && ringOn) {
        const [x0, y0, x1, y1] = t.box;
        g.strokeStyle = C.ring;
        g.lineWidth = 8;
        g.beginPath();
        g.ellipse(ix + ((x0 + x1) / 2) * w, iy + ((y0 + y1) / 2) * h, (Math.abs(x1 - x0) * w) / 2 + 18, (Math.abs(y1 - y0) * h) / 2 + 18, 0, 0, Math.PI * 2);
        g.stroke();
      }
    } else {
      g.fillStyle = C.dim;
      g.font = '30px sans-serif';
      g.fillText('Point your camera at the device', 130, box.y + box.h / 2);
    }

    // Status lights we read, as dots, so the customer sees we are looking at the same thing.
    let y = 840;
    const o = s.observation;
    if (o) {
      g.font = '26px sans-serif';
      let x = 40;
      for (const l of o.indicators.slice(0, 5)) {
        g.fillStyle = LED[l.color] ?? C.dim;
        g.beginPath();
        g.arc(x + 12, y - 9, 12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = C.text;
        const label = l.label.slice(0, 10);
        g.fillText(label, x + 32, y);
        x += 32 + g.measureText(label).width + 28;
        if (x > W - 140) break;
      }
      y += 50;
    }

    if (s.stage === 'resolved' || s.stage === 'technician') {
      roundRect(g, 40, 940, W - 80, 260, 28, s.stage === 'resolved' ? C.accent : C.panel);
      g.fillStyle = s.stage === 'resolved' ? C.bg : C.text;
      g.font = 'bold 56px sans-serif';
      g.fillText(s.stage === 'resolved' ? 'Fixed ✓' : 'Technician booked', 80, 1030);
      g.font = '30px sans-serif';
      wrap(g, s.stage === 'resolved' ? 'No visit needed. Ticket closed.' : `${s.ticket?.window ?? ''} · diagnosis sent ahead`, 80, 1090, W - 160, 40);
    } else if (s.step) {
      roundRect(g, 40, 940, W - 80, 290, 28, C.panel);
      g.fillStyle = C.ring;
      g.font = 'bold 30px sans-serif';
      g.fillText(`Step ${s.step.n}${s.plan ? ` of ${s.plan.steps.length}` : ''}`, 80, 1000);
      g.fillStyle = C.text;
      g.font = 'bold 40px sans-serif';
      wrap(g, s.step.text, 80, 1060, W - 160, 50);
    } else if (s.plan) {
      g.fillStyle = C.text;
      g.font = '30px sans-serif';
      wrap(g, `Likely cause: ${s.plan.likely_cause}`, 40, Math.max(y, 960), W - 80, 40);
    }

    const { data } = g.getImageData(0, 0, W, H);
    return new VideoFrame(new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)), W, H, VideoBufferType.RGBA);
  }

  async close() {
    clearInterval(this.timer);
    await this.source.close();
  }
}

const STAGE_LABEL: Record<CallState['stage'], string> = {
  waiting: 'Live video support',
  looking: 'Looking at your device…',
  diagnosing: 'Checking the manual…',
  guiding: 'Follow along',
  resolved: 'All set',
  technician: 'Help is on the way',
};

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string) {
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

function wrap(g: Ctx, text: string, x: number, y: number, maxW: number, lh: number) {
  let line = '';
  for (const word of text.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > maxW && line) {
      g.fillText(line, x, y);
      line = word;
      y += lh;
    } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}
