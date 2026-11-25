// approval_mode.test.mjs — unit tests for v2.1.0 approval mode logic (issue #65)
// Run with: node approval_mode.test.mjs
import { validateRows, resolveMode, shouldAutoPromote, buildSummaryLines, ALLOWED_SITES } from './approval_mode.mjs';

let failed = 0, total = 0;
function check(cond, desc, extra) {
  total++;
  if (cond) console.log('PASS — ' + desc);
  else { console.error('FAIL — ' + desc + (extra !== undefined ? ' | got=' + JSON.stringify(extra) : '')); failed++; }
}

const good = {
  id: 1, site: '上海', '执行时间': '2026-11-25T08:00:00+08:00', Title: '上海 AutoPrint 2026-11-25 08:00:00',
  '总数': 5, '成功': 4, '跳过': 1, '失败': 0, source_filename: '(email_body)'
};

console.log('--- validateRows: happy path ---');
check(validateRows([good]).ok === true, '合规记录通过校验');
check(validateRows([good, { ...good, id: 2, site: '北京' }]).ok === true, '多站点合规批次通过');
check(ALLOWED_SITES.length === 2, '允许站点数=2');

console.log('--- validateRows: numeric conservation ---');
const badSum = { ...good, '总数': 5, '成功': 4, '跳过': 1, '失败': 1 };
let r = validateRows([badSum]);
check(r.ok === false, '数值不守恒被拒绝');
check(r.errors[0].reasons.some(s => s.includes('数值不守恒')), '错误信息含数值不守恒');

console.log('--- validateRows: site validity ---');
r = validateRows([{ ...good, site: '广州' }]);
check(r.ok === false, '非法站点被拒绝');
check(r.errors[0].reasons.some(s => s.includes('站点非法')), '错误信息含站点非法');
check(validateRows([{ ...good, site: undefined }]).ok === true, '站点缺失放行(入库层已默认北京)');

console.log('--- validateRows: required fields ---');
check(validateRows([{ ...good, '执行时间': '' }]).ok === false, '执行时间缺失被拒绝');
check(validateRows([{ ...good, Title: '', title: '' }]).ok === false, 'Title 缺失被拒绝');
check(validateRows([{ ...good, Title: '', title: '备用标题' }]).ok === true, 'title 备用字段可用');

console.log('--- resolveMode / shouldAutoPromote (fail-safe) ---');
check(resolveMode('auto') === 'auto', 'auto 正确解析');
check(resolveMode('manual') === 'manual', 'manual 正确解析');
check(resolveMode(null) === 'manual', 'null 回退 manual(fail-safe)');
check(resolveMode('bogus') === 'manual', '非法值回退 manual(fail-safe)');
check(shouldAutoPromote('auto') === true, 'auto 触发自动转正');
check(shouldAutoPromote('manual') === false, 'manual 不发自动转正');
check(shouldAutoPromote(undefined) === false, '未配置默认人工');

console.log('--- buildSummaryLines ---');
const lines = buildSummaryLines([good]);
check(lines.length === 1, '摘要行数正确');
check(lines[0].includes('站点 上海') && lines[0].includes('总数 5'), '摘要含站点与数值');
check(lines[0].includes('邮件正文'), '摘要含来源');

console.log('--- 同日同站重复不应在校验层阻断(由 RPC supersede 处理) ---');
check(validateRows([good, { ...good, id: 3 }]).ok === true, '重复行放行交给 RPC 去重');

console.log('\n--- ' + (total - failed) + '/' + total + ' passed ---');
process.exit(failed === 0 ? 0 : 1);
