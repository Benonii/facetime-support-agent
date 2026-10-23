import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import type { FixPlan, Intelligence, Observation } from '../contracts.js';
import type { ChertIMessage, Part } from './chert.js';

const BRAND = process.env.BRAND_NAME ?? 'Lumen Fiber';
const DEFAULT_SYMPTOM = 'my device is not working';
const NEXT = /^\s*(next|done|ok(ay)?|did it|yes|y|k)\b/i;
const TECH = /\b(tech|technician)\b/i;

/** The parts of a Chert `message.received` event we read. */
export interface InboundEvent {
  event_id: string;
  event_type: string;
  data: {
    chat: { id: string; is_group?: boolean };
    message: {
      id: string;
      direction?: string;
      sender_handle?: { handle: string; is_me?: boolean };
      parts: Array<{ type: string; value?: string; attachment_id?: string; mime_type?: string }>;
    };
  };
}

interface Chat {
  symptom?: string;
  jpeg?: Buffer;
  plan?: FixPlan;
  observation?: Observation;
  step: number;
}

export function createHandler(deps: { chert: ChertIMessage; intelligence: Intelligence }) {
  const { chert, intelligence } = deps;
  const chats = new Map<string, Chat>();
  const queues = new Map<string, Promise<void>>();

  const say = (chatId: string, text: string, media?: string) =>
    chert.send(chatId, [{ type: 'text', value: text }, ...(media ? [{ type: 'media', attachment_id: media } as Part] : [])]);

  async function sendStep(chatId: string, c: Chat, intro: string) {
    const text = c.plan!.steps[c.step - 1];
    await chert.typing(chatId);
    // Same call the live show_step tool makes: target.box points at the part for this step.
    const annotation = await intelligence.observe({ jpeg: c.jpeg!, step: text, previous: c.observation });
    const png = await annotate(c.jpeg!, annotation, `Step ${c.step} of ${c.plan!.steps.length}`, text);
    const media = await chert.uploadPng(png);
    const last = c.step === c.plan!.steps.length;
    const circled = annotation.target ? `\nI circled ${annotation.target.label} in the photo.` : '';
    await say(chatId, `${intro}Step ${c.step} of ${c.plan!.steps.length}: ${text}${circled}\n\n${last ? 'That is the last step. Reply DONE if it works now, or TECH and we will send a technician.' : 'Reply NEXT when you have done it.'}`, media);
  }

  async function handle(ev: InboundEvent) {
    const { chat, message } = ev.data;
    const text = message.parts.filter((p) => p.type === 'text').map((p) => p.value ?? '').join(' ').trim();
    const photo = message.parts.find((p) => p.type === 'media' && p.attachment_id);
    const c = chats.get(chat.id) ?? { step: 0 };
    chats.set(chat.id, c);
    console.log(`[imessage] ${chat.id.slice(0, 8)} in: ${photo ? '[photo] ' : ''}${text.slice(0, 80)}`);

    if (photo) {
      if (text) c.symptom = text;
      await chert.typing(chat.id);
      await say(chat.id, `Got it, I'm looking at your photo now. This takes about 30 seconds.`);
      const jpeg = await toJpeg(await chert.download(photo.attachment_id!));
      const observation = await intelligence.observe({ jpeg, previous: c.observation });
      if (!observation.device_visible) {
        await say(chat.id, `I can't see the device clearly in that one. ${observation.next_shot || 'Can you send a closer, well-lit photo of the front lights?'}`);
        return;
      }
      await chert.typing(chat.id);
      const plan = await intelligence.findFix({ jpeg, observation, symptom: c.symptom ?? DEFAULT_SYMPTOM });
      Object.assign(c, { jpeg, observation, plan, step: 1 });
      const seen = observation.findings.slice(0, 2).join('; ');
      await sendStep(chat.id, c, `I can see your ${[observation.device.brand, observation.device.type.replace('_', ' ')].filter(Boolean).join(' ')}${seen ? `: ${seen}` : ''}.\nLikely cause: ${plan.likely_cause}\n\n`);
      return;
    }

    if (c.plan && TECH.test(text)) {
      Object.assign(c, { plan: undefined, step: 0 });
      await say(chat.id, `No problem. I've sent your photo and diagnosis to the ${BRAND} technician team, so they arrive with the right part. They'll text you to pick a time.`);
      return;
    }
    if (c.plan && NEXT.test(text)) {
      if (c.step >= c.plan.steps.length) {
        Object.assign(c, { plan: undefined, step: 0 });
        await say(chat.id, `Great, glad it's working. Ticket closed, no technician visit needed. Text a photo any time you need help again.`);
        return;
      }
      c.step++;
      await sendStep(chat.id, c, '');
      return;
    }

    if (text) c.symptom = text;
    await say(chat.id, `Hi, I'm a customer support agent from ${BRAND}. How can I help you today?\n\nYou can text me a photo of your device and I'll circle what to fix.`);
  }

  /** Fire-and-forget per event, serialized per chat so replies stay in order. */
  return (ev: InboundEvent) => {
    const m = ev.data?.message;
    if (ev.event_type !== 'message.received' || !m || m.direction === 'outbound' || m.sender_handle?.is_me || ev.data.chat.is_group) return;
    const id = ev.data.chat.id;
    const next = (queues.get(id) ?? Promise.resolve()).then(() =>
      handle(ev).catch(async (e) => {
        console.warn('[imessage] failed', (e as Error).message);
        await say(id, `Sorry, I couldn't analyze that. Please try sending the photo again.`).catch(() => {});
      }),
    );
    queues.set(id, next);
    return next;
  };
}

