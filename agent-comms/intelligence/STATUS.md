# Intelligence status (part 3, Nikhil)

## 2026-10-23: voice → intelligence interface implemented (hackathon slice)
- New composite analyze_device starts capture at verbal tool invocation, acknowledges through LiveKit ctx.update, gives one 15s reminder, uses one JPEG for observe/plan/annotation, and returns the instruction to Realtime for speech. Follow-up ready/next/verify and explicit stop are wired. Existing CallState + ScreenCue send matching images to /phone and GuideCard; no shared contract changes.
- Preserved Ben’s greeting/brand/KB/frontend. INT-014 frontend guard landed independently in fe80d11; later c6404a0 retains the dimmed photo while a new look is pending. No frontend files changed by this slice.
- Focused checks: 4 new controller tests + 5 existing bridge tests pass; typecheck passes. One narrow read-only review found lost ticket evidence on cancel, fixed before capture of diagnosis. No broad suite per Nikhil’s hackathon instruction.
- Real intelligence checks: CLI gpt-6.1-sol placed the destination circle correctly on IMG_1051 and misplaced-connector IMG_1052 in 26s and 34s. Default API gpt-5 produced incorrect grounding on the same images; recommend CLI for this MacBook demo (credentials still separate from Realtime voice).
- Isolated real LiveKit/Realtime call with prerecorded spoken input + a photo camera track passed: verbal tool selection, waiting updates, looking/diagnosing/guiding events, published agent video, and returned agent audio. Temporary room/worker cleaned up. Actual handheld /phone call still to verify.
- Ruling from Nikhil’s scope update: defer new DTOs, display acknowledgement, provider-process abort propagation, exhaustive tests and deployment machinery. Cancel suppresses late state/speech; underlying inference may finish in background. 90s request wait cap.
- Run after pulling integration: restart ONE agreed agent worker with matching AGENT_NAME and SERVER_URL. For this verified image case use npm run agent:cli; voice still requires OPENAI_API_KEY. Do not run a second worker under the same name beside Ben’s worker.


## 2026-10-23: implementing hackathon voice → intelligence loop
- Nikhil authorized implementation and prioritizes functionality over broad hardening/tests. Baseline 645609d; branch intelligence-cli-demo.
- Scope: src/agent composite visual tool, fresh caller capture, asynchronous waiting updates, matching image/instruction output. Preserve Ben’s Shure greeting, KB and frontend. No shared DTO changes.
- Acknowledge TEL-010/TEL-011 and SCR-002: preserve owned files/lines, all existing fields/stages/tracks, and matched state emissions.
- No active overlapping claim on board; broadcast scope. Agent owner: report conflicts through board.
- Next checkpoint: focused bridge tests + typecheck, then live readiness/handoff. Real phone acceptance still pending.

## 2026-10-23: destination-target correction verified on the five-photo sequence

- Fixed root causes: vague connector text lost useful identity between camera angles; selecting the first generic withdraw step then circling the part to touch highlighted the misplaced cable. Added bounded earlier-image context to both transports/live bridge and destination-oriented connection planning/annotation. No device-specific destination or box coordinates added.
- Actual new CLI sequence (`gpt-6.1-sol`, same processed photo hashes, no future frames/expected targets): asks for side; wrong-side frame asks opposite edge; correct-side frame instructs MagSafe connection and circles socket; misplaced attempt says move toward hinge and circles destination socket above connector; final image recognizes amber/attached state and requests seating/charging checks. Preview inspected: frame 3 box `[0.239,0.625,0.287,0.643]`, frame 4 `[0.461,0.442,0.494,0.47]`, on the socket, not the cable.
- Verification: 21 focused intelligence/provider/demo/live-bridge tests pass and project typecheck passes. New reference-routing tests first failed on missing earlier images, then passed; invalid references fail before retrieval. Renderer unchanged; inspected actual generated previews. No broad telephony suite repeated.
- Limits: one recorded sequence, not a reliability benchmark or live FaceTime/voice test. Turns took 25.7–46.1 s; CLI latency remains too high for natural conversation. Earlier-image support is optional; current iMessage caller does not retain/pass references yet. Private photos/results stay local.
- Next for telephony/iMessage: pass up to two earlier upright JPEGs as `referenceJpegs` to observe, findFix, and annotation, excluding the current frame. Keep per-chat bounded storage and clear on conversation reset. Existing callers continue working without references; that does not gain sequential visual memory automatically.

## 2026-10-23: active sequential destination-target correction

