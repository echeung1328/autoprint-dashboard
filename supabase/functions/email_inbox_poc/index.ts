// Edge Function: email_inbox_poc v12 (multi-source ingest + approval email, issues #34 #35)
// - Basic Auth gate + whitelist (same as POC)
// - service_role write to report_autoprint_staging (SOP cleaning applied)
// - raw archive to email_raw_archive (RLS ON; only service_role can write, approved users can read)
//
// v11 changes (design_multi_source_ingest_v1.0.md):
//   1. BODY channel: email body parsed first (guard-matched daily notification);
//      attachments are the fallback / bulk-import path (D1 priority BODY > XLSX)
//   2. Excel path CreatedBy = from_email (D2, was batchTag); batch_tag keeps batch trace
//   3. channel tokens in 标签: SRC=BODY / SRC=XLSX (+ SP_REC=<id> for body) (D3)
//   4. body archived to email_raw_archive as filename='(email_body)'
//
// v12 changes (design_promote_approval_v1.0.md, issue #35):
//   5. after staging insert, create promote_approval_request + send approval email
//      (Resend) with HMAC-signed approve/reject links -> promote_approval function.
//      Best-effort: any failure never blocks ingestion (SOP §7 stays as fallback).

import * as XLSX from './xlsx.mjs';
import { shouldSkipTitle } from './row_filter.mjs';
import { parseBody } from './body_parser.mjs';
import { signToken } from './approval_token.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://uvqjtvonxwsmhntnyest.supabase.co';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('PROJECT_SERVICE_ROLE_KEY') || '';
const BU = Deno.env.get('WEBHOOK_BASIC_USER') || 'poc';
const BP = Deno.env.get('WEBHOOK_BASIC_PASS') || '';
const ALLOWED = (Deno.env.get('ALLOWED_SENDERS') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const EXP_BASIC = btoa(BU + ':' + BP);
const OK = { status: 200 };
const E401 = { status: 401 };
const E400 = { status: 400 };
const E500 = { status: 500 };

// ---- failure alerting (config-driven; never blocks the main flow) ----
// Email path: set Supabase Secrets RESEND_API_KEY + ALERT_EMAIL_TO (optional ALERT_EMAIL_FROM).
// Generic path: set INGEST_ALERT_WEBHOOK to any HTTPS endpoint (e.g. an email-bridge).
// If neither is configured, alerts are silently skipped (no error).
// Note: Supabase Edge runtime only allows HTTPS egress, so raw SMTP is not used here.
// Diagnostic: every attempt is recorded in ingest_alert_log (success/fail + error) for SQL review.
async function sendAlert(kind: string, detail: string) {
  let channel = 'none';
  let success = false;
  let err = '';
  try {
    const to = Deno.env.get('ALERT_EMAIL_TO');
    const key = Deno.env.get('RESEND_API_KEY');
    if (to && key) {
      channel = 'resend';
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: Deno.env.get('ALERT_EMAIL_FROM') || 'onboarding@resend.dev',
          to: [to],
          subject: '[AutoPrint 入库告警] ' + kind,
          text: detail + '\n\n时间: ' + new Date().toISOString()
        })
      });
      if (!r.ok) {
        err = 'resend ' + r.status + ' ' + (await r.text()).slice(0, 300);
        throw new Error(err);
      }
      success = true;
      return;
    }
    const wh = Deno.env.get('INGEST_ALERT_WEBHOOK');
    if (wh) {
      channel = 'webhook';
      const r = await fetch(wh, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, detail, at: new Date().toISOString() })
      });
      if (!r.ok) {
        err = 'webhook ' + r.status;
        throw new Error(err);
      }
      success = true;
      return;
    }
  } catch (e) {
    success = false;
    err = (e && e.message) || String(e);
    console.log('alert-send-fail', err);
  } finally {
    try {
      await restInsert('ingest_alert_log', [{ kind, channel, success, detail, error_msg: err }]);
    } catch (_) {
      /* ignore log failure */
    }
  }
}

