# Screens provides (part 4)

- `GuideCard` publishes `agent-guide-card` from the same LiveKit participant as agent audio.
- `render(CallState)` shows the matched `lastSnapshot`, `step.text`, and valid `observation.target`; stale or invalid annotations are hidden.
- Observed indicators and ports are compact caller-facing chips. A supported finding is shown as guide copy when no transcript caption is supplied.
- `getContext()` reports the actual rendered presentation without image bytes for testing and agent inspection.
- The dashboard reads `GET /api/stream`, keys calls by `callId`, and presents findings, plans, sources, snapshots, and tickets.
- Run `npm run screens:test` for the renderer and live-bridge checks; run `npm run screens:demo` for the scripted studio.
