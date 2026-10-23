import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import sharp from 'sharp';
import { dispose, type Room, TrackSource } from '@livekit/rtc-node';
import type { CallState } from '../contracts.js';
import { createDeviceTools } from '../agent/device-tools.js';
import { GuideCard } from './card.js';
import { createScenarios } from './demo/scenarios.js';
import { present, validTarget } from './presenter.js';

const scenarios = await createScenarios();
const scene = (id: string) => structuredClone(scenarios.find((s) => s.id === id)!.state);
// LiveKit's native test transport owns a worker thread until explicitly disposed.
after(() => dispose());

test('publishes the existing Chert camera track on the supplied agent participant', async () => {
  const publications: { name: string; source: number }[] = [];
  const room = { localParticipant: {
    async publishTrack(track: { name: string }, options: { source: number }) {
      publications.push({ name: track.name, source: options.source });
    },
  } } as unknown as Room;
  const card = new GuideCard();
  try {
    await card.publish(room);
    await card.render(scene('guide'));
    await card.publish(room);
    assert.deepEqual(publications, [{ name: 'agent-guide-card', source: TrackSource.SOURCE_CAMERA }]);
  } finally { await card.close(); await card.close(); }
});

test('rejects malformed and out-of-image targets', () => {
  for (const box of [[], [0, 0, 1], [0, 0, 1, 1, 1], [0.8, 0.1, 0.2, 0.4], [-1, 0, 1, 1], [0, 0, Infinity, 1], [0, 0, NaN, 1]]) assert.equal(validTarget(box), false);
  assert.equal(validTarget([0.2, 0.3, 0.4, 0.5]), true);
});

test('never points at a part without a visible device, current photo, and current step', () => {
  const state = scene('guide');
  assert.equal(present(state).highlightVisible, true);
  delete state.lastSnapshot; assert.equal(present(state).highlightVisible, false);
  const unclear = scene('unclear'); assert.equal(present(unclear).view, 'unclear'); assert.equal(present(unclear).highlightVisible, false);
  const stale = present(scene('stale')); assert.equal(stale.view, 'awaiting_analysis'); assert.equal(stale.highlightedPart, undefined);
  const invalid = scene('guide'); invalid.observation!.target!.box = [0.9, 0.2, 0.1, 0.4]; assert.equal(present(invalid).highlightVisible, false);
  const noStep = scene('guide'); delete noStep.step; assert.equal(present(noStep).highlightVisible, false);
});

test('default guide copy is distinguished from actual agent or caller captions', () => {
  assert.equal(present(scene('hello')).caption.speaker, 'guide');
  assert.equal(present(scene('guide')).caption.speaker, 'agent');
  assert.equal(present(scene('ports')).caption.speaker, 'caller');
  assert.equal(present(scene('technician')).instruction.startsWith('Requested visit:'), true);
});

test('live intelligence findings become honest guide copy when no transcript caption is supplied', () => {
  const state = scene('front');
  delete state.screen;
  state.observation!.findings = ['MagSafe port visible on the left side'];
  assert.deepEqual(present(state).caption, { speaker: 'guide', text: 'Observed: MagSafe port visible on the left side' });
  state.screen = { snapshotId: 'new', observationSnapshotId: 'old' };
  assert.equal(present(state).caption.text.includes('MagSafe'), false);
});

test('all demo states export the actual 720 × 1280 caller card without live credentials', async () => {
  const card = new GuideCard();
  try {
    for (const scenario of scenarios) {
      await card.render(scenario.state);
      const png = await card.exportPng();
      const metadata = await sharp(png).metadata();
      assert.equal(metadata.width, 720); assert.equal(metadata.height, 1280);
      assert.equal(card.getContext()!.stage, scenario.state.stage);
      assert.equal(JSON.stringify(card.getContext()).includes('base64'), false);
    }
  } finally { await card.close(); }
});

test('highlight phases differ only when a valid highlight can be displayed', async () => {
  const card = new GuideCard();
  try {
    await card.render(scene('guide'));
    assert.notDeepEqual(await card.exportPng(true), await card.exportPng(false));
    await card.render(scene('stale'));
    assert.deepEqual(await card.exportPng(true), await card.exportPng(false));
  } finally { await card.close(); }
});

