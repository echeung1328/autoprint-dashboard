// ui_logic.test.mjs — Run: node ui_logic.test.mjs (issue #49/#50, v2.2.0)
// 从 index.html 提取 AL_UI_PURE 标记块并直接求值，测试 T4/T5 前端纯逻辑。
// 单一代码源：被测函数就是从生产 index.html 里抠出来的原文，不存在测试副本漂移。
// 用法：index.html 位于仓库根；本文件在 supabase/functions/access_links/。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const html = readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

const match = html.match(/\/\/ === AL_UI_PURE_START[\s\S]*?\n([\s\S]*?)\n\/\/ === AL_UI_PURE_END ===/);
if (!match) {
  console.error('FAIL — 未能在 index.html 中找到 AL_UI_PURE 标记块');
  process.exit(1);
}
const pureSrc = match[1];

let sandbox;
try {
  // 用函数构造器把纯逻辑块注入局部作用域并返回被测函数
  sandbox = new Function(pureSrc + '\nreturn { alParseShareToken, alIsAdminLinksPath, alClampDays, alLinkStatus, AL_STATUS_META, alShareErrorView, alShareKpis, alPerOrderSeconds, alEscape };')();
} catch (e) {
  console.error('FAIL — 纯逻辑块求值失败: ' + e.message);
  process.exit(1);
}

let failed = 0, total = 0;
function check(cond, desc, extra) {
  total++;
  if (cond) console.log('PASS — ' + desc);
  else { console.error('FAIL — ' + desc + (extra !== undefined ? ' | got=' + JSON.stringify(extra) : '')); failed++; }
}

const T = 'A'.repeat(43); // 模拟 43 位 base64url token

// ---- 路由解析 (T4) ----
check(sandbox.alParseShareToken('/share/' + T) === T, '[关键] /share/<token> 解析出 token');
check(sandbox.alParseShareToken('/share/' + T + '/') === T, '尾斜杠兼容');
check(sandbox.alParseShareToken('/share/' + T + '/index.html') === T, 'index.html 后缀兼容');
check(sandbox.alParseShareToken('/') === null, '首页不误判为分享页');
check(sandbox.alParseShareToken('/dashboard') === null, '其他路径不误判');
check(sandbox.alParseShareToken('/share/abc') === null, '过短 token 被拒（防误匹配）');
check(sandbox.alParseShareToken('') === null, '空路径返回 null');
check(sandbox.alParseShareToken(null) === null, '非字符串返回 null');

// ---- 管理页路由 (T5) ----
check(sandbox.alIsAdminLinksPath('/admin/access-links') === true, '识别 /admin/access-links');
check(sandbox.alIsAdminLinksPath('/admin/access-links/') === true, '管理页尾斜杠兼容');
check(sandbox.alIsAdminLinksPath('/admin/access-links/index.html') === true, '管理页 index.html 后缀兼容');
check(sandbox.alIsAdminLinksPath('/admin') === false, '/admin 不误判为链接管理页');
check(sandbox.alIsAdminLinksPath('/') === false, '首页不误判为管理页');

// ---- 有效期钳制 (T5，与后端对齐) ----
check(sandbox.alClampDays(30) === 30, '合法天数原样返回');
check(sandbox.alClampDays(400) === 365, '[关键] 超上限钳制到 365');
check(sandbox.alClampDays(0) === 1, '下界钳制到 1');
check(sandbox.alClampDays(-5) === 1, '负数钳制到 1');
check(sandbox.alClampDays('abc') === 30, '非数字回退默认 30');
check(sandbox.alClampDays('90') === 90, '数字字符串可解析');
check(sandbox.alClampDays(7.9) === 7, '小数向下取整');

// ---- 状态判定 (T5，stopped 优先于 expired) ----
const now = Date.parse('2026-11-25T00:00:00Z');
check(sandbox.alLinkStatus({ status: 'active', expires_at: '2099-01-01T00:00:00Z' }, now) === 'active', '未过期 active 显示生效中');
check(sandbox.alLinkStatus({ status: 'stopped', expires_at: '2099-01-01T00:00:00Z' }, now) === 'stopped', 'stopped 显示已停止');
check(sandbox.alLinkStatus({ status: 'active', expires_at: '2020-01-01T00:00:00Z' }, now) === 'expired', '过期 active 显示已过期');
check(sandbox.alLinkStatus({ status: 'stopped', expires_at: '2020-01-01T00:00:00Z' }, now) === 'stopped', '[关键] stopped 优先于 expired');
check(sandbox.alLinkStatus({ status: 'weird', expires_at: '2099-01-01T00:00:00Z' }, now) === 'unknown', '未知状态归为 unknown');
check(sandbox.alLinkStatus(null, now) === 'unknown', '空链接归为 unknown');
check(sandbox.AL_STATUS_META.stopped.label === '已停止', '状态文案映射存在');

