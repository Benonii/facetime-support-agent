import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { dispose } from '@livekit/rtc-node';
after(() => dispose());
import sharp from 'sharp';
import type { CallState } from '../contracts.js';
import { GuideCard } from './card.js';

test('clearing the snapshot restores the empty rendered card instead of showing the previous photo',async()=>{
 const card=new GuideCard();const state:CallState={callId:'test',stage:'waiting',looks:0};
 // Inspect rendered pixels through the same offline canvas surface used by smoke.ts.
 const png=()=> (card as any).canvas.encode('png') as Promise<Buffer>;
 try {
  await card.render(state);const empty=await png();
  const jpeg=await sharp({create:{width:100,height:100,channels:3,background:'#ff0000'}}).jpeg().toBuffer();
  await card.render({...state,lastSnapshot:`data:image/jpeg;base64,${jpeg.toString('base64')}`});
  assert.notDeepEqual(await png(),empty);
  await card.render(state);assert.deepEqual(await png(),empty);
 } finally {await card.close();}
});
