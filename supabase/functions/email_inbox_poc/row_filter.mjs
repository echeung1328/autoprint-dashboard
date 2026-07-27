// row_filter.mjs — extracted, testable junk-filter for email ingestion rows (SOP §5.3.4)
//
// Returns TRUE when a parsed row's Title should be SKIPPED (not ingested):
//   - empty / whitespace-only title
//   - title is literally a column-name row ("执行时间" / "完成时间")
//
// IMPORTANT (regression guard, see issue #26):
//   Never add a regex that drops business titles such as /^autoprint-/i.
//   That rule previously caused silent DATA LOSS and must not return.
//   To extend skip conditions, add an explicit, narrow allow-list entry below
//   AND add a corresponding assertion in row_filter.test.mjs.

export function shouldSkipTitle(title) {
  if (title === null || title === undefined) return true;
  const t = String(title).trim();
  if (t === '') return true;
  if (t === '执行时间' || t === '完成时间') return true;
  return false;
}