test('the normal agent update sequence suppresses the old target while a new frame is analyzed', async () => {
  const card = new GuideCard();
  try {
    const state = scene('guide'); delete state.screen;
    await card.render(state); assert.equal(card.getContext()!.highlightVisible, true);
    state.lastSnapshot = scene('front').lastSnapshot;
    await card.render(state); assert.equal(card.getContext()!.highlightVisible, false);
    state.observation = { ...state.observation! };
    await card.render(state); assert.equal(card.getContext()!.highlightVisible, true);
  } finally { await card.close(); }
});

test('a removed or invalid photo clears the previous image and target', async () => {
  const card = new GuideCard();
  try {
    const state = scene('guide'); await card.render(state);
    state.lastSnapshot = 'data:image/jpeg;base64,not-an-image';
    await card.render(state);
    assert.equal(card.getContext()!.view, 'no_camera'); assert.equal(card.getContext()!.highlightVisible, false);
    delete state.lastSnapshot; await card.render(state); assert.equal(card.getContext()!.view, 'no_camera');
  } finally { await card.close(); }
});

test('a slow earlier render cannot replace the most recent screen', async () => {
  const card = new GuideCard();
  try {
    await Promise.all([card.render(scene('guide')), card.render(scene('resolved'))]);
    assert.equal(card.getContext()!.stage, 'resolved');
    const context = card.getContext()!; context.issues.push('mutated externally');
    assert.equal(card.getContext()!.issues.includes('mutated externally'), false);
  } finally { await card.close(); }
});

test('long labels and instruction text render without throwing', async () => {
  const card = new GuideCard();
  try {
    const state = scene('guide');
    state.step!.text = 'Carefully identify the correct WAN port before reconnecting the yellow cable. '.repeat(8);
    state.screen!.caption!.text = 'Long caption '.repeat(30);
    await card.render(state); assert.ok((await card.exportPng()).length > 1000);
    assert.ok(card.getContext()!.instruction.endsWith('…'));
    assert.ok(card.getContext()!.issues.some((issue) => issue.includes('shorter step')));
  } finally { await card.close(); }
});

test('the live intelligence bridge reaches the caller card with its matching photo, step, and target', async () => {
  const jpeg = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#6b7370' } }).jpeg().toBuffer();
  const frames = [jpeg, jpeg];
  const state: CallState = { callId: 'live-bridge', stage: 'waiting', looks: 0 };
  const card = new GuideCard();
  const intelligence = {
    observe: async ({ step }: { step?: string }) => ({
      device_visible: true,
      device: { type: 'other' as const, brand: 'Apple', model: 'MacBook' },
      indicators: [],
      ports: [{ label: 'MagSafe', cable_connected: false }],
      findings: ['MagSafe port visible on the left side'],
      target: step ? { label: 'MagSafe port', box: [0.12, 0.3, 0.28, 0.55] } : null,
      next_shot: '', confidence: 0.9,
    }),
    findFix: async () => ({ likely_cause: 'Port identification', steps: ['Locate the MagSafe port'], needs_technician_if: 'The port is damaged', sources: [] }),
  };
  const emit = async () => card.render(state);
  const tools = createDeviceTools({
    intelligence, state,
    grabJpeg: async () => frames.shift() ?? null,
    snapshot: async (image) => `data:image/jpeg;base64,${image.toString('base64')}`,
    emit,
  });
  try {
    await emit();
    await tools.lookAtDevice('left-side ports');
    assert.equal(card.getContext()!.caption.text, 'Observed: MagSafe port visible on the left side');
    await tools.findFix('Where does this charger connect?');
    await tools.showStep(1);
    assert.equal(card.getContext()!.instruction, 'Locate the MagSafe port');
    assert.equal(card.getContext()!.highlightVisible, true);
    assert.equal(card.getContext()!.highlightedPart, 'MagSafe port');
    assert.ok((await card.exportPng()).length > 1000);
  } finally { await card.close(); }
});
