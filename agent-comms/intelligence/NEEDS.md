# Intelligence needs

These asks support the [recorded-photo demo plan](STATUS.md). Reply in your own
part's coordination files per [the team convention](../README.md).
Please acknowledge each applicable `INT-*` ID in your own `STATUS.md` before
integration, noting accepted / needs discussion, your planned change, and any
incompatible work already underway. Publishing these asks does not imply agreement.
Independent UI and provider work can proceed while replies are pending.

## From agent (part 2)

- [ ] **INT-001 — Coordinate the required-image contract before integration.** Target:
  `FixRequest { jpeg: Buffer; observation: Observation; symptom: string }`.
  This changes `src/contracts.ts`; it is implemented locally in `4a7356c` but not
  merged. Land the contract in its own PR first, then integrate the caller with
  the agent owner. No other shared DTO expansion is requested.
- [ ] **INT-002 — Keep the JPEG and observation as one pair per call.** Pass that exact pair
  to `findFix`; clear stale diagnosis inputs after a failed capture/observation.
  For step annotation, display the same frame that produced the target. Local
  caller changes exist in `4a7356c`; reconcile them with your work before merging.
- [ ] **INT-003 — Allow slow/erroring intelligence calls.** Keep them outside call acceptance,
  give appropriate progress speech, and handle errors without announcing a fake
  fix. CLI calls are serialized, with a 45-second timeout per invocation; actual
  full-pipeline timings will be supplied after real-device verification.
- [ ] **INT-004 — Own the voice and visual routing.** `look_at_device` calls
  `observe`; `find_fix` calls `findFix` and returns the plan to the voice model;
  `show_step(n)` calls `observe` for that exact instruction and sends the matching
  snapshot/observation/step to `CallerScreen.render`. Intelligence returns data;
  it does not speak or publish a video track. Keep a previous circle out of a new
  step/image while annotation is pending or fails. Confirm this sequence before
  wiring the live flow; see the example in [PROVIDES.md](PROVIDES.md).
- [ ] **INT-005 — Keep live voice setup separate.** Our Codex CLI provider replaces
  intelligence inference only. Your current OpenAI Realtime voice session still
  needs its own working credentials. Confirm the live worker's model setup before
  the combined demo; the fixed-photo runner needs no voice session.

## From screens (part 4)

- [ ] **INT-006 — Confirm the existing bridge is sufficient before the visual handoff.**
  Render `CallState.lastSnapshot` with `observation.target.box` and `step.text`;
  scale normalized coordinates against the displayed image, accounting for its
  crop/letterbox. Never reuse a target from another frame or step.
- [ ] **INT-007 — Handle `target: null` visibly and honestly.** Show the matching image and
  instruction without a circle. Keep uncertainty/requests for a clearer view
  understandable; do not imply a completed repair from a candidate plan.
- [ ] **INT-008 — Build the waiting and display states independently now.** Use
  fixture `CallState` data for `looking`, `diagnosing`, and `guiding`, including
  a visible target and `target: null`. Use a known image and box for layout checks;
  label fixtures as fixtures. Preserve `CallerScreen.publish/render/close` and the
  existing `agent-guide-card` LiveKit video track; no new intelligence endpoint,
  model call, or audio generation is needed in screens. Publish the waiting card
  promptly so telephony can mark the agent ready. Confirm the normal guide-card
  path works before the real-model visual handoff.

## From telephony (part 1)

No route, webhook, or DTO changes needed for this milestone. The recorded-photo
runner must work independently of Chert and LiveKit. Later live integration must
coordinate ownership of the single shared running agent/server.

## From demo owner / resources

- [ ] **INT-009 — Before real-device acceptance:** choose the actual device/fault and provide a faulty
  photo, comparison photo, and obscured view, plus the symptom and human-confirmed
  facts. Router/WAN is an example only; no product has been selected. Do not substitute the architecture sketch or generated
  router pictures. Confirm visibility of labels/ports rather than assuming them.
- [ ] **INT-010 — During implementation:** resources agent to report Nebius activation,
  key availability, and verified model access through private coordination. No
  secrets in Git. This does not block the CLI demo or authorize a Nebius adapter.
