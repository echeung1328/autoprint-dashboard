// Edge Function: email_inbox_poc v10 (formal pipeline)
// - Basic Auth gate + whitelist (same as POC)
// - service_role write to report_autoprint_staging (SOP cleaning applied)
// - raw archive to email_inbox_poc (POC table, RLS off)
//
// Direction B key changes vs POC:
//   1. anon key -> SUPABASE_SERVICE_ROLE_KEY (bypass RLS on ReportAutoPrint/staging)
//   2. parse xlsx/csv attachments, apply SOP data-quality rules
//   3. land cleaned rows into report_autoprint_staging (human confirms promotion later)

import * as XLSX from './xlsx.mjs';

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
      CreatedBy: batchTag,
      ModifiedBy: batchTag
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
    // junk filter (SOP §5.3.4)
    if (!title || /^autoprint-/i.test(title) || title === '执行时间' || title === '完成时间') continue;
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

  // archive raw meta to email_inbox_poc
  try {
    await restInsert('email_inbox_poc', [
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
  const stagingRows: any[] = [];
  const parseErrors: string[] = [];

  for (const a of atts) {
    let matrix: string[][];
    try {
      if (/\.csv$/i.test(a.name || '') || /csv/.test(a.content_type || '')) {
        matrix = parseCsv(atob(a.content));
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
        await restInsert('email_inbox_poc', [
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
      await restInsert('email_inbox_poc', [
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
      await restInsert('report_autoprint_staging', stagingRows);
      const updates = stagingRows.filter((r) => r.conflict_action === 'update').length;
      return new Response('ok-staged-' + stagingRows.length + ' (update=' + updates + ')', OK);
    } catch (e) {
      return new Response('STAGE_FAIL ' + e.message, E500);
    }
  }
  if (parseErrors.length > 0) {
    return new Response('ok-no-rows; parse-errors: ' + parseErrors.join(' | '), E500);
  }
  return new Response('ok-no-rows', OK);
});
