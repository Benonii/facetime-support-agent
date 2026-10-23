/** Minimal client for Chert's iMessage API (console.trychert.com/api/v1), Bearer auth. */
const BASE = 'https://console.trychert.com/api/v1';

export type Part = { type: 'text'; value: string } | { type: 'media'; attachment_id: string };

/** What handle.ts needs from Chert. Faked in simulate.ts. */
export interface ChertIMessage {
  download(attachmentId: string): Promise<Buffer>;
  uploadPng(png: Buffer): Promise<string>;
  send(chatId: string, parts: Part[], key?: string): Promise<void>;
  typing(chatId: string): Promise<void>;
}

function headers(extra: Record<string, string> = {}) {
  const secret = process.env.CHERT_MESSAGING_SECRET;
  if (!secret) throw new Error('CHERT_MESSAGING_SECRET is not set in .env.local');
  const h: Record<string, string> = { Authorization: `Bearer ${secret}`, ...extra };
  if (process.env.CHERT_TENANT_SLUG) h['x-chert-tenant'] = process.env.CHERT_TENANT_SLUG;
  return h;
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers(init.headers as Record<string, string>) });
  if (!res.ok) throw new Error(`chert ${init.method ?? 'GET'} ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const chert: ChertIMessage = {
  async download(id) {
    const res = await api(`/attachments/${encodeURIComponent(id)}/content`, { signal: AbortSignal.timeout(30_000) });
    return Buffer.from(await res.arrayBuffer());
  },
  async uploadPng(png) {
    const slot = (await (await api('/attachments', json({ filename: 'fix.png', content_type: 'image/png', size_bytes: png.length }))).json()) as { attachment_id: string; upload_url: string };
    await fetch(slot.upload_url, { method: 'PUT', headers: headers({ 'Content-Type': 'image/png', 'Content-Length': String(png.length) }), body: new Uint8Array(png) }).then(async (r) => {
      if (!r.ok) throw new Error(`chert upload → ${r.status} ${await r.text()}`);
    });
    return slot.attachment_id;
  },
  async send(chatId, parts, key) {
    await api(`/chats/${encodeURIComponent(chatId)}/messages`, json({ message: { parts, ...(key ? { idempotency_key: key } : {}) } }));
  },
  async typing(chatId) {
    await api(`/chats/${encodeURIComponent(chatId)}/typing`, json({ state: 'typing' })).catch((e) => console.warn('[imessage] typing', (e as Error).message));
  },
};
