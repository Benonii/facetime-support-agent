import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { FixPlan, type Observation } from './types.js';

let client: OpenAI | undefined;
const openai = () => (client ??= new OpenAI());

interface KeenableResult {
  title: string;
  url: string;
  description?: string;
  snippet?: string;
}

/** Keenable web search (sponsor). Uses the keyed endpoint when KEENABLE_API_KEY is set, else the keyless one. */
export async function keenableSearch(query: string, maxResults = 6): Promise<KeenableResult[]> {
  const key = process.env.KEENABLE_API_KEY;
  const url = key ? 'https://api.keenable.ai/v1/search' : 'https://api.keenable.ai/v1/search/public';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-API-Key': key } : { 'X-Keenable-Title': 'facetime-support-agent' }),
    },
    body: JSON.stringify({ query, mode: 'realtime', max_results: maxResults, snippet_max_length: 1200 }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`keenable ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { results: KeenableResult[] };
  return body.results ?? [];
}

// The brand's own runbook. Edit tonight for the exact device you will demo; it wins over the web.
const PLAYBOOK = `
Internet / globe light OFF or RED, WAN port empty -> the line cable is unplugged. Plug the cable from the wall into the WAN (often yellow or blue) port. Wait 2 minutes.
Internet light AMBER or RED with WAN cable plugged in -> power cycle: unplug power 30 s, plug back in, wait 3 minutes for lights to settle.
Power light OFF -> check the power adapter is in the POWER port and the outlet works. Try another outlet.
Wi-Fi light OFF, internet OK -> press the Wi-Fi / WPS button once, or check the Wi-Fi switch on the side.
Fiber / PON / LOS light RED or blinking red -> fiber signal lost. Check the green fiber connector is clicked in and the cable is not bent sharply. If still red after reseat -> technician.
All lights blinking together for > 5 minutes after power cycle -> firmware stuck. Hold reset 10 s ONLY if the agent confirms; else technician.
`;

export async function lookupFix(o: Observation, symptom: string): Promise<FixPlan> {
  const lights = o.indicators.map((l) => `${l.label} ${l.color} ${l.pattern}`).join(', ');
  const query = `${o.device.brand} ${o.device.model} ${o.device.type} ${lights} troubleshooting`.replace(/\s+/g, ' ').trim();
  let web: KeenableResult[] = [];
  try {
    web = await keenableSearch(query);
  } catch (e) {
    console.warn('[kb] web search failed, playbook only:', (e as Error).message);
  }
  const model = process.env.EXTRACT_MODEL ?? 'gpt-5-mini';
  const res = await openai().responses.parse({
    model,
    ...(/^(gpt-5|o\d)/.test(model) ? { reasoning: { effort: 'low' as const } } : {}),
    instructions:
      'You write the fix plan a support agent will walk a customer through on a live call. ' +
      'Prefer the brand playbook. Use web results for model-specific LED meanings. Steps must be physical and checkable on camera ' +
      '("plug the yellow cable into WAN"), never "contact your ISP". Never include a factory reset as an early step. ' +
      'List only web sources you actually used.',
    input: [
      `Customer says: ${symptom}`,
      `Seen on camera: ${JSON.stringify({ device: o.device, indicators: o.indicators, ports: o.ports, findings: o.findings })}`,
      `Brand playbook:\n${PLAYBOOK}`,
      `Web results:\n${web.map((r, n) => `[${n}] ${r.title}\n${r.url}\n${r.snippet ?? r.description ?? ''}`).join('\n\n') || '(none)'}`,
    ].join('\n\n'),
    text: { format: zodTextFormat(FixPlan, 'fix_plan') },
  });
  if (!res.output_parsed) throw new Error('kb: no plan');
  return res.output_parsed;
}
