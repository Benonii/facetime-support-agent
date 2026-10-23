# Intelligence status (part 3, Nikhil)

## 2026-10-23: implementation checkpoint 1 — CLI provider pushed

- Branch `intelligence-cli-demo`, commit `2f83f37`, draft [PR #7](https://github.com/Benonii/facetime-support-agent/pull/7).
- Separate required-image contract [PR #6](https://github.com/Benonii/facetime-support-agent/pull/6) addresses INT-001. Do not merge the contract alone as a runnable release: main's agent caller still lacks the image. Matching caller is in #7; agent owner please acknowledge INT-001/002/004 before integration.
- Codex CLI preflight used the real saved login and attached planning-sketch image: valid structured response in 5.71 s, reported model `gpt-6.1-sol`. This is not router diagnosis evidence.
- Implemented shared structured-model interface, OpenAI preservation, explicit provider selection, serialized CLI requests, 45 s timeout, private temporary files and process-group cleanup. Twelve focused intelligence tests and focused TypeScript check passed.
- Local photo runner will default to CLI; live factory keeps OpenAI unless `INTELLIGENCE_PROVIDER=codex-cli` is explicit. Realtime voice setup remains part 2's responsibility.
- Next: recorded-photo output bundle and PNG preview, real-model negative check, independent review. Actual router photos remain pending; no live agent/server started.
- Screens can proceed with INT-006/007/008 using existing CallState. No new screen fields or endpoint are being introduced. Agent/screens acknowledgments still pending.
- Resources agent has been asked via the board for verified Nebius access status; it does not block this provider.


## 2026-10-23: pre-build handoff to agent and screens owners

- **Owner/session:** part 3, Nikhil's intelligence implementation session. This
  update is written by the coding agent on Nikhil's explicit request to communicate
  integration needs before building.
- **Communication branch:** `intelligence-prebuild-handoff`, based on shared main
  `e42d6db`. The initial plan (PR #4) and session protocol (PR #3) are now merged.
  Upstream write access is still unavailable to this account, so updates use a
  fork PR. Only `agent-comms/intelligence/` changes in this checkpoint.
- **Planned outcome/files:** CLI provider, focused provider tests, recorded-photo
  runner and preview export in `src/intelligence/`. Preserve existing output DTOs.
  The already-local required-image change touches `src/contracts.ts`; its matching
  caller touches `src/agent/agent.ts` and needs the agent owner's coordination.
  No edits to screens or telephony are planned by this owner.
- **Before we build:** [NEEDS.md](NEEDS.md) now gives parts 2 and 4 stable request
  IDs `INT-001` through `INT-008`. [PROVIDES.md](PROVIDES.md) includes the exact
  tool-result-to-voice and `CallState`-to-screen sequence. Screens can build with
  existing fixtures; agent can prepare routing and waiting/error behavior.
- **Dependencies:** the agent owner must confirm the image bridge/caller change
  before cross-owner integration. Screens must confirm the existing state is
  sufficient. Actual router photos remain pending. CLI authentication is local
  to the machine running intelligence; it does not provision Realtime voice.
- **Acknowledgments:** none from agent/screens yet. No agent/screens coordination folders
  exist on the inspected shared main. Repository publication makes this visible
  for their next fetch; it does not prove they have read or accepted the requests.
- **Telephony reply received:** read Ben's acknowledgment/proposal at `1f9ad3a`.
  Agreed that recorded-photo intelligence needs no telephony work and remains out
  of call acceptance. This session will not start a shared agent worker/server.
  For later live tests, part 2 must name the one worker operator and coordinate
  with Ben's server/tunnel, matching LiveKit project, `AGENT_NAME`, and `SERVER_URL`.
  The worker operator is not yet agreed; this is not a claim that live setup works.
- **Next checkpoint:** after publishing this handoff, begin independent provider
  work; fetch coordination updates at safe checkpoints (roughly 10–15 minutes)
  and before integrating shared contract/caller changes. Pause only disputed
  dependent changes. No new provider implementation has started in this checkpoint.
- **Checks:** documentation whitespace and relative links only; no runtime changes.

## 2026-10-23: approved demo plan, published before implementation

**Team handoff:** build around the image-in / structured-data-out bridge in
[PROVIDES.md](PROVIDES.md). Requests to agent and screens owners are in
[NEEDS.md](NEEDS.md). This entry is the approved implementation plan, not a claim
that the provider or recorded-device demo is already working.

### Current position

- Local commits `489723c` and `4a7356c` implement hardened image observations,
  image-based diagnosis, Keenable retrieval, validated target boxes, and matching
  image/observation inputs in the agent. Seven focused tests and the repository
  typecheck passed for that local code.
- Those commits are **not on shared main** at publication. The required
  `FixRequest.jpeg` change must be integrated through the team's contract-first
  PR workflow, with the agent owner coordinating the caller update. Do not assume
  pulling this documentation adds the implementation.
- Remaining: provider connection, repeatable device case, visual output, and
  real-model verification. Full FaceTime integration is a later team milestone.
- Codex CLI is authenticated on Nikhil's development machine. An image-plus-JSON
  feasibility probe succeeded in 5.3 seconds. This was not a router diagnosis
  benchmark and does not establish authentication on another machine.
- No OpenAI API key is configured for intelligence yet. API credit is available;
  LiveKit credentials do not provide model access. No secrets belong here.
- Actual router photos and human-confirmed expected facts are still needed.

### Architecture and scope

```text
Fixed photo + symptom
        |
observe({ jpeg }) -> Observation
        |
Keenable search (application code)
        |
findFix({ jpeg, observation, symptom }) -> FixPlan
        |
select returned step (default 1)
        |
observe({ jpeg, step }) -> Observation with target box or null
        |
Matching photo + instruction + annotation -> agent/screens handoff
```

Keep `ObserveRequest`, required-image `FixRequest`, `Observation`, and `FixPlan`.
Beyond landing the already-local required-image change, no further shared DTO
expansion is planned. Voice, call state, and screen publication stay with their
owners. Rich conversation history, company manuals/specs, previous incidents,
dedicated image search, and autonomous diagnosis loops remain presentation vision.

### Implementation sequence

1. **Land the image bridge through PRs.** Coordinate the contract-first change and
   matching agent caller with part 2. Preserve unrelated team work.
2. **Connect the provider.** Add Codex CLI behind the existing intelligence
   interface; preserve OpenAI API and the explicit mock switch. Select through
   `INTELLIGENCE_PROVIDER=codex-cli|openai`; default the local photo demo to CLI.
   Keep Keenable retrieval in application code and pass snippets into the model.
3. **Bound CLI execution.** Use a subprocess argument array, prompt on stdin,
   JPEG via `--image`, and JSON schema derived from the existing Zod output schema.
   Run fresh, ephemeral, read-only invocations outside the product checkout;
   disable user-configuration loading and request no tool use. Keep temporary
   image/schema files private and remove them afterward. Serialize requests,
   enforce a 45-second timeout, clean up processes, and reject failed, empty, or
   schema-invalid responses. Never replace failure with canned success.
4. **Preflight and fallback.** Run CLI preflight before the full case. If saved
   authentication, quota, or structured output blocks it, configure the existing
   OpenAI implementation using the verified credit. Ask the resources agent for
   Nebius activation/key/model status; do not delay this demo or build a Nebius
   adapter until access is verified. CLI reference:
   [official non-interactive documentation](https://developers.openai.com/codex/noninteractive).
5. **Fix one device case.** Use an unplugged WAN cable on the team's actual router.
   Collect a clear faulty rear photo, a connected comparison, and an obscured
   view. Record the symptom and human-confirmed expected facts. Inputs stay fixed;
   observations and plans come from the model, not hardcoded diagnoses.
6. **Extend the photo runner.** Save observation, plan, selected-step annotation,
   provider/model identity, and actual stage timings. Allow explicit selection of
   a returned step, defaulting to step 1. Export a PNG with the exact processed
   photo, target circle, and selected instruction. A null target means no circle.
   Keep raw JPEG buffers out of dashboard JSON and generated artifacts out of
   tracked source changes.

### Verification and acceptance

- Retain the seven local regressions; add focused coverage of CLI image/schema
  arguments, invalid output, timeout/process cleanup, and provider selection.
- Run the actual faulty-device case twice. Inspect visible facts, plausible next
  action, whether citations support it, and circle position on the matching image.
- Run connected and obscured photos. The connected observation must reflect the
  changed state; insufficient evidence must produce uncertainty. A photo alone
  does not establish that internet service was restored.
- Inspect the PNG; record actual stage timings. Do not reuse the 5.3-second probe
  as a diagnosis latency claim.
- Complete independent review and fixes before final verification. Announce a
  cancelable 60-second countdown, then run repository typecheck and smoke once
  for the final batch. Keep smoke/generated outputs outside tracked source files.
- Show Nikhil the real result for acceptance before expanding the workflow.

### Deliverable and release boundary

Deliver the runnable command, fixed-case inputs, actual model outputs, annotated
preview, timings, and a concise agent/screens integration note. Commit owned code
locally and prepare PR handoff. This publication authorizes coordination documents
on main; it does not publish implementation code or deploy services.

This milestone proves intelligence on recorded images. It does not prove a
completed repair or live FaceTime call. The later video demo should use the same
device and fault. The only remaining user-supplied input is the hardware photos
with confirmed facts; implementation can proceed while those are collected.
