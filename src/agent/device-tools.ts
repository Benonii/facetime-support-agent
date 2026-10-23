import type { CallState, FixRequest, Intelligence } from '../contracts.js';

/** Per-call bridge. All tools share one queue so an old frame cannot overwrite a newer step. */
export function createDeviceTools({ intelligence, state, grabJpeg, snapshot, emit }: {
  intelligence: Intelligence;
  state: CallState;
  grabJpeg: () => Promise<Buffer | null>;
  snapshot: (jpeg: Buffer) => Promise<string>;
  emit: () => Promise<void>;
}) {
  let latestLook: Omit<FixRequest, 'symptom'> | undefined;
  let referenceFrames: Buffer[] = []; // First and latest usable earlier views, private to this call.
  let queue: Promise<unknown> = Promise.resolve();
  const clearImage = () => {
    latestLook = undefined;
    state.lastSnapshot = undefined;
    state.observation = undefined;
  };
  const noVideo = { device_visible: false, error: 'No current camera frame. Ask for a live camera view; do not describe a port or claim a circle is shown.' };
  const look = async (focus: string, selectedStep = state.step) => {
    const previous = state.observation;
    const referenceJpegs = referenceFrames.slice();
    clearImage();
    state.step = undefined;
    await emit();
    const jpeg = await grabJpeg();
    if (!jpeg) { referenceFrames = []; state.step = undefined; state.stage = 'waiting'; await emit(); return null; }
    const image = await snapshot(jpeg);
    const observation = await intelligence.observe({ jpeg, focus, step: selectedStep?.text, previous, referenceJpegs });
    latestLook = { jpeg, observation, referenceJpegs };
    if (observation.device_visible) {
      const first = referenceFrames[0] ?? jpeg;
      referenceFrames = first.equals(jpeg) ? [first] : [first, jpeg];
    }
    state.step = selectedStep;
    state.lastSnapshot = image;
    state.observation = observation;
    if (observation.device_visible) state.looks++;
    await emit();
    return observation;
  };
  const run = <T>(work: () => Promise<T>) => {
    const next = queue.then(async () => {
      try { return await work(); }
      catch (e) {
        console.warn(`[tools] device analysis failed: ${(e as Error)?.message ?? e}`);
        // Do not expose provider output/secrets or leave an old circle under a new step.
        referenceFrames = []; clearImage(); state.step = undefined; state.plan = undefined; state.stage = 'waiting';
        await emit();
        return { error: 'Device analysis failed or timed out. Tell the caller, then ask to retry with a clear view. No diagnosis or repair has been verified.' };
      }
    });
    queue = next.catch(() => {});
    return next;
  };
  return {
    lookAtDevice: (focus: string) => run(async () => {
      state.stage = 'looking';
      const obs = await look(focus);
      if (!obs) return noVideo;
      const { target, ...rest } = obs;
      return { ...rest, looks_so_far: state.looks };
    }),
    findFix: (symptom: string) => run(async () => {
      const observed = latestLook;
      if (!observed) return { error: 'Look at the device first with look_at_device to capture an image.' };
      state.plan = undefined; state.step = undefined;
      if (state.observation) state.observation = { ...state.observation, target: null };
      state.stage = 'diagnosing'; await emit();
      state.plan = await intelligence.findFix({ ...observed, symptom });
      state.stage = 'guiding'; await emit();
      return state.plan;
    }),
    showStep: (n: number) => run(async () => {
      const text = Number.isInteger(n) && n > 0 ? state.plan?.steps[n - 1] : undefined;
      if (!text) return { error: `No step ${n}.` };
      state.stage = 'guiding';
      const obs = await look(`find the part for this step: ${text}`, { n, text });
      if (!obs) return noVideo;
      return { step: text, circled: obs.target?.label ?? null, device_visible: obs.device_visible, next_shot: obs.next_shot };
    }),
    checkResult: () => run(async () => {
      const before = state.observation;
      const obs = await look('Check whether the requested action changed the ports, connections, or indicators. Do not infer charging or successful repair from an inserted cable alone.');
      if (!obs) return noVideo;
      return { before: before?.indicators, now: obs.indicators, ports_before: before?.ports, ports_now: obs.ports, findings: obs.findings, next_shot: obs.next_shot };
    }),
  };
}
