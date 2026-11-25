// Edge Function: access_links (issue #45, T2/T3/T6)
// 免登录访问链接系统 — 公开校验 + 管理端 CRUD + 审计
//
// Routes:
//   GET  /public?token=xxx          : 公开校验 token，返回对外数据（无需 JWT）
//   GET  /admin/list                : 管理端列出链接（需 admin JWT）
//   POST /admin/create              : 创建链接（需 admin JWT）
//   POST /admin/stop                : 停止访问（需 admin JWT）
//   POST /admin/delete              : 硬删 + 审计（需 admin JWT）
//
// Security:
//   - 公开端点只按 token 校验，数据经 service_role 读取，绝不暴露 anon 直读
//   - 管理端点用 Supabase Auth 校验 JWT + profiles.role=admin + approved=true
//   - token = base64url(32 random bytes)，365 天上限服务端强制
//   - status=stopped 优先于过期；删除先写审计再硬删
//   - 部署：verify_jwt=false（公开端点无 JWT），admin 路由内部自行验 JWT

import { generateToken, isValidTokenFormat, clampLifetimeDays, computeExpiresAt, validateLink, reasonMessage, tokenPrefix } from './access_token.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://uvqjtvonxwsmhntnyest.supabase.co';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('PROJECT_SERVICE_ROLE_KEY') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('PROJECT_ANON_KEY') || '';
const PUBLIC_BASE = Deno.env.get('PROJECT_PUBLIC_BASE') || 'https://autoprintreport.netlify.app';

function checkEnv() {
  const missing = [
    ['SERVICE_ROLE', SERVICE_ROLE],
    ['ANON_KEY', ANON_KEY]
  ].filter(([_, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error('missing env: ' + missing.join(','));
}

// ResponseInit 预定义，避免对象字面量被 JS 误解析（历史踩坑）
const JSON_OK: ResponseInit = { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } };
const JSON_BAD: ResponseInit = { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } };
const JSON_FORBIDDEN: ResponseInit = { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } };
const JSON_UNAUTH: ResponseInit = { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } };
const JSON_ERR: ResponseInit = { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } };

function json(body: unknown, init: ResponseInit = JSON_OK): Response {
  return new Response(JSON.stringify(body), init);
}
function ok(body: unknown): Response { return json(body, JSON_OK); }
function bad(msg: string): Response { return json({ error: msg }, JSON_BAD); }
function forbidden(msg: string): Response { return json({ error: msg }, JSON_FORBIDDEN); }
function unauth(msg: string): Response { return json({ error: msg }, JSON_UNAUTH); }
function serverErr(msg: string): Response { return json({ error: msg }, JSON_ERR); }

function svcHeaders(extra?: Record<string, string>) {
  return Object.assign({
    apikey: SERVICE_ROLE,
    Authorization: 'Bearer ' + SERVICE_ROLE,
    'Content-Type': 'application/json'
  }, extra || {});
}

// ---- service_role data access ----
async function findLinkByToken(token: string): Promise<any | null> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/access_links?select=*&token=eq.' + encodeURIComponent(token) + '&limit=1', { headers: svcHeaders() });
  if (!r.ok) throw new Error('findLink ' + r.status);
  const arr = await r.json();
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

async function insertLink(row: any): Promise<any> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/access_links', {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row)
  });
  if (!r.ok) throw new Error('insertLink ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const arr = await r.json();
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

async function patchLink(id: number | string, patch: any): Promise<void> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/access_links?id=eq.' + encodeURIComponent(String(id)), {
    method: 'PATCH',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch)
  });
  if (!r.ok) throw new Error('patchLink ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function deleteLink(id: number | string): Promise<void> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/access_links?id=eq.' + encodeURIComponent(String(id)), {
    method: 'DELETE',
    headers: svcHeaders({ Prefer: 'return=minimal' })
  });
  if (!r.ok) throw new Error('deleteLink ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function insertAudit(row: any): Promise<void> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/access_links_audit', {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(row)
  });
  if (!r.ok) throw new Error('insertAudit ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function listLinks(): Promise<any[]> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/access_links?select=*&order=created_at.desc', { headers: svcHeaders() });
  if (!r.ok) throw new Error('listLinks ' + r.status);
  return await r.json();
}

// 对外展示数据：复用关键报表卡片（只读聚合，不含 source_email 等内部字段）
async function publicReportData(): Promise<any> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/ReportAutoPrint?select=site,%E6%89%A7%E8%A1%8C%E6%97%B6%E9%97%B4,%E6%80%BB%E6%95%B0,%E6%88%90%E5%8A%9F,%E8%B7%B3%E8%BF%87,%E5%A4%B1%E8%B4%A5&order=%E6%89%A7%E8%A1%8C%E6%97%B6%E9%97%B4.desc&limit=100', { headers: svcHeaders() });
  if (!r.ok) throw new Error('publicReportData ' + r.status);
  const rows = await r.json();
  return { rows: Array.isArray(rows) ? rows : [], generated_at: new Date().toISOString() };
}

