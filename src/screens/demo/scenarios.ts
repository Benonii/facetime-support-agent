import sharp from 'sharp';
import type { CallState, Observation } from '../../contracts.js';

export interface DemoScenario {
  id: string;
  label: string;
  detail: string;
  duration: number;
  state: CallState;
  conversation: { speaker: 'agent' | 'caller'; text: string }[];
}

/** Illustrations only: these fixtures never call vision, search, a model, or a real customer. */
export async function createScenarios(): Promise<DemoScenario[]> {
  const frontRed = await photo('front', false);
  const frontGreen = await photo('front', true);
  const back = await photo('back', false);
  const moved = await photo('back', true);
  const blurry = `data:image/jpeg;base64,${(await sharp(Buffer.from(frontRed.split(',')[1], 'base64')).blur(25).jpeg().toBuffer()).toString('base64')}`;
  const observed: Observation = {
    device_visible: true, device: { type: 'router', brand: 'Lumen', model: 'FX-200' },
    indicators: [{ label: 'Power', color: 'green', pattern: 'solid' }, { label: 'Internet', color: 'red', pattern: 'solid' }, { label: 'Wi-Fi', color: 'green', pattern: 'unknown' }],
    ports: [], findings: ['Internet light is red'], target: null, next_shot: 'Show the back of the router with the ports visible.', confidence: 0.9,
  };
  const ports: Observation = { ...observed, ports: [{ label: 'WAN', cable_connected: false }, { label: 'LAN 1', cable_connected: true }], findings: ['Internet light red', 'WAN port empty'], next_shot: '' };
  const target: Observation = { ...ports, target: { label: 'Blue WAN port', box: [0.234, 0.49, 0.313, 0.6] } };
  const plan = { likely_cause: 'The WAN cable is disconnected.', steps: ['Plug the yellow cable into the blue WAN port until it clicks.', 'Wait for the Internet light, then try opening a website.'], needs_technician_if: 'The Internet light stays red after reconnection.', sources: [] };
  const base: CallState = { callId: 'demo-maria', stage: 'waiting', looks: 0 };
  const chat: DemoScenario['conversation'] = [
    { speaker: 'caller', text: 'Hi, my internet stopped working.' },
    { speaker: 'agent', text: 'I can help. Point your camera at the router, with the lights facing me.' },
    { speaker: 'agent', text: 'Your Internet light is red. Can you show me the ports on the back?' },
    { speaker: 'caller', text: 'Here’s the back. There’s a yellow cable hanging loose.' },
    { speaker: 'agent', text: 'I can see the empty WAN port. I’m checking the next step.' },
    { speaker: 'agent', text: 'See the circle? Plug the yellow cable into the blue WAN port until it clicks.' },
    { speaker: 'caller', text: 'Done. It clicked in.' },
    { speaker: 'agent', text: 'Great. Give it a moment, then show me the Internet light.' },
    { speaker: 'agent', text: 'The light is green now. Can you try opening a website?' },
    { speaker: 'caller', text: 'It works!' },
    { speaker: 'agent', text: 'You’re all set, Maria. We fixed the disconnected cable and closed your case.' },
  ];
  const cue = (index: number, snapshotId?: string) => ({ phase: 'speaking' as const, caption: chat[index], ...(snapshotId ? { snapshotId, observationSnapshotId: snapshotId } : {}) });
  return [
    { id: 'hello', label: '01 · Say hello', detail: 'A calm start. No camera claims or unsolicited greeting.', duration: 5000, state: base, conversation: [] },
    { id: 'front', label: '02 · Read the lights', detail: 'The first observation gives the caller a specific next view.', duration: 6500, state: { ...base, stage: 'looking', looks: 1, lastSnapshot: frontRed, observation: observed, screen: cue(2, 'front-red') }, conversation: chat.slice(0, 3) },
    { id: 'ports', label: '03 · See the ports', detail: 'New angle, new evidence. No annotation until a step is selected.', duration: 5000, state: { ...base, stage: 'looking', looks: 2, lastSnapshot: back, observation: ports, screen: { ...cue(3, 'back-empty'), phase: 'listening' } }, conversation: chat.slice(0, 4) },
    { id: 'research', label: '04 · Check the fix', detail: 'A useful holding screen while the intelligence worker runs.', duration: 5000, state: { ...base, stage: 'diagnosing', looks: 2, lastSnapshot: back, observation: ports, screen: { ...cue(4, 'back-empty'), phase: 'thinking' } }, conversation: chat.slice(0, 5) },
    { id: 'guide', label: '05 · Guide the action', detail: 'A pulsing ring and one clear instruction, on the actual video card.', duration: 8500, state: { ...base, stage: 'guiding', looks: 3, lastSnapshot: back, observation: target, plan, step: { n: 1, text: plan.steps[0] }, screen: cue(5, 'back-target') }, conversation: chat.slice(0, 6) },
    { id: 'wait', label: '06 · Give it a moment', detail: 'The caller gets space to act; the instruction stays visible.', duration: 6000, state: { ...base, stage: 'guiding', looks: 3, lastSnapshot: frontRed, observation: observed, plan, step: { n: 2, text: plan.steps[1] }, screen: { ...cue(7, 'front-wait'), phase: 'waiting' } }, conversation: chat.slice(0, 8) },
    { id: 'verify', label: '07 · Check the result', detail: 'A green light is evidence. The agent still asks the user to test.', duration: 6000, state: { ...base, stage: 'looking', looks: 4, lastSnapshot: frontGreen, observation: { ...observed, indicators: observed.indicators.map((led) => ({ ...led, color: 'green' as const })), ports: [{ label: 'WAN', cable_connected: true }], findings: ['Internet light green'], next_shot: 'Try opening a website and tell me if it loads.' }, plan, screen: cue(8, 'front-green') }, conversation: chat.slice(0, 9) },
    { id: 'resolved', label: '08 · Close the case', detail: 'A quiet finish after the user confirms the original issue is fixed.', duration: 6000, state: { ...base, stage: 'resolved', looks: 4, plan, lastSnapshot: frontGreen, observation: { ...observed, indicators: observed.indicators.map((led) => ({ ...led, color: 'green' as const })), findings: ['WAN cable reconnected', 'Internet light green', 'User confirmed a website loads'], next_shot: '' }, ticket: { id: 'T-DEMO01', outcome: 'resolved_on_call', diagnosis: 'WAN cable reconnected. User confirmed a website loads.', created_at: '2026-10-23T19:00:00Z' }, screen: cue(10, 'front-green') }, conversation: chat },
    { id: 'unclear', label: 'Unclear camera', detail: 'No invented lights or target: ask for a clearer view.', duration: 6000, state: { ...base, stage: 'looking', looks: 1, lastSnapshot: blurry, observation: { ...observed, device_visible: false, indicators: [], target: null, next_shot: 'Move a little closer and hold the camera steady.', confidence: 0.2 }, screen: { phase: 'listening', caption: { speaker: 'agent', text: 'That’s a little blurry. Move closer and hold still for a moment.' }, snapshotId: 'blur', observationSnapshotId: 'blur' } }, conversation: [] },
    { id: 'stale', label: 'Photo changed', detail: 'The target belongs to an older photo. It must not be shown on this one.', duration: 6000, state: { ...base, stage: 'guiding', looks: 3, lastSnapshot: moved, observation: target, plan, step: { n: 1, text: plan.steps[0] }, screen: { phase: 'thinking', snapshotId: 'back-new', observationSnapshotId: 'back-old' } }, conversation: chat.slice(0, 6) },
    { id: 'technician', label: 'Human handoff', detail: 'Carry the case forward without inventing a confirmed booking.', duration: 6000, state: { ...base, stage: 'technician', looks: 4, plan, ticket: { id: 'T-DEMO02', outcome: 'technician_booked', diagnosis: 'WAN cable reconnected; Internet light remains red.', window: 'Tomorrow, 8 am–noon', created_at: '2026-10-23T19:00:00Z' }, screen: { phase: 'waiting', caption: { speaker: 'agent', text: 'This needs another pair of hands. Your observations and the steps we tried are ready for the support team.' } } }, conversation: [] },
  ];
}

