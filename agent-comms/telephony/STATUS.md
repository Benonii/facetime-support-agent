# Telephony status

## 2026-10-23 1:20 PM PT: Chert setup in progress
- **Up:** server on :8787 (warm room ready) and cloudflared tunnel `https://loan-institute-config-lou.trycloudflare.com` (changes on every restart). `/health` OK through the tunnel.
- **In progress:** Ben signing in to the FaceTime control plane (facetime.trychert.com, email + password; console.trychert.com is the iMessage console, Google only).
- **Next:** FaceTime line with video, inbound policy `customer_decides`, no default assistant, signing off, Integration URL `https://<tunnel>/webhooks/chert`. Line + video/BYOR may need enabling by Chert (Discord ask).
- **Then:** first real FaceTime Video call; watch for `[chert] accept … in N ms`.

## 2026-10-23 1:10 PM PT
- **Works:** webhook, warm room (kept fresh every 4 min), bridge token, agent dispatch, event relay, SSE, `/phone`. 15/15 tests. Real LiveKit: accept in 60 ms.
- **Not tested yet:** a real Chert FaceTime call (waiting on Chert for a line with video + BYOR webhook).
- **Open:** no auth on the public routes yet (webhook, `/api/events`, `/api/dev-session`).
- **PR:** #1 `telephony`, ready to merge.
