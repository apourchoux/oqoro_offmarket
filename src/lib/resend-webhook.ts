// Vérification de signature des webhooks Resend (format Svix), sans
// dépendance : HMAC-SHA256 sur `${id}.${timestamp}.${rawBody}` avec le
// secret base64 (préfixe `whsec_` retiré), comparé en temps constant à
// chaque entrée `v1,<signature>` du header `svix-signature`.
// Réf : https://docs.svix.com/receiving/verifying-payloads/how-manual

import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function verifyResendWebhook(
  secret: string,
  headers: SvixHeaders,
  rawBody: string,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > TOLERANCE_SECONDS) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  // Le header peut contenir plusieurs signatures : "v1,xxx v1,yyy".
  for (const entry of signature.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) continue;
    let candidate: Buffer;
    try {
      candidate = Buffer.from(sig, 'base64');
    } catch {
      continue;
    }
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}
