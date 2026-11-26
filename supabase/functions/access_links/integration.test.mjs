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
    // T3+T4：DISTINCT 站点端点返回站点列表；报表端点返回多站点样本，并记录 URL 供断言过滤/limit
    if (u.includes('/rest/v1/ReportAutoPrint?select=site&')) return new Response(JSON.stringify([{ site: '上海' }, { site: '北京' }]), { status: 200 });
    if (u.includes('/rest/v1/ReportAutoPrint?')) {
      const scoped = u.includes('site=eq.');
      const rows = scoped
        ? [{ site: '上海', 总数: 10, 成功: 9, 跳过: 1, 失败: 0, 耗时分钟: 13.0833333333333333 }]
        : [{ site: '上海', 总数: 10, 成功: 9, 跳过: 1, 失败: 0, 耗时分钟: 13.0833333333333333 }, { site: '北京', 总数: 20, 成功: 18, 跳过: 2, 失败: 0, 耗时分钟: 5 }];
      return new Response(JSON.stringify(rows), { status: 200 });
    }
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
log('[关键] 对外数据含耗时分钟', j.data && j.data[0] && Object.prototype.hasOwnProperty.call(j.data[0], '耗时分钟'), true);
log('[关键] 耗时分钟 round 到 1 位小数', j.data && j.data[0] && j.data[0]['耗时分钟'], 13.1);
log('对外数据不含来源邮箱', j.data && j.data[0] && Object.prototype.hasOwnProperty.call(j.data[0], 'source_email'), false);
const reportCall = calls.find(c => c.u.includes('/rest/v1/ReportAutoPrint?'));
log('[关键] select 白名单含耗时分钟编码', reportCall && reportCall.u.includes('%E8%80%97%E6%97%B6%E5%88%86%E9%92%9F'), true);

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

// ---- T3+T4 数据隔离 + 最近 N 条 (v2.3.0 #71/#72) ----
// T3: /admin/sites 动态站点列表 + admin 鉴权
installFetch();
r = await handler(req('https://x.supabase.co/admin/sites'));
log('[T3] 无 JWT 访问 /admin/sites → 401', r.status, 401);
installFetch();
r = await handler(req('https://x.supabase.co/admin/sites', 'GET', null, true));
j = await jsonOf(r);
log('[T3] admin 取站点列表 → 200', r.status, 200);
log('[T3] 站点列表含北京/上海', j.sites, ['上海', '北京']);

// T4: create 接收 site_scope + row_limit，落库 + 审计
installFetch();
r = await handler(req('https://x.supabase.co/admin/create', 'POST', { title: '站点链接', days: 10, site_scope: '北京', row_limit: 7 }, true));
j = await jsonOf(r);
log('[T4] create 带 scope/limit → 200', r.status, 200);
log('[T4] 返回 site_scope', j.site_scope, '北京');
log('[T4] 返回 row_limit', j.row_limit, 7);
const insertCall = calls.find(c => c.u.endsWith('/rest/v1/access_links') && c.method === 'POST');
log('[T4] 落库含 site_scope', insertCall && insertCall.body.site_scope, '北京');
log('[T4] 落库含 row_limit', insertCall && insertCall.body.row_limit, 7);
const createAuditT3 = calls.find(c => c.u.includes('access_links_audit'));
log('[T4] 审计 detail 记 scope', createAuditT3 && createAuditT3.body.detail.site_scope, '北京');
log('[T4] 审计 detail 记 limit', createAuditT3 && createAuditT3.body.detail.row_limit, 7);

// T3: 非法站点白名单校验
installFetch();
r = await handler(req('https://x.supabase.co/admin/create', 'POST', { title: '注入测试', days: 10, site_scope: '数据库注入' }, true));
log('[T3] 非法站点被拒 → 400', r.status, 400);

// T4: row_limit clamp 1-365
installFetch();
r = await handler(req('https://x.supabase.co/admin/create', 'POST', { title: '越界limit', days: 10, row_limit: 999 }, true));
j = await jsonOf(r);
log('[T4] row_limit=999 钳制为365', j.row_limit, 365);
installFetch();
r = await handler(req('https://x.supabase.co/admin/create', 'POST', { title: '越界limit', days: 10, row_limit: 0 }, true));
j = await jsonOf(r);
log('[T4] row_limit=0 钳制为1', j.row_limit, 1);

// T4: /public 按链接 scope 过滤 + 动态 limit，并返回给前端
installFetch({ linkRow: { ...activeRow, site_scope: '上海', row_limit: 5 } });
r = await handler(req('https://x.supabase.co/public?token=' + TOKEN));
j = await jsonOf(r);
log('[T4] /public 返回 site_scope', j.site_scope, '上海');
log('[T4] /public 返回 row_limit', j.row_limit, 5);
const reportCall2 = calls.find(c => c.u.includes('/rest/v1/ReportAutoPrint?select=site,'));
log('[T3] 报表 URL 含 site=eq.上海', reportCall2 && reportCall2.u.includes('site=eq.' + encodeURIComponent('上海')), true);
log('[T4] 报表 URL 含 limit=5', reportCall2 && reportCall2.u.includes('limit=5'), true);
log('[T3] 过滤后仅返回该站点数据', j.data.length, 1);

// 历史链接无 scope/limit 列 → 回退 ALL/100
installFetch({ linkRow: { ...activeRow } });
r = await handler(req('https://x.supabase.co/public?token=' + TOKEN));
j = await jsonOf(r);
log('[兼容] 历史链接回退 site_scope=ALL', j.site_scope, 'ALL');
log('[兼容] 历史链接回退 row_limit=100', j.row_limit, 100);
const reportCall3 = calls.find(c => c.u.includes('/rest/v1/ReportAutoPrint?select=site,'));
log('[兼容] 历史链接报表 URL 无 site 过滤', reportCall3 && reportCall3.u.includes('site=eq.'), false);
log('[兼容] 历史链接报表 URL limit=100', reportCall3 && reportCall3.u.includes('limit=100'), true);

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