function checkEnv() {
  const missing = [['SUPABASE_URL', SUPABASE_URL], ['SERVICE_ROLE', SERVICE_ROLE], ['BU', BU], ['BP', BP]]
    .filter(([_, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error('missing env: ' + missing.join(','));
}

async function restInsert(table: string, rows: any[]) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: 'Bearer ' + SERVICE_ROLE,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('insert ' + table + ' ' + r.status + ' ' + t.slice(0, 200));
  }
}

// like restInsert but returns inserted rows (need staging ids for approval request, #35)
async function restInsertReturning(table: string, rows: any[]): Promise<any[]> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: 'Bearer ' + SERVICE_ROLE,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(rows)
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('insert ' + table + ' ' + r.status + ' ' + t.slice(0, 200));
  }
  return await r.json();
}

// ---- approval email (issue #35; best-effort, never blocks ingestion) ----
// Requires PROJECT_APPROVAL_SECRET + RESEND_API_KEY + ALERT_EMAIL_TO; silently skips if unset.
function bjDay(iso: string | null): string {
  if (!iso) return '?';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '?';
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
async function sendApprovalEmail(inserted: any[]) {
  try {
    const secret = Deno.env.get('PROJECT_APPROVAL_SECRET');
    const to = Deno.env.get('ALERT_EMAIL_TO');
    const key = Deno.env.get('RESEND_API_KEY');
    if (!secret || !to || !key || !inserted.length) return;

    const ids = inserted.map((r) => r.id).filter((n) => Number.isInteger(n));
    if (!ids.length) return;
    const summaryLines = inserted.map(
      (r) =>
        '业务日 ' + bjDay(r['执行时间']) + ' · ' + (r.Title || r['Title'] || '(无标题)') +
        ' · 总数 ' + (r['总数'] ?? '?') + ' 成功 ' + (r['成功'] ?? '?') +
        ' 跳过 ' + (r['跳过'] ?? '?') + ' 失败 ' + (r['失败'] ?? '?') +
        ' · 来源 ' + (r.source_filename === '(email_body)' ? '邮件正文' : r.source_filename)
    );
    const summary = summaryLines.join('\n');

    const expEpoch = Math.floor(Date.now() / 1000) + 72 * 3600;
    const reqRows = await restInsertReturning('promote_approval_request', [
      { staging_ids: ids, summary, expires_at: new Date(expEpoch * 1000).toISOString(), status: 'pending' }
    ]);
    const reqId = reqRows[0].id;

    const approveT = await signToken(reqId, expEpoch, 'approve', secret);
    const rejectT = await signToken(reqId, expEpoch, 'reject', secret);
    const baseUrl = SUPABASE_URL + '/functions/v1/promote_approval';
    const approveUrl = baseUrl + '?id=' + reqId + '&exp=' + expEpoch + '&a=approve&t=' + approveT;
    const rejectUrl = baseUrl + '?id=' + reqId + '&exp=' + expEpoch + '&a=reject&t=' + rejectT;

    const rowsHtml = summaryLines
      .map((l) => '<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-size:13px;">' + l + '</td></tr>')
      .join('');
    const html =
      '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:600px;">' +
      '<h3 style="color:#111827;">AutoPrint 数据待审批转正</h3>' +
      '<p style="color:#475467;font-size:14px;">以下数据已入 staging（pending），请审批是否写入主表：</p>' +
      '<table style="border-collapse:collapse;">' + rowsHtml + '</table>' +
      '<p style="margin:20px 0;">' +
      '<a href="' + approveUrl + '" style="background:#16a34a;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:15px;margin-right:12px;">✅ 批准转正</a>' +
      '<a href="' + rejectUrl + '" style="background:#6b7280;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:15px;">❌ 拒绝</a>' +
      '</p>' +
      '<p style="color:#98a2b3;font-size:12px;">点击后会打开确认页，需再点一次按钮才会执行（防误触）。链接 72 小时后失效；过期或未处理可按 SOP §7 手动转正。</p>' +
      '</div>';

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('ALERT_EMAIL_FROM') || 'onboarding@resend.dev',
        to: [to],
        subject: '[AutoPrint 待审批] ' + bjDay(inserted[0]['执行时间']) + ' 数据转正（' + ids.length + ' 条）',
        html
      })
    });
    if (!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
  } catch (e) {
    await sendAlert('审批邮件发送失败', (e && e.message) || String(e));
  }
}

