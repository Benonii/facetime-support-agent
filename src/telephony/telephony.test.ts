// Run: npm run test:telephony   (no keys, no network: LiveKit is faked)
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { ChertDecision, JobMetadata } from '../contracts.js';
import { createTelephony, type TelephonyConfig } from './app.js';
import type { LiveKitOps } from './livekit.js';

/** Fake LiveKit: the agent "joins" a room joinDelayMs after dispatch (Infinity = never). */
function fakeLiveKit(joinDelayMs = 50) {
  const created: string[] = [];
  const deleted: string[] = [];
  const dispatched: { room: string; agentName: string; metadata: JobMetadata }[] = [];
  const joinAt = new Map<string, number>();
  const lk: LiveKitOps = {
    async createRoom(name) {
      created.push(name);
    },
    async dispatchAgent(room, agentName, metadata) {
      dispatched.push({ room, agentName, metadata });
      joinAt.set(room, Date.now() + joinDelayMs);
    },
    async readyAgent(room) {
      const t = joinAt.get(room);
      return t !== undefined && Date.now() >= t ? `agent-${room}` : null;
    },
    async deleteRoom(room) {
      deleted.push(room);
    },
  };
  return { lk, created, deleted, dispatched };
}

const cfg: TelephonyConfig = {
  livekitUrl: 'wss://test.livekit.cloud',
  apiKey: 'APItestkey',
  apiSecret: 'secret-secret-secret-secret-secret',
  agentName: 'support-agent',
  budgetMs: 1000,
  truckRollCost: 150,
  warmPool: false,
  pollMs: 10,
  warmRetryMs: 20,
  log: () => {},
};

let stops: (() => void)[] = [];
afterEach(() => {
  stops.forEach((s) => s());
  stops = [];
});
function make(lk: LiveKitOps, over: Partial<TelephonyConfig> = {}) {
  const t = createTelephony(lk, { ...cfg, ...over });
  stops.push(t.stop);
  return t;
}

const incoming = (call_id: string, created_at = new Date().toISOString()) => ({
  event_id: `evt-${call_id}`,
  type: 'call.incoming',
  created_at,
  data: { call_id, line_id: 'line_1', media: { audio: true, video: true } },
});
const post = (app: any, path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const jwt = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('call.incoming → accept with the exact ChertDecision shape and a room-scoped bridge token', async () => {
  const f = fakeLiveKit();
  const { app } = make(f.lk);
  const res = await post(app, '/webhooks/chert', incoming('call_abc123'));
  const d = (await res.json()) as Extract<ChertDecision, { action: 'accept' }>;

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(d).sort(), ['action', 'livekit_url', 'participant_token', 'remote_participant_identity']);
  assert.equal(d.action, 'accept');
  assert.equal(d.livekit_url, cfg.livekitUrl);
  const room = f.created[0];
  assert.equal(d.remote_participant_identity, `agent-${room}`);

  const claims = jwt(d.participant_token);
  assert.equal(claims.video.room, room);
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.canPublish, true);
  assert.equal(claims.video.canSubscribe, true);
  assert.notEqual(claims.sub, d.remote_participant_identity, 'bridge identity must differ from the agent');
  assert.ok(claims.exp - claims.nbf <= 2 * 3600, 'token expires within 2 h');
});

test('Part 1 → Part 2: agent is dispatched with JobMetadata { call_id }', async () => {
  const f = fakeLiveKit();
  const { app } = make(f.lk);
  await post(app, '/webhooks/chert', incoming('call_meta'));
  assert.equal(f.dispatched.length, 1);
  assert.equal(f.dispatched[0].agentName, 'support-agent');
  assert.deepEqual(f.dispatched[0].metadata, { call_id: 'call_meta' });
});

test('warm room answers in well under the 5 s budget and a new warm room is started', async () => {
  const f = fakeLiveKit(300); // a cold room would take 300 ms
  const t = make(f.lk, { warmPool: true });
  t.start();
  await wait(350); // warm room is ready
  const t0 = Date.now();
  const d = await (await post(t.app, '/webhooks/chert', incoming('call_warm'))).json();
  assert.equal(d.action, 'accept');
  assert.ok(Date.now() - t0 < 100, `took ${Date.now() - t0} ms`);
  assert.equal(f.created.length, 2, 'used the warm room and started refilling');
  assert.match(d.remote_participant_identity, /support-warm-/);
});

