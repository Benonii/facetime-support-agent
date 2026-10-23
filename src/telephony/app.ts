import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { CallEvent, ChertDecision, ChertEvent, JobMetadata } from '../contracts.js';
import { type LiveKitOps, mintToken } from './livekit.js';

export interface TelephonyConfig {
  livekitUrl: string; // wss://… handed to Chert and the dev phone
  apiKey: string;
  apiSecret: string;
  agentName: string;
  budgetMs: number; // how long after Chert's created_at we may take to answer (Chert's hard limit is ~5 s)
  truckRollCost: number;
  warmPool: boolean;
  pollMs?: number; // how often to check whether the agent joined
  warmRetryMs?: number;
  warmMaxAgeMs?: number; // replace the warm room this often (must stay under the room's 600 s emptyTimeout)
  log?: (msg: string) => void;
}

interface Prepared {
  room: string;
  agentIdentity: string;
}

const STAGES = ['waiting', 'looking', 'diagnosing', 'guiding', 'resolved', 'technician'];

/** Part 2 → Part 1 input check. Keeps a bad POST from breaking every dashboard. */
export function isCallEvent(x: any): x is CallEvent {
  if (!x || typeof x.callId !== 'string' || !x.callId) return false;
  if (x.type === 'call.started' || x.type === 'call.ended') return true;
  return x.type === 'state' && !!x.state && STAGES.includes(x.state.stage);
}

