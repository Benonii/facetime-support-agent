import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Observation } from '../contracts.js';
import { normalizeObservation } from './vision.js';
import { findFix, groundPlan, searchQuery } from './kb.js';

// Transport fixture only; no claim that these bytes depict a real device.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

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
    const plan = await findFix({ jpeg, observation: { ...observation, device_visible: false }, symptom: 'offline' });
    assert.equal(calls, 0);
    assert.equal(plan.steps.length, 1);
    assert.match(plan.steps[0], /camera|view|photo/i);
    assert.deepEqual(plan.sources, []);
    assert.doesNotMatch(plan.likely_cause, /unplugged/i);
  } finally { globalThis.fetch = original; }
});

test('diagnosis rejects a missing or empty image before any external call', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('No network allowed'); };
  try {
    // @ts-expect-error The required image must also be enforced at compile time.
    await assert.rejects(findFix({ observation, symptom: 'offline' }), /jpeg.*non-empty Buffer/i);
    await assert.rejects(findFix({ jpeg: Buffer.alloc(0), observation, symptom: 'offline' }), /jpeg.*non-empty Buffer/i);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('diagnosis sends the exact image and symptom to the model', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only-not-a-real-key';
  const requests: Record<string, any>[] = [];
  const plan = { likely_cause: 'WAN disconnected', steps: ['Check WAN cable'], needs_technician_if: 'Still offline', sources: [] };
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://api.keenable.ai/')) return Response.json({ results: [] });
    assert.ok(url.endsWith('/responses'), 'Unexpected external endpoint');
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({
      id: 'resp_test', object: 'response', created_at: 0, status: 'completed',
      model: 'test-model', error: null, incomplete_details: null,
      output: [{ type: 'message', id: 'msg_test', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: JSON.stringify(plan), annotations: [], logprobs: [] }] }],
    });
  };
  try {
    assert.deepEqual(await findFix({ jpeg, observation, symptom: 'offline since this morning' }), plan);
    assert.equal(requests.length, 1);
    const input = requests[0].input;
    assert.ok(Array.isArray(input), 'Diagnosis must send multimodal input, not text alone');
    const content = input.flatMap((message: any) => message.content);
    assert.deepEqual(content.find((part: any) => part.type === 'input_image'), {
      type: 'input_image', image_url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail: 'high',
    });
    assert.match(content.find((part: any) => part.type === 'input_text').text, /offline since this morning/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
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
