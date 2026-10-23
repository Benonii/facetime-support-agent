// Pretend to be Chert: send call.incoming to a running server, print the decision and how long it took.
// Run: npx tsx src/telephony/simulate-chert.ts [server url, default http://localhost:8787]
import { randomUUID } from 'node:crypto';

const base = process.argv[2] ?? 'http://localhost:8787';
const callId = `sim-${randomUUID().slice(0, 8)}`;
const send = (type: string) =>
  fetch(`${base}/webhooks/chert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: randomUUID(),
      type,
      created_at: new Date().toISOString(),
      data: { call_id: callId, line_id: 'sim-line', media: { audio: true, video: true } },
    }),
  }).then((r) => r.json());

const t0 = Date.now();
const d = await send('call.incoming');
const ms = Date.now() - t0;
console.log(`call.incoming ${callId} → ${d.action} in ${ms} ms ${ms < 5000 ? '(inside Chert 5 s limit)' : '(TOO SLOW, Chert would drop it)'}`);
if (d.action === 'accept') {
  const claims = JSON.parse(Buffer.from(d.participant_token.split('.')[1], 'base64url').toString());
  console.log({ livekit_url: d.livekit_url, agent_identity: d.remote_participant_identity, bridge_identity: claims.sub, room: claims.video.room });
  console.log('Open the room in the LiveKit Cloud dashboard (Sessions) to see the agent sitting in it.');
}
console.log('call.ended →', await send('call.ended'));
