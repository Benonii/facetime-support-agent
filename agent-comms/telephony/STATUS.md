# Telephony status

## 2026-10-23 4:30 PM PT: /phone call fixes from Ben's first live run (design thread)
- **Flicker:** the agent blanks `lastSnapshot` at the start of every look, which collapsed the photo card and re-opened it seconds later; the page now keeps the last photo up (dimmed) until the next one is decoded. Talking/listening labels hold through word gaps instead of toggling per frame.
- **Progress pills:** events are now matched on `callId` **or** the room name, in case `ctx.job.metadata.call_id` is missing and the agent falls back to `ctx.room.name`.
- **Camera:** flip is a visible control in the button column; it restarts the same track (no republish, agent keeps its subscription). Back lens is verified via `getSettings().facingMode` and corrected by device label when the phone hands back the selfie lens.
- Small JS changes inside `public/dev-phone.html` only; routes, tracks and `CallState` reads unchanged.

## 2026-10-23 4:10 PM PT: INT-014 acknowledged, done in /phone
- `public/dev-phone.html` JS only: the ring is drawn only when `screen.snapshotId` and `screen.observationSnapshotId` match (or either is absent), stale image `onload` callbacks are ignored, and the ring clears on image error. No styling touched. `screen.caption` not used yet.

## 2026-10-23 4:15 PM PT: /phone monochrome glass pass (Ben's design thread)
- **Done:** no gradients, no colour except the green call button and red end button; all overlays are blurred translucent glass with a hairline; text ladder is 600 headline / 500 step text / 300 dim captions. `public/dev-phone.html` only, JS untouched.
## 2026-10-23 4:05 PM PT: agent prompt switched to Shure mics (Ben asked)
- `src/agent/agent.ts`: INSTRUCTIONS now a ${BRAND} wireless mic support agent (no routers), tool hints for mic LCD/LED/battery/receiver, BRAND default `Shure`, and the agent greets first after the caller joins: "Hi, I'm a customer support agent from ${BRAND}. How can I help you today?" Tools, DTOs unchanged.

## 2026-10-23 4:05 PM PT: /phone redesign landed (Ben's design thread)
- **Done:** FaceTime layout (technician card full-bleed, self tile bottom-left, round mic/end controls, caller chip top-left), agentglance look (Lexend, grey ladder), beautifului.dev loader/shimmer for thinking states. Checked in the desktop browser pane with a mocked `guiding` state. JS unchanged except `#stage.remote` toggled on agent video subscribe.
- **Touching:** `public/dev-phone.html` markup + CSS only (FaceTime layout, Lexend/agentglance look). JS behavior, IDs, routes, tracks and `CallState` reads stay identical.
- **Ask to other /phone work:** avoid restyling `dev-phone.html` until this lands; JS fixes are fine, I'll merge around them.

## 2026-10-23 3:45 PM PT: demo product is the Shure wireless handheld mic (heads up, intelligence)
- **Changed (small, outside telephony, asked by Ben):** `src/intelligence/kb.ts` now loads product knowledge from `src/intelligence/products/shure-wireless-handheld.md` (override with `PRODUCT_KB=<path>`) instead of the router PLAYBOOK. `vision.ts` lists a wireless mic as a subject. `src/agent/device-tools.ts` now logs `[tools] device analysis failed: …` instead of failing silently.
- **Env:** set `BRAND_NAME=Shure` in `.env.local` (agent + server). Telephony defaults to Shure.
- **Debug "no image":** run `npm run agent` with `OPENAI_API_KEY` (not `agent:cli`); expect `[frames] reading video` then tool calls; any failure now prints `[tools] …`.

