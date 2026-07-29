// body_parser.mjs — email BODY channel parser (issue #34, design_multi_source_ingest_v1.0.md §5)
//
// Parses a plain-text notification body ("键：值" lines) into ONE normalized
// staging record. Shared by Deno Edge Function (index.ts) and Node unit tests.
//
// DATA-SOURCE HARD RULES (design doc §4 — do NOT change):
//   L1. 执行时间/完成时间 are ALWAYS UTC+8 and NEVER carry a trailing 'Z'.
//       Parsing always appends '+08:00'. NEVER add a "detect Z then branch" path.
//   L2. Title is AI-generated and UNRELIABLE. Never derive time from it; store as-is.
//   L3. The only trusted time source is the explicit 执行时间 key.
//       Guard matched but 执行时间 unparseable -> { ok:false, guardMatched:true } (parse_error).
//
// Trigger guard (design doc §5.1): body qualifies ONLY when ALL REQUIRED_KEYS
// are present. Otherwise -> { ok:false, guardMatched:false } and the caller
// falls back to the attachment path (signatures/forwards must not hijack).

export const REQUIRED_KEYS = ['title', '执行时间', '总数', '成功', '跳过', '失败', '完成时间'];

// ---- timestamp parsing: same semantics as index.ts parseTs (always +08:00) ----
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
function build(y, mo, d, h, mi, s) {
  return y + '-' + pad(mo) + '-' + pad(d) + 'T' + pad(h) + ':' + pad(mi) + ':' + pad(s) + '+08:00';
}
export function parseTsBody(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  // YYYY-MM-DD HH:MM[:SS] / YYYY/MM/DD / YYYY年MM月DD日 HH:MM  (wall clock = UTC+8, L1)
  const m = s.match(/(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})[日\sT]*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return build(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  return null;
}

// ---- key/value extraction ----
// Splits each line at the FIRST colon (full-width '：' or half-width ':').
// Keys are normalized: trimmed, inner spaces removed, ASCII lowered.
export function extractKeyValues(text) {
  const kv = {};
  if (!text) return kv;
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^([^：:]{1,50})[：:]\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim().replace(/\s+/g, '').toLowerCase();
    if (!key) continue;
    if (!(key in kv)) kv[key] = m[2].trim(); // first occurrence wins
  }
  return kv;
}

function toBool(v) {
  return /^(是|true|yes|1|y)$/i.test(String(v || '').trim());
}
function toInt(v) {
  const n = parseInt(String(v || '').trim(), 10);
  return isNaN(n) ? 0 : n; // 总数=0 is LEGAL data (no print jobs that day)
}

// Extract SharePoint record id: prefer explicit 记录id key, fallback to &ID=<n> in any URL value.
function extractRecordId(kv) {
  const explicit = (kv['记录id'] || '').match(/\d+/);
  if (explicit) return explicit[0];
  for (const k of Object.keys(kv)) {
    const m = String(kv[k]).match(/[?&]id=(\d+)/i);
    if (m && /sharepoint|记录/.test(k + kv[k])) return m[1];
  }
  return null;
}

// ---- main entry ----
// parseBody(text, { from, batchTag }) ->
//   { ok:true,  record }                          — qualified, one staging record
//   { ok:false, guardMatched:false, reason }      — not a notification body (fallback to attachments)
//   { ok:false, guardMatched:true,  reason }      — notification body but broken (archive as parse_error + alert)
export function parseBody(text, opts) {
  const from = (opts && opts.from) || '';
  const batchTag = (opts && opts.batchTag) || '';
  const kv = extractKeyValues(text);

  const missing = REQUIRED_KEYS.filter((k) => !(k in kv));
  if (missing.length > 0) {
    return { ok: false, guardMatched: false, reason: 'schema-not-matched: missing ' + missing.join(',') };
  }

  // L3: 执行时间 must parse; Title is NEVER used as a time source (L2).
  const execTime = parseTsBody(kv['执行时间']);
  if (!execTime) {
    return { ok: false, guardMatched: true, reason: 'bad-执行时间: ' + kv['执行时间'] };
  }
  const doneTime = parseTsBody(kv['完成时间']); // optional-but-expected; null tolerated with error_msg

  const creator = (kv['创建人'] || '').trim();
  const recId = extractRecordId(kv);
  const tags = ['SRC=BODY'];
  if (recId) tags.push('SP_REC=' + recId);

  const record = {
    Title: kv['title'], // stored as-is (L2)
    执行时间: execTime,
    完成时间: doneTime,
    总数: toInt(kv['总数']),
    成功: toInt(kv['成功']),
    跳过: toInt(kv['跳过']),
    失败: toInt(kv['失败']),
    附件Excel表格: toBool(kv['附件excel表格']),
    任务完成通知邮件: toBool(kv['任务完成通知邮件']),
    标签: tags.join(';'),
    CreatedBy: creator || from, // D2: body 创建人; fallback sender
    ModifiedBy: creator || from,
    source_email: from,
    source_filename: '(email_body)', // channel marker (design doc §5.4)
    batch_tag: batchTag,
    status: 'pending'
  };
  if (!doneTime) record.error_msg = 'doneTime-unparsed';

  // 耗时分钟 preview (main table column is GENERATED — never promoted from here)
  const mins = kv['耗时（分钟）'] || kv['耗时(分钟)'] || kv['耗时分钟'];
  if (mins !== undefined) {
    record['耗时分钟'] = toInt(mins);
  } else if (doneTime) {
    record['耗时分钟'] = Math.round((new Date(doneTime).getTime() - new Date(execTime).getTime()) / 60000);
  }

  return { ok: true, record };
}