// ---- admin JWT 鉴权 ----
async function requireAdmin(req: Request): Promise<{ ok: true; userId: string } | { ok: false; resp: Response }> {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return { ok: false, resp: unauth('缺少访问令牌') };
  const jwt = auth.slice(7);
  // 用 anon key + 用户 JWT 调 auth/v1/user 校验
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + jwt }
  });
  if (!r.ok) return { ok: false, resp: unauth('令牌无效或已过期') };
  const user = await r.json();
  const userId = user.id;
  if (!userId) return { ok: false, resp: unauth('无法识别用户') };
  // 查 profiles 确认 admin + approved
  const pr = await fetch(SUPABASE_URL + '/rest/v1/profiles?select=role,approved&id=eq.' + encodeURIComponent(userId) + '&limit=1', { headers: svcHeaders() });
  if (!pr.ok) return { ok: false, resp: serverErr('权限校验失败') };
  const profiles = await pr.json();
  if (!Array.isArray(profiles) || !profiles.length || profiles[0].role !== 'admin' || profiles[0].approved !== true) {
    return { ok: false, resp: forbidden('仅管理员可执行此操作') };
  }
  return { ok: true, userId };
}

async function readBody(req: Request): Promise<any> {
  try { return await req.json(); } catch (_) { return {}; }
}

// ---- 路由处理 ----
async function handlePublic(url: URL): Promise<Response> {
  const token = url.searchParams.get('token') || '';
  if (!isValidTokenFormat(token)) return forbidden(reasonMessage('not_found'));
  const row = await findLinkByToken(token);
  const v = validateLink(row);
  if (!v.ok) return forbidden(reasonMessage(v.reason));
  const report = await publicReportData();
  return ok({
    title: row.title,
    expires_at: row.expires_at,
    data: report.data || report.rows,
    generated_at: report.generated_at
  });
}

async function handleAdminCreate(req: Request, userId: string): Promise<Response> {
  const body = await readBody(req);
  const title = String(body.title || '').trim();
  if (!title) return bad('缺少标题');
  const days = clampLifetimeDays(body.days);
  const token = generateToken();
  const expiresAt = computeExpiresAt(Date.now(), days);
  const row = await insertLink({ token, title, status: 'active', expires_at: expiresAt, created_by: userId });
  await insertAudit({ link_id: row ? row.id : null, token_prefix: tokenPrefix(token), action: 'create', performed_by: userId, detail: { title, days, expires_at: expiresAt } });
  return ok({ id: row ? row.id : null, token, title, status: 'active', expires_at: expiresAt, url: PUBLIC_BASE + '/share/' + token });
}

async function handleAdminStop(req: Request, userId: string): Promise<Response> {
  const body = await readBody(req);
  const token = String(body.token || '');
  if (!token) return bad('缺少 token');
  const row = await findLinkByToken(token);
  if (!row) return forbidden(reasonMessage('not_found'));
  await patchLink(row.id, { status: 'stopped' });
  await insertAudit({ link_id: row.id, token_prefix: tokenPrefix(token), action: 'stop', performed_by: userId, detail: { title: row.title } });
  return ok({ id: row.id, status: 'stopped' });
}

async function handleAdminDelete(req: Request, userId: string): Promise<Response> {
  const body = await readBody(req);
  const token = String(body.token || '');
  if (!token) return bad('缺少 token');
  const row = await findLinkByToken(token);
  if (!row) return forbidden(reasonMessage('not_found'));
  // 先写审计，再硬删（硬删后 link_id 仍在审计表留存）
  await insertAudit({ link_id: row.id, token_prefix: tokenPrefix(token), action: 'delete', performed_by: userId, detail: { title: row.title, expires_at: row.expires_at } });
  await deleteLink(row.id);
  return ok({ id: row.id, deleted: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type' } });
  try {
    checkEnv();
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === 'GET' && path.endsWith('/public')) return await handlePublic(url);

    if (path.includes('/admin/')) {
      const auth = await requireAdmin(req);
      if (!auth.ok) return auth.resp;
      if (req.method === 'GET' && path.endsWith('/list')) return ok({ links: await listLinks() });
      if (req.method === 'POST' && path.endsWith('/create')) return await handleAdminCreate(req, auth.userId);
      if (req.method === 'POST' && path.endsWith('/stop')) return await handleAdminStop(req, auth.userId);
      if (req.method === 'POST' && path.endsWith('/delete')) return await handleAdminDelete(req, auth.userId);
      return bad('未知管理端点');
    }
    return bad('未知端点');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return serverErr('internal: ' + msg.slice(0, 200));
  }
});
