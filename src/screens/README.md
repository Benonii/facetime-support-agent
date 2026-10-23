# Screens and conversation presentation (Part 4)

Branch: `feat/screens-conversation`. Based on the shared four-part contracts.

## Run the standalone demo

```sh
npm ci
npm run screens:demo
```

Open http://localhost:8790. Use Node 22 or 24, as required by the existing project.
No `.env.local`, model key, Chert account, microphone, or LiveKit connection is needed.
The demo never registers another worker against your teammates' shared LiveKit project.

- Eight scenes follow Maria's disconnected WAN cable from hello to resolution.
- Additional scenes cover an unclear camera, a changed photo, and a support handoff.
- Play the walkthrough, step through it, or edit the caption and instruction.
- Toggle the target ring. Both image phases are rendered by the production `GuideCard`.
- The **Agent context** tab shows the received `CallState` and returned `getContext()` value.
- `/dashboard` is the actual support dashboard, using the demo's isolated SSE stream.
- Device images are labelled illustrations. Conversation messages are scripted, not a live model.

`SCREENS_PORT=8791 npm run screens:demo` changes the port.

## Integration: keep the call wiring as it is

The existing agent already imports `GuideCard` and calls `publish(room)`, `render(state)`, and `close()`.
Those calls still work. The 720 × 1280 camera track is still named `agent-guide-card`, at 10 fps,
published from the same participant as agent speech. Chert's BYOR bridge carries that video back to the caller.
This PR does not change the webhook, room routing, agent tools, voice session, or intelligence implementation.

### Optional, additive contract for the agent teammate

`src/contracts.ts` adds `ScreenCue`, `ScreenContext`, optional `CallState.screen`, and optional `CallerScreen.getContext()`.
No existing required fields, stage values, or event types change.

Agent → screen:

```ts
state.screen = {
  phase: 'speaking', // listening | thinking | speaking | waiting
  caption: { speaker: 'agent', text: 'Plug the yellow cable into the circled port.' },
  snapshotId: 'frame-42',
  observationSnapshotId: 'frame-42',
};
await card.render(state);
```

A caption is display-only. Populate it from the actual final utterance or a deliberate screen caption.
It never requests speech, invents an agent turn, or changes turn detection. Omit it to show guide copy,
which is explicitly labelled **YOUR GUIDE**, rather than a transcript.

Screen → agent (after rendering):

```ts
const screen = card.getContext();
// Add this to the existing small tool result, if useful:
return { step: state.step?.text, screen };
```

The returned context includes the displayed title, instruction, caption, phase, camera-view status,
visible highlight, next action, and presentation issues. It contains no images, credentials, or audio.
If the caller cannot see a highlight, the voice agent should not say “see the circle.”
A very long caption or step is bounded on screen; the returned display text and issue report reflect truncation.

### Photo/annotation pairing

Set `snapshotId` as soon as a new photo is available, and set `observationSnapshotId` only when its analysis returns.
If one ID is missing or they differ, the ring is suppressed until the pair matches.
The current in-process agent also works without IDs: changing the photo while retaining the previous Observation
suppresses its old target until a new Observation object is supplied. Explicit IDs are recommended across serialization boundaries.
Clear the photo when camera data is removed; an unreadable or invalid image never leaves an older image on screen.
Invalid target boxes (wrong length, non-finite, reversed, or outside 0–1) are never drawn.

The screens cannot determine whether vision correctly identified the physical part. That remains Part 3's responsibility.
Likewise, screens trust the agent's resolved stage; result verification belongs to Part 2.

## Live Chert setup (organizer update)

The organizer's email says to enter **HACKATHON** during Chert setup and select **Shared Line**.
The team needs its own LiveKit account/key and its own model API key; Chert is not providing model credits.
Use the inbound FaceTime Video/BYOR path documented in `CONTEXT.md`, with the team's configured webhook.
The demo here does not provision lines or verify phone numbers. Coordinate one active call with the telephony owner.

## Verification

```sh
npm run typecheck
npm run screens:test
npm run smoke
```

The tests exercise the real renderer and presentation rules: target validation, image provenance, unclear or missing
camera data, display-only captions, pulsing phases, concurrent updates, and bounded long text.
The original smoke test remains compatible. Live FaceTime relay still requires the team's provisioned Chert line
and a real media call; a browser demo alone does not establish that the bridge works.

## File ownership

- `card.ts`: actual caller-video pixels, publication, snapshots, annotation placement, context feedback.
- `presenter.ts`: evidence-aware copy and screen-context mapping.
- `demo/`: isolated fixtures and loopback-only demo server.
- `../../public/screens/studio.html`: screen and conversation workbench.
- `../../public/dashboard.html`: production support desk consuming existing `CallEvent` SSE.

The dashboard deduplicates by call ID and preserves final outcomes when `call.ended` arrives.
If the upstream server replays only `call.ended` after a page reload, it cannot reconstruct the omitted final state;
retaining/replaying the last state is a telephony-owner follow-up.
