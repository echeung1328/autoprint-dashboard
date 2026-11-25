// access_token.test.mjs — 单元测试 (issue #45 T2/T6)
// 运行：node access_token.test.mjs
// 按贡献指南 §7 V1.1：关键用例 [关键] 标记；输入/预期/实际可见。

import {
  generateToken, isValidTokenFormat, clampLifetimeDays,
  computeExpiresAt, validateLink, reasonMessage, tokenPrefix,
  MAX_LIFETIME_DAYS
} from './access_token.mjs';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label} | 预期=${JSON.stringify(expected)} 实际=${JSON.stringify(actual)}`); }
}

console.log('=== access_token 单元测试 ===');

// [关键] token 生成
const t1 = generateToken();
check('[关键] token 长度=43', t1.length, 43);
check('[关键] token 格式合法', isValidTokenFormat(t1), true);
check('[关键] token 唯一（1000 次无碰撞）', new Set(Array.from({length:1000}, () => generateToken())).size, 1000);
check('token 不含 = 填充', t1.includes('='), false);

// 格式校验边界
check('短 token 拒绝', isValidTokenFormat('abc'), false);
check('含非法字符拒绝', isValidTokenFormat('A'.repeat(42) + '!'), false);
check('非字符串拒绝', isValidTokenFormat(null), false);
check('43位合法字符通过', isValidTokenFormat('A'.repeat(43)), true);

// [关键] 365 天上限
check('[关键] clamp 400天→365', clampLifetimeDays(400), MAX_LIFETIME_DAYS);
check('clamp 1天→1', clampLifetimeDays(1), 1);
check('clamp 0天→1', clampLifetimeDays(0), 1);
check('clamp 负数→1', clampLifetimeDays(-5), 1);
check('clamp 小数→向下取整', clampLifetimeDays(30.9), 30);
check('clamp 非法值→1', clampLifetimeDays('abc'), 1);
check('[关键] computeExpiresAt 365天', computeExpiresAt(0, 400), new Date(365*86400000).toISOString());

// [关键] 链接校验优先级
const NOW = Date.parse('2026-11-25T00:00:00Z');
const active = { status: 'active', expires_at: '2026-12-25T00:00:00Z' };
const stopped = { status: 'stopped', expires_at: '2026-12-25T00:00:00Z' };
const expired = { status: 'active', expires_at: '2026-11-24T00:00:00Z' };
const stoppedExpired = { status: 'stopped', expires_at: '2026-11-24T00:00:00Z' };
check('[关键] 有效链接通过', validateLink(active, NOW), { ok: true, reason: null });
check('[关键] 已停止拒绝', validateLink(stopped, NOW), { ok: false, reason: 'stopped' });
check('[关键] 已过期拒绝', validateLink(expired, NOW), { ok: false, reason: 'expired' });
check('[关键] stopped 优先于 expired', validateLink(stoppedExpired, NOW), { ok: false, reason: 'stopped' });
check('不存在拒绝', validateLink(null, NOW), { ok: false, reason: 'not_found' });
check('异常状态拒绝', validateLink({ status: 'weird', expires_at: '2027-01-01T00:00:00Z' }, NOW), { ok: false, reason: 'invalid_status' });
check('边界：恰好过期时刻仍有效', validateLink({status:'active',expires_at:'2026-11-25T00:00:00Z'}, NOW), { ok: true, reason: null });
check('非法日期按过期处理', validateLink({status:'active',expires_at:'bad'}, NOW), { ok: false, reason: 'expired' });

// 提示文案 & 审计前缀
check('停止文案', reasonMessage('stopped'), '链接已停止访问');
check('过期文案', reasonMessage('expired'), '链接已过期');
check('未知原因兜底', reasonMessage('xxx'), '链接不可用');
check('[关键] token_prefix 仅8位', tokenPrefix(t1), t1.slice(0,8));
check('空 token 前缀为空', tokenPrefix(null), '');

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
