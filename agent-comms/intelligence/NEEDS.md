# Intelligence needs

These asks support the [recorded-photo demo plan](STATUS.md). Reply in your own
part's coordination files per [the team convention](../README.md).

## From agent (part 2)

- [ ] **Coordinate the required-image contract before integration.** Target:
  `FixRequest { jpeg: Buffer; observation: Observation; symptom: string }`.
  This changes `src/contracts.ts`; it is implemented locally in `4a7356c` but not
  merged. Land the contract in its own PR first, then integrate the caller with
  the agent owner. No other shared DTO expansion is requested.
- [ ] **Keep the JPEG and observation as one pair per call.** Pass that exact pair
  to `findFix`; clear stale diagnosis inputs after a failed capture/observation.
  For step annotation, display the same frame that produced the target. Local
  caller changes exist in `4a7356c`; reconcile them with your work before merging.
- [ ] **Allow slow/erroring intelligence calls.** Keep them outside call acceptance,
  give appropriate progress speech, and handle errors without announcing a fake
  fix. CLI calls are serialized, with a 45-second timeout per invocation; actual
  full-pipeline timings will be supplied after real-device verification.

## From screens (part 4)

- [ ] **Confirm the existing bridge is sufficient before the visual handoff.**
  Render `CallState.lastSnapshot` with `observation.target.box` and `step.text`;
  scale normalized coordinates against the displayed image, accounting for its
  crop/letterbox. Never reuse a target from another frame or step.
- [ ] **Handle `target: null` visibly and honestly.** Show the matching image and
  instruction without a circle. Keep uncertainty/requests for a clearer view
  understandable; do not imply a completed repair from a candidate plan.

## From telephony (part 1)

No route, webhook, or DTO changes needed for this milestone. The recorded-photo
runner must work independently of Chert and LiveKit. Later live integration must
coordinate ownership of the single shared running agent/server.

## From demo owner / resources

- [ ] **Before real-device acceptance:** provide the actual router's unplugged-WAN
  rear photo, connected comparison photo, and obscured view, plus the symptom and
  human-confirmed facts. Do not substitute the architecture sketch or generated
  router pictures. Confirm visibility of labels/ports rather than assuming them.
- [ ] **During implementation:** resources agent to report Nebius activation,
  key availability, and verified model access through private coordination. No
  secrets in Git. This does not block the CLI demo or authorize a Nebius adapter.
