// Pretend to be a customer texting a photo, with a fake Chert. No keys needed with MOCK_INTELLIGENCE=1.
// Run: npm run imessage:sim -- photo.jpg ["symptom"]   (writes imessage-sim-*.png next to you)
import { readFile, writeFile } from 'node:fs/promises';
import { createIntelligence } from '../intelligence/index.js';
import type { ChertIMessage } from './chert.js';
import { createHandler, type InboundEvent } from './handle.js';

const [file, symptom = 'no internet'] = process.argv.slice(2);
if (!file) throw new Error('usage: npm run imessage:sim -- photo.jpg ["symptom"]');
const photo = await readFile(file);
const uploads: Buffer[] = [];
const fake: ChertIMessage = {
  download: async () => photo,
  uploadPng: async (png) => (uploads.push(png), `att_${uploads.length}`),
  send: async (_chat, parts) => console.log('\n← agent:', parts.map((p) => (p.type === 'text' ? p.value : `[image ${p.attachment_id}]`)).join(' ')),
  typing: async () => {},
};
const handle = createHandler({ chert: fake, intelligence: createIntelligence() });
let n = 0;
const text = (value: string, media = false): InboundEvent => ({
  event_id: `sim-${++n}`,
  event_type: 'message.received',
  data: {
    chat: { id: 'sim-chat', is_group: false },
    message: { id: `m${n}`, direction: 'inbound', sender_handle: { handle: '+15555550123' }, parts: [{ type: 'text', value }, ...(media ? [{ type: 'media', attachment_id: 'in_sim' }] : [])] },
  },
});

for (const [msg, media] of [['hi', false], [symptom, true], ['next', false]] as const) {
  console.log(`\n→ customer: ${media ? '[photo] ' : ''}${msg}`);
  await handle(text(msg, media));
}
for (const [i, png] of uploads.entries()) await writeFile(`imessage-sim-${i + 1}.png`, png);
console.log(`\nwrote ${uploads.length} annotated image(s): imessage-sim-*.png`);
