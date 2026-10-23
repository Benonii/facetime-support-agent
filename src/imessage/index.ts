// iMessage support route: customer texts a photo of their device, we reply with the fix and the part circled.
// Listens to Chert's event stream, so no tunnel or webhook is needed. Run: npm run imessage
import { createIntelligence } from '../intelligence/index.js';
import { api, chert } from './chert.js';
import { createHandler, type InboundEvent } from './handle.js';

if (!process.env.CHERT_MESSAGING_SECRET) throw new Error('Set CHERT_MESSAGING_SECRET in .env.local (console.trychert.com > API keys)');
process.env.INTELLIGENCE_PROVIDER ??= process.env.OPENAI_API_KEY ? 'openai' : 'codex-cli';
console.log(`[imessage] intelligence: ${process.env.MOCK_INTELLIGENCE === '1' ? 'mock' : process.env.INTELLIGENCE_PROVIDER}`);
const handle = createHandler({ chert, intelligence: createIntelligence() });
const seen = new Set<string>();

// Print the number(s) customers should text.
const numbers = await api('/phone-numbers').then((r) => r.json()).catch((e) => ({ error: (e as Error).message }));
console.log('[imessage] sender lines:', JSON.stringify(numbers));

let since = new Date().toISOString();
console.log(`[imessage] listening for texts since ${since}`);

// The stream closes every 60 s; reconnect with ?since= so nothing is missed.
for (;;) {
  try {
    const res = await api(`/events/stream?since=${encodeURIComponent(since)}`, { headers: { Accept: 'text/event-stream' } });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
        if (!data) continue;
        const ev = JSON.parse(data) as { id?: string; type?: string; payload?: InboundEvent; created_at?: string; reconnect_with_since?: string };
        if (ev.reconnect_with_since) since = ev.reconnect_with_since;
        if (!ev.id || !ev.payload || seen.has(ev.id)) continue;
        seen.add(ev.id);
        if (ev.created_at && ev.created_at > since) since = ev.created_at;
        handle(ev.payload);
      }
    }
  } catch (e) {
    console.warn('[imessage] stream', (e as Error).message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
