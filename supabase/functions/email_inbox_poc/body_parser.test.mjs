// body_parser.test.mjs — regression tests for the email BODY channel parser (issue #34).
// Run with: node body_parser.test.mjs
import { parseBody, parseTsBody, extractKeyValues } from './body_parser.mjs';

const SAMPLE = `创建人：张怀忠(Zhang Huaizhong 昆仑联通)
邮箱：zhang.hz@comlan.com
Title：AutoPrint-2026-07-29 09:30
执行时间：2026-07-29 09:30:00
总数：6
成功：6
跳过：0
失败：0
完成时间：2026-07-29 09:30:54
附件Excel表格：TRUE
任务完成通知邮件：TRUE
耗时（分钟）：1
查看 SharePoint 记录：https://comlanoffice.sharepoint.com/sites/x/Lists/y/DispForm.aspx?ID=139
记录ID：139`;

let failed = 0;
let total = 0;
function check(cond, desc, extra) {
  total++;
  if (cond) console.log('PASS — ' + desc);
  else {
    console.error('FAIL — ' + desc + (extra !== undefined ? ' | got=' + JSON.stringify(extra) : ''));
    failed++;
  }
}

// ---- 1. full sample happy path ----
{
  const r = parseBody(SAMPLE, { from: 'zhang.hz@comlan.com', batchTag: 'EMAIL_202607' });
  check(r.ok === true, 'full sample: qualifies', r);
  const rec = r.record;
  check(rec.Title === 'AutoPrint-2026-07-29 09:30', 'Title stored as-is', rec.Title);
  check(rec['执行时间'] === '2026-07-29T09:30:00+08:00', 'L1: 执行时间 -> wall clock +08:00', rec['执行时间']);
  check(
    new Date(rec['执行时间']).toISOString() === '2026-07-29T01:30:00.000Z',
    'L1: UTC equivalent is 01:30Z (no double +8)',
    new Date(rec['执行时间']).toISOString()
  );
  check(rec['完成时间'] === '2026-07-29T09:30:54+08:00', '完成时间 parsed', rec['完成时间']);
  check(rec.总数 === 6 && rec.成功 === 6 && rec.跳过 === 0 && rec.失败 === 0, 'counters parsed as int');
  check(rec['附件Excel表格'] === true && rec['任务完成通知邮件'] === true, 'TRUE -> boolean true');
  check(rec['耗时分钟'] === 1, '耗时（分钟）full-width parens mapped', rec['耗时分钟']);
  check(rec.标签 === 'SRC=BODY;SP_REC=139', 'D3: 标签 = SRC=BODY;SP_REC=139', rec.标签);
  check(rec.CreatedBy === '张怀忠(Zhang Huaizhong 昆仑联通)', 'D2: CreatedBy = body 创建人', rec.CreatedBy);
  check(rec.source_filename === '(email_body)', 'channel marker (email_body)', rec.source_filename);
  check(rec.status === 'pending', 'status pending');
}

// ---- 2. L2: random AI-generated Titles never block parsing ----
{
  const body = SAMPLE.replace('Title：AutoPrint-2026-07-29 09:30', 'Title：每日报销单据打印');
  const r = parseBody(body, { from: 'a@b.c' });
  check(r.ok && r.record.Title === '每日报销单据打印', 'L2: random Chinese Title stored as-is', r.record && r.record.Title);
}
{
  // Title contains a Z-suffixed time — must be IGNORED as a time source
  const body = SAMPLE.replace('Title：AutoPrint-2026-07-29 09:30', 'Title：AutoPrint-2026-07-28T01:30:00Z');
  const r = parseBody(body, { from: 'a@b.c' });
  check(
    r.ok && r.record['执行时间'] === '2026-07-29T09:30:00+08:00',
    'L2: Z inside Title ignored; time comes from 执行时间 key only',
    r.record && r.record['执行时间']
  );
}

