// integration.test.mjs — offline integration test for promote_approval (issue #35)
// Compiles the Deno Edge Function with esbuild, mocks Deno + fetch, and drives
// GET (confirm page) / POST (execute) flows including one-time-use and expiry.
//
// Run: node integration.test.mjs
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { signToken } from './approval_token.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
let esbuild;
try {
  esbuild = createRequire(import.meta.url)('esbuild');
} catch (_) {
  try {
    esbuild = createRequire(process.env.ESBUILD_REQUIRE_BASE || 'C:/Users/Eric Zhang/.workbuddy/binaries/node/workspace/package.json')('esbuild');
  } catch (e) {
    console.error('SKIP — esbuild not found. Install esbuild (npm i esbuild) or set ESBUILD_REQUIRE_BASE.');
    process.exit(0);
  }
}

const SRC = join(__dirname, 'index.ts');
const OUT = join(tmpdir(), 'promote_approval_bundle.mjs');
esbuild.buildSync({ entryPoints: [SRC], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', outfile: OUT });

// ---- mock Deno ----
const SECRET = 'integration-secret-0123456789abcdef';
const ENV = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sr_test',
  PROJECT_APPROVAL_SECRET: SECRET,
  RESEND_API_KEY: 'rk_test',
  ALERT_EMAIL_TO: 'zhang.hz@comlan.com'
};
let handler = null;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };

// ---- mock fetch ----
const reqRows = {};      // id -> promote_approval_request row
const patches = [];      // { table, filter, body }
const rpcCalls = [];     // { p_ids }
const emails = [];       // resend payloads
let rpcFail = false;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = opts.method || 'GET';
  if (u.startsWith('https://api.resend.com/')) {
    emails.push(JSON.parse(opts.body));
    return new Response('{}', { status: 200 });
  }
  if (u.includes('/rest/v1/rpc/promote_staging_ids')) {
    rpcCalls.push(JSON.parse(opts.body));
    if (rpcFail) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify({ superseded: 0, updated: 0, inserted: 1, promoted: 1 }), { status: 200 });
  }
  if (u.includes('/rest/v1/promote_approval_request')) {
    const idMatch = u.match(/id=eq\.([^&]+)/);
    const id = idMatch ? decodeURIComponent(idMatch[1]) : '';
    if (method === 'GET') {
      const row = reqRows[id];
      return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    }
    if (method === 'PATCH') {
      patches.push({ table: 'promote_approval_request', id, body: JSON.parse(opts.body) });
      Object.assign(reqRows[id] || {}, JSON.parse(opts.body));
      return new Response(null, { status: 204 });
    }
  }
  if (u.includes('/rest/v1/report_autoprint_staging') && method === 'PATCH') {
    patches.push({ table: 'report_autoprint_staging', url: u, body: JSON.parse(opts.body) });
    return new Response(null, { status: 204 });
  }
  return new Response('not-mocked ' + u, { status: 500 });
};

await import('file://' + OUT.replace(/\\/g, '/'));
if (!handler) { console.error('FAIL — handler not captured'); process.exit(1); }

// ---- helpers ----
const BASE = 'https://test.supabase.co/functions/v1/promote_approval';
const NOW = Math.floor(Date.now() / 1000);
const EXP_OK = NOW + 72 * 3600;

function mkRow(id, over = {}) {
  reqRows[id] = Object.assign({
    id,
    staging_ids: [21, 22],
    summary: '业务日 2026-07-30 · 总数 6 成功 6',
    expires_at: new Date((EXP_OK) * 1000).toISOString(),
    status: 'pending',
    acted_at: null
  }, over);
  return reqRows[id];
}
async function get(id, exp, a, t) {
  const res = await handler(new Request(BASE + `?id=${id}&exp=${exp}&a=${a}&t=${t}`, { method: 'GET' }));
  return { status: res.status, text: await res.text() };
}
async function postForm(id, exp, a, t) {
  const body = new URLSearchParams({ id, exp: String(exp), a, t }).toString();
  const res = await handler(new Request(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }));
  return { status: res.status, text: await res.text() };
}
function reset() {
  patches.length = 0; rpcCalls.length = 0; emails.length = 0; rpcFail = false;
  for (const k of Object.keys(reqRows)) delete reqRows[k];
}

let failed = 0, total = 0;
function check(cond, desc, extra) {
  total++;
  if (cond) console.log('PASS — ' + desc);
  else { console.error('FAIL — ' + desc + (extra !== undefined ? ' | got=' + JSON.stringify(extra) : '')); failed++; }
}

// ---- 1. GET valid pending -> confirm page, ZERO mutations ----
{
  reset();
  const id = 'aaaaaaaa-0000-0000-0000-000000000001';
  mkRow(id);
  const t = await signToken(id, EXP_OK, 'approve', SECRET);
  const r = await get(id, EXP_OK, 'approve', t);
  check(r.status === 200 && r.text.includes('确认转正') && r.text.includes('<form method="POST">'), '1: GET renders confirm page with POST form', r.status);
  check(patches.length === 0 && rpcCalls.length === 0 && emails.length === 0, '1: GET causes ZERO mutations (Safe Links defense)', { patches, rpcCalls });
  check(r.text.includes('21, 22'), '1: confirm page shows staging ids', '');
}

