/** Optional: text the offer + label over iMessage through Chert's messaging API. */
export async function sendIMessage(phone: string, body: string): Promise<boolean> {
  const secret = process.env.CHERT_MESSAGING_SECRET;
  if (!secret) return false;
  try {
    const res = await fetch('https://console.trychert.com/api/v1/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, body }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) console.warn('[imessage]', res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.warn('[imessage]', (e as Error).message);
    return false;
  }
}