async function reportExists(title: string, execTime: string): Promise<boolean> {
  const url =
    SUPABASE_URL +
    '/rest/v1/ReportAutoPrint?select=id&limit=1&Title=eq.' +
    encodeURIComponent(title) +
    '&执行时间=eq.' +
    encodeURIComponent(execTime);
  const r = await fetch(url, { headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE } });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('conflict check ' + r.status + ' ' + t.slice(0, 200));
  }
  const arr = await r.json();
  return Array.isArray(arr) && arr.length > 0;
}

// ---- bilingual column mapping (SOP §5.3.2) ----
interface MapRule {
  keys: string[];
  db: string;
}
const RULES: MapRule[] = [
  { keys: ['标题', 'title', 'name'], db: 'Title' },
  { keys: ['执行时间', 'start', '开始时间'], db: '执行时间' },
  { keys: ['完成时间', 'end', '结束时间'], db: '完成时间' },
  { keys: ['总数', 'total'], db: '总数' },
  { keys: ['成功', 'success'], db: '成功' },
  { keys: ['跳过', 'skip'], db: '跳过' },
  { keys: ['失败', 'fail', 'error'], db: '失败' },
  { keys: ['附件', 'attach', 'excel'], db: '附件Excel表格' },
  { keys: ['邮件', 'mail', 'notify', '通知'], db: '任务完成通知邮件' },
  { keys: ['标签', 'tag', 'label'], db: '标签' }
];

function mapHeader(h: string): string | null {
  const n = (h || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!n) return null;
  for (const r of RULES) {
    for (const k of r.keys) {
      const kk = k.toLowerCase();
      if (n === kk || n.includes(kk) || kk.includes(n)) return r.db;
    }
  }
  return null;
}

// ---- timestamp parsing -> always +08:00 (SOP §5.3.3) ----
function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}
function build(y: number, mo: number, d: number, h: number, mi: number, s: number): string {
  return y + '-' + pad(mo) + '-' + pad(d) + 'T' + pad(h) + ':' + pad(mi) + ':' + pad(s) + '+08:00';
}
function fmt(d: Date): string {
  return (
    d.getUTCFullYear() +
    '-' +
    pad(d.getUTCMonth() + 1) +
    '-' +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    ':' +
    pad(d.getUTCMinutes()) +
    ':' +
    pad(d.getUTCSeconds()) +
    '+08:00'
  );
}
function parseTs(v: any): string | null {
  if (v === null || v === undefined || v === '') return null;
  // Excel serial date
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return fmt(new Date((v - 25569) * 86400 * 1000));
  }
  const s = String(v).trim();
  if (/^\d+$/.test(s) && Number(s) > 20000 && Number(s) < 80000) {
    return fmt(new Date((Number(s) - 25569) * 86400 * 1000));
  }
  // YYYY-MM-DD HH:MM[:SS] / YYYY/MM/DD / YYYY年MM月DD日 HH:MM
  let m = s.match(/(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})[日\sT]*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return build(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  // MM/DD/YYYY HH:MM AM/PM
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (m) {
    let hh = +m[4];
    const ap = (m[6] || '').toLowerCase();
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    return build(+m[3], +m[1], +m[2], hh, +m[5], 0);
  }
  // already ISO
  const d = new Date(s);
  if (!isNaN(d.getTime())) return fmt(d);
  return null;
}

