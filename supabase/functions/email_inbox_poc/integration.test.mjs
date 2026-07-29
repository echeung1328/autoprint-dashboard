// integration.test.mjs — offline integration test for index.ts v11 (issue #34)
// Compiles the Deno Edge Function with esbuild, mocks Deno + fetch, and drives
// the handler with realistic Webhook Relay payloads.
//
// Run: node integration.test.mjs   (requires esbuild resolvable via NODE_PATH
// or an adjacent node_modules; falls back with a clear message otherwise)
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let esbuild;
try {
  esbuild = createRequire(import.meta.url)('esbuild');
} catch (_) {
  try {
    // WorkBuddy managed-node workspace fallback (local dev machine)
    esbuild = createRequire(process.env.ESBUILD_REQUIRE_BASE || 'C:/Users/Eric Zhang/.workbuddy/binaries/node/workspace/package.json')('esbuild');
  } catch (e) {
    console.error('SKIP — esbuild not found. Install esbuild (npm i esbuild) or set ESBUILD_REQUIRE_BASE.');
    process.exit(0);
  }
}

const SRC = join(__dirname, 'index.ts');
const OUT = join(tmpdir(), 'email_inbox_bundle.mjs');

esbuild.buildSync({
  entryPoints: [SRC],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: OUT
});

// ---- mock Deno ----
const ENV = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sr_test',
  WEBHOOK_BASIC_USER: 'poc',
  WEBHOOK_BASIC_PASS: 'testpass',
  ALLOWED_SENDERS: 'zhang.hz@comlan.com',
  // #35 approval email
  PROJECT_APPROVAL_SECRET: 'test-approval-secret-0123456789',
  RESEND_API_KEY: 'rk_test',
  ALERT_EMAIL_TO: 'zhang.hz@comlan.com'
};
let handler = null;
globalThis.Deno = {
  env: { get: (k) => ENV[k] },
  serve: (h) => {
    handler = h;
  }
};

// ---- mock fetch: capture Supabase REST inserts + Resend emails ----
const store = {}; // table -> rows[]
const calls = [];
const emails = []; // resend payloads
let idSeq = 100;
let uuidSeq = 0;
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method || 'GET' });
  const u = String(url);
  if (u.startsWith('https://api.resend.com/')) {
    emails.push(JSON.parse(opts.body));
    return new Response('{}', { status: 200 });
  }
  if (u.includes('/rest/v1/ReportAutoPrint?select=id')) {
    return new Response(JSON.stringify([]), { status: 200 }); // no existing main-table row
  }
  const m = u.match(/\/rest\/v1\/([a-zA-Z_]+)/);
  if (m && (opts.method || 'GET') === 'POST') {
    const table = m[1];
    store[table] = store[table] || [];
    const parsed = JSON.parse(opts.body);
    const withIds = parsed.map((r) =>
      Object.assign(
        { id: table === 'promote_approval_request' ? 'uuid-req-' + ++uuidSeq : ++idSeq },
        r
      )
    );
    for (const r of withIds) store[table].push(r);
    const prefer = (opts.headers || {}).Prefer || '';
    if (prefer.includes('representation')) {
      return new Response(JSON.stringify(withIds), { status: 201 });
    }
    return new Response('', { status: 201 });
  }
  return new Response('not-mocked ' + u, { status: 500 });
};

await import('file://' + OUT.replace(/\\/g, '/'));
if (!handler) {
  console.error('FAIL — Deno.serve handler not captured');
  process.exit(1);
}