## 2026-10-23 3:20 PM PT: demo path is now our own web call PWA (`/phone`), Chert dropped
- **Why:** Chert inbound still "unavailable". Ben chose our own frontend into LiveKit.
- **Done:** `/phone` call app (voice ring reacting to the agent's audio, Look/Diagnose/Fix/Done progress from `/api/stream`, mute, flip, hang up, iOS audio unlock, wake lock), installable PWA (manifest, icons, service worker). `/api/dev-session` takes the warm room and returns the agent's `callId`; `/api/dev-session/end` deletes the room. 17/17 tests; flow checked in headless Chromium with a stubbed LiveKit client.
- **Answers SCR-001:** visual acceptance runs over `/phone`. Same track names, so no agent or screens change.
- **Not verified yet:** a real phone over the tunnel with the real agent.

## 2026-10-23 3:15 PM PT: demo path switched to web call (`/phone`), Chert dropped
- **Why:** Chert inbound calls still "unavailable". Ben chose our own web frontend into LiveKit.
- **Done:** `/phone` is now a real call page (call button, agent video full screen, self view, mute, flip, hang up, iPhone audio unlock, screen wake lock). `/api/dev-session` takes the warm room; new `/api/dev-session/end` deletes the room on hang-up. 17/17 telephony tests; page flow checked in headless Chromium with a stubbed LiveKit client.
- **Not verified yet:** a real phone call over the tunnel with the real agent.
- **Ask to agent owner:** run the worker as `support-agent` (or tell Ben the name so his server's `AGENT_NAME` matches), same LiveKit project.

## 2026-10-23 3:00 PM PT: ack intelligence `referenceJpegs` (ff27cdb)
- **Read:** `observe`/`findFix` now accept optional `referenceJpegs` (up to 2 earlier upright JPEGs, not the current frame). Existing callers keep working.
- **iMessage route:** not opted in yet. To opt in: keep the last 2 photos per chat, pass them as `referenceJpegs`, clear on `DONE`/reset. Ben to decide; not started.

## 2026-10-23 2:40 PM PT: iMessage fallback route (`src/imessage/`, commit 3087fd8)
- **Why:** inbound FaceTime to the shared line still shows "unavailable". This is the backup demo path.
- **Flow:** customer texts a device photo (plus optional symptom) to our Chert iMessage number → `intelligence.observe` → `findFix` → `observe({step})` → reply with likely cause, step 1, and the photo with the part circled. `NEXT` sends the next step, `DONE` closes, `TECH` hands off.
- **Transport:** Chert's event stream (`GET /api/v1/events/stream`), so no tunnel or webhook subscription is needed.
- **Verified:** `npm run imessage:sim -- photo.jpg` with mock intelligence (text + circled PNG, HEIC input converted). Typecheck clean.
- **Not verified:** real Chert API (needs `CHERT_MESSAGING_SECRET` in `.env.local`). Codex CLI 0.125 on Ben's laptop rejects every model with a ChatGPT login, so live runs need `OPENAI_API_KEY` or a Codex upgrade.
- **Touches no other part's code.** Reuses `createIntelligence()` and the `Intelligence` contract only.

## 2026-10-23 2:35 PM PT: ack intelligence blocker audit (8b7b7fd)
- **Read:** Chert beta.10 docs say inbound video works through `chert dev`, so the CLI path can carry caller video. The webhook 404 only blocks the webhook route.
- **Owed by telephony:** for the next failed call, Ben posts here the call time, `chert dev` connector lines, worker `registered`/`received job`/error lines, and whether the bridge participant joined. No secrets.
- **PR #9** (Ben): request/webhook logging only, not a call fix.

## 2026-10-23 2:15 PM PT: ack intelligence worker name
- **Read** intelligence `d7e64d3` / PROVIDES: live worker is `AGENT_NAME=intelligence-demo npm run agent:cli` on one agreed machine.
- **Telephony side:** when that worker shows `registered worker … agentName: "intelligence-demo"`, Ben restarts `chert dev --agent intelligence-demo`. Only one worker with that name. Until then the line stays on `support-agent`.
- **Still open:** caller video through `chert dev` unverified; `/phone` (needs Ben's `npm run server` + tunnel) is the camera fallback.

## 2026-10-23 1:50 PM PT: switched to `chert dev` (CLI), not the webhook
- **Why:** our Chert line is a Shared (HACKATHON) line, (628) 289-2384. The console can't save an Integration URL on it (PATCH line → 404), so the webhook path is blocked until Chert fixes it (asked in Discord).
- **Now:** `chert dev --agent support-agent` (CLI 0.1.0-beta.10) runs on Ben's laptop and holds the line. `chert doctor` all green. No tunnel or webhook is used for calls; Chert dispatches the named agent into its own LiveKit room.
- **Not verified yet:** whether caller video (`facetime-remote-video`) reaches the agent through `chert dev`. First FaceTime Video test call pending.
- **No code change needed:** agent already falls back to `ctx.room.name` as `callId` when `ctx.job.metadata` has no `call_id`.

## 2026-10-23 1:30 PM PT: acks
- **Intelligence (Nikhil):** read your NEEDS/STATUS. Agreed: nothing from telephony for the recorded-photo milestone, and intelligence stays out of the Chert accept path (accept only waits on the agent joining, never on vision).
- **Shared running server, proposal:** Ben runs the one telephony server + tunnel for live tests. The agent worker that joins calls must use the same LiveKit project and `AGENT_NAME`, and set `SERVER_URL` to Ben's tunnel (URL above, changes on restart). Only one agent worker per `AGENT_NAME` at a time, or warm rooms go to whichever worker answers first. Say in your STATUS who runs the agent for live tests.
- **Session:** telephony, owner Ben, branch main (docs) / feature branches (code). Not touching other parts' files.

## 2026-10-23 1:20 PM PT: Chert setup in progress
- **Up:** server on :8787 (warm room ready) and cloudflared tunnel `https://loan-institute-config-lou.trycloudflare.com` (changes on every restart). `/health` OK through the tunnel.
- **In progress:** Ben signing in to the FaceTime control plane (facetime.trychert.com, email + password; console.trychert.com is the iMessage console, Google only).
- **Next:** FaceTime line with video, inbound policy `customer_decides`, no default assistant, signing off, Integration URL `https://<tunnel>/webhooks/chert`. Line + video/BYOR may need enabling by Chert (Discord ask).
- **Then:** first real FaceTime Video call; watch for `[chert] accept … in N ms`.

## 2026-10-23 1:10 PM PT
- **Works:** webhook, warm room (kept fresh every 4 min), bridge token, agent dispatch, event relay, SSE, `/phone`. 15/15 tests. Real LiveKit: accept in 60 ms.
- **Not tested yet:** a real Chert FaceTime call (waiting on Chert for a line with video + BYOR webhook).
- **Open:** no auth on the public routes yet (webhook, `/api/events`, `/api/dev-session`).
- **Merged** to main (PR #1).
