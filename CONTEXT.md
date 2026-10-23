# Project context: FaceTime video support agent

Read this before building any part. It is the shared mental model, the contracts between parts,
and the rules that are easy to break. Feed it to your AI coding tool as context.

## What we are building (one paragraph)

A customer whose device is broken (router, monitor, charger…) FaceTimes our support line. An AI agent
answers, **sees** the device through the caller's camera, reads the lights and ports, and shows the caller
their own device on screen with the **part to touch circled**, plus the step in big text. It walks them
through the fix, checks the lights changed, and closes the ticket. If it can't be fixed, it books a
technician with the diagnosis attached. Business pitch: every fix on the call is a technician visit
("truck roll", ~$150) not paid for. Hackathon target: Chert's "Best Use of FaceTime" prize.

## Architecture

```
Customer iPhone ──FaceTime Video──▶ Chert line
                                      │ 1. POST call.incoming  (HTTPS webhook)
                                      ▼
                              src/server.ts  (Hono, always on, behind cloudflared tunnel)
                                      │ 2. hands over a pre-made "warm" LiveKit room with the agent already in it
                                      │ 3. replies {accept, livekit_url, bridge token, agent identity}  < 5 s
                                      ▼
Chert bridge joins the LiveKit room ◀────────────────────────────────▶ src/agent.ts (LiveKit Agents worker, always on;
   publishes  facetime-remote-audio  (caller mic)                         one fresh job per call)
              facetime-remote-video  (caller camera)                      - OpenAI Realtime: hears + speaks
   subscribes to agent audio + agent video                                - tools (below) do vision, fix plan, tickets
                                                                          - publishes agent-guide-card video
                                      agent ──POST /api/events──▶ server ──SSE──▶ dashboard (/)
```

**Who does what**

| Part | Does | Does NOT |
| --- | --- | --- |
| Chert | Owns the FaceTime number, asks our webhook to accept, bridges caller audio/video into our LiveKit room and our audio/video back | No speech-to-text, no talking, no vision, no logic |
| LiveKit Cloud | Hosts the room (a private meeting) and carries the media tracks | Doesn't create rooms on its own in our setup; our server does |
| `src/server.ts` | Webhook, warm room pool, LiveKit room + dispatch + token, dashboard + event stream, dev-session for the test page | No AI |
| `src/agent.ts` | Voice conversation (OpenAI Realtime, speech in and out in one model), calls tools | Doesn't stream video to the model; tools grab single frames |
| Tools | Vision on one frame, fix plan, circle, tickets | |

## Hard facts and rules (easy to get wrong)

