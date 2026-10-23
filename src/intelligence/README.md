# Intelligence prototype

One camera frame plus the caller's symptom produces observations and a short fix
plan. `FixRequest` in `src/contracts.ts` now requires `jpeg: Buffer` as well as the
observation and symptom. Agent and CLI callers pass the same photo to both calls;
screen output shapes are unchanged. This prototype does not include a company manual
corpus, a general conversation-memory system, dedicated image search or a new diagnostic loop.

## Teammate takeover: use your own laptop and account

You do not need Nikhil's `.env.local`, Codex login, or API keys. Clone/pull main,
use your own local login, and supply your own environment values. No source edit
is needed to change accounts, executable, model, or intelligence provider.

### 1. Install and authenticate

On macOS/Linux, install Node 24 (or Node 22.23.2+) and use a fresh checkout:

```sh
git clone https://github.com/Benonii/facetime-support-agent.git
cd facetime-support-agent
npm ci
npm install -g @openai/codex
codex login
codex login status
codex --version
codex exec --help
# Fresh checkout only; do not overwrite an existing local configuration.
cp .env.example .env.local
```

Choose **Sign in with ChatGPT** using your own account with Codex access. Usage
and model access follow that account's subscription/workspace limits. Authentication
is local to the OS user running the worker; do not copy someone else's auth cache.
See the official [CLI installation](https://learn.chatgpt.com/docs/codex/cli) and
[authentication](https://learn.chatgpt.com/docs/auth) documentation.

The installed CLI must support `exec --ephemeral --ignore-user-config
--output-schema --image` and repeated `--image` arguments. Check its help before
running. If a flag is unsupported, update the CLI; the original verification used
the desktop-bundled CLI, so a fresh standalone installation still needs the photo
smoke run below. Do not silently drop isolation or schema flags to work around an
older version. `CODEX_BIN` can point at your own compatible executable (path only,
not a shell command); leave it unset if `codex` is on PATH. Leave `CODEX_MODEL`
unset initially, or choose a model your account can access. No model is pinned to
Nikhil's account. Custom user config is ignored by this adapter.

### 2. Prove intelligence alone

Set these values in your gitignored `.env.local`:

```dotenv
INTELLIGENCE_PROVIDER=codex-cli
MOCK_INTELLIGENCE=0
```

This explicit selection matters: `.env.example` sets `openai`, and an explicit
value overrides the photo runner's CLI default. For a photo-only run, leave
`LIVEKIT_*` and `CHERT_MESSAGING_SECRET` blank. Set `OPENAI_API_KEY` for product
research, even when diagnosis uses Codex CLI. Without it research returns an
unavailable brief; CLI diagnosis still works from images and matching product
knowledge. Keenable's key is optional; without one the code uses its public endpoint.

```sh
npm run try:intel -- /absolute/path/your-photo.jpg "Where does this connector go?" --out data/intelligence/first-run
```

Use your own approved photo and a new output directory for each run. Inspect
`result.json` for provider `codex-cli`, successful model calls and the actual model
identity; inspect `preview.png` for the correct destination. A `failure.json` is a
failure, not a successful smoke run. The single-photo runner does not retain a
sequence; the LiveKit bridge carries earlier images as described below.

### 3. Choose the rest of the runtime

| Mode | Local credentials/configuration |
| --- | --- |
| CLI photo intelligence | Your saved Codex login for diagnosis; `OPENAI_API_KEY` for product research |
| API photo intelligence | `INTELLIGENCE_PROVIDER=openai`, your `OPENAI_API_KEY`; optionally `VISION_MODEL` / `EXTRACT_MODEL` |
| Live voice + CLI intelligence | Your saved Codex login **plus** a separate `OPENAI_API_KEY` with Realtime access and `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| iMessage + CLI intelligence | Your saved Codex login, explicit `INTELLIGENCE_PROVIDER=codex-cli`, `MOCK_INTELLIGENCE=0`, and authorized `CHERT_MESSAGING_SECRET`; optional tenant slug |

A ChatGPT subscription login does **not** supply the application's Realtime voice
API credentials. For API intelligence, set the provider to `openai`; this CLI
adapter deliberately does not forward application API keys to its subprocess.
For a hosted/public service or CI, use API-backed intelligence and server-side
secret management rather than exposing a developer's subscription CLI.

For live voice, agree on one worker owner and `AGENT_NAME` with the telephony owner:

```sh
AGENT_NAME=intelligence-demo npm run agent:cli
```

The worker, server and Chert dispatch must agree on the LiveKit project and agent
name. Use your own LiveKit project for isolated testing, or receive authorized
shared project credentials privately. Set `SERVER_URL` to the server you actually
use; a teammate's temporary tunnel URL can change. Do not run competing workers
with the same name. See [telephony's current routing handoff](../../agent-comms/telephony/PROVIDES.md)
for Chert and iMessage; a working photo run does not prove FaceTime is working.

### Credential and output boundaries

- Git tracks only the blank/placeholder `.env.example`. `.env`, `.env.*` (except
  that template), and `data/` are ignored. Never force-add local configuration.
- Codex caches its own login outside the checkout, normally under `~/.codex` or
  the OS credential store. Do not put `CODEX_HOME` inside this repository or commit
  `auth.json`. Run login and the worker as the same local user.
- The CLI subprocess receives only OS/login-discovery environment variables,
  not the application's OpenAI, LiveKit, Chert or Keenable keys. Images are sent
  to the selected inference provider; local CLI authentication does not mean
  inference runs offline. Temporary inference files are removed afterward.
- Private laptop photos and replay outputs were not committed. Use ignored
  `data/` for new output; custom `--out` paths are not automatically ignored.
- Quick check before a commit: `git ls-files '.env' '.env.*'` should list only
  `.env.example`; `git check-ignore .env.local` should print `.env.local`.

Handoff audit on 2026-10-23: all 149 reachable Git blobs across 49 fetched/local
commits were checked against the three distinct nonempty local credential values
available in the two project `.env`/`.env.local` locations, plus common key/private-key
patterns. No matches were found. Environment/auth filename history contained only
`.env.example`. This is a scoped repository check, not an audit of external logs,
unfetched/deleted history or every possible secret format.

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

The current proof uses Nikhil's MacBook photos: locate a visible MagSafe port,
withhold a target when that port is on the other side or hidden, and identify an
incompatible loose connector. It verifies contextual guidance, not a charging fault
or completed repair. The device itself need not be broken for this proof.

Two full left-side runs took 27.048 s and 27.544 s with the local CLI model
`gpt-6.1-sol`. Both requested the missing connector before recommending a connection.
Separate target probes located MagSafe and returned null for the opposite-side and
front views. Original photos and generated results remain local because the laptop
screen contains personal content. No source support or successful charging is implied.

For later fault/repair acceptance, collect the same actual device before and after
the action plus an obscured view, and record human-confirmed facts. Repeat the first
input, inspect matching image hashes, visible facts, next steps, source applicability,
and circle position. A connected cable alone is not proof of restored function.
Persistent product-manual ingestion remains deferred. On-demand Keenable retrieval,
Decisions ranking and compact evidence briefs are implemented in `research.ts`;
see Bridge behavior below. The recorded photo acceptance above predates this pipeline.

## LiveKit agent with CLI intelligence

```sh
codex login status
# .env.local: shared LIVEKIT_* credentials and OPENAI_API_KEY for Realtime voice
# Coordinate this name with the person running chert dev. Only one worker per name.
AGENT_NAME=intelligence-demo npm run agent:cli
# Or keep the normal launcher and choose the provider explicitly:
INTELLIGENCE_PROVIDER=codex-cli npm run agent
```

`agent:cli` explicitly enables real CLI intelligence and disables the mock switch.
The existing `look_at_device`, `find_fix`, `show_step`, and `check_result` tools in
`src/agent/agent.ts` delegate to the per-call bridge in `src/agent/device-tools.ts`.
Device calls run in order. Missing frames and inference failures clear the matching
image/target and return a retry instruction to voice. Step changes never reuse an
old circle under a new instruction. Plans survive ordinary camera-view changes,
and clearing a snapshot also clears the guide card image cache. `check_result` returns ports as well as lights.

CLI authentication belongs to the machine running the worker. It does not supply
Realtime audio credentials. The launch command is prepared; a real worker/call is
not verified here. Telephony currently uses `chert dev` with caller video unverified.
If no camera track arrives, use the team's HTTPS `/phone` path for camera testing.
The worker publishes the guide card before opening a voice session, and slow
intelligence stays outside call acceptance. No new screen endpoint or DTO is needed.

## Sequential connection guidance

`ObserveRequest` and `FixRequest` optionally accept `referenceJpegs: Buffer[]` (at most
two earlier upright JPEGs, max 1280 px each). Both providers send the current `jpeg`
as image 1, followed by those earlier views. References help identify a connector
that has moved out of view; current connection state and target coordinates must
come from image 1. Do not pass future frames, expected answers, or old coordinates.

The live per-call bridge retains the first and most recent usable earlier views,
passes the same reference set through observation and diagnosis, and supplies
references for fresh step annotation. It clears this context on missing video or
analysis failure. Reference bytes never enter CallState/events. This bounded memory
is per call, not a persistent device library. The single-photo CLI runner and other
callers remain backward compatible; the iMessage route must opt in to references
separately before it gains this sequential behavior.

For connection/repositioning tasks, the first plan step names the destination and
a visible landmark. Annotation circles that destination socket rather than the
misplaced connector or hand. A pure removal/inspection task may still circle the
connector. If the destination is not visible, return no target and request a useful
view. Never copy a box between camera angles. These are model instructions, not a
geometric correctness guarantee; inspect replay output on the actual device.

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
- `findFix` calls `researchProduct` with device, symptom, relevant findings/ports/lights
  and explicit model uncertainty. Four parallel Keenable searches cover official
  support/manuals, specs, Reddit and other forums (four results each). No images go
  to search. The internal request accepts an optional verified manufacturer domain;
  the current observation contract cannot confirm one, so the live bridge discovers sources.
- Decisions (`gpt-6-luna`) scores deduplicated snippets from 0 to 3. At most four
  candidates scoring >=1.5 are fetched (up to 6000 characters each), then one text-only
  Responses call (`gpt-6-luna`, no tools) returns a structured evidence brief.
- Only that brief reaches diagnosis: at most six cited findings, four sources,
  applicability gaps, contradictions and coverage limitations, <=6000 serialized
  characters. Manufacturer guidance/specs are distinguished from community reports.
  Unknown/invented citation IDs and oversized summaries produce an unavailable report.
- Research has a 15-second total deadline: search <=4s, ranking <=2s, page fetch <=4s,
  synthesis uses the remaining time. No automatic retries. Partial fetch failures use
  ranked excerpts with explicit limitations. No useful evidence is distinct from
  research unavailable; neither sends raw results to diagnosis. The photo, matching
  product knowledge and current diagnosis provider remain available.
- Real research runs only when `DEMO_SCRIPT` and `MOCK_INTELLIGENCE` are not `1`.
  The teammate-owned `agent:demo` intentionally bypasses real research and diagnosis.
- Research requires a configured OpenAI API key with Decisions and Responses access,
  including in CLI mode. Missing/expired keys return unavailable; no personal-key fallback.
  `[research]` logs only status, stage durations, candidate counts/IDs and token usage.
- Plans have at most six nonempty steps. Source URLs must occur in the brief's source
  list; titles come from retrieved results. This validates provenance, not semantic support.
- The voice agent owns speech and `CallState`; screens render its snapshot/target.
  The agent retains raw JPEG and observation together per call, including invisible
  observations. It updates the screen snapshot and observation together after vision
  finishes. A missing frame or failed observation clears the pair available for
  diagnosis; `find_fix` requests a new look instead of using an older pair.

## Focused checks

```sh
node --import tsx --test src/intelligence/*.test.ts src/agent/device-tools.test.ts
./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext src/intelligence/*.ts
```

These checks validate local boundaries, not live model accuracy, visual placement,
latency or a completed FaceTime call. No-device handling does not create a ticket
or claim the problem was resolved.

Test gotcha: offline tests importing the LiveKit native renderer must call the
SDK's `dispose()` after closing the card, otherwise native background resources
keep the Node test process alive. `src/screens/card.test.ts` demonstrates teardown.


## Live voice and camera loop (hackathon)

The voice agent now exposes one `analyze_device` tool. A spoken request such as
“this is broken”, “look at this” or “take the photo” starts capture immediately
(with the existing 400 ms settle). If the agent first asks for another angle,
it waits for the caller’s “ready” before capturing again. No camera polling
triggers inference and no manual shutter is required.

The tool acknowledges through LiveKit’s nonblocking tool update, sends one
frozen JPEG through observation → plan → target annotation, then returns one
instruction to Realtime for speech. Existing CallState fields carry the matching
photo, step and target to `/phone` and GuideCard. A single reminder is sent after
15 seconds if still processing. Missing video and failures ask for another view
or retry. Verification describes evidence and asks whether the task worked.

Run with the usual local credentials and the same AGENT_NAME/LiveKit project as
Ben’s server. The server must be reachable at SERVER_URL for native /phone images.
Use `npm run agent` for the API intelligence provider or `npm run agent:cli` for
the signed-in Codex CLI provider. Both still need OPENAI_API_KEY for Realtime
voice. No credentials or login files are committed.

Recorded MacBook checks on this integration: the CLI provider (gpt-6.1-sol)
selected the destination correctly before and after a misplaced connector, in
26 and 34 seconds. The default API vision model (gpt-5) returned incorrect port
geometry in the same check; choose the CLI route for that demonstration, or
validate the configured API vision model on the actual demo device first.
An isolated real LiveKit + OpenAI Realtime call also passed: a prerecorded spoken
request and a photo published as the camera track triggered the actual tool;
looking → diagnosing → guiding events arrived and agent audio returned after
publication. This checks transport and voice orchestration, not real phone
camera permissions or a moving handheld view.

For hackathon scope, cancellation suppresses obsolete state and speech; it does
not terminate an already-running intelligence provider operation. The whole
request stops waiting after 90 seconds. Display receipt acknowledgements and
full provider cancellation remain deferred.
