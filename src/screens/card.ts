import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { LocalVideoTrack, type Room, TrackPublishOptions, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';
import { type CallerScreen, type CallState, type Observation, type ScreenContext, TRACKS } from '../contracts.js';
import { present } from './presenter.js';

export const CARD_WIDTH = 720;
export const CARD_HEIGHT = 1280;
const W = CARD_WIDTH, H = CARD_HEIGHT;
const C = { bg: '#0b1512', panel: '#15231d', line: '#2c3b31', text: '#f5f6eb', dim: '#a3b2a3', accent: '#d2f58a', ring: '#ffe29a' };
const LED: Record<string, string> = { green: '#a5e5a2', white: '#edf0e8', blue: '#8bbbf9', amber: '#ffc479', red: '#fa9b8b', purple: '#d0b1f5', off: '#627268', other: '#c4cdc2' };
type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

/** Publishes from the same participant as agent speech. Chert relays this camera track unchanged. */
export class GuideCard implements CallerScreen {
  private source?: VideoSource;
  private track?: LocalVideoTrack;
  private canvas = createCanvas(W, H);
  private frames: VideoFrame[] = [];
  private pngs: Buffer[] = [];
  private timer?: NodeJS.Timeout;
  private tick = 0;
  private sequence = 0;
  private closed = false;
  private snap?: Image;
  private snapSrc?: string;
  private observation?: Observation;
  private observationSnapshot?: string;
  private context?: ScreenContext;
  private renderedInstruction = '';
  private renderedCaption = '';
  private brand: string;

  constructor(options: { brand?: string } = {}) {
    this.brand = options.brand ?? process.env.BRAND_NAME ?? 'Lumen Fiber';
  }

  async publish(room: Room) {
    if (this.closed) throw new Error('Cannot publish a closed caller screen.');
    if (this.source) return;
    if (!room.localParticipant) throw new Error('Join the LiveKit room before publishing the caller screen.');
    this.source = new VideoSource(W, H);
    const track = LocalVideoTrack.createVideoTrack(TRACKS.agentVideo, this.source);
    this.track = track;
    const options = new TrackPublishOptions();
    options.source = TrackSource.SOURCE_CAMERA;
    await room.localParticipant.publishTrack(track, options);
    this.timer = setInterval(() => {
      const frame = this.frames[Math.floor(this.tick++ / 5) % 2];
      if (frame) this.source?.captureFrame(frame);
    }, 100); // Stable 10 fps, including when there is no new observation.
  }

  async render(input: CallState) {
    if (this.closed) return;
    const sequence = ++this.sequence;
    // The agent mutates CallState between awaits. Render a coherent copy of this update.
    if (input.observation !== this.observation) {
      this.observation = input.observation;
      this.observationSnapshot = input.lastSnapshot;
    }
    const annotationCurrent = !input.observation || this.observationSnapshot === input.lastSnapshot;
    const state = structuredClone(input);
    let image: Image | undefined;
    if (state.lastSnapshot) {
      if (state.lastSnapshot === this.snapSrc) image = this.snap;
      else {
        try {
          if (!/^data:image\/(jpeg|png|webp);base64,/.test(state.lastSnapshot)) throw new Error('Unsupported snapshot.');
          image = await loadImage(Buffer.from(state.lastSnapshot.split(',')[1], 'base64'));
        } catch {
          state.lastSnapshot = undefined; // A bad image must not leave an old photo on screen.
        }
      }
    }
    if (this.closed || sequence !== this.sequence) return;
    this.snap = image;
    this.snapSrc = state.lastSnapshot;
    this.context = present(state, annotationCurrent);
    this.frames = [];
    this.pngs = [];
    for (const bright of [true, false]) {
      this.frames.push(this.draw(state, bright));
      this.pngs.push(this.canvas.encodeSync('png'));
    }
    const instructionTruncated = this.renderedInstruction !== this.context.instruction.replace(/\s+/g, ' ').trim();
    const captionTruncated = this.renderedCaption !== this.context.caption.text.replace(/\s+/g, ' ').trim();
    this.context = {
      ...this.context,
      instruction: this.renderedInstruction,
      caption: { ...this.context.caption, text: this.renderedCaption },
      issues: [...this.context.issues,
        ...(instructionTruncated ? ['The instruction was shortened to fit; use a shorter step.'] : []),
        ...(captionTruncated ? ['The caption was shortened to fit; use a shorter caption.'] : [])],
    };
    if (!this.closed && sequence === this.sequence && this.frames[0]) this.source?.captureFrame(this.frames[0]);
  }

  getContext(): ScreenContext | undefined {
    return this.context ? structuredClone(this.context) : undefined;
  }

  /** The demo exports the exact pixels used by the live video publisher. */
  async exportPng(bright = true): Promise<Buffer> {
    const png = this.pngs[bright ? 0 : 1];
    if (!png) throw new Error('Render a call state before exporting the caller screen.');
    return Buffer.from(png);
  }

  private draw(state: CallState, bright: boolean): VideoFrame {
    const g = this.canvas.getContext('2d');
    const view = this.context!;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    // Compact brand mark and connection status keep the video legible on a phone.
    panel(g, 32, 36, 42, 42, 14, C.accent);
    g.strokeStyle = C.bg; g.lineWidth = 3;
    g.beginPath(); g.moveTo(45, 57); g.lineTo(51, 63); g.lineTo(63, 49); g.stroke();
    text(g, this.brand, 89, 65, 29, C.text, 'bold');
    panel(g, 563, 39, 125, 36, 18, C.panel);
    dot(g, 582, 57, 4, C.accent); text(g, 'SUPPORT', 596, 63, 16, C.accent, 'bold');
    text(g, STAGES[state.stage], 34, 127, 17, C.accent, 'bold');
    fitText(g, view.title, 32, 181, 656, 2, 49, 55, C.text, 'bold');
    const device = state.observation?.device;
    const identifiedDevice = [device?.brand, device?.model].filter(Boolean).join(' ')
      || (device?.type && device.type !== 'other' ? device.type.replaceAll('_', ' ') : '');
    const deviceName = identifiedDevice || 'Visual support, one step at a time';
    fitText(g, deviceName, 34, 244, 650, 1, 23, 29, C.dim);

    const photo = { x: 32, y: 270, w: 656, h: 492 };
    panel(g, photo.x, photo.y, photo.w, photo.h, 28, C.panel);
    if (state.stage === 'resolved' || state.stage === 'technician') {
      const success = state.stage === 'resolved';
      dot(g, 360, 460, 91, success ? C.accent : '#d8dcca');
      g.strokeStyle = C.bg; g.lineWidth = 10; g.lineCap = 'round';
      g.beginPath();
      if (success) { g.moveTo(318, 460); g.lineTo(349, 490); g.lineTo(405, 426); }
      else { g.arc(360, 443, 24, Math.PI, 0); g.moveTo(322, 498); g.quadraticCurveTo(360, 462, 398, 498); }
      g.stroke();
      center(g, success ? 'Fixed, together.' : 'Your case stays with you.', 360, 615, 34, C.text, 'bold');
      center(g, success ? 'One less thing to worry about.' : 'Observations and steps, ready to hand over.', 360, 658, 22, C.dim);
    } else if (this.snap && state.lastSnapshot) {
      const scale = Math.min((photo.w - 28) / this.snap.width, (photo.h - 28) / this.snap.height);
      const width = this.snap.width * scale, height = this.snap.height * scale;
      const x = photo.x + (photo.w - width) / 2, y = photo.y + (photo.h - height) / 2;
      g.save(); g.beginPath(); g.roundRect(photo.x + 1, photo.y + 1, photo.w - 2, photo.h - 2, 27); g.clip();
      g.drawImage(this.snap, x, y, width, height);
      if (view.highlightVisible && state.observation?.target) {
        const [x0, y0, x1, y1] = state.observation.target.box;
        g.strokeStyle = bright ? C.ring : '#bcad79'; g.lineWidth = bright ? 8 : 5;
        g.beginPath(); g.ellipse(x + (x0 + x1) / 2 * width, y + (y0 + y1) / 2 * height,
          (x1 - x0) * width / 2 + 12, (y1 - y0) * height / 2 + 12, 0, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
      panel(g, 48, 286, view.view === 'snapshot' ? 180 : 239, 34, 17, C.bg);
      text(g, view.view === 'snapshot' ? 'CAMERA SNAPSHOT' : 'CHECKING THIS VIEW', 62, 308, 14, C.text, 'bold');
      if (view.highlightVisible) {
        panel(g, 48, 702, 624, 43, 15, C.bg);
        dot(g, 67, 723, 4, C.ring);
        fitText(g, view.highlightedPart!, 83, 730, 570, 1, 21, 25, C.ring, 'bold');
      }
    } else {
      g.strokeStyle = '#6e886b'; g.lineWidth = 3;
      g.beginPath(); g.roundRect(300, 411, 120, 88, 20); g.stroke();
      g.beginPath(); g.arc(360, 455, 23, 0, Math.PI * 2); g.stroke();
      center(g, 'Show me what you see.', 360, 570, 32, C.text, 'bold');
      center(g, 'Device in frame. Labels facing you.', 360, 615, 22, C.dim);
    }

    const observationCurrent = state.observation?.device_visible && view.view === 'snapshot';
    const signals = observationCurrent ? [
      ...state.observation!.indicators.map((led) => ({ label: `${led.label} · ${led.color}`, color: LED[led.color] ?? C.dim })),
      ...state.observation!.ports.map((port) => ({ label: `${port.label} · ${port.cable_connected ? 'connected' : 'open'}`, color: port.cable_connected ? C.accent : C.ring })),
    ].slice(0, 3) : [];
    if (signals.length && !['resolved', 'technician'].includes(state.stage)) {
      const chipW = (656 - (signals.length - 1) * 10) / signals.length;
      signals.forEach((signal, index) => {
        const x = 32 + index * (chipW + 10);
        panel(g, x, 780, chipW, 50, 15, C.panel);
        dot(g, x + 20, 805, 6, signal.color);
        fitText(g, signal.label, x + 34, 812, chipW - 47, 1, 18, 24, C.text);
      });
    } else {
      const finding = observationCurrent ? state.observation!.findings.map((item) => item.trim()).find(Boolean) : undefined;
      fitText(g, finding ? `Observed · ${finding}`
        : view.view === 'awaiting_analysis' ? 'Fresh photo received. Checking the details.'
        : view.view === 'unclear' ? 'A little more light or a closer view will help.'
        : state.stage === 'resolved' ? 'SESSION COMPLETE' : 'We’ll keep the next step clear.', 36, 813, 648, 1, 21, 25, C.dim);
    }

    text(g, view.caption.speaker === 'caller' ? 'YOU' : view.caption.speaker === 'agent' ? 'ALEX' : 'YOUR GUIDE', 35, 868, 15, C.dim, 'bold');
    this.renderedCaption = fitText(g, view.caption.text, 34, 902, 650, 2, 25, 32, C.text);

    panel(g, 32, 978, 656, 220, 26, state.stage === 'resolved' ? C.accent : '#203228');
    const ink = state.stage === 'resolved' ? C.bg : C.text;
    const kicker = state.stage === 'resolved' ? 'CASE CLOSED' : state.stage === 'technician' ? 'NEXT SUPPORT STEP'
      : state.step && view.view === 'snapshot' ? `STEP ${state.step.n}${state.plan ? ` OF ${state.plan.steps.length}` : ''}`
      : state.stage === 'diagnosing' ? 'WORKING ON IT' : 'NEXT';
    text(g, kicker, 57, 1018, 16, state.stage === 'resolved' ? '#3c5131' : C.accent, 'bold');
    this.renderedInstruction = fitText(g, view.instruction, 56, 1066, 608, 3, 34, 40, ink, 'bold');
    if (state.step && state.plan && view.view === 'snapshot' && state.stage === 'guiding') {
      const count = Math.min(state.plan.steps.length, 6), gap = 7, width = (608 - (count - 1) * gap) / count;
      for (let i = 0; i < count; i++) panel(g, 56 + i * (width + gap), 1178, width, 4, 2, i < state.step.n ? C.accent : '#486047');
    }
    dot(g, 42, 1239, 5, view.phase === 'thinking' ? '#e7cd88' : C.accent);
    text(g, PHASES[view.phase], 58, 1247, 20, C.dim);
    text(g, 'LUMEN CARE', 543, 1247, 15, C.dim, 'bold');
    const { data } = g.getImageData(0, 0, W, H);
    return new VideoFrame(new Uint8Array(data), W, H, VideoBufferType.RGBA);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.sequence++;
    clearInterval(this.timer);
    this.frames = []; this.pngs = []; this.snap = undefined;
    await this.track?.close(false);
    await this.source?.close();
  }
}

const STAGES: Record<CallState['stage'], string> = {
  waiting: 'LET’S START HERE', looking: 'TAKING A LOOK', diagnosing: 'CONNECTING THE DOTS',
  guiding: 'LET’S TRY THIS', resolved: 'ALL TAKEN CARE OF', technician: 'THE NEXT STEP',
};
const PHASES: Record<ScreenContext['phase'], string> = {
  listening: 'Listening · take your time', thinking: 'Checking the details', speaking: 'Alex is speaking', waiting: 'Your turn · I’m here',
};
function panel(g: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  g.fillStyle = color; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
}
function dot(g: Ctx, x: number, y: number, r: number, color: string) {
  g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function text(g: Ctx, value: string, x: number, y: number, size: number, color: string, weight = 'normal') {
  g.fillStyle = color; g.font = `${weight} ${size}px sans-serif`; g.fillText(value, x, y);
}
function center(g: Ctx, value: string, x: number, y: number, size: number, color: string, weight = 'normal') {
  g.font = `${weight} ${size}px sans-serif`; text(g, value, x - g.measureText(value).width / 2, y, size, color, weight);
}
/** Bounded layout: long instructions shrink, then ellipsize; they never spill into another panel. */
function fitText(g: Ctx, value: string, x: number, y: number, maxWidth: number, maxLines: number, size: number, lineHeight: number, color: string, weight = 'normal') {
  let lines: string[] = [];
  const words = String(value).replace(/\s+/g, ' ').trim().split(' ');
  for (let font = size; font >= size - 6; font -= 2) {
    g.font = `${weight} ${font}px sans-serif`;
    lines = [''];
    for (const word of words) {
      const last = lines.length - 1;
      if (lines[last] && g.measureText(`${lines[last]} ${word}`).width > maxWidth) lines.push(word);
      else lines[last] += `${lines[last] ? ' ' : ''}${word}`;
    }
    if (lines.length <= maxLines || font === size - 6) { size = font; break; }
  }
  if (lines.length > maxLines) lines[maxLines - 1] += '…';
  const visible: string[] = [];
  for (const [index, original] of lines.slice(0, maxLines).entries()) {
    let line = original;
    g.font = `${weight} ${size}px sans-serif`;
    while (g.measureText(line).width > maxWidth && line.length > 1) line = line.slice(0, -2) + '…';
    text(g, line, x, y + index * lineHeight, size, color, weight);
    visible.push(line);
  }
  return visible.join(' ');
}