1. **Caller video only arrives through Chert BYOR** (webhook mode, line policy `customer_decides`). The `chert dev` CLI is audio only. The open-source connector is audio only.
2. **Outbound calls (agent calls customer) are audio only.** Our flow is inbound.
3. **The webhook must answer within ~5 s** (we budget 4 s from `created_at`). Missing/late = call declined. That's why the warm room exists. Never do slow work in the webhook.
4. **The agent must already be in the room** before we answer "accept".
5. **One Chert line = one active call at a time.**
6. **LiveKit JS agents (v1.8.0) do not feed video to the model.** `FrameGrabber` keeps the newest frame; tools call `grabJpeg()` and send it to the vision model.
7. **Don't greet first.** FaceTime media may not be flowing when the caller joins. The caller says hi, then the agent speaks (Chert guidance).
8. **Don't open the OpenAI session before a caller joins** (costs money). Agent waits with `ctx.waitForParticipant()`.
9. **Pin `@livekit/agents` and `@livekit/agents-plugin-openai` at 1.8.0** (Chert's tested version).
10. **Secrets live in `.env.local` only** (gitignored). Never commit keys. Never log tokens or caller media.
11. **Fresh bridge token per call**, scoped to one room, join+publish+subscribe, identity different from the agent's, expires ≤ 2 h.

## Contracts between parts

### Chert → server (`POST /webhooks/chert`)

```json
{ "event_id": "…", "type": "call.incoming", "created_at": "2026-10-23T19:00:00Z",
  "data": { "call_id": "…", "line_id": "…", "media": { "audio": true, "video": true } } }
```
Other types: `call.started`, `call.ended`, `call.failed` (reply `{"ok": true}`; on ended/failed delete the room).
Events can repeat: same `call_id` must get the same room (server keeps a promise map `seen`).

### Server → Chert (reply to `call.incoming`)

```json
{ "action": "accept", "livekit_url": "wss://…livekit.cloud",
  "participant_token": "<fresh bridge JWT>", "remote_participant_identity": "<agent identity in room>" }
```
or `{ "action": "decline" }`.

### Tracks in the room

| Track | From | Kind |
| --- | --- | --- |
| `facetime-remote-audio` | Chert bridge (caller mic) | audio, source microphone |
| `facetime-remote-video` | Chert bridge (caller camera) | video |
| agent audio | agent (OpenAI voice) | audio |
| `agent-guide-card` | agent (`src/card.ts`) | video 720×1280, 10 fps |

The dev test page (`/phone`) publishes the **same track names**, so agent code is identical in dev and on FaceTime.

### Agent → server (`POST /api/events`) → dashboard (`GET /api/stream`, SSE)

```ts
type CallEvent =
  | { type: 'call.started'; callId: string }
  | { type: 'state'; callId: string; state: CallState }   // sent on every change
  | { type: 'call.ended'; callId: string };
```
`CallState`, `Observation`, `FixPlan`, `Ticket` are defined in `src/types.ts`. **Change types there first**, then both sides.

### Tools the realtime model can call (`src/agent.ts`)

| Tool | Input | What it does | Returns to model |
| --- | --- | --- | --- |
| `look_at_device` | `focus` | grab frame → `observeFrame()` (vision) → update state + card | lights, ports, findings, next_shot |
| `find_fix` | `symptom` | `lookupFix()`: PLAYBOOK + Keenable web search → `FixPlan` | cause, steps, when to send a tech |
| `show_step` | `n` | set step n, re-look so vision returns `target.box`, card circles it | step text, circled label |
| `check_result` | – | re-look, compare lights before/after | before, now, findings |
| `mark_resolved` | – | ticket `resolved_on_call` | ticket id |
| `book_technician` | name, address, window, phone | ticket `technician_booked`, optional iMessage via Chert | ticket id, window |

Tool rule: return small JSON, never long text. The model reads results aloud in its own words.

### Vision output (`Observation`, `src/types.ts`)

`device {type, brand, model}`, `indicators[] {label, color, pattern}`, `ports[] {label, cable_connected}`,
`findings[]`, `target {label, box:[x0,y0,x1,y1] normalized 0..1} | null`, `next_shot`, `confidence`.
`card.ts` draws the circle from `target.box` over the last snapshot.

## Files and owners (split the work here)

| Area | Files | Good first tasks |
| --- | --- | --- |
| **Telephony + server** | `src/server.ts` | Get Chert line → webhook working through the tunnel; log timings; confirm `facetime-remote-video` arrives |
| **Agent + prompt** | `src/agent.ts` | Tune `INSTRUCTIONS` for a < 90 s call; filler lines before slow tools; interruption handling |
| **Vision** | `src/vision.ts`, `src/frames.ts` | Make light colors + target box accurate for our demo device; try faster `VISION_MODEL` |
| **Knowledge** | `src/kb.ts` | Rewrite `PLAYBOOK` for the exact demo device; Keenable query quality |
| **Caller screen** | `src/card.ts` | Look of the guide card; circle accuracy; "Fixed" screen |
| **Dashboard + pitch** | `public/dashboard.html`, demo video, LinkedIn/X post | KPIs on the projector; record the < 2 min FaceTime demo |

Keep changes inside your area; if you need a new field, add it to `src/types.ts` and tell the team.

## Run it

```bash
npm install
cp .env.example .env.local      # LIVEKIT_URL/KEY/SECRET, OPENAI_API_KEY, KEENABLE_API_KEY, BRAND_NAME
npm run typecheck && npm run smoke   # smoke renders smoke-card.png, no keys needed
npm run agent    # terminal 1: worker
npm run server   # terminal 2: http://localhost:8787  (dashboard /, test page /phone)
npm run tunnel   # terminal 3: public https URL
```

- **Dev path (no Chert needed):** open `https://<tunnel>/phone` on a phone, Start call, point at the device.
- **Real FaceTime:** Chert dashboard → line policy `customer_decides`, no default assistant, Integration URL `https://<tunnel>/webhooks/chert`, signing off. FaceTime **Video** the line.
- Only one person runs the agent + server against the shared LiveKit project at a time, or use separate `AGENT_NAME`s.

## Demo (90 s)

Unplug the cable → FaceTime the line → agent names the red light and empty port → circle blinks on the port
→ plug it in → agent re-checks, light green, "ticket closed" → dashboard shows truck roll avoided.

## Submission (Chert prize, before 5 PM)

Public repo, demo video of a live FaceTime call < 2 min, LinkedIn or X post. Submitted in Chert's Discord.

## References

- Chert docs index: https://docs.trychert.com/llms.txt
- BYOR (webhook, tracks, tokens): https://docs.trychert.com/facetime/bring-your-own-room
- FaceTime quickstart: https://docs.trychert.com/facetime/quickstart
- Agent skeleton: https://docs.trychert.com/facetime-cli/build-agent
- Webhook contract reference: https://github.com/cherthq/chert-reference-agent (docs/CONTRACT.md)
- LiveKit Agents JS: https://github.com/livekit/agents-js
- Keenable search API: https://docs.keenable.ai/api-reference/search
