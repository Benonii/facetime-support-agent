// Part 3 test bench: run vision + fix plan on a photo, no call needed.
//   npm run try:intel -- path/to/router.jpg "my internet is down"
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { createIntelligence } from './index.js';

const [file, symptom = 'my internet is down', step] = process.argv.slice(2);
if (!file) throw new Error('usage: npm run try:intel -- photo.jpg "symptom" ["step text"]');
const jpeg = await sharp(readFileSync(file)).rotate().resize(1280, 1280, { fit: 'inside' }).jpeg().toBuffer();
const intel = createIntelligence();
console.time('observe');
const observation = await intel.observe({ jpeg, step });
console.timeEnd('observe');
console.log(JSON.stringify(observation, null, 2));
console.time('findFix');
console.log(JSON.stringify(await intel.findFix({ observation, symptom }), null, 2));
console.timeEnd('findFix');
