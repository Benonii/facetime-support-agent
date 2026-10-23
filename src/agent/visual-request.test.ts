import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CallState, Intelligence, Observation } from '../contracts.js';
import { createVisualRequestController } from './visual-request.js';
const obs: Observation = { device_visible:true, device:{type:'other',brand:'',model:''}, ports:[], indicators:[], findings:['Charging port visible'], target:null, next_shot:'', confidence:.9 };
const plan = { likely_cause:'Connect charger', steps:['Move the connector to the port nearest the hinge'], needs_technician_if:'Damaged', sources:[] };
function setup(intelligence: Intelligence, jpeg:Buffer|null=Buffer.from('current')) {
 const state:CallState={callId:'test',stage:'waiting',looks:0}; const events:CallState[]=[];let captures=0;
 const controller=createVisualRequestController({state,intelligence,grabJpeg:async()=>{captures++;return jpeg?Buffer.from(`${jpeg.toString()}-${captures}`):null;},snapshot:async()=> 'data:image/jpeg;base64,current',emit:async()=>{events.push(structuredClone(state));}});
 return {controller,state,events,captures:()=>captures};
}
test('one request acknowledges, diagnoses and annotates the same frame; follow-up keeps original goal',async()=>{
 const calls:any[]=[]; const updates:string[]=[];
 const intel:Intelligence={observe:async r=>{calls.push(r);return {...obs,target:r.step?{label:'destination port',box:[.1,.2,.3,.4]}:null};},findFix:async r=>{calls.push(r);return plan;}};
 const {controller,state,events,captures}=setup(intel);
 const first=await controller.run({requestId:'1',question:'Where does this charger go?',mode:'guide'},async s=>{updates.push(s);assert.equal(calls.length,0);});
 assert.equal(captures(),1);assert.equal(updates.length,1);assert.equal(first.outcome,'guidance');
 assert.equal(calls.length,3);assert.ok(calls.every(c=>c.jpeg===calls[0].jpeg));
 assert.equal(state.observation?.target?.label,'destination port');assert.equal(state.step?.text,plan.steps[0]);
 assert.equal(state.screen?.snapshotId,state.screen?.observationSnapshotId);
 assert.ok(events.some(s=>s.stage==='diagnosing')); assert.ok(events.every(s=>!s.observation?.target||!!s.lastSnapshot&&!!s.step));
 await controller.run({requestId:'2',question:'It does not fit here',mode:'guide'});
 assert.match(calls[4].symptom,/Where does this charger go/);assert.match(calls[4].symptom,/does not fit/);
 assert.equal(calls[3].referenceJpegs.length,1);
});
test('missing camera and provider failure clear old instructions and return honest retry guidance',async()=>{
 let calls=0;
 const intel:Intelligence={observe:async()=>{calls++;throw Error('private provider failure');},findFix:async()=>plan};
 const missing=setup(intel,null);const result=await missing.controller.run({requestId:'1',question:'help',mode:'guide'});
 assert.equal(result.outcome,'needs_view');assert.equal(calls,0);
 const failed=setup(intel);failed.state.step={n:1,text:'old instruction'};
 const error=await failed.controller.run({requestId:'2',question:'help',mode:'guide'});
 assert.equal(error.outcome,'failed');assert.equal(failed.state.step,undefined);assert.equal(failed.state.lastSnapshot,undefined);
 assert.ok(!JSON.stringify(error).includes('private provider'));
});
test('cancelled slow work cannot publish its late target',async()=>{
 let release!:(o:Observation)=>void;const pending=new Promise<Observation>(r=>{release=r;});
 const {controller,state}=setup({observe:async()=>pending,findFix:async()=>plan});
 const running=controller.run({requestId:'1',question:'help',mode:'guide'});
 await new Promise(r=>setImmediate(r));await controller.cancel();
 assert.equal((await running).outcome,'cancelled');release({...obs,target:{label:'obsolete',box:[0,0,1,1]}});
 await new Promise(r=>setImmediate(r));assert.equal(state.observation,undefined);assert.equal(state.step,undefined);
});
test('verification reports evidence without resolving; unclear view produces no target or diagnosis',async()=>{
 let fixes=0;const {controller,state}=setup({observe:async()=>obs,findFix:async()=>{fixes++;return plan;}});
 assert.equal((await controller.run({requestId:'v',question:'Is it connected?',mode:'verify'})).outcome,'verification');
 assert.notEqual(state.stage,'resolved');assert.equal(fixes,0);
 const unclear=setup({observe:async()=>({...obs,device_visible:false,next_shot:'Show the other side'}),findFix:async()=>{fixes++;return plan;}});
 assert.equal((await unclear.controller.run({requestId:'u',question:'help',mode:'guide'})).outcome,'needs_view');
 assert.equal(unclear.state.observation?.target,null);assert.equal(fixes,0);
});
