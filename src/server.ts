import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import type { CallEvent } from './types.js';

const LK_URL = process.env.LIVEKIT_URL!;
const LK_HTTP = LK_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
const KEY = process.env.LIVEKIT_API_KEY!;
const SECRET = process.env.LIVEKIT_API_SECRET!;
const AGENT_NAME = process.env.AGENT_NAME || 'support-agent';
const BUDGET_MS = Number(process.env.CHERT_DECISION_BUDGET_MS ?? 4000);
const PARTICIPANT_KIND_AGENT = 4; // ParticipantInfo_Kind.AGENT (not re-exported by the SDK)

const rooms = new RoomServiceClient(LK_HTTP, KEY, SECRET);
const dispatch = new AgentDispatchClient(LK_HTTP, KEY, SECRET);

// ---------- LiveKit helpers ----------

interface Prepared {
  room: string;
  agentIdentity: string;
}

/** Create a room, dispatch our named agent into it, and wait until the agent has joined. */
async function prepareRoom(callId: string, deadline: number): Promise<Prepared> {
  const room = `support-${callId.slice(0, 8)}-${Date.now().toString(36)}`;
  await rooms.createRoom({ name: room, emptyTimeout: 600, departureTimeout: 20 });
  await dispatch.createDispatch(room, AGENT_NAME, { metadata: JSON.stringify({ call_id: callId }) });
  while (Date.now() < deadline) {
    const ps = await rooms.listParticipants(room);
    const agent = ps.find((p) => p.kind === PARTICIPANT_KIND_AGENT && p.tracks.length > 0); // joined + published its card
    if (agent) return { room, agentIdentity: agent.identity };
    await new Promise((r) => setTimeout(r, 150));
  }
  rooms.deleteRoom(room).catch(() => {});
  throw new Error('agent not ready before deadline');
}

async function mintToken(room: string, identity: string, ttlSeconds = 3600) {
  const at = new AccessToken(KEY, SECRET, { identity, ttl: ttlSeconds });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
  return at.toJwt();
}

// One pre-warmed room so we answer Chert well inside its 5 s decision deadline.
let warm: Promise<Prepared> | null = null;
function refillWarm() {
  warm = prepareRoom(`warm-${randomUUID()}`, Date.now() + 30_000);
  warm.catch((e) => {
    console.warn('[warm] failed:', e.message);
    warm = null;
    setTimeout(refillWarm, 5000);
  });
}

// ---------- Dashboard event bus ----------

const listeners = new Set<(ev: CallEvent) => void>();
const latest = new Map<string, CallEvent>();
function publish(ev: CallEvent) {
  latest.set(ev.callId, ev);
  for (const l of listeners) l(ev);
}

// ---------- HTTP ----------

const app = new Hono();
const page = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

app.get('/', (c) => c.html(page('dashboard.html').replace('__TRUCK_ROLL_COST__', String(Number(process.env.TRUCK_ROLL_COST ?? 150)))));
app.get('/phone', (c) => c.html(page('dev-phone.html')));
app.get('/health', (c) => c.json({ ok: true, warm: !!warm }));

// Chert BYOR webhook. Configure this URL as the line's HTTPS Integration URL, inbound policy customer_decides.
const seen = new Map<string, Promise<Prepared>>();
async function prepareForCall(callId: string, deadline: number): Promise<Prepared> {
  // Take the warm room synchronously so two calls never share it, then start warming the next one.
  const w = warm;
  if (w) refillWarm();
  const halfBudget = new Promise<null>((r) => setTimeout(() => r(null), Math.max(0, (deadline - Date.now()) / 2)));
  const fromWarm = w ? await Promise.race([w.catch(() => null), halfBudget]) : null;
  return fromWarm ?? prepareRoom(callId, deadline);
}

app.post('/webhooks/chert', async (c) => {
  const ev = await c.req.json<{ event_id: string; type: string; created_at: string; data: { call_id: string; media?: { video?: boolean } } }>();
  const callId = ev.data?.call_id;
  console.log(`[chert] ${ev.type} ${callId}`);

  if (ev.type === 'call.incoming') {
    const deadline = Date.parse(ev.created_at) + BUDGET_MS;
    try {
      // Retries and concurrent duplicates must get the same room, not a second agent.
      if (!seen.has(callId)) seen.set(callId, prepareForCall(callId, deadline));
      const prepared = await seen.get(callId)!;
      const token = await mintToken(prepared.room, `chert-bridge-${callId.slice(0, 8)}`, 3600);
      return c.json({
        action: 'accept',
        livekit_url: LK_URL,
        participant_token: token,
        remote_participant_identity: prepared.agentIdentity,
      });
    } catch (e) {
      seen.delete(callId);
      console.warn('[chert] declining:', (e as Error).message);
      return c.json({ action: 'decline' });
    }
  }

  if (ev.type === 'call.ended' || ev.type === 'call.failed') {
    const prepared = seen.get(callId);
    seen.delete(callId);
    prepared?.then((p) => rooms.deleteRoom(p.room)).catch(() => {});
  }
  return c.json({ ok: true });
});

// Dev path: open /phone on any device with a camera. It joins as a fake FaceTime caller.
app.post('/api/dev-session', async (c) => {
  const callId = `dev-${randomUUID()}`;
  const prepared = await prepareRoom(callId, Date.now() + 20_000);
  const token = await mintToken(prepared.room, `dev-phone-${callId.slice(4, 10)}`, 1800);
  return c.json({ url: LK_URL, token, room: prepared.room, callId });
});

// Agent -> dashboard
app.post('/api/events', async (c) => {
  publish(await c.req.json<CallEvent>());
  return c.json({ ok: true });
});

app.get('/api/stream', (c) =>
  streamSSE(c, async (stream) => {
    for (const ev of latest.values()) await stream.writeSSE({ data: JSON.stringify(ev) });
    const send = (ev: CallEvent) => void stream.writeSSE({ data: JSON.stringify(ev) });
    listeners.add(send);
    stream.onAbort(() => {
      listeners.delete(send);
    });
    while (!stream.aborted) await stream.sleep(15_000).then(() => stream.writeSSE({ event: 'ping', data: '' }));
  }),
);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[server] http://localhost:${port}  (dashboard /, dev phone /phone, webhook POST /webhooks/chert)`);
  if (process.env.WARM_POOL !== '0') refillWarm();
});
