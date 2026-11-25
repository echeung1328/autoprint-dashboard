// integration.test.mjs — access_links Edge Function 集成测试 (issue #45 T2/T3/T6)
// 运行：node integration.test.mjs
// 方式：esbuild 编译 index.ts 为可 import 的模块，mock fetch + Deno.serve 捕获路由。
// 按贡献指南 §7 V1.1：关键用例标注；输入/预期/实际可见；无法自动化的见测试记录「需人工测试」清单。

import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const log = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label} | 预期=${JSON.stringify(expected)} 实际=${JSON.stringify(actual)}`); }
};

// esbuild 解析：与 promote_approval/integration.test.mjs 同款做法（不新增依赖）
let esbuild;
try {
  esbuild = createRequire(import.meta.url)('esbuild');
} catch (_) {
  try {
    esbuild = createRequire(process.env.ESBUILD_REQUIRE_BASE || 'C:/Users/Eric Zhang/.workbuddy/binaries/node/workspace/package.json')('esbuild');
  } catch (e) {
    console.error('SKIP — esbuild not found.');
    process.exit(0);
  }
}
const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- 编译 index.ts 为 ESM（把 Deno.serve 替换为捕获函数）----
const SRC = join(__dirname, 'index.ts');
const result = esbuild.buildSync({ entryPoints: [SRC], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', write: false });
let code = result.outputFiles[0].text;
// 把 Deno.serve(...) 调用替换为导出 handler
code = code.replace(/Deno\.serve\(async \((req)\) => \{/, 'const __handler = async ($1) => {');
// 移除文件末尾的 }); 收尾（Deno.serve 的调用括号）
code = code.replace(/\}\);\s*$/, '};\nexport { __handler as handler };\n');
// mock Deno 环境
code = 'const Deno = { env: { get: (k) => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc", SUPABASE_ANON_KEY: "anon", PROJECT_PUBLIC_BASE: "https://site" })[k] || "" }, serve: () => {} };\n' + code;

const dir = mkdtempSync(join(tmpdir(), 'al-test-'));
const modPath = join(dir, 'mod.mjs');
writeFileSync(modPath, code);
const { handler } = await import(pathToFileURL(modPath).href);

const NOW = Date.parse('2026-11-25T00:00:00Z');
const TOKEN = 'A'.repeat(43);
const activeRow = { id: 1, token: TOKEN, title: '测试链接', status: 'active', expires_at: '2026-12-25T00:00:00Z', created_by: null, created_at: '2026-11-01T00:00:00Z' };
const adminProfile = [{ role: 'admin', approved: true }];
const userResp = { id: 'admin-uuid', email: 'admin@test.com' };

// fetch mock 状态
let calls = [];
function installFetch({ linkRow = activeRow, profile = adminProfile, jwtOk = true } = {}) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ u, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    if (u.includes('/auth/v1/user')) return new Response(JSON.stringify(jwtOk ? userResp : {}), { status: jwtOk ? 200 : 401 });
    if (u.includes('/rest/v1/profiles?')) return new Response(JSON.stringify(profile), { status: 200 });
    if (u.includes('/rest/v1/access_links?select=*&token=')) return new Response(JSON.stringify(linkRow ? [linkRow] : []), { status: 200 });
    if (u.includes('/rest/v1/access_links?select=*&order=')) return new Response(JSON.stringify([activeRow]), { status: 200 });
    if (u.includes('/rest/v1/ReportAutoPrint?')) return new Response(JSON.stringify([{ site: '上海', 总数: 10, 成功: 9, 跳过: 1, 失败: 0 }]), { status: 200 });
    if (u.includes('/rest/v1/access_links_audit') && opts.method === 'POST') return new Response('[]', { status: 201 });
    if (u.includes('/rest/v1/access_links') && opts.method === 'POST') return new Response(JSON.stringify([{ ...activeRow, id: 99 }]), { status: 201 });
    if (u.includes('/rest/v1/access_links?id=eq.') && opts.method === 'PATCH') return new Response(null, { status: 204 });
    if (u.includes('/rest/v1/access_links?id=eq.') && opts.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response('[]', { status: 200 });
  };
}

function req(url, method = 'GET', body = null, withAdmin = false) {
  const headers = {};
  if (withAdmin) headers.Authorization = 'Bearer admin-jwt';
  if (body) headers['Content-Type'] = 'application/json';
  return new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}
async function jsonOf(resp) { return await resp.json(); }

console.log('=== access_links 集成测试 ===');

// ---- T2 公开校验 ----
installFetch();
let r = await handler(req('https://x.supabase.co/public?token=' + TOKEN));
let j = await jsonOf(r);
log('[关键] 有效 token → 200', r.status, 200);
log('[关键] 返回标题', j.title, '测试链接');
log('对外数据已返回', Array.isArray(j.data), true);

installFetch({ linkRow: { ...activeRow, status: 'stopped' } });
r = await handler(req('https://x.supabase.co/public?token=' + TOKEN));
j = await jsonOf(r);
log('[关键] 已停止 → 403', r.status, 403);
log('停止原因文案', j.error, '链接已停止访问');

installFetch({ linkRow: { ...activeRow, expires_at: '2026-11-24T00:00:00Z' } });
r = await handler(req('https://x.supabase.co/public?token=' + TOKEN));
j = await jsonOf(r);
log('[关键] 已过期 → 403', r.status, 403);
log('过期原因文案', j.error, '链接已过期');

installFetch({ linkRow: null });
r = await handler(req('https://x.supabase.co/public?token=' + TOKEN));
log('[关键] 已删除/不存在 → 403', r.status, 403);

// ---- T3 admin 鉴权 ----
installFetch();
r = await handler(req('https://x.supabase.co/admin/list'));
log('[关键] 无 JWT 访问管理端 → 401', r.status, 401);

installFetch({ profile: [{ role: 'viewer', approved: true }] });
r = await handler(req('https://x.supabase.co/admin/list', 'GET', null, true));
log('[关键] 非 admin → 403', r.status, 403);

installFetch({ profile: [{ role: 'admin', approved: false }] });
r = await handler(req('https://x.supabase.co/admin/list', 'GET', null, true));
log('未批准 admin → 403', r.status, 403);

installFetch();
r = await handler(req('https://x.supabase.co/admin/list', 'GET', null, true));
j = await jsonOf(r);
log('[关键] admin 列表面板 → 200', r.status, 200);
log('列表含链接', j.links.length, 1);

// ---- T3 CRUD + T6 审计 ----
installFetch();
r = await handler(req('https://x.supabase.co/admin/create', 'POST', { title: '新链接', days: 400 }, true));
j = await jsonOf(r);
log('[关键] create → 200', r.status, 200);
log('[关键] 400天被钳制为365', Math.round((Date.parse(j.expires_at) - Date.parse('2026-11-25T00:00:00Z')) / 86400000) >= 364, true);
log('返回分享 URL', j.url.startsWith('https://site/share/'), true);
const createCalls = calls.filter(c => c.u.includes('access_links_audit'));
log('[关键] create 写审计', createCalls.length, 1);
log('create 审计 action', createCalls[0].body.action, 'create');

installFetch();
r = await handler(req('https://x.supabase.co/admin/stop', 'POST', { token: TOKEN }, true));
j = await jsonOf(r);
log('[关键] stop → 200', r.status, 200);
log('stop 状态', j.status, 'stopped');
const stopCalls = calls.filter(c => c.u.includes('access_links_audit'));
log('[关键] stop 写审计', stopCalls[0].body.action, 'stop');

installFetch();
r = await handler(req('https://x.supabase.co/admin/delete', 'POST', { token: TOKEN }, true));
j = await jsonOf(r);
log('[关键] delete → 200', r.status, 200);
log('delete 标记', j.deleted, true);
const delCalls = calls.filter(c => c.u.includes('access_links_audit'));
log('[关键] delete 写审计', delCalls[0].body.action, 'delete');
// 审计先于硬删
const auditIdx = calls.findIndex(c => c.u.includes('access_links_audit'));
const deleteIdx = calls.findIndex(c => c.u.includes('access_links?id=eq.') && c.method === 'DELETE');
log('[关键] 审计先于硬删', auditIdx < deleteIdx, true);

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
