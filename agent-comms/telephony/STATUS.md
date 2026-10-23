# Telephony status

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
