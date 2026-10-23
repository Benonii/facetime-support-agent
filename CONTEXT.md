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
                              src/telephony/server.ts  (Hono, always on, behind cloudflared tunnel)
                                      │ 2. hands over a pre-made "warm" LiveKit room with the agent already in it
                                      │ 3. replies {accept, livekit_url, bridge token, agent identity}  < 5 s
                                      ▼
Chert bridge joins the LiveKit room ◀────────────────────────────────▶ src/agent/ (LiveKit Agents worker, always on;
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
| Telephony (`src/telephony`) | Webhook, warm room pool, LiveKit room + dispatch + token, dashboard + event stream, dev-session for the test page | No AI |
| Agent (`src/agent`) | Voice conversation (OpenAI Realtime, speech in and out in one model), calls tools | Doesn't stream video to the model; tools grab single frames |
| Intelligence + Screens | Vision on one frame, fix plan; the circled guide card and dashboard | |

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

## The 4 parts (build them in parallel)

All DTOs live in **`src/contracts.ts`**. That file is the only thing parts share. Change it first, tell the team, then update both sides.

```
 1 TELEPHONY ──JobMetadata──▶ 2 AGENT ──ObserveRequest / FixRequest──▶ 3 INTELLIGENCE
 (src/telephony)              (src/agent) ◀──── Observation / FixPlan ──── (src/intelligence)
      ▲  │                       │
      │  └──SSE CallEvent──▶ 4 SCREENS ◀──CallState (CallerScreen.render)──┘
      └──POST /api/events CallEvent── agent      (src/screens, public/dashboard.html)
```

| # | Part | Folder | Owns | Input DTO | Output DTO | Build alone with |
| - | - | - | - | - | - | - |
| 1 | Telephony | `src/telephony/server.ts` | Chert webhook, warm room, bridge token, agent dispatch, event relay, `/phone` dev page | `ChertEvent`, `CallEvent` | `ChertDecision`, `JobMetadata`, SSE `CallEvent` | `/phone` page + `npm run agent:mock` |
| 2 | Agent | `src/agent/` | Voice (OpenAI Realtime), prompt, 6 tools, frame grab, `CallState` | `JobMetadata`, caller tracks | `ObserveRequest`, `FixRequest`, `CallState`, `CallEvent` | `npm run agent:mock` (no vision keys) |
| 3 | Intelligence | `src/intelligence/` | Vision on one frame, playbook + Keenable fix plan | `ObserveRequest`, `FixRequest` | `Observation`, `FixPlan` | `npm run try:intel -- photo.jpg "no internet"` |
| 4 | Screens | `src/screens/card.ts`, `public/dashboard.html` | What the caller sees (circle + step), the projector dashboard | `CallState`, SSE `CallEvent` | `agent-guide-card` video track | `npm run smoke` (renders smoke-card.png) |

### DTOs (see `src/contracts.ts` for exact types)

**1 to 2: `JobMetadata`** (dispatch metadata, JSON string): `{ call_id }`

**2 to 3: `Intelligence` interface**
```ts
observe(req: ObserveRequest): Promise<Observation>   // ObserveRequest { jpeg: Buffer; focus?; step?; previous?: Observation }
findFix(req: FixRequest): Promise<FixPlan>           // FixRequest { observation; symptom }
```
`Observation`: `device_visible`, `device {type, brand, model}`, `indicators[] {label, color, pattern}`,
`ports[] {label, cable_connected}`, `findings[]`, `target {label, box:[x0,y0,x1,y1] 0..1} | null`, `next_shot`, `confidence`.
`FixPlan`: `likely_cause`, `steps[]`, `needs_technician`, sources. `MOCK_INTELLIGENCE=1` swaps in canned answers (`src/intelligence/mock.ts`).

**2 to 4: `CallerScreen` interface + `CallState`**
```ts
interface CallerScreen { publish(room); render(state: CallState); close() }
CallState { callId, stage: 'waiting'|'looking'|'diagnosing'|'guiding'|'resolved'|'technician',
            observation?, plan?, step? {n, text}, looks, ticket?, lastSnapshot? (jpeg data URL) }
```
The card circles `observation.target.box` over `lastSnapshot`.

**2 to 1 to 4: `CallEvent`** (agent `POST /api/events`, server rebroadcasts on `GET /api/stream` SSE)
```ts
{ type: 'call.started', callId } | { type: 'state', callId, state: CallState } | { type: 'call.ended', callId }
```

**Chert to 1: `ChertEvent`** `POST /webhooks/chert`
```json
{ "event_id": "…", "type": "call.incoming", "created_at": "…",
  "data": { "call_id": "…", "line_id": "…", "media": { "audio": true, "video": true } } }
```
Other types `call.started|ended|failed` get `{"ok": true}`; ended/failed delete the room. Same `call_id` must get the same room.

**1 to Chert: `ChertDecision`** `{ action: "accept", livekit_url, participant_token, remote_participant_identity }` or `{ action: "decline" }`.

### Tracks in the room (`TRACKS` in contracts.ts)

| Track | From | Kind |
| --- | --- | --- |
| `facetime-remote-audio` | Chert bridge (caller mic) | audio |
| `facetime-remote-video` | Chert bridge (caller camera) | video |
| agent audio | agent (OpenAI voice) | audio |
| `agent-guide-card` | screens (`src/screens/card.ts`) | video 720×1280, 10 fps |

The `/phone` dev page publishes the **same track names**, so agent code is identical in dev and on FaceTime.

### Agent tools (`src/agent/agent.ts`)

| Tool | Input | Calls | Returns to model |
| --- | --- | --- | --- |
| `look_at_device` | `focus` | `intelligence.observe` | lights, ports, findings, next_shot |
| `find_fix` | `symptom` | `intelligence.findFix` | cause, steps, when to send a tech |
| `show_step` | `n` | `observe` with `step` set, so `target.box` circles the part | step text, circled label |
| `check_result` | – | `observe`, compare lights | before, now, findings |
| `mark_resolved` | – | ticket `resolved_on_call` | ticket id |
| `book_technician` | name, address, window, phone | ticket + optional Chert iMessage | ticket id, window |

Tool rule: return small JSON, never long text.

### Good first tasks per part

1. **Telephony:** Chert line to webhook through the tunnel, log timings, confirm `facetime-remote-video` arrives.
2. **Agent:** tune `INSTRUCTIONS` for a < 90 s call, filler lines before slow tools, interruptions.
3. **Intelligence:** accurate light colors + target box on our demo device, rewrite `PLAYBOOK`, faster `VISION_MODEL`.
4. **Screens:** card look, circle accuracy, "Fixed" screen, dashboard KPIs (truck rolls avoided).

Stay inside your folder. Need a new field? Add it to `src/contracts.ts` and tell the team.

## Run it

```bash
npm install
cp .env.example .env.local      # LIVEKIT_URL/KEY/SECRET, OPENAI_API_KEY, KEENABLE_API_KEY, BRAND_NAME
npm run typecheck && npm run smoke   # smoke renders smoke-card.png, no keys needed
npm run agent    # terminal 1: worker (or agent:mock, no vision/search keys)
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
