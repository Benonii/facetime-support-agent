# Intelligence prototype

One camera frame plus the caller's symptom produces observations and a short fix
plan. `FixRequest` in `src/contracts.ts` now requires `jpeg: Buffer` as well as the
observation and symptom. Agent and CLI callers pass the same photo to both calls;
screen output shapes are unchanged. This prototype does not include a company manual
corpus, conversation memory, dedicated image search or a new diagnostic loop.

## Run with a real photo

Use the repository's supported Node 22 or 24 runtime and installed dependencies.
Put `OPENAI_API_KEY` in the gitignored root `.env.local`. Optional:
`KEENABLE_API_KEY`, `VISION_MODEL` (default `gpt-5`), `EXTRACT_MODEL` (default
`gpt-5-mini`). Search uses the existing public Keenable endpoint without its key.

```sh
npm run try:intel -- /absolute/path/to/device.jpg "internet is down"
npm run try:intel -- /absolute/path/to/device.jpg "internet is down" "Connect the WAN cable"
```

The second command asks vision to locate the part for that step. The CLI reports
timings and JSON; visually check the box against the same photo before demoing it.
Do not use the planning sketch as a device-test image. `MOCK_INTELLIGENCE=1` is
canned integration data, not proof that a real device was understood or fixed.

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
node --import tsx --test src/intelligence/intelligence.test.ts
./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext src/intelligence/*.ts
```

These checks validate local boundaries, not live model accuracy, visual placement,
latency or a completed FaceTime call. No-device handling does not create a ticket
or claim the problem was resolved.
