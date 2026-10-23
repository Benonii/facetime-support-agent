import { serve } from '@hono/node-server';
import { createTelephony } from './app.js';
import { liveKit } from './livekit.js';

const missing = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[server] missing ${missing.join(', ')} in .env.local (LiveKit Cloud > Settings > Keys)`);
  process.exit(1);
}

const url = process.env.LIVEKIT_URL!;
const key = process.env.LIVEKIT_API_KEY!;
const secret = process.env.LIVEKIT_API_SECRET!;

const telephony = createTelephony(liveKit(url, key, secret), {
  livekitUrl: url,
  apiKey: key,
  apiSecret: secret,
  agentName: process.env.AGENT_NAME || 'support-agent',
  budgetMs: Number(process.env.CHERT_DECISION_BUDGET_MS ?? 4000),
  truckRollCost: Number(process.env.TRUCK_ROLL_COST ?? 150),
  brandName: process.env.BRAND_NAME || 'Shure',
  warmPool: process.env.WARM_POOL !== '0',
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: telephony.app.fetch, port }, () => {
  console.log(`[server] http://localhost:${port}  (dashboard /, dev phone /phone, webhook POST /webhooks/chert)`);
  telephony.start();
});
