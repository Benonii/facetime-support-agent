// Run the actual intelligence bridge on a fixed photo, without starting a call.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { createIntelligence, selectProvider } from './index.js';
import { runRecordedCase, renderPreview } from './demo.js';
import type { ModelCall } from './model.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  step: { type: 'string', default: '1' }, out: { type: 'string' }, facts: { type: 'string' },
} });
const [file, symptom = 'the device is not working'] = positionals;
if (!file || positionals.length > 2) throw new Error('usage: npm run try:intel -- photo.jpg "symptom" [--step 1] [--out new-directory] [--facts human-facts.txt]');
const step = Number(values.step);
if (!Number.isInteger(step) || step < 1) throw new Error('--step must be a positive integer');
process.env.INTELLIGENCE_PROVIDER ??= 'codex-cli';
const provider = process.env.MOCK_INTELLIGENCE === '1' ? 'mock' : selectProvider();
const out = resolve(values.out ?? `data/intelligence/${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}`);
const started = performance.now();
const jpeg = await sharp(await readFile(file)).rotate().resize(1280,1280,{fit:'inside',withoutEnlargement:true}).jpeg().toBuffer();
const preprocessingMs = Math.round(performance.now()-started);
const humanFacts = values.facts ? await readFile(values.facts,'utf8') : null;
await mkdir(dirname(out),{recursive:true});
await mkdir(out,{mode:0o700}); // Refuse existing directories to prevent stale/overwritten results.
await writeFile(`${out}/processed.jpg`,jpeg,{mode:0o600});
const calls: ModelCall[]=[];
try {
  const result = await runRecordedCase(createIntelligence(call=>calls.push(call)),jpeg,symptom,step);
  const previewStart=performance.now();
  const preview=await renderPreview(jpeg,result.annotation,result.step.text);
  const metadata={
    formatVersion:1, kind:provider==='mock'?'canned-fixture':'model-run', provider,
    createdAt:new Date().toISOString(), symptom, humanFacts,
    imageSha256:createHash('sha256').update(jpeg).digest('hex'),
    processedImage:'processed.jpg', preview:'preview.png', modelCalls:calls,
    ...result, timings:{preprocessingMs,...result.timings,previewMs:Math.round(performance.now()-previewStart),totalMs:Math.round(performance.now()-started)},
  };
  await writeFile(`${out}/preview.png`,preview,{mode:0o600});
  await writeFile(`${out}/result.json`,JSON.stringify(metadata,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({out,provider,kind:metadata.kind,step:result.step.n,timings:metadata.timings},null,2));
} catch (error) {
  // No fabricated successful result. Keep the processed input and bounded failure metadata.
  await writeFile(`${out}/failure.json`,JSON.stringify({provider,modelCalls:calls,error:error instanceof Error?error.message:'Unknown failure'},null,2)+'\n',{mode:0o600});
  throw error;
}
