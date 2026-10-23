import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Intelligence, Observation } from '../contracts.js';

export class RecordedCaseError extends Error {
  constructor(public stage: string, public timings: Record<string, number>, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Inference failed', { cause });
  }
}

/** Same bridge as the live tools, with one frozen frame for reproducibility. */
export async function runRecordedCase(intel: Intelligence, jpeg: Buffer, symptom: string, stepNumber = 1) {
  if (!Number.isInteger(stepNumber) || stepNumber < 1) throw new Error('step must be a positive integer');
  const timings: Record<string, number> = {};
  const timed = async <T>(stage: string, work: () => Promise<T>) => {
    const start = performance.now();
    try {
      const value = await work(); timings[stage] = Math.round(performance.now() - start); return value;
    } catch (cause) {
      timings[stage] = Math.round(performance.now() - start);
      throw new RecordedCaseError(stage, timings, cause);
    }
  };
  const observation = await timed('observeMs', () => intel.observe({ jpeg }));
  const plan = await timed('findFixIncludingSearchMs', () => intel.findFix({ jpeg, observation, symptom }));
  const text = plan.steps[stepNumber - 1];
  if (!text) throw new RecordedCaseError('selectStep', timings, new Error(`step ${stepNumber} is not in the returned plan (${plan.steps.length} steps)`));
  const annotation = await timed('annotateMs', () => intel.observe({ jpeg, step: text }));
  return { observation, plan, annotation, step: { n: stepNumber, text }, timings };
}

/** Standalone inspection artifact. Part 4 still owns the live GuideCard renderer. */
export async function renderPreview(jpeg: Buffer, annotation: Observation, instruction: string): Promise<Buffer> {
  const image = await loadImage(jpeg);
  const width = 960, margin = 32, photoWidth = width - margin * 2;
  const photoHeight = Math.round(image.height * photoWidth / image.width);
  const measure = createCanvas(width, 1).getContext('2d');
  measure.font = '28px sans-serif';
  const lines: string[] = []; let line = '';
  // Character wrapping also handles unusually long unbroken model strings.
  for (const char of instruction) {
    if (char === '\n' || measure.measureText(line + char).width > photoWidth) {
      lines.push(line); line = char === '\n' ? '' : char;
    } else line += char;
  }
  if (line) lines.push(line);
  const canvas = createCanvas(width, photoHeight + 140 + lines.length * 38);
  const g = canvas.getContext('2d');
  g.fillStyle = '#101820'; g.fillRect(0, 0, width, canvas.height);
  g.drawImage(image, margin, margin, photoWidth, photoHeight);
  const box = annotation.target?.box;
  if (annotation.device_visible && box?.length === 4 && box.every(n => Number.isFinite(n) && n >= 0 && n <= 1) && box[0] < box[2] && box[1] < box[3]) {
    const [x0,y0,x1,y1] = box;
    g.strokeStyle = '#ffd23f'; g.lineWidth = 5; g.beginPath();
    g.ellipse(margin + (x0+x1)/2*photoWidth, margin + (y0+y1)/2*photoHeight,
      (x1-x0)/2*photoWidth + 6, (y1-y0)/2*photoHeight + 6, 0, 0, Math.PI*2); g.stroke();
  }
  g.fillStyle = '#ffd23f'; g.font = '22px sans-serif';
  g.fillText('RECORDED-PHOTO INTELLIGENCE PREVIEW', margin, photoHeight+78);
  g.fillStyle = '#ffffff'; g.font = '28px sans-serif';
  lines.forEach((text,n) => g.fillText(text, margin, photoHeight+120+n*38));
  return canvas.encode('png');
}
