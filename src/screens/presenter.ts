import type { CallState, ScreenContext } from '../contracts.js';

export function validTarget(box: number[] | undefined): box is [number, number, number, number] {
  return !!box && box.length === 4 && box.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
    && box[2] > box[0] && box[3] > box[1];
}

/** Only describes supported evidence. Default guide copy is not presented as an agent transcript. */
export function present(state: CallState, annotationCurrent = true): ScreenContext {
  const cue = state.screen;
  const hasPhoto = !!state.lastSnapshot;
  const idsMatch = !(cue?.snapshotId || cue?.observationSnapshotId)
    || (!!cue.snapshotId && cue.snapshotId === cue.observationSnapshotId);
  const current = annotationCurrent && idsMatch;
  const unclear = state.observation?.device_visible === false;
  const view: ScreenContext['view'] = !hasPhoto ? 'no_camera' : unclear ? 'unclear' : !current ? 'awaiting_analysis' : 'snapshot';
  const issues: string[] = [];
  if (!hasPhoto && !['resolved', 'technician'].includes(state.stage)) issues.push('No camera snapshot is available.');
  if (unclear) issues.push('The latest observation could not identify the device.');
  if (!current && hasPhoto) issues.push('Waiting for an observation matched to this snapshot.');
  const target = state.observation?.target;
  if (target && !validTarget(target.box)) issues.push('The target box is invalid; no highlight is shown.');
  const highlightVisible = state.stage === 'guiding' && !!state.step && view === 'snapshot'
    && !!target && validTarget(target.box);
  const phase = cue?.phase ?? (view === 'awaiting_analysis' || state.stage === 'looking' || state.stage === 'diagnosing' ? 'thinking'
    : state.stage === 'guiding' ? 'waiting' : 'listening');
  const titles: Record<CallState['stage'], string> = {
    waiting: 'Let’s take a look.', looking: 'A closer look.', diagnosing: 'Finding the next step.',
    guiding: 'One step at a time.', resolved: 'You’re all set.', technician: 'A little more help.',
  };
  const defaults: Record<CallState['stage'], string> = {
    waiting: 'Say hello when you’re ready. We’ll work through this together.',
    looking: 'Hold your camera steady so the device and its labels are clear.',
    diagnosing: 'Checking the observations and available instructions.',
    guiding: view === 'awaiting_analysis' ? 'The target will appear after this new view has been checked.'
      : highlightVisible ? `The circle shows ${target!.label}.` : 'Follow the instruction below, then tell me what changed.',
    resolved: 'Your issue has been marked resolved. Your case details are below.',
    technician: 'Your support details can travel with you to the next person.',
  };
  let instruction = state.step?.text || (state.stage === 'guiding' ? 'Wait for the next instruction.' : 'Keep your device in view.');
  if (state.stage === 'waiting') instruction = 'Point your camera at the device.';
  if (state.stage === 'looking') instruction = state.observation?.next_shot || 'Show the device with its labels facing the camera.';
  if (view === 'no_camera' && !['resolved', 'technician'].includes(state.stage)) instruction = 'Point your camera at the device.';
  if (view === 'unclear' && !['resolved', 'technician'].includes(state.stage)) instruction = state.observation?.next_shot || 'Move closer and hold the camera steady.';
  if (view === 'awaiting_analysis' && state.stage === 'guiding') instruction = 'Hold this view while the new photo is checked.';
  if (state.stage === 'resolved') instruction = state.ticket ? `Case ${state.ticket.id} · resolved on this call` : 'Your support session is complete.';
  if (state.stage === 'technician') instruction = state.ticket?.window ? `Requested visit: ${state.ticket.window}` : 'Your case is ready for further support.';
  return {
    stage: state.stage,
    title: unclear && state.stage === 'looking' ? 'A clearer view will help.' : titles[state.stage],
    instruction,
    caption: cue?.caption?.text.trim()
      ? { speaker: cue.caption.speaker, text: cue.caption.text.trim().slice(0, 240) }
      : { speaker: 'guide', text: defaults[state.stage] },
    phase, view, highlightVisible,
    ...(highlightVisible ? { highlightedPart: target!.label } : {}),
    nextUserAction: state.stage === 'resolved' ? 'End the call whenever you’re ready.'
      : state.stage === 'technician' ? 'Confirm your preferred next support step.' : instruction,
    issues,
  };
}