const AUTH = 'Basic ' + btoa('poc:testpass');
async function post(payload) {
  const req = new Request('https://test.supabase.co/functions/v1/email_inbox_poc', {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const res = await handler(req);
  return { status: res.status, text: await res.text() };
}
function reset() {
  for (const k of Object.keys(store)) delete store[k];
  emails.length = 0;
}

let failed = 0;
let total = 0;
function check(cond, desc, extra) {
  total++;
  if (cond) console.log('PASS — ' + desc);
  else {
    console.error('FAIL — ' + desc + (extra !== undefined ? ' | got=' + JSON.stringify(extra) : ''));
    failed++;
  }
}

const BODY_OK = `创建人：张怀忠(Zhang Huaizhong 昆仑联通)
邮箱：zhang.hz@comlan.com
Title：AutoPrint-2026-07-29 09:30
执行时间：2026-07-29 09:30:00
总数：6
成功：6
跳过：0
失败：0
完成时间：2026-07-29 09:30:54
附件Excel表格：TRUE
任务完成通知邮件：TRUE
耗时（分钟）：1
查看 SharePoint 记录：https://comlanoffice.sharepoint.com/x?ID=139
记录ID：139`;

// ---- Scenario A: qualified body, no attachments ----
{
  reset();
  const r = await post({ from: 'zhang.hz@comlan.com', subject: 'ReportAutoPrint 新增记录通知', body: BODY_OK, attachments: [] });
  check(r.status === 200 && r.text.startsWith('ok-staged-body-1'), 'A: body email -> ok-staged-body-1', r);
  const rows = store.report_autoprint_staging || [];
  check(rows.length === 1, 'A: exactly 1 staging row', rows.length);
  const rec = rows[0] || {};
  check(rec['执行时间'] === '2026-07-29T09:30:00+08:00', 'A: 执行时间 +08:00', rec['执行时间']);
  check(rec['标签'] === 'SRC=BODY;SP_REC=139', 'A: 标签 SRC=BODY;SP_REC=139', rec['标签']);
  check(rec.CreatedBy === '张怀忠(Zhang Huaizhong 昆仑联通)', 'A: CreatedBy = body 创建人', rec.CreatedBy);
  check(rec.source_filename === '(email_body)', 'A: source_filename (email_body)', rec.source_filename);
  check(rec.conflict_action === 'insert', 'A: conflict_action insert', rec.conflict_action);
  const arch = (store.email_raw_archive || []).map((a) => a.filename);
  check(arch.includes('(meta)') && arch.includes('(email_body)'), 'A: archive has (meta)+(email_body)', arch);
  // #35: approval email
  const reqRows2 = store.promote_approval_request || [];
  check(reqRows2.length === 1 && Array.isArray(reqRows2[0].staging_ids) && reqRows2[0].staging_ids.length === 1, 'A: approval request created with staging id', reqRows2);
  check(emails.length === 1 && emails[0].subject.includes('待审批'), 'A: approval email sent', emails.map((e) => e.subject));
  const h = (emails[0] || {}).html || '';
  check(h.includes('a=approve&t=') && h.includes('a=reject&t=') && h.includes('/functions/v1/promote_approval?id=uuid-req-'), 'A: email has signed approve+reject links', h.slice(0, 0));
}

// ---- Scenario B: plain body + CSV attachment (attachment fallback path) ----
{
  reset();
  const csv = 'Title,执行时间,总数,成功,跳过,失败,完成时间,附件Excel表格,任务完成通知邮件\n每日打印,2026-07-28 09:30:00,5,5,0,0,2026-07-28 09:32:00,是,是\n';
  const r = await post({
    from: 'zhang.hz@comlan.com',
    subject: '补导数据',
    body: '请查收附件。\n此致',
    attachments: [{ name: 'fix.csv', content_type: 'text/csv', content: Buffer.from(csv, "utf8").toString("base64") }]
  });
  check(r.status === 200 && r.text.startsWith('ok-staged-1'), 'B: csv attachment -> ok-staged-1', r);
  const rec = (store.report_autoprint_staging || [])[0] || {};
  check(rec.CreatedBy === 'zhang.hz@comlan.com', 'B: D2 Excel CreatedBy = from_email', rec.CreatedBy);
  check(rec['标签'] === 'SRC=XLSX', 'B: 标签 SRC=XLSX', rec['标签']);
  check(rec['执行时间'] === '2026-07-28T09:30:00+08:00', 'B: 执行时间 +08:00', rec['执行时间']);
  check(rec.batch_tag && rec.batch_tag.startsWith('EMAIL_'), 'B: batch_tag kept', rec.batch_tag);
  check(emails.length === 1 && emails[0].subject.includes('待审批'), 'B: approval email sent for XLSX path too', emails.map((e) => e.subject));
}

// ---- Scenario C: qualified body AND attachment -> body wins (D1) ----
{
  reset();
  const csv = 'Title,执行时间\nX,2026-07-01 09:00\n';
  const r = await post({
    from: 'zhang.hz@comlan.com',
    subject: '通知',
    body: BODY_OK,
    attachments: [{ name: 'extra.csv', content_type: 'text/csv', content: Buffer.from(csv, "utf8").toString("base64") }]
  });
  check(r.text.startsWith('ok-staged-body-1') && r.text.includes('atts-skipped=1'), 'C: D1 body wins, atts skipped', r);
  check((store.report_autoprint_staging || []).length === 1, 'C: only body row staged', (store.report_autoprint_staging || []).length);
  const skipped = (store.email_raw_archive || []).find((a) => a.filename === 'extra.csv');
  check(skipped && skipped.error_msg === 'skipped-body-priority', 'C: attachment archived as skipped-body-priority', skipped && skipped.error_msg);
}

// ---- Scenario D: notification-shaped body but bad 执行时间 (L3) ----
{
  reset();
  const bad = BODY_OK.replace('执行时间：2026-07-29 09:30:00', '执行时间：不是时间');
  const r = await post({ from: 'zhang.hz@comlan.com', subject: '坏通知', body: bad, attachments: [] });
  check((store.report_autoprint_staging || []).length === 0, 'D: no staging row', (store.report_autoprint_staging || []).length);
  const pe = (store.email_raw_archive || []).find((a) => a.status === 'parse_error');
  check(!!pe && /执行时间/.test(pe.error_msg || ''), 'D: body archived as parse_error', pe && pe.error_msg);
  const alert = (store.ingest_alert_log || []).find((a) => a.kind === '正文解析失败');
  check(!!alert, 'D: alert 正文解析失败 logged', store.ingest_alert_log);
  check(r.status === 200 && r.text === 'ok-no-rows', 'D: response ok-no-rows (no atts)', r);
}

// ---- Scenario E: ordinary email (no schema body, no attachments) ----
{
  reset();
  const r = await post({ from: 'zhang.hz@comlan.com', subject: '你好', body: '开会时间改到下午。\n谢谢', attachments: [] });
  check(r.status === 200 && r.text === 'ok-no-rows', 'E: ordinary mail passes silently', r);
  check((store.report_autoprint_staging || []).length === 0, 'E: no staging row');
  check(!(store.ingest_alert_log || []).length, 'E: no alert', store.ingest_alert_log);
  check(emails.length === 0, 'E: no approval email for ordinary mail', emails.length);
}

// ---- Scenario F: whitelist reject unchanged ----
{
  reset();
  const r = await post({ from: 'evil@x.com', subject: 'hack', body: BODY_OK, attachments: [] });
  check(r.status === 200 && r.text === 'ok-not-allowed', 'F: whitelist still rejects before body parse', r);
  check((store.report_autoprint_staging || []).length === 0, 'F: no staging row');
}

// ---- Scenario G: HTML-only body still parsed ----
{
  reset();
  const html = '<div>' + BODY_OK.split('\n').map((l) => '<p>' + l + '</p>').join('') + '</div>';
  const r = await post({ from: 'zhang.hz@comlan.com', subject: '通知', html, attachments: [] });
  check(r.text.startsWith('ok-staged-body-1'), 'G: html body stripped and parsed', r);
}

if (failed > 0) {
  console.error('\n' + failed + '/' + total + ' integration test(s) FAILED');
  process.exit(1);
}
console.log('\nAll ' + total + ' integration tests passed');
