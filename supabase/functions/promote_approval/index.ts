// Edge Function: promote_approval v1 (issue #35)
// Email-approval promotion: staging(pending) -> ReportAutoPrint via one click + confirm page.
//
// Security model (design_promote_approval_v1.0.md):
//   - GET  ?id&exp&a&t : verify HMAC token, render CONFIRM PAGE ONLY (never mutates data;
//     defends against corporate mail gateways pre-clicking links, e.g. O365 Safe Links)
//   - POST (form from confirm page): verify token again + DB status must be 'pending'
//     (one-time use) -> approve: RPC promote_staging_ids / reject: staging -> rejected
//   - token = HMAC-SHA256(`${id}.${exp}.${action}`, PROJECT_APPROVAL_SECRET), see approval_token.mjs
//   - deploy with verify_jwt=false (email clicks carry no JWT); HMAC carries all auth.

import { verifyToken } from './approval_token.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://uvqjtvonxwsmhntnyest.supabase.co';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('PROJECT_SERVICE_ROLE_KEY') || '';
const APPROVAL_SECRET = Deno.env.get('PROJECT_APPROVAL_SECRET') || '';

const HTML_HEADERS = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
const HTML_ENCODER = new TextEncoder();

function htmlResponse(body: string, status = 200): Response {
  // Encode string to UTF-8 bytes so Deno does not auto-infer text/plain from a string body.
  return new Response(HTML_ENCODER.encode(body), { status, headers: HTML_HEADERS });
}

function checkEnv() {
  const missing = [
    ['SERVICE_ROLE', SERVICE_ROLE],
    ['PROJECT_APPROVAL_SECRET', APPROVAL_SECRET]
  ]
    .filter(([_, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error('missing env: ' + missing.join(','));
}

// ---- REST helpers (service_role) ----
function svcHeaders(extra?: Record<string, string>) {
  return Object.assign(
    {
      apikey: SERVICE_ROLE,
      Authorization: 'Bearer ' + SERVICE_ROLE,
      'Content-Type': 'application/json'
    },
    extra || {}
  );
}

async function getRequestRow(id: string): Promise<any | null> {
  const r = await fetch(
    SUPABASE_URL + '/rest/v1/promote_approval_request?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1',
    { headers: svcHeaders() }
  );
  if (!r.ok) throw new Error('load request ' + r.status);
  const arr = await r.json();
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

async function updateRequestRow(id: string, patch: any) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/promote_approval_request?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch)
  });
  if (!r.ok) throw new Error('update request ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function callPromoteRpc(ids: number[]): Promise<any> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/promote_staging_ids', {
    method: 'POST',
    headers: svcHeaders(),
    body: JSON.stringify({ p_ids: ids })
  });
  const text = await r.text();
  if (!r.ok) throw new Error('rpc ' + r.status + ' ' + text.slice(0, 300));
  return JSON.parse(text);
}

async function rejectStaging(ids: number[]) {
  const r = await fetch(
    SUPABASE_URL + '/rest/v1/report_autoprint_staging?status=eq.pending&id=in.(' + ids.join(',') + ')',
    {
      method: 'PATCH',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ status: 'rejected' })
    }
  );
  if (!r.ok) throw new Error('reject staging ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

// ---- result email (best-effort; never blocks response) ----
async function sendResultEmail(subjectSuffix: string, text: string) {
  try {
    const to = Deno.env.get('ALERT_EMAIL_TO');
    const key = Deno.env.get('RESEND_API_KEY');
    if (!to || !key) return;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('ALERT_EMAIL_FROM') || 'onboarding@resend.dev',
        to: [to],
        subject: '[AutoPrint 审批结果] ' + subjectSuffix,
        text: text + '\n\n时间: ' + new Date().toISOString()
      })
    });
  } catch (_) {
    /* best-effort */
  }
}

// ---- HTML pages (inline styles; mobile-friendly) ----
function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page(title: string, inner: string): string {
  return (
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">' +
    '<title>' + esc(title) + '</title></head>' +
    '<body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f5f6f8;margin:0;padding:24px;">' +
    '<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.08);">' +
    inner +
    '<p style="color:#98a2b3;font-size:12px;margin-top:28px;">AutoPrint 数据转正审批 · issue #35</p>' +
    '</div></body></html>'
  );
}

function confirmPage(row: any, q: { id: string; exp: string; a: string; t: string }): string {
  const isApprove = q.a === 'approve';
  const btnColor = isApprove ? '#16a34a' : '#dc2626';
  const btnText = isApprove ? '确认转正（写入主表）' : '确认拒绝（标记 rejected）';
  const heading = isApprove ? '✅ 批准数据转正' : '❌ 拒绝本批数据';
  return page(
    'AutoPrint 审批确认',
    '<h2 style="margin:0 0 8px;color:#111827;">' + heading + '</h2>' +
      '<p style="color:#475467;">请核对以下摘要后点击按钮确认。此页面本身不会修改任何数据。</p>' +
      '<pre style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px;white-space:pre-wrap;color:#334155;font-size:13px;">' +
      esc(row.summary || '(无摘要)') +
      '</pre>' +
      '<p style="color:#475467;font-size:13px;">涉及 staging 行: ' + esc((row.staging_ids || []).join(', ')) +
      ' · 有效期至: ' + esc(row.expires_at) + '</p>' +
      '<form method="POST">' +
      '<input type="hidden" name="id" value="' + esc(q.id) + '">' +
      '<input type="hidden" name="exp" value="' + esc(q.exp) + '">' +
      '<input type="hidden" name="a" value="' + esc(q.a) + '">' +
      '<input type="hidden" name="t" value="' + esc(q.t) + '">' +
      '<button type="submit" style="background:' + btnColor + ';color:#fff;border:0;border-radius:8px;' +
      'padding:12px 28px;font-size:16px;cursor:pointer;">' + btnText + '</button>' +
      '</form>'
  );
}