// ---- 分享失败视图 (T4) ----
check(sandbox.alShareErrorView(403, '链接已停止访问').title === '链接已停止访问', '[关键] 停止文案透出');
check(sandbox.alShareErrorView(403, '链接已过期').title === '链接已过期', '[关键] 过期文案透出');
check(sandbox.alShareErrorView(403, '链接不存在或已删除').title === '链接不可用', '不存在的链接友好提示');
check(sandbox.alShareErrorView(0, '网络错误').title === '暂时无法加载', '网络错误友好提示');
check(sandbox.alShareErrorView(500, 'internal err').title === '暂时无法加载', '服务端错误友好提示');
check(sandbox.alShareErrorView(404, '').title === '无法访问', '其他状态码兜底');

// ---- KPI 汇总 (T4) ----
const rows = [
  { 'site': '北京', '总数': 10, '成功': 8, '跳过': 1, '失败': 1, '耗时分钟': 13.08 },
  { 'site': '上海', '总数': 20, '成功': 18, '跳过': 1, '失败': 1, '耗时分钟': 12.0 }
];
const k = sandbox.alShareKpis(rows);
check(k.total === 30, '总数求和');
check(k.success === 26, '成功求和');
check(k.skipped === 2, '跳过求和');
check(k.fail === 2, '失败求和');
check(k.avgDuration === 12.5, '[关键] 平均耗时 round 到 1 位（13.08+12)/2=12.54→12.5');
check(k.count === 2, '行数统计');
const kEmpty = sandbox.alShareKpis([]);
check(kEmpty.total === 0 && kEmpty.avgDuration === 0 && kEmpty.count === 0, '空数据不崩且归零');
const kNull = sandbox.alShareKpis([{ '总数': null, '耗时分钟': 'abc' }]);
check(kNull.total === 0 && kNull.avgDuration === 0, '脏数据（null/非数字）安全归零');

// ---- 每报销单平均耗时（秒）(v2.3.0 #70) ----
const pos = sandbox.alPerOrderSeconds({ '耗时分钟': 58.5, '成功': 128 });
check(pos === 27.4, '[关键] 58.5分/128单 = 27.4秒（×60÷成功，round 1位）', pos);
check(sandbox.alPerOrderSeconds({ '耗时分钟': 12, '成功': 18 }) === 40, '12分/18单 = 40秒（整除）', sandbox.alPerOrderSeconds({ '耗时分钟': 12, '成功': 18 }));
check(sandbox.alPerOrderSeconds({ '耗时分钟': 13.08, '成功': 8 }) === 98.1, '13.08分/8单 = 98.1秒', sandbox.alPerOrderSeconds({ '耗时分钟': 13.08, '成功': 8 }));
check(sandbox.alPerOrderSeconds({ '耗时分钟': 10, '成功': 0 }) === null, '[关键] 成功=0 返回 null（防除零）');
check(sandbox.alPerOrderSeconds({ '耗时分钟': 10, '成功': -3 }) === null, '成功为负返回 null');
check(sandbox.alPerOrderSeconds({ '耗时分钟': 10, '成功': 'abc' }) === null, '成功非数字返回 null');
check(sandbox.alPerOrderSeconds({ '耗时分钟': 'abc', '成功': 10 }) === null, '耗时非数字返回 null');
check(sandbox.alPerOrderSeconds({ '耗时分钟': 10 }) === null, '缺成功字段返回 null');
check(sandbox.alPerOrderSeconds(null) === null, '空行返回 null');
check(sandbox.alPerOrderSeconds({ '耗时分钟': null, '成功': 5 }) === null, '耗时 null 返回 null');
check(sandbox.alPerOrderSeconds({ '耗时分钟': 1, '成功': 3 }) === 20, '1分/3单 = 20秒（除不尽 round）', sandbox.alPerOrderSeconds({ '耗时分钟': 1, '成功': 3 }));

// ---- HTML 转义 (T4/T5 安全) ----
check(sandbox.alEscape('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;', '[关键] 危险标签被转义');
check(sandbox.alEscape('a&b"c\'d') === 'a&amp;b&quot;c&#39;d', '特殊字符转义');
check(sandbox.alEscape(null) === '', 'null 转空串');

console.log('\n--- ' + (total - failed) + '/' + total + ' passed ---');
process.exit(failed === 0 ? 0 : 1);