// ---- minimal CSV parser (handles quoted fields) ----
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c === '\r') {
        /* skip */
      } else field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---- email body text extraction (BODY channel, issue #34) ----
// Webhook Relay payload field name may vary; try common plain-text fields first,
// then fall back to stripping HTML.
function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#65306;/g, '：');
}
function pickBodyText(p: any): string {
  const cand = p.body_plain ?? p.plain ?? p.text ?? p.body ?? p.message ?? null;
  if (cand && typeof cand === 'string' && cand.trim()) return cand;
  const html = p.body_html ?? p.html ?? null;
  if (html && typeof html === 'string' && html.trim()) return stripHtml(html);
  return '';
}
// UTF-8 safe base64 (btoa alone throws on non-latin1)
function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ---- clean a parsed matrix into staging records (SOP rules) ----
function cleanMatrix(matrix: string[][], from: string, filename: string, batchTag: string): any[] {
  if (!matrix || matrix.length < 2) return [];
  const header = matrix[0].map((h) => mapHeader(h));
  const out: any[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    const rec: any = {
      source_email: from,
      source_filename: filename,
      batch_tag: batchTag,
      status: 'pending',
      '附件Excel表格': false,
      '任务完成通知邮件': false,
      总数: 0,
      成功: 0,
      跳过: 0,
      失败: 0,
      // D2 (design_multi_source_ingest_v1.0.md §6): CreatedBy = sender, not batchTag.
      // batch_tag still carries the batch trace (EMAIL_YYYYMM).
      CreatedBy: from,
      ModifiedBy: from
    };
    let title = '';
    let execTime: string | null = null;
    let doneTime: string | null = null;
    for (let j = 0; j < header.length; j++) {
      const db = header[j];
      if (!db) continue;
      const val = row[j] === undefined || row[j] === null ? '' : String(row[j]).trim();
      if (db === 'Title') title = val;
      else if (db === '执行时间') {
        execTime = parseTs(val);
        if (!execTime) rec.error_msg = (rec.error_msg || '') + ' execTime-unparsed';
      } else if (db === '完成时间') {
        doneTime = parseTs(val);
        if (!doneTime) rec.error_msg = (rec.error_msg || '') + ' doneTime-unparsed';
      } else if (db === '附件Excel表格' || db === '任务完成通知邮件') {
        rec[db] = /^(是|true|yes|1|y)$/i.test(val);
      } else if (['总数', '成功', '跳过', '失败'].includes(db)) {
        rec[db] = parseInt(val, 10) || 0;
      } else {
        rec[db] = val;
      }
    }
    // junk filter (SOP §5.3.4): skip empty rows or rows that literally are column names.
    // Logic lives in row_filter.mjs — see row_filter.test.mjs for regression coverage (issue #26).
    if (shouldSkipTitle(title)) continue;
    rec.Title = title;
    rec['执行时间'] = execTime;
    rec['完成时间'] = doneTime;
    // 耗时分钟 preview (generated column in main table; here just for review)
    if (execTime && doneTime) {
      const d1 = new Date(execTime);
      const d2 = new Date(doneTime);
      if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
        rec['耗时分钟'] = Math.round((d2.getTime() - d1.getTime()) / 60000);
      }
    }
    // D3: channel token in 标签 (append, keep any tag from the sheet)
    rec['标签'] = rec['标签'] ? rec['标签'] + ';SRC=XLSX' : 'SRC=XLSX';
    // composite-key dedup within file (SOP §5.3.5)
    const key = title + '|' + (execTime || '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rec);
  }
  return out;
}

