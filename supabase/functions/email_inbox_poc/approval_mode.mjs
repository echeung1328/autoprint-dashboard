// approval_mode.mjs — v2.1.0 (issue #65)
// Pure decision/validation logic for switchable approval mode.
// No Deno / network dependencies so it can be unit-tested with plain node.
//
// Design (user decisions #65):
//   - global mode: 'manual' | 'auto' (default manual)
//   - auto = validate then promote, NOT blind straight-through
//   - validations: numeric conservation / site validity / required fields
//   - same-day-same-site dedup is handled by promote_staging_ids RPC (supersede/upsert),
//     so validation here deliberately does NOT block duplicates (would break resend flow).

export const ALLOWED_SITES = ['北京', '上海'];

// Validate a batch of staging rows. Returns { ok, errors }.
// Each error: { id, reasons: string[] }
export function validateRows(rows) {
  const errors = [];
  for (const r of rows) {
    const reasons = [];
    const total = num(r['总数']);
    const ok = num(r['成功']);
    const skip = num(r['跳过']);
    const fail = num(r['失败']);

    // rule 1: numeric conservation (only when all four are present numbers)
    if ([total, ok, skip, fail].every((n) => n !== null)) {
      if (total !== ok + skip + fail) {
        reasons.push('数值不守恒: 总数' + total + ' != 成功' + ok + '+跳过' + skip + '+失败' + fail);
      }
    } else {
      reasons.push('数值字段缺失或非数字');
    }

    // rule 2: site validity (missing site defaults to 北京 in ingest, so blank is suspicious)
    const site = r.site;
    if (site !== undefined && site !== null && site !== '' && !ALLOWED_SITES.includes(site)) {
      reasons.push('站点非法: ' + site);
    }

    // rule 3: required fields
    if (!r['执行时间']) reasons.push('执行时间缺失');
    if (!r['Title'] && !r.title) reasons.push('Title 缺失');

    if (reasons.length) errors.push({ id: r.id, reasons });
  }
  return { ok: errors.length === 0, errors };
}

// Interpret raw mode value from DB/config. Anything unexpected falls back to 'manual' (fail-safe).
export function resolveMode(raw) {
  return raw === 'auto' ? 'auto' : 'manual';
}

// Decide whether ingestion should auto-promote (true) or send approval email (false).
export function shouldAutoPromote(mode) {
  return resolveMode(mode) === 'auto';
}

// Build the audit summary line reused by both auto-promote audit and result email.
export function buildSummaryLines(inserted) {
  return inserted.map((r) =>
    '站点 ' + (r.site || '北京') + ' · ' +
    '业务日 ' + bjDay(r['执行时间']) + ' · ' + (r.Title || r.title || '(无标题)') +
    ' · 总数 ' + (r['总数'] ?? '?') + ' 成功 ' + (r['成功'] ?? '?') +
    ' 跳过 ' + (r['跳过'] ?? '?') + ' 失败 ' + (r['失败'] ?? '?') +
    ' · 来源 ' + (r.source_filename === '(email_body)' ? '邮件正文' : (r.source_filename || '?'))
  );
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bjDay(iso) {
  if (!iso) return '?';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '?';
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
