// Edge Function: promote_approval v2 (issue #35)
// Email-approval promotion: staging(pending) -> ReportAutoPrint via one click + external confirm page.
//
// Security model:
//   - GET  ?id&exp&a&t : verify HMAC token, then 302 redirect to external static confirm UI
//     (never mutates data; defends against corporate mail gateways pre-clicking links,
//     e.g. O365 Safe Links)
//   - POST (form from confirm UI): verify token again + DB status must be 'pending'
//     (one-time use) -> approve: RPC promote_staging_ids / reject: staging -> rejected
//   - token = HMAC-SHA256(`${id}.${exp}.${action}`, PROJECT_APPROVAL_SECRET), see approval_token.mjs
//   - deploy with verify_jwt=false (email clicks carry no JWT); HMAC carries all auth.
//
// Platform note: Supabase Edge Functions on the default *.supabase.co domain rewrite
// GET responses with Content-Type text/html to text/plain. Therefore the actual HTML
// confirmation page is hosted externally (e.g. GitHub Pages) and this function only
// returns 302 redirects + handles the POST execution.

import { verifyToken } from './approval_token.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://uvqjtvonxwsmhntnyest.supabase.co';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('PROJECT_SERVICE_ROLE_KEY') || '';
const APPROVAL_SECRET = Deno.env.get('PROJECT_APPROVAL_SECRET') || '';
const APPROVAL_UI_URL = Deno.env.get('APPROVAL_UI_URL') || '';

function checkEnv() {
  const missing = [
    ['SERVICE_ROLE', SERVICE_ROLE],
    ['PROJECT_APPROVAL_SECRET', APPROVAL_SECRET],
    ['APPROVAL_UI_URL', APPROVAL_UI_URL]
  ]
    .filter(([_, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error('missing env: ' + missing.join(','));
}

// ---- redirect helpers ----
function redirect(url: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: url } });
}

function buildUiUrl(base: string, params: Record<string, string>): string {
  const u = new URL(base);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) u.searchParams.set(k, v);
  });
  return u.toString();
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
    if (!form) {
      return redirect(buildUiUrl(APPROVAL_UI_URL, { result: 'error', error: '表单数据缺失' }));
    }
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
      return redirect(buildUiUrl(APPROVAL_UI_URL, { result: 'expired', error: '该审批链接已超过 72 小时有效期' }));
    }
    return redirect(buildUiUrl(APPROVAL_UI_URL, { result: 'error', error: '审批链接校验失败（参数缺失或被篡改）' }));
  }

  // 2. load request row (stateful: one-time use)
  let row: any;
  try {
    row = await getRequestRow(q.id);
  } catch (e) {
    return redirect(buildUiUrl(APPROVAL_UI_URL, { result: 'error', error: '读取审批请求失败: ' + String(e.message).slice(0, 200) }));
  }
  if (!row) {
    return redirect(buildUiUrl(APPROVAL_UI_URL, { result: 'error', error: '未找到对应的审批请求' }));
  }
  if (row.status !== 'pending') {
    return redirect(buildUiUrl(APPROVAL_UI_URL, {
      result: 'error',
      error: '此审批请求当前状态为 ' + row.status + '（' + (row.acted_at || '') + '），不能重复操作'
    }));
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    try {
      await updateRequestRow(q.id, { status: 'expired' });
    } catch (_) { /* ignore */ }
    return redirect(buildUiUrl(APPROVAL_UI_URL, { result: 'expired', error: '该审批请求已过期' }));
  }

  // 3. GET -> 302 redirect to external static confirm UI (zero side effects)
  if (req.method === 'GET') {
    return redirect(buildUiUrl(APPROVAL_UI_URL, {
      id: q.id,
      exp: q.exp,
      a: q.a,
      t: q.t,
      summary: String(row.summary || ''),
      staging_ids: (row.staging_ids || []).join(','),
      expires_at: String(row.expires_at || '')
    }));
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
      return redirect(buildUiUrl(APPROVAL_UI_URL, { result: 'approved', detail: resStr }));
    } catch (e) {
      try {
        await updateRequestRow(q.id, { error_msg: String(e.message).slice(0, 300) });
      } catch (_) { /* ignore */ }
      await sendResultEmail('批准执行失败', '审批请求 ' + q.id + ' 执行失败: ' + e.message + '\n数据仍在 staging(pending)，可走 SOP §7 手动处理。');
      return redirect(buildUiUrl(APPROVAL_UI_URL, {
        result: 'error',
        error: '转正执行出错: ' + String(e.message).slice(0, 200) + '。数据仍保留在 staging，可走 SOP §7 手动转正。'
      }));
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
    return redirect(buildUiUrl(APPROVAL_UI_URL, { result: 'rejected', detail: 'rejected ids=' + ids.join(',') }));
  } catch (e) {
    return redirect(buildUiUrl(APPROVAL_UI_URL, { result: 'error', error: '拒绝操作出错: ' + String(e.message).slice(0, 200) }));
  }
});
