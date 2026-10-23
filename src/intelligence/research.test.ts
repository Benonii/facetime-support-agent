import assert from 'node:assert/strict';
import { test } from 'node:test';
import { researchProduct, type ResearchRequest } from './research.js';

const request: ResearchRequest = {
  product: { brand: 'Apple', model: 'MacBook Pro', type: 'laptop' },
  identityUncertainty: ['Model and MagSafe generation not confirmed'],
  question: 'MagSafe connector will not fit', facts: ['Connector does not seat'],
};
const hit = { title: 'Connector guide', url: 'https://support.example.com/guide', snippet: 'RAW_EXCERPT: Different connector generations are incompatible.' };
const summary = {
  findings: [{ text: 'Check connector generation before applying model-specific information.', kind: 'manufacturer_guidance', sourceIds: ['s1'] }],
  gaps: ['MagSafe generation unknown'], contradictions: [],
};
function response(body: unknown) {
  return Response.json({ id: 'resp_test', object: 'response', created_at: 0, status: 'completed', model: 'gpt-6-luna',
    output: [{ type: 'message', id: 'msg_test', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(body), annotations: [], logprobs: [] }] }],
    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } });
}
function transport(options: { summary?: unknown; failRank?: boolean; empty?: boolean; fetchFail?: boolean; partial?: boolean } = {}) {
  const calls: { url: string; body: any }[] = [];
  const fake: typeof fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url.includes('/search')) {
      if (options.partial && body.site === 'reddit.com') return new Response('', { status: 503 });
      return Response.json({ results: options.empty ? [] : [hit, { ...hit, url: hit.url + '?utm_source=copy' },
        { title: 'Other fault', url: 'https://reddit.com/r/test/comments/other', snippet: 'An unrelated overheating fault.' }] });
    }
    if (url.endsWith('/decisions')) {
      if (options.failRank) return new Response('', { status: 401 });
      const candidates = body.input[0].content[0].data.candidates;
      return Response.json({ model: 'gpt-6-luna', usage: { input_tokens: 100 }, answers: candidates.map((c: any) => (
        { type: 'score', name: c.id, score: c.url.includes('reddit') ? 0.3 : 2.2, confidence: 0.8 }
      )) });
    }
    if (url.includes('/fetch')) return options.fetchFail ? new Response('', { status: 404 }) : Response.json({ content: 'FETCHED_PAGE: Different connector generations are incompatible.' });
    if (url.endsWith('/responses')) return response(options.summary ?? summary);
    throw new Error('Unexpected network endpoint');
  };
  return { fake, calls };
}

test('research ranks deduplicated evidence and returns a compact source-linked brief', async () => {
  const { fake, calls } = transport();
  const result = await researchProduct(request, { fetch: fake, apiKey: 'test-key' });
  assert.equal(result.status, 'evidence_found');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].coverage, 'page');
  assert.equal(result.findings[0].sourceIds[0], result.sources[0].id);
  assert.ok(JSON.stringify(result).length <= 6000);
  assert.doesNotMatch(JSON.stringify(result), /RAW_EXCERPT|FETCHED_PAGE/);
  const searches = calls.filter(c => c.url.includes('/search'));
  assert.equal(searches.length, 4);
  assert.ok(searches.some(c => c.body.site === 'reddit.com'));
  const ranking = calls.find(c => c.url.endsWith('/decisions'))!.body;
  assert.equal(ranking.input[0].content[0].data.candidates.length, 2);
  assert.match(JSON.stringify(ranking), /generation not confirmed/);
  const synthesis = calls.find(c => c.url.endsWith('/responses'))!.body;
  assert.doesNotMatch(JSON.stringify(synthesis), /unrelated overheating|input_image/);
});

test('partial search and fetch failures keep only ranked excerpts with coverage gaps', async () => {
  const { fake } = transport({ partial: true, fetchFail: true });
  const result = await researchProduct(request, { fetch: fake, apiKey: 'test-key' });
  assert.equal(result.status, 'evidence_found');
  assert.equal(result.sources[0].coverage, 'excerpt');
  assert.ok(result.limitations.length >= 2);
});

test('empty results skip models; rejected credentials do not retry or leak raw evidence', async () => {
  for (const empty of [true, false]) {
    const { fake, calls } = transport({ empty, failRank: true });
    const result = await researchProduct(request, { fetch: fake, apiKey: 'test-key' });
    assert.equal(result.status, empty ? 'nothing_relevant' : 'unavailable');
    assert.deepEqual(result.sources, []);
    assert.deepEqual(result.findings, []);
    assert.equal(calls.filter(c => c.url.endsWith('/decisions')).length, empty ? 0 : 1);
    assert.equal(calls.filter(c => c.url.endsWith('/responses')).length, 0);
  }
});

test('invented citations and oversized briefs never reach diagnosis', async () => {
  for (const invalid of [
    { ...summary, findings: [{ ...summary.findings[0], sourceIds: ['invented'] }] },
    { ...summary, gaps: ['x'.repeat(6500)] },
  ]) {
    const { fake } = transport({ summary: invalid });
    const result = await researchProduct(request, { fetch: fake, apiKey: 'test-key' });
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.sources, []);
  }
});

test('ranking deadline returns an unavailable report even if transport ignores abort', async () => {
  const { fake } = transport();
  const started = performance.now();
  const result = await researchProduct(request, { apiKey: 'test-key', fetch: async (input, init) =>
    String(input).endsWith('/decisions') ? new Promise<Response>(() => {}) : fake(input, init) });
  assert.equal(result.status, 'unavailable');
  assert.ok(performance.now() - started < 3000);
  assert.match(result.limitations.join(' '), /rank/i);
});
