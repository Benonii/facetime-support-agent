# Telephony status

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