/** Upright JPEG, max 1280 px, the shape intelligence expects. iPhones often send HEIC, which sharp can't read here. */
export async function toJpeg(bytes: Buffer): Promise<Buffer> {
  const isHeic = bytes.subarray(4, 8).toString('latin1') === 'ftyp' && /heic|heix|hevc|mif1|msf1/.test(bytes.subarray(8, 12).toString('latin1'));
  if (isHeic) bytes = await heicToJpeg(bytes);
  return sharp(bytes).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg().toBuffer();
}

async function heicToJpeg(heic: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'imsg-'));
  try {
    await writeFile(join(dir, 'in.heic'), heic);
    await promisify(execFile)('heif-convert', [join(dir, 'in.heic'), join(dir, 'out.jpg')]);
    return await readFile(join(dir, 'out.jpg'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The customer's photo with the part to touch circled, plus the step underneath. */
export async function annotate(jpeg: Buffer, o: Observation, title: string, step: string): Promise<Buffer> {
  const img = await loadImage(jpeg);
  const W = 960, pad = 32, pw = W - pad * 2, ph = Math.round((img.height * pw) / img.width);
  const g0 = createCanvas(W, 1).getContext('2d');
  g0.font = 'bold 34px sans-serif';
  const lines = wrap(g0, step, pw);
  const canvas = createCanvas(W, ph + pad * 2 + 70 + lines.length * 44);
  const g = canvas.getContext('2d');
  g.fillStyle = '#0b0f14';
  g.fillRect(0, 0, W, canvas.height);
  g.drawImage(img, pad, pad, pw, ph);
  const b = o.target?.box;
  if (o.device_visible && b?.length === 4 && b.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) && b[0] < b[2] && b[1] < b[3]) {
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 8;
    g.beginPath();
    g.ellipse(pad + ((b[0] + b[2]) / 2) * pw, pad + ((b[1] + b[3]) / 2) * ph, ((b[2] - b[0]) / 2) * pw + 14, ((b[3] - b[1]) / 2) * ph + 14, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#ffd23f';
  g.font = 'bold 28px sans-serif';
  g.fillText(title, pad, ph + pad + 50);
  g.fillStyle = '#e8edf2';
  g.font = 'bold 34px sans-serif';
  lines.forEach((l, i) => g.fillText(l, pad, ph + pad + 100 + i * 44));
  return canvas.encode('png');
}

function wrap(g: { measureText(t: string): { width: number } }, text: string, maxW: number) {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > maxW && line) {
      out.push(line);
      line = word;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}