- Owner: intelligence (Nikhil's Codex), session `01a16a47-1bb3-7d90-b151-e703f0c1f1ff`, branch `intelligence-cli-demo`, based on main `277f5a7`.
- User flagged the five-photo replay circling a misplaced connector instead of the correct socket. Trace: planner first says withdraw the connector; target prompt selects the part to touch. Earlier connector identity is lost in single-frame/text-only context.
- Scope: optional bounded `referenceJpegs` on ObserveRequest/FixRequest, both model transports, live device-tools bridge, destination-oriented connection prompts, focused tests and owning docs. No screen output shape change; no hardcoded port coordinates. Private photos stay local.
- Next checkpoint: replay these same five frames with only earlier image context; inspect correct-side and misplacement destination boxes. Verify missing/failed frames cannot reuse old coordinates. No worker/deployment changes.
- Telephony's new iMessage route remains untouched; it may opt into the optional earlier-image input after this checkpoint. Existing callers stay compatible.

## 2026-10-23: FaceTime blocker audit after telephony acknowledgment

- Fetched `7032784`: Ben acknowledges `intelligence-demo`, but keeps the line on `support-agent` until the intended worker registers. PR #9 (`42256c3`, still open at inspection) adds HTTP/webhook logging after calls showed "unavailable"; it is instrumentation, not a verified call fix.
- **Correction:** current [Chert beta.10 docs](https://docs.trychert.com/facetime-cli/video) support inbound video through `chert dev` without a webhook. Corrected stale `CONTEXT.md` guidance. The shared-line Integration URL 404 blocks the webhook setup, not necessarily CLI video. Line video and caller-capture enablement still require confirmation.
- **Local evidence:** original product `.env.local` has LiveKit credentials but no nonempty `OPENAI_API_KEY`; `AGENT_NAME` remains `support-agent`. No local listener on 8787 at inspection. These are observations of Nikhil's machine, not Ben's runtime. No worker, server, or connector started or stopped by this audit.
- Our agent already subscribes to video and manually grabs frames. `session.inputOptions.videoEnabled: false` disables direct Realtime video input, not our image-tool path; do not flip it as a speculative fix. A published GuideCard alone is not proof of Chert audio readiness.
- **Next evidence from telephony/voice:** one failed call's timestamp, Chert connector readiness/error lines, worker registration/job/error lines, and whether the bridge participant appeared. Keep secrets out. If connection works, confirm `[frames] reading video` plus changing camera observations and returned GuideCard video. A green plain `doctor` does not prove the named agent or a conversation.
- Configure voice API access on the agreed worker machine; register exactly `intelligence-demo` in the same LiveKit project before Ben switches the connector. For an independent camera/voice proof, use `/phone` with server + HTTPS tunnel + matching worker name. This fallback also needs voice credentials; it does not validate FaceTime.
- Documentation-only audit and handoff. No new runtime verification or claim that the "unavailable" root cause is identified.

## 2026-10-23: presentation ownership handed to screens and voice

- Nikhil explicitly requested a message and repo handoff so the other owners can make the intelligence results clear and attractive. Published [SCREENS-VOICE-HANDOFF.md](SCREENS-VOICE-HANDOFF.md), with exact fields, examples, verified cases, renderer constraints, and live setup limits.
- INT-012 assigns visual presentation to screens; INT-013 assigns spoken presentation and synchronization to voice. These are handoff requests, not received acknowledgments. No screens/agent sessions were identifiable on the board, so delivery uses a repo issue and board broadcast addressed to those roles.
- Delivery: [GitHub issue #8](https://github.com/Benonii/facetime-support-agent/issues/8) posted for both roles; board broadcast links to it. No named owner or receipt acknowledgment is claimed.
- Documentation only; corrected stale planned/pending language in PROVIDES. No code changes or repeated test suite. Actual photos remain local; the repo includes the data contract and replay instructions.

## 2026-10-23: CLI intelligence and live tool integration landed on main

- **Code on main:** `d7e64d3` (includes the provider/runner, required-image contract and matching caller). Nikhil explicitly authorized direct main pushes and the agent integration; this supersedes the earlier PR-only/waiting-for-owner notes below. No DTO expansion beyond required FixRequest.jpeg. PR #6/#7 are superseded by the integrated main checkpoint.
- **Launch:** on the one agreed machine, `AGENT_NAME=intelligence-demo npm run agent:cli`. Requires saved local Codex authentication, shared LiveKit env, and a separate OpenAI Realtime API key. Ben's `chert dev --agent intelligence-demo` must match the worker name. No worker started by this session; live voice authentication and caller video remain unverified.
- **Tool chain:** agent.ts keeps `look_at_device`, `find_fix`, `show_step`, `check_result`. Per-call bridge queues them, keeps image and observation paired, returns results to voice, and emits matching snapshot/target/step to screens. Errors ask for retry; ordinary view changes preserve the plan. Step publication waits for the fresh target/image.
- **Narrow screens fix:** independent review found GuideCard retained a cached photo after lastSnapshot cleared. Fixed cache reset plus rendered-pixel regression; no layout change. Screens owner should preserve it. The second review finding (plan discarded on new angle) is also fixed with a regression.
- **Actual supplied-photo evidence:** two left-side full pipeline runs 27.048/27.544 s (same processed SHA), both identify MagSafe/two USB-C/headphone and ask for missing connector before connection. Current-prompt targeting: left MagSafe 7.591 s, opposite-side null 6.787 s, front null 6.255 s. Connector full run 24.001 s identifies a barrel plug, says it matches neither stated MagSafe nor USB-C, and circles it with leave-disconnected guidance. Model reported gpt-6.1-sol. All relevant previews inspected locally, including the real GuideCard with the photo and a cleared-card render.
- **Evidence limit:** a port-guidance proof, not charging/repair validation. Connector run receives laptop port types in the symptom; it is not joint two-image inference. Initial connector-only view was normalized away; prompt now treats visible accessories as subjects, verified by rerun. Raw photos/results are local because they contain personal screen content.
- **Verification:** after review fixes and cancelable 60-second wait, repository typecheck passed, **35/35 tests passed**, smoke passed. Smoke initially failed to locate tsx from output cwd; corrected to absolute loader path and reran smoke only. New native renderer test calls dispose during teardown. No code edits after the final passing batch.
- **Search:** Keenable research completed separately (six hypothetical public queries, 247–377 ms). Source host filtering does not prove model/symptom applicability. Existing retrieval retained; no new manual corpus, Nebius adapter or tuned search pipeline. The connector run's Apple source supports MagSafe families/matching charger guidance; connector identity is visual evidence, not a source claim.
- **Next shared test:** confirm one worker operator, configure Realtime key, ensure a camera track reaches the worker, make one live port-guidance call. If Chert CLI has no video, use `/phone`. Agent and screens owners should fetch main and review PROVIDES; this publication is not an acknowledgment from those owners.

## 2026-10-23: laptop charging proof and explicit agent integration

- Nikhil supplied four laptop/connector photos and selected a simple port-identification / incompatible-connector proof. This is guidance verification, not a broken-device repair. Original photos and model outputs stay local, outside the public repo.
- Nikhil explicitly requested changes to `src/agent/agent.ts` and CLI-backed LiveKit integration. This session now owns that narrow integration plus `src/agent` focused tests, an explicit `agent:cli` launch and related setup documentation. Existing tool names and screen DTOs remain unchanged. No screens or telephony implementation edits.
- Existing implementation through `3aa5b84` passed independent review (one failure-telemetry fix applied), repository typecheck, all 30 tests and inspected smoke render after the 60-second countdown. New integration changes will receive focused checks; previous results are not claims about new code.
- Read telephony update `5f7f970`: Ben runs `chert dev` on the shared line; caller video remains unverified. No worker started by this session. A missing camera track must produce a request for video, never an invented observation. Use `/phone` if the CLI call path has no video.
- Agent flow: `look_at_device` captures JPEG → CLI observation; `find_fix` sends that exact JPEG/observation plus symptom → plan returned to voice; `show_step` observes a fresh frame with the selected step → matched snapshot/target/instruction rendered by screens. CLI inference does not replace OpenAI Realtime voice credentials.
- Next: run laptop photos through the real model, inspect target placement, finish agent integration and push a coherent verified code checkpoint to main under Nikhil's explicit authorization. Part 2/4 agents: preserve these tool names and CallState fields; pull before editing.

## 2026-10-23: checkpoint 2 — runner pushed; hardware choice still open

- User clarification: **no demo product/fault has been selected**. Router/WAN was an example, not a fixed requirement. Do not build product-specific UI or assume a manual corpus. Recorded inputs and real-device acceptance wait for that choice.
- Photo runner/preview pushed at `194c924` in [PR #7](https://github.com/Benonii/facetime-support-agent/pull/7); later wording generalizes the default symptom. `--step` selects a returned step (default 1); `--out` creates a new bundle of processed JPEG, result JSON, PNG, model identity and timings. `--facts` records expected human facts without feeding answers to the model.
- Real saved-auth negative case on the supplied planning sketch: no device visible, no invented ports/cause/target, request for a real device view. Observing 5.914 s, annotation 6.263 s, total 12.410 s; diagnosis/search skipped on no-device evidence. Preview inspected. This is not a fault-diagnosis benchmark.
- Two additional focused runner checks pass; independent whole-branch review underway before final verification. No actual faulty/comparison/obscured hardware runs yet.
- Separate Keenable research session requested by Nikhil is exploring product-agnostic failure queries, tuning and result provenance. It owns no shared implementation files. Current simple application-side search remains; no product-specific corpus work yet.
- Resources reply received: Nebius activation, key and model access remain unverified. No adapter or repeated promo request; CLI demo proceeds independently.
- Parts 2/4: the handoff fields and requests INT-001 through INT-008 are unchanged. The same processed image, selected instruction and optional target must travel together. Model provider choice remains private to intelligence.


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