// ---- main handler ----
Deno.serve(async (req) => {
  try {
    checkEnv();
  } catch (e) {
    return new Response('ENV ' + e.message, E500);
  }

  const auth = req.headers.get('authorization');
  if (!auth || !auth.toLowerCase().startsWith('basic ') || auth.slice(6).trim() !== EXP_BASIC) {
    return new Response('auth-fail', E401);
  }

  let body = '';
  try {
    body = await req.text();
  } catch (e) {
    return new Response('read-fail ' + e.message, E400);
  }
  let p: any;
  try {
    p = JSON.parse(body);
  } catch (e) {
    return new Response('invalid-json', E400);
  }

  const from = (p.from || '').toLowerCase();
  const subject = p.subject || '';
  const base = { received_at: new Date().toISOString(), from_email: from, subject };
  const atts = (p.attachments || []).filter(
    (a: any) => /(excel|spreadsheet|ms-excel|csv|sheet)/i.test(a.content_type || '') || /\.(xlsx|xls|csv)$/i.test(a.name || '')
  );

  // archive raw meta to email_raw_archive
  try {
    await restInsert('email_raw_archive', [
      Object.assign({}, base, {
        filename: '(meta)',
        content_type: 'text/plain',
        raw_base64: null,
        row_count: atts.length,
        status: ALLOWED.length && !ALLOWED.includes(from) ? 'whitelist-rejected' : 'received',
        error_msg: null
      })
    ]);
  } catch (e) {
    console.log('archive meta fail', e.message);
  }

  if (ALLOWED.length && !ALLOWED.includes(from)) {
    return new Response('ok-not-allowed', OK);
  }

  const batchTag = 'EMAIL_' + new Date().toISOString().slice(0, 7).replace('-', '');

  // ---- BODY channel first (D1: body > attachment; issue #34) ----
  // Guard inside parseBody: qualifies ONLY when all 7 required keys are present,
  // so signatures/forwards can never hijack the attachment path.
  const bodyText = pickBodyText(p);
  if (bodyText) {
    const br: any = parseBody(bodyText, { from, batchTag });
    if (br.ok) {
      const rec = br.record;
      // archive raw body (replayable, like attachments)
      try {
        await restInsert('email_raw_archive', [
          Object.assign({}, base, {
            filename: '(email_body)',
            content_type: 'text/plain',
            raw_base64: b64utf8(bodyText),
            row_count: 1,
            status: 'stored',
            error_msg: null
          })
        ]);
      } catch (_) {
        /* ignore */
      }
      // conflict marker (informational; promotion dedup is business-day based, SOP §7)
      try {
        rec.conflict_action = (await reportExists(rec.Title, rec['执行时间'])) ? 'update' : 'insert';
      } catch (_) {
        rec.conflict_action = 'check-error';
      }
      try {
        const insertedBody = await restInsertReturning('report_autoprint_staging', [rec]);
        // #35: approval email (best-effort; never throws)
        await sendApprovalEmail(insertedBody);
        // D1: BODY wins — any attachments are archived raw but NOT parsed
        for (const a of atts) {
          try {
            await restInsert('email_raw_archive', [
              Object.assign({}, base, {
                filename: a.name,
                content_type: a.content_type,
                raw_base64: a.content,
                row_count: null,
                status: 'stored',
                error_msg: 'skipped-body-priority'
              })
            ]);
          } catch (_) {
            /* ignore */
          }
        }
        return new Response('ok-staged-body-1' + (atts.length ? ' (atts-skipped=' + atts.length + ')' : ''), OK);
      } catch (e) {
        await sendAlert('写入 staging 失败(BODY)', e.message);
        return new Response('STAGE_FAIL(body) ' + e.message, E500);
      }
    } else if (br.guardMatched) {
      // notification-shaped body but broken (L3) -> archive parse_error + alert, then fall back to attachments
      try {
        await restInsert('email_raw_archive', [
          Object.assign({}, base, {
            filename: '(email_body)',
            content_type: 'text/plain',
            raw_base64: b64utf8(bodyText),
            row_count: 0,
            status: 'parse_error',
            error_msg: br.reason
          })
        ]);
      } catch (_) {
        /* ignore */
      }
      await sendAlert('正文解析失败', br.reason + ' | subject=' + subject + ' from=' + from);
    }
    // guardMatched=false -> normal non-notification mail, silently fall through to attachments
  }

  const stagingRows: any[] = [];
  const parseErrors: string[] = [];

  for (const a of atts) {
    let matrix: string[][];
    try {
      if (/\.csv$/i.test(a.name || '') || /csv/.test(a.content_type || '')) {
        // NOTE: atob() alone yields latin1 bytes — Chinese headers (执行时间 etc.)
        // become mojibake and column mapping silently fails. Decode as UTF-8. (found by #34 integration test)
        const csvBytes = Uint8Array.from(atob(a.content), (c) => c.charCodeAt(0));
        matrix = parseCsv(new TextDecoder('utf-8').decode(csvBytes));
      } else {
        const buf = Uint8Array.from(atob(a.content), (c) => c.charCodeAt(0));
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      }
    } catch (e) {
      const msg = (a.name || 'attachment') + ': ' + e.message;
      parseErrors.push(msg);
      try {
        await restInsert('email_raw_archive', [
          Object.assign({}, base, {
            filename: a.name,
            content_type: a.content_type,
            raw_base64: a.content,
            row_count: null,
            status: 'error',
            error_msg: 'parse-fail: ' + e.message
          })
        ]);
      } catch (_) {
        /* ignore */
      }
      continue;
    }

    // archive raw attachment
    try {
      await restInsert('email_raw_archive', [
        Object.assign({}, base, {
          filename: a.name,
          content_type: a.content_type,
          raw_base64: a.content,
          row_count: null,
          status: 'stored',
          error_msg: null
        })
      ]);
    } catch (_) {
      /* ignore */
    }

    const cleaned = cleanMatrix(matrix, from, a.name, batchTag);
    for (const r of cleaned) stagingRows.push(r);
  }

  // conflict detection per composite key -> INSERT vs UPDATE at promotion (SOP §5.4)
  const uniq = new Map<string, any>();
  for (const r of stagingRows) {
    const k = r.Title + '|' + (r['执行时间'] || '');
    if (!uniq.has(k)) uniq.set(k, r);
  }
  for (const [, r] of uniq) {
    if (!r['执行时间']) {
      r.conflict_action = 'insert';
      continue;
    }
    try {
      r.conflict_action = (await reportExists(r.Title, r['执行时间'])) ? 'update' : 'insert';
    } catch (e) {
      r.conflict_action = 'check-error';
      r.error_msg = (r.error_msg || '') + ' conflict-check-fail';
    }
  }

  if (stagingRows.length > 0) {
    try {
      const insertedRows = await restInsertReturning('report_autoprint_staging', stagingRows);
      // #35: approval email (best-effort; never throws)
      await sendApprovalEmail(insertedRows);
      const updates = stagingRows.filter((r) => r.conflict_action === 'update').length;
      return new Response('ok-staged-' + stagingRows.length + ' (update=' + updates + ')', OK);
    } catch (e) {
      await sendAlert('写入 staging 失败', e.message);
      return new Response('STAGE_FAIL ' + e.message, E500);
    }
  }
  if (parseErrors.length > 0) {
    await sendAlert('解析失败', parseErrors.join(' | '));
    return new Response('ok-no-rows; parse-errors: ' + parseErrors.join(' | '), E500);
  }
  // blind-spot fix (issue #27): attachment present but 0 rows parsed ->
  // likely empty table / header-only / header columns not matching SOP mapping.
  // Previously this returned 200 silently (data-loss risk). Now we alert.
  if (atts.length > 0) {
    await sendAlert(
      '解析成功但 0 行',
      '邮件含附件但未解析出任何数据行（可能为空表 / 仅表头 / 表头列名不匹配 SOP 映射）。subject=' +
        subject +
        ' from=' +
        from
    );
  }
  return new Response('ok-no-rows', OK);
});