// ---- 2. GET tampered token -> invalid, no DB read needed ----
{
  reset();
  const id = 'aaaaaaaa-0000-0000-0000-000000000002';
  mkRow(id);
  const t = await signToken(id, EXP_OK, 'approve', SECRET);
  const r = await get(id, EXP_OK, 'approve', t.replace(/^./, '0') === t ? 'f' + t.slice(1) : '0' + t.slice(1));
  check(r.status === 200 && r.text.includes('链接无效'), '2: tampered token -> 链接无效', r.text.slice(0, 80));
  check(rpcCalls.length === 0 && patches.length === 0, '2: no mutations');
}

// ---- 3. GET expired token param -> 过期 ----
{
  reset();
  const id = 'aaaaaaaa-0000-0000-0000-000000000003';
  mkRow(id);
  const expPast = NOW - 10;
  const t = await signToken(id, expPast, 'approve', SECRET);
  const r = await get(id, expPast, 'approve', t);
  check(r.text.includes('链接已过期'), '3: expired token param -> 链接已过期');
}

// ---- 4. POST approve happy path ----
{
  reset();
  const id = 'aaaaaaaa-0000-0000-0000-000000000004';
  mkRow(id);
  const t = await signToken(id, EXP_OK, 'approve', SECRET);
  const r = await postForm(id, EXP_OK, 'approve', t);
  check(r.text.includes('转正完成') && r.text.includes('promoted=1'), '4: POST approve -> 转正完成', r.text.slice(0, 120));
  check(rpcCalls.length === 1 && JSON.stringify(rpcCalls[0].p_ids) === '[21,22]', '4: RPC called with staging ids', rpcCalls);
  const p = patches.find((x) => x.table === 'promote_approval_request');
  check(p && p.body.status === 'approved' && p.body.action_result.includes('promoted=1'), '4: request row -> approved + result', p && p.body);
  check(emails.length === 1 && emails[0].subject.includes('已批准'), '4: result email sent', emails.map((e) => e.subject));
}

// ---- 5. POST on already-approved request (one-time use) ----
{
  reset();
  const id = 'aaaaaaaa-0000-0000-0000-000000000005';
  mkRow(id, { status: 'approved', acted_at: '2026-07-30T10:00:00Z' });
  const t = await signToken(id, EXP_OK, 'approve', SECRET);
  const r = await postForm(id, EXP_OK, 'approve', t);
  check(r.text.includes('该请求已处理') && r.text.includes('approved'), '5: replay blocked (one-time use)', r.text.slice(0, 100));
  check(rpcCalls.length === 0, '5: RPC NOT called on replay');
}

// ---- 6. POST reject happy path ----
{
  reset();
  const id = 'aaaaaaaa-0000-0000-0000-000000000006';
  mkRow(id);
  const t = await signToken(id, EXP_OK, 'reject', SECRET);
  const r = await postForm(id, EXP_OK, 'reject', t);
  check(r.text.includes('已拒绝'), '6: POST reject -> 已拒绝', r.text.slice(0, 80));
  const sp = patches.find((x) => x.table === 'report_autoprint_staging');
  check(sp && sp.body.status === 'rejected' && sp.url.includes('id=in.(21,22)') && sp.url.includes('status=eq.pending'), '6: staging PATCH rejected, scoped to pending ids', sp && sp.url);
  const rp = patches.find((x) => x.table === 'promote_approval_request');
  check(rp && rp.body.status === 'rejected', '6: request row -> rejected');
  check(rpcCalls.length === 0, '6: no RPC on reject');
}

// ---- 7. DB row expired (token still valid) -> expired + status flip ----
{
  reset();
  const id = 'aaaaaaaa-0000-0000-0000-000000000007';
  mkRow(id, { expires_at: new Date(Date.now() - 60000).toISOString() });
  const t = await signToken(id, EXP_OK, 'approve', SECRET);
  const r = await postForm(id, EXP_OK, 'approve', t);
  check(r.text.includes('链接已过期'), '7: DB-expired request -> 过期页', r.text.slice(0, 80));
  const p = patches.find((x) => x.table === 'promote_approval_request');
  check(p && p.body.status === 'expired', '7: request row flipped to expired');
  check(rpcCalls.length === 0, '7: no RPC');
}

// ---- 8. RPC failure -> error page, staging untouched, error logged ----
{
  reset();
  const id = 'aaaaaaaa-0000-0000-0000-000000000008';
  mkRow(id);
  rpcFail = true;
  const t = await signToken(id, EXP_OK, 'approve', SECRET);
  const r = await postForm(id, EXP_OK, 'approve', t);
  check(r.text.includes('执行失败') && r.text.includes('SOP'), '8: RPC fail -> error page with SOP fallback hint', r.text.slice(0, 120));
  const p = patches.find((x) => x.table === 'promote_approval_request' && x.body.error_msg);
  check(!!p, '8: error_msg recorded on request row');
  const p2 = patches.find((x) => x.table === 'promote_approval_request' && x.body.status);
  check(!p2, '8: status stays pending (retryable)', p2 && p2.body);
  check(emails.length === 1 && emails[0].subject.includes('失败'), '8: failure email sent');
}

// ---- 9. unknown request id / bad method ----
{
  reset();
  const id = 'aaaaaaaa-0000-0000-0000-000000000009';
  const t = await signToken(id, EXP_OK, 'approve', SECRET);
  const r = await get(id, EXP_OK, 'approve', t);
  check(r.text.includes('请求不存在'), '9: unknown id -> 请求不存在');
  const res = await handler(new Request(BASE, { method: 'PUT' }));
  check(res.status === 405, '9: PUT -> 405');
}

if (failed > 0) {
  console.error('\n' + failed + '/' + total + ' integration test(s) FAILED');
  process.exit(1);
}
console.log('\nAll ' + total + ' integration tests passed');
