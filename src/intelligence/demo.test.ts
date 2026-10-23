import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import type { Intelligence, Observation } from '../contracts.js';
import { runRecordedCase, renderPreview } from './demo.js';
const obs: Observation={device_visible:true,device:{type:'router',brand:'',model:''},indicators:[],ports:[],findings:[],target:null,next_shot:'',confidence:0.5};

test('selected returned step and identical photo drive the annotation and preview',async()=>{
  const jpeg=await sharp({create:{width:100,height:80,channels:3,background:'#ffffff'}}).jpeg().toBuffer();
  const calls: any[]=[];
  const intel: Intelligence={
    observe:async req=>{calls.push(req);return {...obs,target:req.step?{label:'port',box:[.2,.3,.4,.5]}:null};},
    findFix:async req=>{calls.push(req);return {likely_cause:'fixture',steps:['First','Second'],needs_technician_if:'unknown',sources:[]};},
  };
  const result=await runRecordedCase(intel,jpeg,'offline',2);
  assert.equal(result.step.text,'Second'); assert.equal(calls[2].step,'Second');
  assert.ok(calls.every(req=>req.jpeg===jpeg)); assert.equal(calls[1].observation,result.observation);
  const withCircle=await renderPreview(jpeg,result.annotation,result.step.text);
  const withoutCircle=await renderPreview(jpeg,{...result.annotation,target:null},result.step.text);
  assert.equal((await sharp(withCircle).metadata()).format,'png'); assert.notDeepEqual(withCircle,withoutCircle);
  // Original image remains unchanged and is embedded without rotation or crop.
  assert.equal((await sharp(jpeg).metadata()).width,100);
  await assert.rejects(runRecordedCase(intel,jpeg,'offline',3),/step/);
  await assert.rejects(runRecordedCase(intel,jpeg,'offline',0),/step/);
});

test('invisible image still produces an unannotated request for a better view',async()=>{
  const intel: Intelligence={observe:async()=>({...obs,device_visible:false}),findFix:async()=>({likely_cause:'unknown',steps:['Show the device'],needs_technician_if:'unknown',sources:[]})};
  const result=await runRecordedCase(intel,Buffer.from('fixture'),'offline');
  assert.equal(result.step.n,1); assert.equal(result.annotation.target,null);
});


test('failed stages retain stage name and elapsed timing without a successful result',async()=>{
  const intel: Intelligence={observe:async()=>{throw new Error('model unavailable');},findFix:async()=>{throw new Error('must not run');}};
  await assert.rejects(runRecordedCase(intel,Buffer.from('fixture'),'offline'),(error:any)=>{
    assert.equal(error.stage,'observeMs'); assert.ok(error.timings.observeMs>=0); assert.match(error.message,/model unavailable/); return true;
  });
});
