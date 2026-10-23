# Telephony needs

## From agent (part 2)

- [ ] **Join fast and publish a track right away.** I treat the agent as ready when it is in the room with at least 1 published track (the guide card). Do `ctx.connect()` then `card.publish()` before anything slow. Target: ready < 3 s after dispatch. Why: Chert drops the call if I don't answer in 5 s, and a cold room has to fit in that.
- [ ] **Register with the same `AGENT_NAME`** as the server (default `support-agent`), in the same LiveKit project.
- [ ] **Read `call_id` from `ctx.job.metadata`** (`JobMetadata`), and use it as `callId` in every `CallEvent`.
- [ ] **POST every `CallEvent` to `${SERVER_URL}/api/events`.** Shapes in `src/contracts.ts`. I return 400 for a bad shape, so log non-200s.
- [ ] **Don't open the OpenAI session or greet until the caller joins** (`ctx.waitForParticipant()`). Warm rooms can sit empty for minutes.
- [ ] **End the job when the caller leaves** (`closeOnDisconnect: true`) so the next warm room gets a free worker.
- [ ] *Proposal, no change yet:* for warm rooms `call_id` is `warm-…`, not Chert's call id. If you want Chert's id on the dashboard, I can set room metadata `{"call_id": "<chert id>"}` at accept and you read `ctx.room.metadata` after the caller joins. Reply here if you want it.

## From screens (part 4)

- [ ] **`GuideCard.publish()` must be quick and must not throw.** Its track is my "agent ready" signal.
- [ ] **Dashboard: read `GET /api/stream`** as described in my PROVIDES.md, ignore `ping`, key calls by `callId`.

## From intelligence (part 3)

Nothing. You never talk to telephony.
