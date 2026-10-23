import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { CallEvent, CallState } from '../../contracts.js';
import { GuideCard } from '../card.js';
import { createScenarios } from './scenarios.js';

const scenarios = await createScenarios();
const card = new GuideCard();
const app = new Hono();
const listeners = new Set<(event: CallEvent) => void>();
let latest: CallState | undefined;
let queue: Promise<unknown> = Promise.resolve();
const page = (file: string) => readFileSync(new URL(`../../../public/${file}`, import.meta.url), 'utf8');
const request = z.object({
  scenario: z.string(),
  instruction: z.string().max(600).optional(),
  caption: z.string().max(240).optional(),
  highlight: z.boolean().optional(),
}).strict();

app.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
app.use('/api/render', bodyLimit({ maxSize: 4096 }));
app.get('/', (c) => c.html(page('screens/studio.html')));
app.get('/dashboard', (c) => c.html(page('dashboard.html').replace('__TRUCK_ROLL_COST__', '150')));
app.get('/health', (c) => c.json({ ok: true, mode: 'screens-demo', liveCalls: false }));
app.get('/api/scenarios', (c) => c.json(scenarios.map(({ state, ...scenario }) => ({ ...scenario, stage: state.stage, instruction: state.step?.text ?? '', caption: state.screen?.caption?.text ?? '' }))));
app.post('/api/render', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Send a JSON scenario request.' }, 400); }
  const parsed = request.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid preview settings.' }, 400);
  const scenario = scenarios.find((item) => item.id === parsed.data.scenario);
  if (!scenario) return c.json({ error: 'Unknown scenario.' }, 404);
  const input = parsed.data;
  const run = queue.then(async () => {
    const state = structuredClone(scenario.state);
    if (input.instruction !== undefined) state.step = { n: state.step?.n ?? 1, text: input.instruction };
    if (input.caption !== undefined) state.screen = { ...state.screen, caption: { speaker: 'agent', text: input.caption } };
    if (input.highlight === false && state.observation) state.observation.target = null;
    await card.render(state);
    const [bright, dim] = await Promise.all([card.exportPng(true), card.exportPng(false)]);
    latest = state;
    const event: CallEvent = { type: 'state', callId: state.callId, state };
    for (const listener of listeners) listener(event);
    // The inspector deliberately omits raw image bytes. The image preview is returned separately.
    return {
      frames: [bright, dim].map((png) => `data:image/png;base64,${png.toString('base64')}`),
      context: card.getContext(),
      input: { ...state, lastSnapshot: state.lastSnapshot ? '[JPEG snapshot omitted]' : undefined },
      conversation: scenario.conversation,
    };
  });
  queue = run.catch(() => {});
  return c.json(await run);
});
app.get('/api/stream', (c) => streamSSE(c, async (stream) => {
  const send = (event: CallEvent) => { void stream.writeSSE({ data: JSON.stringify(event) }); };
  listeners.add(send);
  stream.onAbort(() => { listeners.delete(send); });
  if (latest) await stream.writeSSE({ data: JSON.stringify({ type: 'state', callId: latest.callId, state: latest }) });
  while (!stream.aborted) await stream.sleep(15_000).then(() => stream.writeSSE({ event: 'ping', data: '' }));
}));
app.onError((_error, c) => c.json({ error: 'The screen could not be rendered. Try another scenario.' }, 500));

// Independent of the shared LiveKit project. This server never joins or dispatches an agent.
const port = Number(process.env.SCREENS_PORT ?? 8790);
const hostname = process.env.SCREENS_HOST ?? '0.0.0.0';
const server = serve({ fetch: app.fetch, hostname, port }, () => {
  console.log(`[screens] Studio: http://localhost:${port}/`);
  console.log(`[screens] Dashboard: http://localhost:${port}/dashboard`);
  console.log('[screens] Scripted demo only. No API keys, camera, calls, or model usage.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  void card.close().then(() => { server.close(); process.exit(0); });
});
