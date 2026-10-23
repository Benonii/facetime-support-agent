# Part 1: Telephony

Answers Chert, hands it a LiveKit room with our agent already inside, and relays the agent's events to the dashboard.

| File | What |
| - | - |
| `server.ts` | Entry point (`npm run server`): reads env, starts the HTTP server |
| `app.ts` | All routes + warm room pool. No env reads, so tests can build it |
| `livekit.ts` | The 4 LiveKit calls we use (create room, dispatch agent, is agent ready, delete room) + token minting |
| `telephony.test.ts` | Tests with a fake LiveKit, no keys needed |
| `simulate-chert.ts` | Pretends to be Chert against a running server |

## Contracts (from `src/contracts.ts`, unchanged)

| Direction | DTO | Route |
| - | - | - |
| Chert → us | `ChertEvent` | `POST /webhooks/chert` |
| us → Chert | `ChertDecision` | reply to `call.incoming`, inside 4 s |
| us → Part 2 (agent) | `JobMetadata { call_id }` | LiveKit dispatch metadata |
| Part 2 → us | `CallEvent` | `POST /api/events` (bad shape → 400) |
| us → Part 4 (dashboard) | `CallEvent` | `GET /api/stream` (SSE) |

## Env (`.env.local`)

Required: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (LiveKit Cloud > Settings > Keys).
Optional: `AGENT_NAME` (default `support-agent`, must match the agent), `PORT` (8787), `CHERT_DECISION_BUDGET_MS` (4000),
`TRUCK_ROLL_COST` (150), `WARM_POOL=0` to turn off the warm room.

## Test

1. No keys: `npx tsx --test src/telephony/telephony.test.ts` (15 tests).
2. Real LiveKit, no Chert: `npm run agent:mock` and `npm run server`, wait for `[warm] ready`, then
   `npx tsx src/telephony/simulate-chert.ts`. Expect `accept in <100 ms`.
3. Real FaceTime: `npm run tunnel`, set the Chert line's Integration URL to `https://<tunnel>/webhooks/chert`
   (policy `customer_decides`), FaceTime Video the line, watch the `[chert] accept … in N ms` log.
