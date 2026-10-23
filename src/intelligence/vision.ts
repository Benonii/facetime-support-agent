import { Observation, type ObserveRequest } from '../contracts.js';

import { apiModel, type StructuredModel } from './model.js';

export function normalizeObservation(observation: Observation, step?: string): Observation {
  if (!observation.device_visible) {
    return {
      ...observation,
      device: { type: 'other', brand: '', model: '' },
      indicators: [], ports: [], target: null, confidence: 0,
      findings: ['No usable view of the device in this frame.'],
      next_shot: observation.next_shot || 'Hold the camera steady with the device and its lights in view.',
    };
  }
  const box = observation.target?.box;
  const valid = step?.trim() && box?.length === 4 &&
    box.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) &&
    box[0] < box[2] && box[1] < box[3];
  return { ...observation, target: valid ? observation.target : null };
}

const SYSTEM = `You are a field technician looking at one frame from a live FaceTime support call.
The customer is pointing their camera at a device that is not working (usually a router or modem).
- Report every status light: its label/icon, color, and whether it looks solid or blinking (one frame:
  say "unknown" if you cannot tell; a light caught mid-blink may look off).
- Report ports left to right and whether a cable is plugged in. Read model numbers from labels only if legible.
- If a current step is given, set target to the exact part the customer must touch for that step,
  with a tight normalized box [x0, y0, x1, y1]. This box is drawn on the customer's screen, so be precise.
- Only report what you can see. Never invent labels or model numbers; use an empty string when unknown.
- Earlier notes are context, not evidence of the current state. Report lights, ports, findings and
  target only from this frame; do not carry forward a disconnected cable after it is connected.
- If the requested part is obscured or uncertain, return target null and request a clearer view.
  Without a current step, return target null. If the device is not visible, say so.`;

export async function observe({ jpeg, ...opts }: ObserveRequest, generate: StructuredModel = apiModel()): Promise<Observation> {
  const result = await generate({
    jpeg, model: process.env.VISION_MODEL ?? 'gpt-5', schema: Observation, name: 'observation', instructions: SYSTEM,
    text: [
      opts.focus ? `Agent focus: ${opts.focus}` : '',
      opts.step ? `Current step for the customer: ${opts.step}` : '',
      opts.previous ? `Notes so far: ${JSON.stringify({ ...opts.previous, target: undefined })}` : 'First look at this device.',
    ].join('\n'),
  });
  return normalizeObservation(result, opts.step);
}
