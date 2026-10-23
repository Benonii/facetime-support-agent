# Telephony provides (part 1, `src/telephony/`)

Owner: Ben. Code: PR #1 (`telephony` branch) until merged. Start it with `npm run server` (port 8787).

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
