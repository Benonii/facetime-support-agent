import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Observation } from '../contracts.js';
import { normalizeObservation } from './vision.js';
import { findFix, groundPlan, searchQuery } from './kb.js';

const observation: Observation = {
  device_visible: true,
  device: { type: 'router', brand: 'Example', model: 'R1' },
  indicators: [{ label: 'Internet', color: 'red', pattern: 'unknown' }],
  ports: [{ label: 'WAN', cable_connected: false }],
  findings: ['WAN port empty'],
  target: { label: 'WAN', box: [0.2, 0.3, 0.4, 0.5] },
  confidence: 0.9,
  next_shot: '',
};

test('only valid current-step targets reach the screen', () => {
  assert.deepEqual(normalizeObservation(observation, 'Connect WAN').target, observation.target);
  assert.equal(normalizeObservation(observation).target, null);
  for (const box of [[0, 0, 1], [-0.1, 0, 1, 1], [0, 0, 1.1, 1],
    [0.8, 0, 0.2, 1], [0, 0.3, 1, 0.3], [0, 0, NaN, 1], [0, 0, Infinity, 1]]) {
    assert.equal(normalizeObservation({ ...observation, target: { label: 'WAN', box } }, 'Connect WAN').target, null);
  }
});

test('invisible frames cannot forward previous lights, ports or targets', () => {
  const result = normalizeObservation({ ...observation, device_visible: false }, 'Connect WAN');
  assert.equal(result.target, null);
  assert.deepEqual(result.indicators, []);
  assert.deepEqual(result.ports, []);
  assert.equal(result.device.model, '');
  assert.ok(result.next_shot.length > 0);
});

test('unseen devices ask for a usable view without external calls', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('No network allowed'); };
  try {
    const plan = await findFix({ observation: { ...observation, device_visible: false }, symptom: 'offline' });
    assert.equal(calls, 0);
    assert.equal(plan.steps.length, 1);
    assert.match(plan.steps[0], /camera|view|photo/i);
    assert.deepEqual(plan.sources, []);
    assert.doesNotMatch(plan.likely_cause, /unplugged/i);
  } finally { globalThis.fetch = original; }
});

test('retrieval includes the caller symptom and observed device', () => {
  const query = searchQuery({ observation, symptom: 'drops connection every night' });
  assert.ok(query.includes('drops connection every night'));
  assert.ok(query.includes('Example R1'));
  assert.ok(query.includes('Internet red'));
});

test('plan drops invented sources and caps guidance at six nonempty steps', () => {
  const source = { title: 'Manufacturer guide', url: 'https://example.com/manual' };
  const plan = groundPlan({ likely_cause: 'Cable disconnected',
    steps: ['', ' Connect WAN ', 'Wait', 'Check light', 'Check browser', 'Check cable', 'Check outlet', 'Extra'],
    needs_technician_if: 'Still offline',
    sources: [
      { title: 'Invented', url: 'https://example.com/invented' },
      { title: 'Model changed title', url: source.url },
      source,
    ],
  }, [source]);
  assert.deepEqual(plan.sources, [source]);
  assert.equal(plan.steps.length, 6);
  assert.equal(plan.steps[0], 'Connect WAN');
});