// ---- 3. guard: non-notification bodies fall through ----
{
  const r = parseBody('你好，请查收附件。\n\n此致\n张怀忠', { from: 'a@b.c' });
  check(r.ok === false && r.guardMatched === false, 'guard: plain text body -> fallback (guardMatched=false)', r);
}
{
  const body = SAMPLE.split('\n').filter((l) => !l.startsWith('执行时间')).join('\n');
  const r = parseBody(body, { from: 'a@b.c' });
  check(r.ok === false && r.guardMatched === false, 'guard: missing 执行时间 key -> schema not matched', r);
}
{
  const r = parseBody('', { from: 'a@b.c' });
  check(r.ok === false && r.guardMatched === false, 'guard: empty body -> fallback', r);
}

// ---- 4. L3: guard matched but 执行时间 unparseable -> parse_error path ----
{
  const body = SAMPLE.replace('执行时间：2026-07-29 09:30:00', '执行时间：不是时间');
  const r = parseBody(body, { from: 'a@b.c' });
  check(r.ok === false && r.guardMatched === true, 'L3: bad 执行时间 -> guardMatched=true (parse_error)', r);
}

// ---- 5. 总数=0 is legal ----
{
  const body = SAMPLE.replace('总数：6', '总数：0').replace('成功：6', '成功：0');
  const r = parseBody(body, { from: 'a@b.c' });
  check(r.ok && r.record.总数 === 0 && r.record.成功 === 0, '总数=0 legal (no-print day)', r.record && r.record.总数);
}

// ---- 6. half-width colons + slash dates ----
{
  const body = [
    '创建人: 张三',
    'Title: 测试',
    '执行时间: 2026/7/29 9:30',
    '总数: 3',
    '成功: 2',
    '跳过: 1',
    '失败: 0',
    '完成时间: 2026/7/29 9:31',
    '附件Excel表格: 是',
    '任务完成通知邮件: no'
  ].join('\n');
  const r = parseBody(body, { from: 'a@b.c' });
  check(r.ok === true, 'half-width colons qualify', r);
  check(r.ok && r.record['执行时间'] === '2026-07-29T09:30:00+08:00', 'slash date normalized +08:00', r.record && r.record['执行时间']);
  check(r.ok && r.record['附件Excel表格'] === true && r.record['任务完成通知邮件'] === false, '是/no boolean mapping');
  check(r.ok && r.record.标签 === 'SRC=BODY', 'no 记录ID -> 标签 only SRC=BODY', r.record && r.record.标签);
  check(r.ok && r.record['耗时分钟'] === 1, 'no 耗时 key -> derived from times (1 min)', r.record && r.record['耗时分钟']);
}

// ---- 7. 记录ID fallback from SharePoint URL ----
{
  const body = SAMPLE.split('\n').filter((l) => !l.startsWith('记录ID')).join('\n');
  const r = parseBody(body, { from: 'a@b.c' });
  check(r.ok && r.record.标签 === 'SRC=BODY;SP_REC=139', 'SP_REC extracted from URL &ID=139 when 记录ID missing', r.record && r.record.标签);
}

// ---- 8. parseTsBody unit checks (L1 single-branch, no Z handling) ----
check(parseTsBody('2026-07-29 09:30:00') === '2026-07-29T09:30:00+08:00', 'parseTsBody: space form');
check(parseTsBody('2026年7月29日 9:30') === '2026-07-29T09:30:00+08:00', 'parseTsBody: 年月日 form');
check(parseTsBody('') === null && parseTsBody(null) === null, 'parseTsBody: empty/null -> null');
check(parseTsBody('乱码') === null, 'parseTsBody: garbage -> null');

// ---- 9. extractKeyValues edge: URL after full-width colon kept intact ----
{
  const kv = extractKeyValues('查看 SharePoint 记录：https://x.sharepoint.com/a?ID=7');
  check(kv['查看sharepoint记录'] === 'https://x.sharepoint.com/a?ID=7', 'URL value not split at inner colon', kv);
}

if (failed > 0) {
  console.error('\n' + failed + '/' + total + ' test(s) FAILED');
  process.exit(1);
}
console.log('\nAll ' + total + ' body_parser tests passed');
