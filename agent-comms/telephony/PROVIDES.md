# Telephony provides (part 1, `src/telephony/`)

Owner: Ben. Code: on main. Start it with `npm run server` (port 8787).

## Owned by Ben: ask in telephony NEEDS/STATUS before changing (2026-10-23 3:50 PM PT)

These files are the live demo. Don't edit, move, rename or reformat them. If you need a change, add an ask to your own
`NEEDS.md` under `## From telephony` and tell Ben; he or his agent makes it.

| Path | What |
| - | - |
| `src/telephony/**` | server, warm room pool, routes, tests |
| `src/imessage/**` | iMessage fallback |
| `public/dev-phone.html`, `public/manifest.webmanifest`, `public/sw.js`, `public/icons/**` | `/phone` web call PWA (the demo caller app) |
| `src/intelligence/products/**` | product knowledge (Shure wireless handheld mic is the demo product) |
| `src/intelligence/kb.ts`: the `PRODUCT_KB` / `PLAYBOOK` loader and the `Product knowledge:` text block | feeds the product KB to the fix plan |
| `src/agent/device-tools.ts`: the `[tools] device analysis failed` log in `run()` | only that line; rest of the file is part 2 |
| `src/intelligence/vision.ts`: "wireless microphone" in the subject list | only that phrase; rest is part 3 |
| `BRAND_NAME=Shure` in `.env.example` | demo brand |

### Contracts the /phone page depends on (don't change without asking)

- Track names in `src/contracts.ts` `TRACKS`: caller publishes `facetime-remote-audio` / `facetime-remote-video`; agent publishes `agent-guide-card`.
- Agent participant attribute `lk.agent.state` (LiveKit Agents: listening / thinking / speaking) drives the voice orb.
- `CallEvent` on `GET /api/stream`, keyed by `callId` = the room's `JobMetadata.call_id`. The page reads `state.stage`
  (`waiting|looking|diagnosing|guiding|resolved|technician`), `state.lastSnapshot` (JPEG data URL of the analysed frame),
  `state.observation.target.box` (normalized `[x1,y1,x2,y2]`) and `.label`, `state.step {n,text}`, `state.plan.steps`, `state.ticket {id,window}`.
  Renaming or dropping any of these breaks the annotated photo and progress UI.
- Routes `/phone`, `/api/dev-session`, `/api/dev-session/end`, `/api/events`, `/api/stream`, `/health`; env `AGENT_NAME`, `BRAND_NAME`, `PRODUCT_KB`.

## Demo path now: web call at `/phone` (2026-10-23 3:15 PM PT)

Chert is out of the demo path. Callers use our own page: `https://<Ben's tunnel>/phone`.
- Publishes `facetime-remote-audio` + `facetime-remote-video` (same names as Chert's bridge), plays the agent's audio + `agent-guide-card` video. **No agent or screens change needed.**
- Takes the warm room (agent already in it), so the call starts in ms. `JobMetadata.call_id` is the warm id; caller identity is `caller-…`.
- Hang-up calls `POST /api/dev-session/end {room}`, which deletes the room so the agent job ends.
- Agent worker must use `AGENT_NAME` = the server's (`support-agent` default) in the shared LiveKit project.

## Calls right now: `chert dev`, not the webhook (2026-10-23)

The Chert webhook (`/webhooks/chert`) is not wired to our line yet (Shared line, console can't save the URL). Real FaceTime calls go through `chert dev` on Ben's laptop instead:

- Chert dispatches the agent named by `chert dev --agent NAME` into a room it prepares, in **our shared LiveKit project**. No tunnel or webhook involved.
- `ctx.job.metadata` may not contain `call_id`; use `ctx.room.name` as the fallback (agent already does).
- **To test your own agent on the real line from your laptop:** run your agent with the shared LiveKit keys and a unique `AGENT_NAME` (e.g. `screens-agent`), then tell Ben the name. He restarts `chert dev --agent <name>` and the next FaceTime call goes to your agent. One call at a time on the line.
- Your own cloudflared tunnel is still fine for `/phone` and your dashboard, but Chert doesn't use it.

## iMessage fallback (`src/imessage/`, 2026-10-23)

- `npm run imessage`: listens for texts to our Chert iMessage line and replies with the fix plus a circled photo. Prints the sender line(s) to text on start.
- `npm run imessage:sim -- photo.jpg ["symptom"]`: offline test with mock intelligence and a fake Chert; writes `imessage-sim-*.png`.
- Env: `CHERT_MESSAGING_SECRET` (required), `CHERT_TENANT_SLUG` (only if the API returns 404/2001), `INTELLIGENCE_PROVIDER` (defaults to `openai` when `OPENAI_API_KEY` is set, else `codex-cli`).

## Routes

| Route | Who calls it | Body / reply |
| - | - | - |
| `POST /webhooks/chert` | Chert | `ChertEvent` in. `call.incoming` → `ChertDecision` in < 4 s. Others → `{ok:true}`. Bad body → 400 |
| `POST /api/events` | **Agent (part 2)** | one `CallEvent`. `{ok:true}`, or 400 if the shape is wrong (unknown `type`, missing `callId`, `state.stage` not one of the 6) |
| `GET /api/stream` | **Dashboard (part 4)** | SSE. Each `message` is one JSON `CallEvent`. On connect, replays the latest event per call. An `event: ping` (empty data) every 15 s: ignore it |
| `POST /api/dev-session` | `/phone` page | `{url, token, room, callId}` for a room with the agent already in it |
| `GET /phone` | you, on a phone | fake FaceTime caller: publishes your camera/mic as `facetime-remote-video` / `facetime-remote-audio` |
| `GET /` | projector | dashboard (`public/dashboard.html`, `__TRUCK_ROLL_COST__` filled in) |
| `GET /health` | anyone | `{ok, warm_room_ready, active_calls}` |

## What I send the agent (part 2)

- A LiveKit **dispatch** to agent name `AGENT_NAME` (default `support-agent`) with metadata `JobMetadata` = `{"call_id": "..."}` (JSON string in `ctx.job.metadata`).
- For warm rooms, `call_id` is `warm-<uuid>` (the room is made before the call exists). For `/phone` it is `dev-<uuid>`.
- The room already exists when you join. The caller (Chert bridge or `/phone`) joins later and publishes `facetime-remote-audio` + `facetime-remote-video`.
- When the call ends I delete the room, so your job ends with "Room disconnected" if no caller ever came (normal for the simulator).

## Test against me without Chert

- `npx tsx src/telephony/simulate-chert.ts`: fake `call.incoming` + `call.ended` against a running server. Prints `accept in N ms`.
- `/phone` over `npm run tunnel` for real camera + mic.
- Tested: 15 unit tests (fake LiveKit), real LiveKit accept in 60 ms (2026-10-23).

## Env

Required: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (same LiveKit project as the agent). Optional: `AGENT_NAME`, `PORT`, `CHERT_DECISION_BUDGET_MS`, `TRUCK_ROLL_COST`, `WARM_POOL=0`.
