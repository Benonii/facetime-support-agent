# Telephony status

## 2026-10-23 1:10 PM PT
- **Works:** webhook, warm room (kept fresh every 4 min), bridge token, agent dispatch, event relay, SSE, `/phone`. 15/15 tests. Real LiveKit: accept in 60 ms.
- **Not tested yet:** a real Chert FaceTime call (waiting on Chert for a line with video + BYOR webhook).
- **Open:** no auth on the public routes yet (webhook, `/api/events`, `/api/dev-session`).
- **PR:** #1 `telephony`, ready to merge.
