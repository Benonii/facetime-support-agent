// Offline smoke test: renders the FaceTime guide card to PNG. No API keys needed.
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import type { CallState, Observation } from './contracts.js';
import { GuideCard } from './screens/card.js';

// Fake router photo: dark box with 4 lights and 4 ports.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960"><rect width="1280" height="960" fill="#2b2b2b"/>
<rect x="160" y="260" width="960" height="420" rx="40" fill="#e9e9e9"/>
<circle cx="320" cy="360" r="18" fill="#3ddc97"/><circle cx="460" cy="360" r="18" fill="#ff5d5d"/><circle cx="600" cy="360" r="18" fill="#3ddc97"/><circle cx="740" cy="360" r="18" fill="#555"/>
<rect x="300" y="520" width="110" height="80" fill="#1d6fe0"/><rect x="460" y="520" width="110" height="80" fill="#333"/><rect x="620" y="520" width="110" height="80" fill="#333"/><rect x="780" y="520" width="110" height="80" fill="#333"/></svg>`;
const jpeg = await sharp(Buffer.from(svg)).jpeg().toBuffer();

const observation: Observation = {
  device_visible: true,
  device: { type: 'router', brand: 'Lumen', model: 'FX-200', },
  indicators: [
    { label: 'Power', color: 'green', pattern: 'solid' }, { label: 'Internet', color: 'red', pattern: 'solid' },
    { label: 'Wi-Fi', color: 'green', pattern: 'blinking' }, { label: 'LAN', color: 'off', pattern: 'unknown' },
  ],
  ports: [{ label: 'WAN', cable_connected: false }, { label: 'LAN1', cable_connected: false }],
  findings: ['Internet light red', 'WAN port (blue) empty'],
  target: { label: 'blue WAN port', box: [0.23, 0.54, 0.32, 0.63] },
  next_shot: '', confidence: 0.9,
} as Observation;

const card = new GuideCard();
const state: CallState = {
  callId: 'smoke', stage: 'guiding', looks: 2, observation,
  plan: { likely_cause: 'Line cable unplugged from WAN', steps: ['Plug the wall cable into the blue WAN port', 'Wait 2 minutes and watch the Internet light'], needs_technician_if: 'Internet light stays red', sources: [] },
  step: { n: 1, text: 'Plug the wall cable into the blue WAN port' },
  lastSnapshot: `data:image/jpeg;base64,${(await sharp(jpeg).resize(640).jpeg().toBuffer()).toString('base64')}`,
};
await card.render(state);
(card as any).draw(state, true); // canvas holds the last draw; redraw with the ring on for the PNG
writeFileSync('smoke-card.png', await (card as any).canvas.encode('png'));
console.log('wrote smoke-card.png');
await card.close();
process.exit(0);