export function createTelephony(lk: LiveKitOps, cfg: TelephonyConfig) {
  const log = cfg.log ?? ((m: string) => console.log(m));
  const pollMs = cfg.pollMs ?? 150;
  const timers = new Set<NodeJS.Timeout>();
  let stopped = false;
  const sleep = (ms: number) =>
    new Promise<void>((r) => {
      const t = setTimeout(() => (timers.delete(t), r()), ms);
      timers.add(t);
    });

  /** Create a room, dispatch our agent with JobMetadata, and wait until the agent has joined and published. */
  async function prepareRoom(callId: string, deadline: number): Promise<Prepared> {
    const room = `support-${callId.slice(0, 8)}-${Date.now().toString(36)}`;
    await lk.createRoom(room);
    const metadata: JobMetadata = { call_id: callId };
    await lk.dispatchAgent(room, cfg.agentName, metadata).catch((e) => {
      lk.deleteRoom(room).catch(() => {});
      throw e;
    });
    while (Date.now() < deadline && !stopped) {
      const agentIdentity = await lk.readyAgent(room);
      if (agentIdentity) return { room, agentIdentity };
      await sleep(pollMs);
    }
    lk.deleteRoom(room).catch(() => {});
    throw new Error('agent not ready before deadline (is `npm run agent` running with the same AGENT_NAME?)');
  }

  // ---------- Warm pool of 1: a room with the agent already inside, so call.incoming answers in ms ----------
  // LiveKit closes a room nobody human joined after emptyTimeout (600 s), and an agent restart (`npm run agent`
  // reloads on save) leaves the room without its agent. So the warm room is swapped for a fresh one every
  // warmMaxAgeMs, and re-checked when a call takes it.

  const warmMaxAgeMs = cfg.warmMaxAgeMs ?? 4 * 60_000;
  let warm: Promise<Prepared> | null = null;
  let warmReady = false;
  const newWarm = () => prepareRoom(`warm-${randomUUID()}`, Date.now() + 30_000);
  const drop = (room: string) => lk.deleteRoom(room).catch(() => {});

  function refillWarm() {
    if (stopped) return;
    const p = newWarm();
    warm = p;
    p.then(
      (w) => {
        if (warm !== p) return; // a call took it while it warmed up
        warmReady = true;
        log(`[warm] ready ${w.room}`);
        scheduleRecycle(p, w);
      },
      (e) => {
        log(`[warm] failed: ${e.message}`);
        // Only clear the slot if it still holds this attempt; a call may already have taken it and refilled.
        if (warm === p) {
          warm = null;
          sleep(cfg.warmRetryMs ?? 5000).then(() => warm === null && refillWarm());
        }
      },
    );
  }

  /** Build the replacement first, then swap, so there is never a gap without a ready warm room. */
  function scheduleRecycle(p: Promise<Prepared>, w: Prepared) {
    sleep(warmMaxAgeMs).then(() => {
      if (stopped || warm !== p) return;
      const next = newWarm();
      next.then(
        (nw) => {
          if (stopped || warm !== p) return void drop(nw.room); // a call took the old one and refilled already
          warm = next;
          drop(w.room);
          log(`[warm] recycled ${w.room} → ${nw.room}`);
          scheduleRecycle(next, nw);
        },
        (e) => {
          log(`[warm] recycle failed: ${e.message}`);
          scheduleRecycle(p, w); // keep the old one (the take-time check guards it) and try again later
        },
      );
    });
  }

  /** Take the warm room (synchronously, so two calls never share it), else build a fresh one. */
  async function prepareForCall(callId: string, deadline: number): Promise<Prepared> {
    const w = warm;
    warm = null;
    warmReady = false;
    if (cfg.warmPool) refillWarm();
    if (w) {
      // A warm room still warming up gets half the budget; then fall back to a fresh room.
      const half = sleep(Math.max(0, (deadline - Date.now()) / 2)).then(() => null);
      const got = await Promise.race([w.catch(() => null), half]);
      // Is the agent still in it? One listParticipants round trip, and it catches a closed room or a dead agent.
      if (got && (await lk.readyAgent(got.room).catch(() => null)) === got.agentIdentity) return got;
      if (got) {
        log(`[warm] ${got.room} lost its agent, using a fresh room`);
        drop(got.room);
      } else {
        w.then((late) => drop(late.room), () => {}); // nobody will use it now; free the agent
      }
    }
    return prepareRoom(callId, deadline);
  }

  // ---------- Dashboard event bus (Part 2 POSTs CallEvent, Part 4 listens on SSE) ----------

  const listeners = new Set<(ev: CallEvent) => void>();
  const latest = new Map<string, CallEvent>();
  function publish(ev: CallEvent) {
    latest.set(ev.callId, ev);
    for (const l of listeners) l(ev);
  }

  // ---------- HTTP ----------

  const app = new Hono();
  // Access log for every route, so we can see which APIs get hit (no bodies, headers or tokens).
  app.use('*', async (c, next) => {
    const t0 = Date.now();
    await next();
    log(`[http] ${c.req.method} ${c.req.path} → ${c.res.status} in ${Date.now() - t0} ms`);
  });
  const page = (f: string) => readFileSync(new URL(`../../public/${f}`, import.meta.url), 'utf8');

  app.get('/', (c) => c.html(page('dashboard.html').replace('__TRUCK_ROLL_COST__', String(cfg.truckRollCost))));
  app.get('/phone', (c) => c.html(page('dev-phone.html')));
  app.get('/health', (c) => c.json({ ok: true, warm_room_ready: warmReady, active_calls: seen.size }));

  // Chert BYOR webhook. Line policy customer_decides, Integration URL https://<tunnel>/webhooks/chert.
  const seen = new Map<string, Promise<Prepared>>();
  app.post('/webhooks/chert', async (c) => {
    const t0 = Date.now();
    const ev = await c.req.json<ChertEvent>().catch(() => null);
    const callId = ev?.data?.call_id;
    if (!ev || !callId) {
      log(`[chert] rejected webhook: ${ev ? `type ${ev.type ?? '?'} without data.call_id` : 'body is not JSON'}`);
      return c.json({ error: 'expected a Chert event with data.call_id' }, 400);
    }
    const media = ev.data.media ? `audio=${ev.data.media.audio} video=${ev.data.media.video}` : 'media=?';
    log(`[chert] ${ev.type} ${callId} line=${ev.data.line_id ?? '?'} ${media} lag=${Date.now() - Date.parse(ev.created_at)} ms`);

    if (ev.type === 'call.incoming') {
      // Chert's clock and ours can disagree; never plan past our own budget either. If Chert's clock is behind ours,
      // created_at looks old and the deadline would already be past, so a cold room still gets a short try.
      const created = Date.parse(ev.created_at);
      const fromChert = Number.isFinite(created) ? created + cfg.budgetMs : Infinity;
      const deadline = Math.max(Math.min(fromChert, t0 + cfg.budgetMs), t0 + Math.min(1500, cfg.budgetMs));
      try {
        // Retries and concurrent duplicates must get the same room, not a second agent.
        if (!seen.has(callId)) seen.set(callId, prepareForCall(callId, deadline));
        const prepared = await seen.get(callId)!;
        const token = await mintToken(cfg.apiKey, cfg.apiSecret, prepared.room, `chert-bridge-${callId.slice(0, 8)}`, 3600);
        log(`[chert] accept ${callId} → ${prepared.room} in ${Date.now() - t0} ms`);
        return c.json<ChertDecision>({
          action: 'accept',
          livekit_url: cfg.livekitUrl,
          participant_token: token,
          remote_participant_identity: prepared.agentIdentity,
        });
      } catch (e) {
        seen.delete(callId);
        log(`[chert] decline ${callId} after ${Date.now() - t0} ms: ${(e as Error).message}`);
        return c.json<ChertDecision>({ action: 'decline' });
      }
    }

    if (ev.type === 'call.ended' || ev.type === 'call.failed') {
      const prepared = seen.get(callId);
      seen.delete(callId);
      prepared?.then((p) => lk.deleteRoom(p.room)).catch(() => {});
    }
    return c.json({ ok: true });
  });

  // Dev path: /phone on any device with a camera joins as a fake FaceTime caller with the same track names.
  app.post('/api/dev-session', async (c) => {
    const callId = `dev-${randomUUID()}`;
    try {
      const prepared = await prepareRoom(callId, Date.now() + 20_000);
      const token = await mintToken(cfg.apiKey, cfg.apiSecret, prepared.room, `dev-phone-${callId.slice(4, 10)}`, 1800);
      return c.json({ url: cfg.livekitUrl, token, room: prepared.room, callId });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 503);
    }
  });

  // Part 2 (agent) → here. Body is one CallEvent.
  app.post('/api/events', async (c) => {
    const ev = await c.req.json().catch(() => null);
    if (!isCallEvent(ev)) return c.json({ error: 'body must be a CallEvent (see src/contracts.ts)' }, 400);
    publish(ev);
    return c.json({ ok: true });
  });

  // Here → Part 4 (dashboard). One JSON CallEvent per SSE message; replays the latest per call on connect.
  app.get('/api/stream', (c) =>
    streamSSE(c, async (stream) => {
      for (const ev of latest.values()) await stream.writeSSE({ data: JSON.stringify(ev) });
      const send = (ev: CallEvent) => void stream.writeSSE({ data: JSON.stringify(ev) });
      listeners.add(send);
      stream.onAbort(() => {
        listeners.delete(send);
      });
      while (!stream.aborted && !stopped) await stream.sleep(15_000).then(() => stream.writeSSE({ event: 'ping', data: '' }));
    }),
  );

  return {
    app,
    start() {
      if (cfg.warmPool) refillWarm();
    },
    stop() {
      stopped = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
