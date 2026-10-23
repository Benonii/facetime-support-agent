import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { Observation } from './types.js';

let client: OpenAI | undefined;
const openai = () => (client ??= new OpenAI());

const SYSTEM = `You are a field technician looking at one frame from a live FaceTime support call.
The customer is pointing their camera at a device that is not working (usually a router or modem).
- Report every status light: its label/icon, color, and whether it looks solid or blinking (one frame:
  say "unknown" if you cannot tell; a light caught mid-blink may look off).
- Report ports left to right and whether a cable is plugged in. Read model numbers from labels only if legible.
- If a current step is given, set target to the exact part the customer must touch for that step,
  with a tight normalized box [x0, y0, x1, y1]. This box is drawn on the customer's screen, so be precise.
- Only report what you can see. Never invent labels or model numbers.
- You get the notes from earlier frames. Merge, do not forget earlier findings.`;

export async function observeFrame(
  jpeg: Buffer,
  opts: { focus?: string; step?: string; previous?: Observation },
): Promise<Observation> {
  const model = process.env.VISION_MODEL ?? 'gpt-5';
  const res = await openai().responses.parse({
    model,
    // Keep tool latency low; the caller is waiting on the line.
    ...(/^(gpt-5|o\d)/.test(model) ? { reasoning: { effort: 'low' as const } } : {}),
    instructions: SYSTEM,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              opts.focus ? `Agent focus: ${opts.focus}` : '',
              opts.step ? `Current step for the customer: ${opts.step}` : '',
              opts.previous ? `Notes so far: ${JSON.stringify({ ...opts.previous, target: undefined })}` : 'First look at this device.',
            ].join('\n'),
          },
          { type: 'input_image', image_url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail: 'high' },
        ],
      },
    ],
    text: { format: zodTextFormat(Observation, 'observation') },
  });
  if (!res.output_parsed) throw new Error('vision: no parsed output');
  return res.output_parsed;
}
