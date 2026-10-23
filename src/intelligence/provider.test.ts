import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { codexModel } from './codex.js';
import { createIntelligence, selectProvider } from './index.js';
import { mockIntelligence } from './mock.js';

const request = { jpeg: Buffer.from('test-image'), instructions: 'Inspect image', text: 'symptom: offline', schema: z.object({ answer: z.string() }), name: 'probe', model: 'unused' };
async function fixture(body: string) {
  const dir = await mkdtemp(join(tmpdir(), 'intel-test-'));
  const command = join(dir, 'fake-codex');
  await writeFile(command, `#!${process.execPath}\n${body}`, { mode: 0o700 });
  return { dir, command, close: () => rm(dir, { recursive: true, force: true }) };
}

test('CLI sends private image/schema files and stdin prompt; removes files after success', async () => {
  const f = await fixture(`
    const fs = require('node:fs'); const args = process.argv.slice(2);
    const image = args[args.indexOf('--image')+1], schema = args[args.indexOf('--output-schema')+1];
    let prompt=''; process.stdin.on('data',x=>prompt+=x); process.stdin.on('end',()=>{
      process.stderr.write('model: verified-test-model\\n');
      console.log(JSON.stringify({answer:JSON.stringify({args,image,schema,cwd:process.cwd(),prompt,bytes:fs.readFileSync(image).toString(),mode:fs.statSync(image).mode & 511,shape:JSON.parse(fs.readFileSync(schema))})}));
    });`);
  const calls: any[] = [];
  try {
    const result = await codexModel({ command: f.command, onCall: x => calls.push(x) })(request);
    const got = JSON.parse(result.answer);
    for (const flag of ['--ephemeral','--ignore-user-config','--skip-git-repo-check','--sandbox']) assert.ok(got.args.includes(flag));
    assert.ok(got.args.includes('read-only')); assert.equal(got.bytes,'test-image'); assert.equal(got.mode,0o600);
    assert.match(got.prompt,/symptom: offline/); assert.match(got.prompt,/Do not use.*tools/i);
    assert.equal(got.shape.additionalProperties,false); assert.deepEqual(got.shape.required,['answer']);
    assert.notEqual(got.cwd,process.cwd()); await assert.rejects(access(got.image)); await assert.rejects(access(got.schema));
    assert.equal(calls[0].model,'verified-test-model'); assert.equal(calls[0].status,'success');
  } finally { await f.close(); }
});

test('CLI rejects nonzero, empty, non-JSON and schema-invalid output', async () => {
  for (const body of ['process.exit(2)', '', `console.log('garbage')`, `console.log('{"answer":123}')`]) {
    const f = await fixture(body);
    try { const calls: any[]=[]; await assert.rejects(codexModel({ command:f.command, onCall:x=>calls.push(x) })(request)); assert.equal(calls[0]?.status,'failed'); assert.equal(calls[0]?.operation,'probe'); assert.ok(calls[0]?.durationMs>=0); }
    finally { await f.close(); }
  }
});

test('timeout kills the process group and removes temporary files', async () => {
  const f = await fixture(''); const record = join(f.dir,'record.json');
  await writeFile(f.command, `#!${process.execPath}\nconst fs=require('node:fs'); const cp=require('node:child_process'); const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)']); fs.writeFileSync(${JSON.stringify(record)},JSON.stringify({pid:process.pid,child:child.pid,cwd:process.cwd()})); setInterval(()=>{},1000);`, { mode:0o700 });
  try {
    const calls: any[]=[];
    await assert.rejects(codexModel({ command:f.command, timeoutMs:500, onCall:x=>calls.push(x) })(request), /timed out/);
    assert.equal(calls[0]?.status,'failed'); assert.ok(calls[0]?.durationMs>=450);
    const result = JSON.parse(await readFile(record,'utf8'));
    assert.throws(()=>process.kill(result.pid,0));
    // Descendant shutdown is asynchronous at the OS level.
    for(let n=0;n<30;n++){ try {process.kill(result.child,0); await new Promise(r=>setTimeout(r,10));} catch {break;} }
    assert.throws(()=>process.kill(result.child,0)); await assert.rejects(access(result.cwd));
  } finally { await f.close(); }
});

test('CLI serializes calls and recovers its queue after failure', async () => {
  const f=await fixture(''); const record=join(f.dir,'order');
  await writeFile(f.command, `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(record)},'start\\n');setTimeout(()=>{fs.appendFileSync(${JSON.stringify(record)},'end\\n');console.log('{"answer":"ok"}');},100);`,{mode:0o700});
  try {
    const model=codexModel({command:f.command}); await Promise.all([model(request),model(request)]);
    assert.equal(await readFile(record,'utf8'),'start\nend\nstart\nend\n');
    await assert.rejects(codexModel({command:'/nonexistent-codex'})(request));
    assert.equal((await model(request)).answer,'ok');
  } finally {await f.close();}
});

test('provider selection is explicit and mock override is retained',()=>{
  assert.equal(selectProvider({}),'openai'); assert.equal(selectProvider({INTELLIGENCE_PROVIDER:'codex-cli'}),'codex-cli');
  assert.equal(selectProvider({INTELLIGENCE_PROVIDER:'openai'}),'openai');
  assert.throws(()=>selectProvider({INTELLIGENCE_PROVIDER:'typo'}),/INTELLIGENCE_PROVIDER/);
  const before=process.env.MOCK_INTELLIGENCE; process.env.MOCK_INTELLIGENCE='1';
  try {assert.equal(createIntelligence(),mockIntelligence);} finally {if(before===undefined) delete process.env.MOCK_INTELLIGENCE;else process.env.MOCK_INTELLIGENCE=before;}
});

test('CLI sends current image first and earlier references separately, then removes all images',async()=>{
 const f=await fixture(`const fs=require('node:fs');const args=process.argv.slice(2);const paths=args.flatMap((v,i)=>v==='--image'?[args[i+1]]:[]);console.log(JSON.stringify({answer:JSON.stringify({paths,bytes:paths.map(p=>fs.readFileSync(p).toString())})}));`);
 try {
  const result=await codexModel({command:f.command})({...request,referenceJpegs:[Buffer.from('first-view'),Buffer.from('last-view')]});
  const got=JSON.parse(result.answer);
  assert.deepEqual(got.bytes,['test-image','first-view','last-view']);
  for(const path of got.paths)await assert.rejects(access(path));
 }finally{await f.close();}
});
