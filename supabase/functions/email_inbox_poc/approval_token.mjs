// approval_token.mjs — HMAC-SHA256 one-time approval token (issue #35)
// Runs on both Deno (Edge Function) and Node 22 (unit tests) via Web Crypto.
//
// Token payload: `${id}.${exp}.${action}`   (id = request uuid, exp = epoch seconds, action = approve|reject)
// Token value  : hex(HMAC-SHA256(payload, secret))
// Any change to id / exp / action invalidates the token.
// One-time-use is enforced by the DB (promote_approval_request.status must be 'pending').

const te = new TextEncoder();

async function hmacHex(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    te.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, te.encode(payload));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

export async function signToken(id, exp, action, secret) {
  if (!id || !exp || !action || !secret) throw new Error('signToken: missing arg');
  return hmacHex(id + '.' + exp + '.' + action, secret);
}

// constant-time-ish compare (both are fixed-length hex of same HMAC size)
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// verify → { ok, reason }  reasons: bad-params / expired / bad-token
export async function verifyToken({ id, exp, action, token }, secret, nowEpoch) {
  if (!id || !exp || !action || !token || !secret) return { ok: false, reason: 'bad-params' };
  if (action !== 'approve' && action !== 'reject') return { ok: false, reason: 'bad-params' };
  const expNum = Number(exp);
  if (!Number.isFinite(expNum)) return { ok: false, reason: 'bad-params' };
  const now = nowEpoch !== undefined ? nowEpoch : Math.floor(Date.now() / 1000);
  if (now > expNum) return { ok: false, reason: 'expired' };
  const expect = await hmacHex(id + '.' + exp + '.' + action, secret);
  if (!safeEqual(expect, token)) return { ok: false, reason: 'bad-token' };
  return { ok: true, reason: '' };
}
