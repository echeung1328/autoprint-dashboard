// access_token.mjs — token generation & link validation logic (issue #45 T2/T6)
// Runs on both Deno (Edge Function) and Node 22 (unit tests) via Web Crypto.
//
// token = base64url(32 random bytes) => 43 chars, URL-safe, unguessable.
// Validation rules (pure functions, no IO):
//   - status 'stopped' takes priority over expiry
//   - expired when now > expires_at
//   - max lifetime 365 days enforced at creation

export const MAX_LIFETIME_DAYS = 365;
export const TOKEN_BYTES = 32;

/** Generate a base64url token from 32 crypto-random bytes. */
export function generateToken(bytes = TOKEN_BYTES) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Token format check: base64url, expected length for 32 bytes (=43 chars). */
export function isValidTokenFormat(token, bytes = TOKEN_BYTES) {
  if (typeof token !== 'string') return false;
  const expectedLen = Math.ceil((bytes * 4) / 3);
  if (token.length !== expectedLen) return false;
  return /^[A-Za-z0-9_-]+$/.test(token);
}

/** Clamp requested days into [1, 365]. Used server-side at creation (T6). */
export function clampLifetimeDays(days) {
  const n = Number(days);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_LIFETIME_DAYS, Math.max(1, Math.floor(n)));
}

/** Compute expires_at ISO string from a start time + days. */
export function computeExpiresAt(fromMs, days) {
  const d = clampLifetimeDays(days);
  return new Date(fromMs + d * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Validate a link row against current time.
 * Returns { ok: boolean, reason: 'not_found'|'stopped'|'expired'|null }
 * Priority: not_found > stopped > expired > ok (stopped beats expired per #51).
 */
export function validateLink(row, nowMs = Date.now()) {
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status === 'stopped') return { ok: false, reason: 'stopped' };
  if (row.status !== 'active') return { ok: false, reason: 'invalid_status' };
  const exp = new Date(row.expires_at).getTime();
  if (!Number.isFinite(exp)) return { ok: false, reason: 'expired' };
  if (nowMs > exp) return { ok: false, reason: 'expired' };
  return { ok: true, reason: null };
}

/** Reason -> HTTP-safe message (no internal details). */
export function reasonMessage(reason) {
  const map = {
    not_found: '链接不存在或已删除',
    stopped: '链接已停止访问',
    expired: '链接已过期',
    invalid_status: '链接状态异常'
  };
  return map[reason] || '链接不可用';
}

/** token_prefix for audit: first 8 chars only, never full token. */
export function tokenPrefix(token) {
  return typeof token === 'string' ? token.slice(0, 8) : '';
}
