# FaceTime video support agent

The customer FaceTimes support, points the camera at their router, and the agent reads the lights and ports,
circles the exact cable to touch on their screen, and walks them through the fix. If it can't be fixed,
it books a technician with the diagnosis attached. Every fix on the call is a truck roll (~$150) not paid for.

```
iPhone (FaceTime Video)
   │
   ▼
Chert line ──POST call.incoming──▶ src/server.ts  /webhooks/chert   (Hono, public via cloudflared)
   │                                 │ createRoom + dispatch "support-agent" (warm pool of 1)
   │◀──── accept {livekit_url, bridge token, agent identity} ───┘
   │
   ▼
LiveKit room ── facetime-remote-audio ─▶ src/agent.ts  (OpenAI Realtime voice, tools)
             ── facetime-remote-video ─▶   FrameGrabber (newest frame only)
             ◀─ agent audio                 look_at_device → vision.ts (lights, ports, target box)
             ◀─ agent-guide-card video      find_fix       → kb.ts (brand PLAYBOOK + Keenable web results)
                (their device, part         show_step      → re-look, circle the part on their screen
                 circled, step text)        check_result / mark_resolved / book_technician (+ Chert iMessage)
                                     │
                                     └─ POST /api/events ─▶ dashboard (/)  fix rate, truck rolls avoided
```

## Setup (10 min)

```bash
nvm use 22            # 22.23.2+ or 24.x
npm install
cp .env.example .env.local   # fill LIVEKIT_*, OPENAI_API_KEY at minimum
npm run typecheck && npm run smoke   # smoke renders smoke-card.png, no keys needed
```

Accounts: LiveKit Cloud (free, cloud.livekit.io), OpenAI key with Realtime access, Keenable key (check-in),
cloudflared (`pacman -S cloudflared`).

## Run

Three terminals:

```bash
npm run agent      # LiveKit worker, registers as $AGENT_NAME
npm run server     # http://localhost:8787  dashboard / , dev phone /phone
npm run tunnel     # prints https://<random>.trycloudflare.com
```

### Path A: build without Chert (do this first)
Open `https://<tunnel>/phone` on your phone (HTTPS needed for camera), tap **Start call**, say hi.
The page publishes your camera as `facetime-remote-video`, so the agent code is identical to the real FaceTime path.

### Path B: real FaceTime video (BYOR webhook)
In the Chert dashboard for your line: inbound policy `customer_decides`, no default Assistant,
HTTPS Integration URL = `https://<tunnel>/webhooks/chert`, signing unchecked.
FaceTime **Video** the line's address from an iPhone.

### Path C: `chert dev` (audio only fallback)
```bash
npm i -g @trychert/facetime@beta && chert login && chert doctor
chert dev --agent support-agent
```
Same agent. No caller video on this path, so look_at_device returns "no video". Use only if B is blocked.

## Files

| file | what |
| - | - |
| `src/agent.ts` | prompt, 6 tools, session wiring |
| `src/frames.ts` | subscribes to caller video, `grabJpeg()` |
| `src/vision.ts` | frame → `Observation` JSON (lights, ports, findings, target box) |
| `src/kb.ts` | `PLAYBOOK` (edit for your demo router) + Keenable search → `FixPlan` |
| `src/card.ts` | the video the caller sees: their device with the part circled, step text |
| `src/server.ts` | Chert webhook, warm pool, dev session, SSE dashboard |
| `public/` | `dev-phone.html`, `dashboard.html` |
