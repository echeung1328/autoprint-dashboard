// approval_token.test.mjs — unit tests for HMAC one-time approval token (issue #35)
// Run: node approval_token.test.mjs
import { signToken, verifyToken } from './approval_token.mjs';

let pass = 0;
let fail = 0;
function ok(cond, name) {
  if (cond) {
    pass++;
    console.log('  PASS', name);
  } else {
    fail++;
    console.log('  FAIL', name);
  }
}

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const ID = '9b2f7c1e-1234-4abc-9def-0123456789ab';
const NOW = 1800000000; // fixed epoch for determinism
const EXP = NOW + 72 * 3600;

const t = await signToken(ID, EXP, 'approve', SECRET);

// 1. round-trip
ok((await verifyToken({ id: ID, exp: EXP, action: 'approve', token: t }, SECRET, NOW)).ok, 'valid token verifies');

// 2. hex shape
ok(/^[0-9a-f]{64}$/.test(t), 'token is 64-char hex');

// 3. deterministic
ok((await signToken(ID, EXP, 'approve', SECRET)) === t, 'same input -> same token');

// 4. tamper id
ok(!(await verifyToken({ id: ID.replace('9b', '00'), exp: EXP, action: 'approve', token: t }, SECRET, NOW)).ok, 'tampered id rejected');

// 5. tamper exp (extend validity)
ok(!(await verifyToken({ id: ID, exp: EXP + 9999, action: 'approve', token: t }, SECRET, NOW)).ok, 'tampered exp rejected');

// 6. tamper action (approve token cannot reject)
const r6 = await verifyToken({ id: ID, exp: EXP, action: 'reject', token: t }, SECRET, NOW);
ok(!r6.ok && r6.reason === 'bad-token', 'approve token cannot be replayed as reject');

// 7. expired
const r7 = await verifyToken({ id: ID, exp: EXP, action: 'approve', token: t }, SECRET, EXP + 1);
ok(!r7.ok && r7.reason === 'expired', 'expired token rejected with reason=expired');

// 8. boundary: exactly at exp still valid
ok((await verifyToken({ id: ID, exp: EXP, action: 'approve', token: t }, SECRET, EXP)).ok, 'token valid at exact expiry second');

// 9. wrong secret
ok(!(await verifyToken({ id: ID, exp: EXP, action: 'approve', token: t }, SECRET + 'x', NOW)).ok, 'wrong secret rejected');

// 10. missing params
ok((await verifyToken({ id: '', exp: EXP, action: 'approve', token: t }, SECRET, NOW)).reason === 'bad-params', 'missing id -> bad-params');
ok((await verifyToken({ id: ID, exp: 'abc', action: 'approve', token: t }, SECRET, NOW)).reason === 'bad-params', 'non-numeric exp -> bad-params');
ok((await verifyToken({ id: ID, exp: EXP, action: 'delete', token: t }, SECRET, NOW)).reason === 'bad-params', 'unknown action -> bad-params');

// 11. token length mismatch (safeEqual guard)
ok(!(await verifyToken({ id: ID, exp: EXP, action: 'approve', token: t.slice(0, 63) }, SECRET, NOW)).ok, 'truncated token rejected');

// 12. reject-action token round-trip
const tr = await signToken(ID, EXP, 'reject', SECRET);
ok((await verifyToken({ id: ID, exp: EXP, action: 'reject', token: tr }, SECRET, NOW)).ok, 'reject token verifies for reject');
ok(tr !== t, 'approve/reject tokens differ');

console.log(`\n${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
