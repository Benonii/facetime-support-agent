# Intelligence prototype

One camera frame plus the caller's symptom produces observations and a short fix
plan. `FixRequest` in `src/contracts.ts` now requires `jpeg: Buffer` as well as the
observation and symptom. Agent and CLI callers pass the same photo to both calls;
screen output shapes are unchanged. This prototype does not include a company manual
corpus, conversation memory, dedicated image search or a new diagnostic loop.

## Run with a real photo

Use Node 22.23.2+ or Node 24 and installed dependencies. The photo runner defaults
`INTELLIGENCE_PROVIDER` to `codex-cli`; the live agent keeps `openai` as its default.
An explicit environment value takes priority. `MOCK_INTELLIGENCE=1` always means
canned fixture data and is labeled as such in saved results.

```sh
codex login status
npm run try:intel -- /absolute/path/router-faulty.jpg "internet is down" --out data/intelligence/faulty-1
npm run try:intel -- /absolute/path/router-faulty.jpg "internet is down" --step 2 --out data/intelligence/faulty-step2
INTELLIGENCE_PROVIDER=openai npm run try:intel -- /absolute/path/router-faulty.jpg "internet is down"
```

CLI requires an authenticated `codex` executable on PATH (or `CODEX_BIN` as an
executable path). Use a version supporting `exec --ephemeral --ignore-user-config
--output-schema --image`. `CODEX_MODEL` optionally pins the model; otherwise the
CLI default is used and its reported identity is saved. No new API key is needed
for an existing CLI login. Calls run serially, each with a 45-second execution
limit, in private temporary directories outside the checkout. They request no
model tool use, use a read-only sandbox, and remove temporary files/processes.
This is a local demo integration, not a public inference service.

For OpenAI, put `OPENAI_API_KEY` in gitignored `.env.local`. `VISION_MODEL` defaults
to `gpt-5`; `EXTRACT_MODEL` to `gpt-5-mini`. Both providers use application-side
Keenable retrieval (`KEENABLE_API_KEY` optional; public endpoint otherwise).
CLI does not replace the separate OpenAI Realtime voice session.

The runner rotates/resizes the input once, then supplies the same processed JPEG
to observation, diagnosis, and selected-step annotation. `--step` is a 1-based
index into the returned plan (default 1), replacing the older freeform third
positional argument. An unavailable step is an error, not a fallback.

Each run creates a new directory (existing directories are refused):

- `processed.jpg`: the exact image sent to the model.
- `result.json`: observation, plan, annotation, selected instruction, image SHA-256,
  provider/model calls, timings, optional human facts, and artifact filenames.
  No image bytes or data URLs are embedded in this file.
- `preview.png`: the full processed image with the target circle and selected
  instruction. Null/invalid targets produce an unannotated image. This is an
  inspection artifact; part 4 owns the live guide card.
- On failure: `failure.json` instead of a successful result. No canned fallback.

Default outputs go under ignored `data/intelligence/`. `--out` chooses a new
output directory; `--facts facts.txt` records human-confirmed expected facts for
comparison, without feeding those expected answers to the model. Result timings
separate observation, diagnosis including search, annotation, and rendering;
model call timings also record provider inference duration.

## Fixed device case and acceptance

The demo product and fault are not selected yet. Once chosen, collect a faulty
view, a comparison view after the relevant action, and an obscured view of the
**same actual device**. An unplugged/connected WAN cable is one possible example,
not a requirement. Record the symptom, visible identifiers, state, and uncertainty
in a facts file. Do not assume cable colors or labels. The
planning sketch and synthetic test images are not substitutes for device photos.

Run the faulty photo twice into separate directories, then the comparison and
obscured photos with the same symptom. Check image hashes for repeatability,
visible facts, changed observations, plausible next steps, source support,
and circle placement against `processed.jpg`. Inspect the obscured result for
uncertainty and no invented target. A connected cable alone is not proof of restored
internet. Show the real outputs to Nikhil before expanding the live workflow.

Hardware selection and actual device photos are still pending. Product-specific
manual ingestion and tuned retrieval are deferred until that choice. A separate
Keenable research session is exploring product-agnostic query/result design.
Unit tests, CLI preflight, and a non-device negative case do not establish device
accuracy or a completed repair/FaceTime call.

## Bridge behavior

- `observe` describes the current frame. Earlier observations provide context, but
  the model is instructed not to carry old light/port states into a new frame.
- Targets are optional. Only a current step and four finite ordered coordinates
  within `[0,1]` may produce a box. Invalid or invisible targets become `null`.
- An invisible device produces empty indicators/ports and a request for a clear
  view. `findFix` skips external calls when given that invisible observation.
- `findFix` requires a nonempty JPEG Buffer, even for an invisible observation.
  It sends the image itself to the diagnosis model alongside observation/symptom.
  The boundary checks presence/type, not JPEG decoding; callers supply valid JPEGs.
- Search includes the device, symptom and lights. A search failure leaves the
  observed evidence and generic router guidance available; it is not a live manual.
- Plans have at most six nonempty steps. Source URLs must have appeared in search;
  titles come from those results. This validates provenance, not semantic support.
- The voice agent owns speech and `CallState`; screens render its snapshot/target.
  The agent retains raw JPEG and observation together per call, including invisible
  observations. It updates the screen snapshot and observation together after vision
  finishes. A missing frame or failed observation clears the pair available for
  diagnosis; `find_fix` requests a new look instead of using an older pair.

## Focused checks

```sh
node --import tsx --test src/intelligence/*.test.ts
./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext src/intelligence/*.ts
```

These checks validate local boundaries, not live model accuracy, visual placement,
latency or a completed FaceTime call. No-device handling does not create a ticket
or claim the problem was resolved.