test('duplicate / concurrent call.incoming for one call_id get the same room', async () => {
  const f = fakeLiveKit();
  const { app } = make(f.lk);
  const [a, b] = await Promise.all([post(app, '/webhooks/chert', incoming('call_dup')), post(app, '/webhooks/chert', incoming('call_dup'))]);
  const [da, db] = [await a.json(), await b.json()];
  assert.equal(f.created.length, 1);
  assert.equal(da.remote_participant_identity, db.remote_participant_identity);
});

test('agent never joins → decline before the deadline', async () => {
  const f = fakeLiveKit(Infinity);
  const { app } = make(f.lk, { budgetMs: 300 });
  const t0 = Date.now();
  const d = await (await post(app, '/webhooks/chert', incoming('call_noagent'))).json();
  assert.deepEqual(d, { action: 'decline' });
  assert.ok(Date.now() - t0 < 500);
  assert.deepEqual(f.deleted, f.created, 'the unused room is cleaned up');
});

test('Chert clock ahead of ours by minutes still accepts (deadline capped by our clock)', async () => {
  const f = fakeLiveKit();
  const { app } = make(f.lk);
  const d = await (await post(app, '/webhooks/chert', incoming('call_skew', new Date(Date.now() + 120_000).toISOString()))).json();
  assert.equal(d.action, 'accept');
});

test('call.ended deletes the room; call.started gets {ok:true}', async () => {
  const f = fakeLiveKit();
  const { app } = make(f.lk);
  await post(app, '/webhooks/chert', incoming('call_end'));
  const started = await post(app, '/webhooks/chert', { ...incoming('call_end'), type: 'call.started' });
  assert.deepEqual(await started.json(), { ok: true });
  await post(app, '/webhooks/chert', { ...incoming('call_end'), type: 'call.ended' });
  await wait(10);
  assert.deepEqual(f.deleted, [f.created[0]]);
});

test('malformed webhook → 400, not a crash', async () => {
  const { app } = make(fakeLiveKit().lk);
  assert.equal((await post(app, '/webhooks/chert', { type: 'call.incoming' })).status, 400);
  const raw = await app.request('/webhooks/chert', { method: 'POST', body: 'not json' });
  assert.equal(raw.status, 400);
});

test('Part 2 → Part 1 → Part 4: CallEvent from the agent is streamed to the dashboard over SSE', async () => {
  const { app } = make(fakeLiveKit().lk);
  const state = { type: 'state', callId: 'c1', state: { callId: 'c1', stage: 'looking', looks: 1 } };
  assert.equal((await post(app, '/api/events', state)).status, 200);

  const res = await app.request('/api/stream');
  const reader = res.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /^data: /);
  assert.deepEqual(JSON.parse(first.slice(6).trim()), state, 'replays the latest event on connect');

  await post(app, '/api/events', { type: 'call.ended', callId: 'c1' });
  const live = new TextDecoder().decode((await reader.read()).value);
  assert.deepEqual(JSON.parse(live.slice(6).trim()), { type: 'call.ended', callId: 'c1' });
  await reader.cancel();
});

test('bad CallEvent from the agent → 400', async () => {
  const { app } = make(fakeLiveKit().lk);
  assert.equal((await post(app, '/api/events', { type: 'state', callId: 'x', state: { stage: 'nope' } })).status, 400);
  assert.equal((await post(app, '/api/events', { type: 'call.started' })).status, 400);
});

test('dev session (/phone) gets a room with the agent and a token', async () => {
  const f = fakeLiveKit();
  const { app } = make(f.lk);
  const s = await (await post(app, '/api/dev-session', {})).json();
  assert.equal(s.url, cfg.livekitUrl);
  assert.equal(jwt(s.token).video.room, s.room);
  assert.match(s.callId, /^dev-/);
});

test('/health reports warm room readiness', async () => {
  const t = make(fakeLiveKit(20).lk, { warmPool: true });
  t.start();
  assert.equal((await (await t.app.request('/health')).json()).warm_room_ready, false);
  await wait(60);
  assert.equal((await (await t.app.request('/health')).json()).warm_room_ready, true);
});