function infoPage(title: string, msg: string, color?: string): Response {
  return htmlResponse(
    page(title, '<h2 style="margin:0 0 8px;color:' + (color || '#111827') + ';">' + esc(title) + '</h2>' +
      '<p style="color:#475467;">' + msg + '</p>'),
    200
  );
}

const FALLBACK_HINT = '如需处理该批数据，请使用 SOP §7 手动转正（后备通道），或等待下一封审批邮件。';

// ---- main ----
Deno.serve(async (req) => {
  try {
    checkEnv();
  } catch (e) {
    return new Response('ENV ' + e.message, { status: 500 });
  }

  // extract params from query (GET) or form body (POST)
  let q: { id: string; exp: string; a: string; t: string };
  if (req.method === 'GET') {
    const u = new URL(req.url);
    q = {
      id: u.searchParams.get('id') || '',
      exp: u.searchParams.get('exp') || '',
      a: u.searchParams.get('a') || '',
      t: u.searchParams.get('t') || ''
    };
  } else if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    if (!form) return infoPage('请求无效', '表单数据缺失。' + FALLBACK_HINT, '#dc2626');
    q = {
      id: String(form.get('id') || ''),
      exp: String(form.get('exp') || ''),
      a: String(form.get('a') || ''),
      t: String(form.get('t') || '')
    };
  } else {
    return new Response('method-not-allowed', { status: 405 });
  }

  // 1. HMAC verification (stateless)
  const v = await verifyToken({ id: q.id, exp: q.exp, action: q.a, token: q.t }, APPROVAL_SECRET);
  if (!v.ok) {
    if (v.reason === 'expired') {
      return infoPage('链接已过期', '该审批链接已超过 72 小时有效期。' + FALLBACK_HINT, '#d97706');
    }
    return infoPage('链接无效', '审批链接校验失败（参数缺失或被篡改）。' + FALLBACK_HINT, '#dc2626');
  }

  // 2. load request row (stateful: one-time use)
  let row: any;
  try {
    row = await getRequestRow(q.id);
  } catch (e) {
    return infoPage('系统错误', '读取审批请求失败: ' + esc(e.message), '#dc2626');
  }
  if (!row) return infoPage('请求不存在', '未找到对应的审批请求。' + FALLBACK_HINT, '#dc2626');
  if (row.status !== 'pending') {
    return infoPage(
      '该请求已处理',
      '此审批请求当前状态为 <b>' + esc(row.status) + '</b>（' + esc(row.acted_at || '') + '），不能重复操作。',
      '#d97706'
    );
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    try {
      await updateRequestRow(q.id, { status: 'expired' });
    } catch (_) { /* ignore */ }
    return infoPage('链接已过期', '该审批请求已过期。' + FALLBACK_HINT, '#d97706');
  }

  // 3. GET -> confirm page ONLY (zero side effects)
  if (req.method === 'GET') {
    return htmlResponse(confirmPage(row, q), 200);
  }

  // 4. POST -> execute
  const ids: number[] = (row.staging_ids || []).map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n));
  const actorInfo = ((req.headers.get('user-agent') || '').slice(0, 120));
  if (q.a === 'approve') {
    try {
      const result = await callPromoteRpc(ids);
      const resStr =
        'promoted=' + result.promoted + ' inserted=' + result.inserted +
        ' updated=' + result.updated + ' superseded=' + result.superseded;
      await updateRequestRow(q.id, {
        status: 'approved',
        acted_at: new Date().toISOString(),
        actor_info: actorInfo,
        action_result: resStr
      });
      await sendResultEmail('已批准转正', '审批请求 ' + q.id + ' 已批准。\n结果: ' + resStr + '\nstaging行: ' + ids.join(','));
      return infoPage(
        '✅ 转正完成',
        '数据已写入主表。<br>结果: <b>' + esc(resStr) + '</b><br>本链接已失效，重复点击无副作用。',
        '#16a34a'
      );
    } catch (e) {
      try {
        await updateRequestRow(q.id, { error_msg: String(e.message).slice(0, 300) });
      } catch (_) { /* ignore */ }
      await sendResultEmail('批准执行失败', '审批请求 ' + q.id + ' 执行失败: ' + e.message + '\n数据仍在 staging(pending)，可走 SOP §7 手动处理。');
      return infoPage('执行失败', '转正执行出错: ' + esc(e.message) + '<br>数据仍保留在 staging，可走 SOP §7 手动转正。', '#dc2626');
    }
  }

  // reject
  try {
    await rejectStaging(ids);
    await updateRequestRow(q.id, {
      status: 'rejected',
      acted_at: new Date().toISOString(),
      actor_info: actorInfo,
      action_result: 'rejected ids=' + ids.join(',')
    });
    await sendResultEmail('已拒绝', '审批请求 ' + q.id + ' 已拒绝，staging 行 ' + ids.join(',') + ' 标记为 rejected（保留审计）。');
    return infoPage('❌ 已拒绝', '本批数据已标记 rejected（不进主表，保留审计）。本链接已失效。', '#dc2626');
  } catch (e) {
    return infoPage('执行失败', '拒绝操作出错: ' + esc(e.message), '#dc2626');
  }
});
