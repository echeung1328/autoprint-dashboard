// row_filter.test.mjs — lightweight regression test for the ingestion junk filter.
// Run with: node row_filter.test.mjs
import { shouldSkipTitle } from './row_filter.mjs';

const cases = [
  // [input, expectedSkip, description]
  ['AutoPrint-2026-07-22T01:30:00Z', false, 'regression #26: AutoPrint- prefixed business title must NOT be dropped'],
  ['autoprint-foo', false, 'lowercase autoprint- variant must NOT be dropped'],
  ['AutoPrint-2026-07-21 09:30', false, 'space-form AutoPrint title must NOT be dropped'],
  ['每日报销单据打印', false, 'normal business title must NOT be dropped'],
  ['', true, 'empty string is skipped'],
  ['   ', true, 'whitespace-only is skipped'],
  [null, true, 'null is skipped'],
  [undefined, true, 'undefined is skipped'],
  ['执行时间', true, 'column-name row "执行时间" is skipped'],
  ['完成时间', true, 'column-name row "完成时间" is skipped'],
];

let failed = 0;
for (const [input, expected, desc] of cases) {
  const got = shouldSkipTitle(input);
  if (got !== expected) {
    console.error('FAIL — ' + desc + ' | input=' + JSON.stringify(input) + ' expected=' + expected + ' got=' + got);
    failed++;
  } else {
    console.log('PASS — ' + desc);
  }
}

if (failed > 0) {
  console.error('\n' + failed + ' regression test(s) FAILED');
  process.exit(1);
}
console.log('\nAll ' + cases.length + ' regression tests passed');