async function photo(side: 'front' | 'back', fixed: boolean): Promise<string> {
  const color = fixed ? '#75ac63' : '#d56857';
  const front = `<rect x="170" y="310" width="940" height="320" rx="60" fill="#efebdf"/>
  <path d="M210 340h860" stroke="#fff" stroke-width="5" opacity=".6"/>
  <text x="220" y="375" font-family="sans-serif" font-size="24" fill="#63715b">lumen / FX-200</text>
  ${[320, 600, 880].map((x, i) => `<circle cx="${x}" cy="475" r="16" fill="${i === 1 ? color : '#75ac63'}"/><text x="${x}" y="540" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#66735f">${['POWER', 'INTERNET', 'WI-FI'][i]}</text>`).join('')}`;
  const back = `<rect x="170" y="310" width="940" height="320" rx="60" fill="#efebdf"/>
  <text x="220" y="375" font-family="sans-serif" font-size="24" fill="#63715b">lumen / FX-200 · back</text>
  ${[300, 480, 660, 840].map((x, i) => `<text x="${x + 50}" y="445" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#56614e">${['WAN', 'LAN 1', 'LAN 2', 'POWER'][i]}</text><rect x="${x}" y="470" width="100" height="105" rx="9" fill="${i === 0 ? '#648eb2' : '#485047'}"/><path d="M${x + 16} 490h68v61h-68z" fill="#212e2e"/><path d="M${x + 22} 493v15m12-15v15m12-15v15m12-15v15m12-15v15" stroke="#cdb67c" stroke-width="4"/>`).join('')}
  <path d="M530 565c0 160 170 145 170 320" fill="none" stroke="#c6c9bf" stroke-width="25"/>
  <path d="M${fixed ? '350 565' : '260 730'}c0 95-130 40-140 190" fill="none" stroke="#dfba5f" stroke-width="26"/>
  ${fixed ? '<rect x="330" y="525" width="40" height="60" rx="6" fill="#f4d477"/>' : '<rect x="239" y="678" width="42" height="66" rx="6" fill="#f4d477"/>'}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960"><defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="#c8c7b5"/><stop offset="1" stop-color="#eee7d5"/></linearGradient><filter id="shadow"><feGaussianBlur stdDeviation="24"/></filter></defs><rect width="1280" height="960" fill="url(#bg)"/><ellipse cx="650" cy="672" rx="460" ry="53" fill="#60614e" opacity=".18" filter="url(#shadow)"/>${side === 'front' ? front : back}<text x="45" y="915" font-family="sans-serif" font-size="20" fill="#67705c">DEMO DEVICE · ILLUSTRATION</text></svg>`;
  return `data:image/jpeg;base64,${(await sharp(Buffer.from(svg)).jpeg({ quality: 87 }).toBuffer()).toString('base64')}`;
}
