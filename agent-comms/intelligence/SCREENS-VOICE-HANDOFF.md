# Screens and voice handoff: build the presentation around this

To the **screens owner (part 4)** and **voice/agent owner (part 2)**, from Nikhil's
intelligence coding session, at his explicit request.
[Reply / claim the work in GitHub issue #8](https://github.com/Benonii/facetime-support-agent/issues/8).

Intelligence and the agent
bridge are on main (`d7e64d3`; verification/handoff `be7ef23`). Pull main first.

**The ask:** take ownership of making the guidance clear, attractive, and easy to
follow. Use the actual camera photo, the model's selected instruction, and its
optional target. Screens owns layout, typography, annotation styling, transitions,
and dashboard presentation. Voice owns the spoken explanation, pacing, requests
for another view, and coordination with the displayed step. Choose the design;
the examples below illustrate the intended experience, not mandatory scripts.

## The bridge already implemented

```text
Caller camera → look_at_device → observe(JPEG) → facts returned to voice
Caller question + same JPEG/observation → find_fix → plan returned to voice
show_step(n) → fresh JPEG + selected instruction → observe → optional target
             → matching CallState → GuideCard video + dashboard state event
             → step/circled/next_shot returned to voice
```

No new intelligence endpoint is needed. Keep `look_at_device`, `find_fix`,
`show_step`, `check_result`, and the existing contracts. Relevant code:
[src/contracts.ts](../../src/contracts.ts),
[src/agent/device-tools.ts](../../src/agent/device-tools.ts),
[src/agent/agent.ts](../../src/agent/agent.ts),
[src/screens/card.ts](../../src/screens/card.ts),
[public/dashboard.html](../../public/dashboard.html).

| Available data | Use it for |
|---|---|
| `CallState.lastSnapshot` | Actual processed camera photo, as a small JPEG data URL |
| `CallState.step: {n, text}` | Current instruction and 1-based step number |
| `observation.target: {label, box} \| null` | Optional highlight; box is normalized `[x0,y0,x1,y1]` on that photo |
| `observation.findings`, `ports`, `indicators` | Brief explanation of what was seen |
| `observation.next_shot` | Specific request for a clearer/different camera view |
| `plan.likely_cause`, `steps`, `needs_technician_if` | Context and next actions, not proof of a fault or repair |
| `plan.sources: {title,url}[]` | Optional supporting links; may be empty; URL membership is not verified claim support |
| `CallState.stage` | `waiting`, `looking`, `diagnosing`, `guiding`, `resolved`, `technician` |

## Screens: INT-012

Make the photo and current instruction the main elements. Secondary facts and
sources can be quieter. The current guide card is a functional starting point;
you own how it should look. Please preserve these behaviors:

- Scale the target against the actual displayed image, including letterboxing.
  Never put coordinates from one photo onto another, or overlay the frozen target
  on a moving live camera stream. Avoid cropping unless you transform coordinates.
- `target: null` means no circle. Use `next_shot` to make the next action clear.
  A missing snapshot means clear the old image; the cache-reset fix is already in
  `GuideCard.render` with a regression. A new image/target/step arrives together.
- Make waiting/looking/diagnosing understandable. The renderer receives stage and
  available data; there is **no dedicated error-message field** in CallState.
  Voice receives tool failures and can explain them. Do not infer a specific error
  from `waiting`; propose any new shared error field before changing contracts.
- A port-identification answer is useful without a broken device. Avoid showing
  “repair completed” or “charging confirmed” merely because a port was located.
  Do not present model confidence as a calibrated accuracy percentage.
- Preserve `CallerScreen.publish/render/close` and `agent-guide-card` video.
  Publish promptly; the voice worker currently does this before slow inference.
  Dashboard state comes through `/api/stream`, keyed by callId.

## Voice: INT-013

Keep spoken guidance consistent with the displayed step. Say a short progress
line before a slow tool call; sampled full recorded runs took 24–28 seconds,
while targeted observations took 6–8 seconds. These are measurements, not an SLA.

Explain one useful observed fact, then one action. Only say a part is circled
when `show_step` returns a non-null `circled` value. If the port is not visible,
ask for the requested side instead of naming a substitute. On a tool error,
explain the failure and offer a retry; do not invent an answer. Plans survive new
camera angles, and device tools are serialized per call.

For the current proof, suitable wording would be “The MagSafe port is on this
side” or “That connector has a barrel-shaped tip; it doesn't match the stated
MagSafe or USB-C ports.” A subsequent task-complete or repair claim needs the
caller's confirmation. Do not force a connector or infer electrical compatibility
from shape alone.

## What was actually verified

- Left-side laptop photo: model located MagSafe; circle visually inspected.
- Opposite-side photo: no MagSafe target; requested the other side.
- Front photo: no port target; requested a side view.
- Loose connector: identified barrel tip, said it matches neither the stated
  MagSafe nor USB-C port, and highlighted it with leave-disconnected guidance.
- Two repeated full left-photo runs requested the missing connector before
  recommending a connection. Connector compatibility used laptop port types in
  the question; this is not simultaneous multi-image inference.
- Typecheck, 35 tests, smoke, and a real-photo GuideCard render passed. This is
  recorded-photo guidance evidence, not a completed live call or charging test.

For design work now, `npm run smoke` renders the existing labeled synthetic
fixture without keys. For another actual photo:

```sh
npm run try:intel -- /absolute/path/photo.jpg "the user's question" --out data/intelligence/new-case
```

It creates `processed.jpg`, `result.json`, and `preview.png`; `--step 2` selects
the second returned plan step. Preview PNG is an inspection artifact, not the
required final UI design. The original laptop photos/results remain local because
personal screen content is visible; they are not public repo assets. Use an
approved local photo or a fixture for design; retain the matching result/photo pair.

## Live-call setup and reply

On the one agreed worker machine, with saved Codex auth, shared LiveKit credentials,
and a separate OpenAI Realtime API key in `.env.local`:

```sh
AGENT_NAME=intelligence-demo npm run agent:cli
```

Coordinate that exact name with Ben's `chert dev --agent intelligence-demo`.
Caller video on that path is unverified; use the team's HTTPS `/phone` camera path
if needed. No worker has been started by the intelligence session.

Please acknowledge **INT-012** (screens) or **INT-013** (voice) in your own
`agent-comms/<part>/STATUS.md` or the linked GitHub handoff issue. State what you're
taking on and any missing field/blocker. Build the presentation and voice behavior
in your own folders; bring substantial bridge changes back before implementing.
