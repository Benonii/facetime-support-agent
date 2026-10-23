import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CallState, Intelligence, Observation } from '../contracts.js';
import { createDeviceTools } from './device-tools.js';
const observation: Observation = {device_visible:true,device:{type:'other',brand:'',model:''},ports:[],indicators:[],findings:[],target:null,next_shot:'',confidence:0.8};
const plan = {likely_cause:'Port identification',steps:['Locate the charging port'],needs_technician_if:'Damaged port',sources:[]};
function setup(intelligence: Intelligence, frames: (Buffer|null)[]) {
 const state: CallState={callId:'test',stage:'waiting',looks:0}; const emitted: CallState[]=[];
 const bridge=createDeviceTools({intelligence,state,grabJpeg:async()=>frames.shift()??null,snapshot:async b=>`snapshot:${b.toString()}`,emit:async()=>{emitted.push(structuredClone(state));}});
 return {state,emitted,bridge};
}
test('live tool bridge pairs image with diagnosis and publishes fresh step image/target together',async()=>{
 const first=Buffer.from('first'); const next=Buffer.from('next'); const calls:any[]=[];
 const intel:Intelligence={observe:async req=>{calls.push(req);return {...observation,target:req.step?{label:'charging port',box:[.1,.2,.3,.4]}:null};},findFix:async req=>{calls.push(req);return plan;}};
 const {bridge,state,emitted}=setup(intel,[first,next]);
 await bridge.lookAtDevice('ports'); const observed=state.observation; const result=await bridge.findFix('where does it go?');
 assert.equal(result,plan);assert.equal(calls[1].jpeg,first);assert.equal(calls[1].observation,observed);
 const shown=await bridge.showStep(1);
 assert.equal(calls[2].jpeg,next);assert.equal(calls[2].step,plan.steps[0]);
 assert.deepEqual(shown,{step:plan.steps[0],circled:'charging port',device_visible:true,next_shot:''});
 assert.equal(state.lastSnapshot,'snapshot:next');assert.equal(state.step?.text,plan.steps[0]);
 assert.ok(emitted.every(s=>!s.observation?.target || s.lastSnapshot==='snapshot:next'));
 assert.ok(emitted.every(s=>!s.step || s.lastSnapshot==='snapshot:next')); 
 assert.ok(!JSON.stringify(emitted).includes('"type":"Buffer"'));
});
test('missing video and failed model clear old image/target and prevent stale diagnosis',async()=>{
 let fail=false;let diagnoses=0;
 const intel:Intelligence={observe:async()=>{if(fail)throw Error('private provider details');return observation;},findFix:async()=>{diagnoses++;return plan;}};
 const {bridge,state}=setup(intel,[Buffer.from('first'),null,Buffer.from('third')]);
 await bridge.lookAtDevice('ports');await bridge.findFix('help');
 assert.ok('error' in await bridge.showStep(1));assert.equal(state.lastSnapshot,undefined);assert.equal(state.step,undefined);
 assert.ok('error' in await bridge.findFix('help'));assert.equal(diagnoses,1);
 fail=true;const result=await bridge.lookAtDevice('ports');assert.ok('error' in result);assert.ok(!JSON.stringify(result).includes('private'));
 assert.equal(state.plan,undefined);assert.equal(state.observation,undefined);assert.equal(state.stage,'waiting');
});
test('overlapping tools wait for the observation and invalid steps never capture a frame',async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let diagnoses=0;let observations=0;
 const intel:Intelligence={observe:async()=>{observations++;await gate;return observation;},findFix:async()=>{diagnoses++;return plan;}};
 const {bridge}=setup(intel,[Buffer.from('one')]);
 const looking=bridge.lookAtDevice('ports');const fixing=bridge.findFix('help');
 await new Promise(r=>setImmediate(r));assert.equal(diagnoses,0);release();await looking;await fixing;assert.equal(diagnoses,1);
 assert.ok('error' in await bridge.showStep(0));assert.ok('error' in await bridge.showStep(9));assert.equal(observations,1);
});

test('a new camera angle preserves the plan so the caller can continue to a later step',async()=>{
 const twoSteps={...plan,steps:['Locate port','Show connector']};
 const intel:Intelligence={observe:async()=>observation,findFix:async()=>twoSteps};
 const {bridge,state}=setup(intel,[Buffer.from('one'),Buffer.from('two'),Buffer.from('three')]);
 await bridge.lookAtDevice('ports');await bridge.findFix('help');await bridge.lookAtDevice('other side');
 assert.equal(state.plan,twoSteps);assert.ok(!('error' in await bridge.showStep(2)));assert.equal(state.step?.text,'Show connector');
});
