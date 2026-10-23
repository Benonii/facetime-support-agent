import type { FixPlan, Intelligence, Observation } from '../contracts.js';

// Scripted demo (DEMO_SCRIPT=1): answers for the photo in products/demo-shure-muted.jpg, a Shure SM58 wireless
// handheld whose screen shows the mute icon and whose status light is red. Boxes are normalized to that photo.
const BOX = {
  power: [0.47, 0.395, 0.56, 0.445],
  screen: [0.455, 0.49, 0.58, 0.565],
  grille: [0.35, 0.11, 0.61, 0.25],
};

const seen: Observation = {
  device_visible: true,
  device: { type: 'other', brand: 'Shure', model: 'SM58 wireless handheld (APX-AWS-20, HH-1)' },
  indicators: [
    { label: 'status light', color: 'red', pattern: 'solid' },
    { label: 'mute icon (crossed-out mic) on screen', color: 'other', pattern: 'solid' },
  ],
  ports: [],
  findings: [
    'Screen shows the mute icon, a crossed-out microphone',
    'Status light above the power button is red',
    'Battery is full, 29 hours 18 minutes left',
    'Signal is good: RF bars up, channel 1',
  ],
  target: null,
  next_shot: '',
  confidence: 0.95,
};

const plan: FixPlan = {
  likely_cause: 'The mic is muted. The screen shows the mute icon and the light is red; battery and signal are fine.',
  steps: [
    'Quick-press the round power button under the red light once to unmute. Do not hold it, holding turns the mic off.',
    'Check the screen: the crossed-out mic icon should be gone.',
    'Say "test, test" into the top of the mic and listen to the room speakers.',
  ],
  needs_technician_if: 'There is still no sound after the mute icon is gone and the receiver shows signal.',
  sources: [],
};

const fixed: Observation = {
  ...seen,
  indicators: [{ label: 'status light', color: 'green', pattern: 'solid' }],
  findings: ['Mute icon is gone from the screen', 'Status light is no longer red', 'Battery full, signal good on channel 1'],
};

const target = (step: string): Observation['target'] =>
  /screen|icon/i.test(step) ? { label: 'mic screen', box: BOX.screen }
  : /test|top of the mic|speak/i.test(step) ? { label: 'top of the mic', box: BOX.grille }
  : { label: 'power button', box: BOX.power };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
let planned = false;

export const scriptedIntelligence: Intelligence = {
  async observe(req) {
    await pause(900);
    if (!req.previous) planned = false; // a new call, or a new problem
    if (req.step) return { ...seen, target: target(req.step) };
    return planned ? fixed : seen; // a look after the plan is the caller checking their fix
  },
  async findFix() {
    await pause(900);
    planned = true;
    return plan;
  },
};
