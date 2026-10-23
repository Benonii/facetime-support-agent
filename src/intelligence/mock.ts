import type { FixPlan, Intelligence, Observation } from '../contracts.js';

// Canned answers in the exact DTO shapes. Lets parts 2 and 4 work before part 3 is done.
const observation: Observation = {
  device_visible: true,
  device: { type: 'router', brand: 'Lumen', model: 'FX-200' },
  indicators: [
    { label: 'Power', color: 'green', pattern: 'solid' },
    { label: 'Internet', color: 'red', pattern: 'solid' },
    { label: 'Wi-Fi', color: 'green', pattern: 'blinking' },
  ],
  ports: [{ label: 'WAN', cable_connected: false }, { label: 'LAN1', cable_connected: true }],
  findings: ['Internet light red', 'WAN port empty'],
  target: null,
  next_shot: '',
  confidence: 0.9,
};

const plan: FixPlan = {
  likely_cause: 'The line cable is unplugged from the WAN port',
  steps: ['Plug the cable from the wall into the WAN port', 'Wait two minutes and watch the Internet light'],
  needs_technician_if: 'The Internet light stays red after the cable is plugged in',
  sources: [],
};

export const mockIntelligence: Intelligence = {
  async observe(req) {
    await new Promise((r) => setTimeout(r, 800)); // feel the latency
    return req.step ? { ...observation, target: { label: 'WAN port', box: [0.3, 0.55, 0.42, 0.7] } } : observation;
  },
  async findFix() {
    await new Promise((r) => setTimeout(r, 800));
    return plan;
  },
};
