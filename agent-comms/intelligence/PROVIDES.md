# Intelligence provides (part 3, `src/intelligence/`)

Owner: Nikhil. Approved plan and evidence status: [STATUS.md](STATUS.md).
Presentation owners: start with [the screens and voice handoff](SCREENS-VOICE-HANDOFF.md).

Implementation includes Codex CLI and OpenAI providers, recorded-photo outputs,
and the existing LiveKit tools wired through a serialized per-call bridge.
See the newest STATUS entry for the exact pushed commit and verification.

## Run the CLI-backed live worker

On the one agreed worker machine, use Node 22.23.2+ or 24, installed dependencies,
`codex login status`, and `.env.local` containing the shared LiveKit keys plus an
OpenAI Realtime API key. Then run `AGENT_NAME=intelligence-demo npm run agent:cli`.
Tell Ben the chosen name so `chert dev --agent intelligence-demo` dispatches to it.
Do not run another worker with the same name. CLI login does not authenticate voice.
Caller video on the current Chert CLI path remains unverified; `/phone` is the
camera fallback. No worker or real call has been started by this session.

Tools remain `look_at_device`, `find_fix`, `show_step`, `check_result`. Device tool
calls queue per call; missing frames and model errors return explicit retry guidance.
Plan survives a new camera angle. New step/photo/target publish together after
observation. Clearing a snapshot now clears GuideCard's cached image as well.
Screens should keep rendering existing `CallState`; no new endpoint or DTO.

Current proof: laptop charging-port identification and an incompatible barrel
connector, using real supplied photos. It does not establish a hardware fault,
correct adapter wattage, successful charging, or completed FaceTime integration.
Original images/results remain local; they contain personal screen content.

## Agent to intelligence

```ts
observe({ jpeg, referenceJpegs?, focus?, step?, previous? }): Promise<Observation>
findFix({ jpeg, referenceJpegs?, observation, symptom }): Promise<FixPlan>
```

- `jpeg` is a nonempty, upright JPEG `Buffer`, max 1280 px, not a URL or an image
  description. `findFix` requires the **same frame used for its observation**.
  Required `FixRequest.jpeg` is implemented on main.
- Optional `referenceJpegs` contains at most two earlier upright JPEG Buffers. Both
  providers receive current image first, earlier references after. The live bridge
  supplies first/latest prior views privately; missing video or failures reset them.
  Other callers (including iMessage) must opt in; no automatic cross-session memory.
- For connection corrections, target the destination socket in the current frame,
  not the misplaced connector. Never carry coordinates across frames. Pure
  disconnect/inspection tasks can still target the connector itself.
- `observe` reports current visible device, lights, ports, findings, next view,
  confidence, and optional target. `previous` supplies context, not current facts.
- `findFix` receives the image itself plus observation and symptom, retrieves
  Keenable snippets in application code, and returns `likely_cause`, `steps`,
  `needs_technician_if`, and `sources: {title, url}[]`.
- Plans contain at most six nonempty steps. Sources are restricted to retrieved
  URLs; this validates provenance, not whether each source supports a claim.
- For a selected step, call `observe({ jpeg, step: plan.steps[n - 1] })`.
  The returned target is tied to that image and instruction. A target box is
  `[x0,y0,x1,y1]`, normalized 0..1, finite and ordered. Invalid or invisible
  targets become `null`; never invent a circle when evidence is insufficient.
- An invisible observation produces a request for a clearer view rather than an
  external diagnosis call. Missing image input is an error, even for that path.

## Intelligence to agent to screens

Intelligence returns `Observation` and `FixPlan`; it does not own voice, tickets,
`CallState`, dashboard events, or publication of the guide-card video track.

Part 2 pairs the displayed processed snapshot with the annotation observation
and selected instruction. Existing part 4 inputs remain:

```ts
CallState.observation.target // { label, box } | null
CallState.step               // { n, text }; n is 1-based
CallState.lastSnapshot       // existing JPEG data URL used by the guide card
```

Do not put a raw `Buffer` or serialized buffer in dashboard JSON. This plan does
not change the existing `lastSnapshot` transport or introduce a new screen DTO.

## Provider and testing boundary

- Implemented: `INTELLIGENCE_PROVIDER=codex-cli|openai`; local photo demo defaults to
  Codex CLI. Existing OpenAI implementation and `MOCK_INTELLIGENCE=1` remain.
- CLI requires an authenticated local Codex installation on the machine running
  intelligence. It is a local demo option, not a hosted deployment prerequisite.
- OpenAI uses server-side `OPENAI_API_KEY`, `VISION_MODEL`, and `EXTRACT_MODEL`.
  Keenable uses `KEENABLE_API_KEY` when configured, otherwise the existing public
  endpoint. Credentials stay in gitignored `.env.local`.
- Existing runner entrypoint: `npm run try:intel -- photo.jpg "no internet"`.
  Supports `--step`, `--out`, and `--facts`; writes processed.jpg, result.json,
  and preview.png (or failure.json). See [runner guidance](../../src/intelligence/README.md).
- `MOCK_INTELLIGENCE=1` is canned integration data, never proof of model accuracy.
- CLI requests are serialized with a 45-second execution timeout per request.
  One demo has multiple calls plus search; do not assume it fits a 5-second
  telephony webhook or the probe's 5.3-second latency.

No intelligence work is required in telephony's accept path. The agent owns
progress speech and how recoverable intelligence failures are surfaced to callers.

## Implemented wiring pattern for parts 2 and 4

This is integration pseudocode for the required-image contract, not a new API or
a claim that the full flow is tested. The tool arguments visible to the voice
model stay small: the agent captures JPEG bytes internally rather than asking
the voice model to supply image data.

```ts
// look_at_device(focus): agent captures and retains this exact pair.
const observation = await intelligence.observe({ jpeg, focus });
const observed = { jpeg, observation };

// find_fix(symptom): return the structured plan to the voice model to explain.
const plan = await intelligence.findFix({ ...observed, symptom });

// show_step(n): fixed-photo demo reuses jpeg; live agent captures a fresh frame.
const text = plan.steps[n - 1]; // validate n before proceeding
const annotated = await intelligence.observe({ jpeg: stepJpeg, step: text });
// Update these together, only if the result still belongs to the active step.
state.plan = plan;
state.observation = annotated;
state.lastSnapshot = await thumb(stepJpeg, 640); // same orientation/aspect ratio
state.step = { n, text };
state.stage = 'guiding';
await card.render(state); // screens turns state into its existing video track
// Agent also posts CallEvent for the dashboard and returns a small tool result.
return { step: text, circled: annotated.target?.label ?? null };
```

The LiveKit voice agent chooses how to say the returned facts and instruction.
Screens uses `step.text`, `lastSnapshot`, and `observation.target`; it does not need
the model prompt, retrieval snippets, raw JPEG Buffer, or a separate intelligence
connection. Its video track and the agent's audio reach the caller through the
same LiveKit room. The projector dashboard separately receives state events via
telephony's SSE relay.

For an unplugged-WAN case, the intended sequence is: report only visible evidence,
propose a supported next step, then display and speak that same step with a target
only if the relevant port is visible. Connecting a cable in a comparison photo
must not automatically produce a resolved ticket. Missing images, timeouts, and
invalid outputs must remain failures/requests for more evidence, not mock success.
