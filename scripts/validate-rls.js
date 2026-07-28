#!/usr/bin/env node
/**
 * AutoPrint RLS 安全验证脚本（零依赖版）
 * 使用 Node 18+ 内置 fetch 直连 Supabase REST API，无需 npm install。
 *
 * 核心检查：匿名用户（anon）是否真能读到受保护表的数据。
 *   - anon 能读到任何行  -> RLS 疑似失效 -> 严重（CI 失败）
 *   - anon 被拒（401/403 或 200 空结果）-> RLS 生效 -> 通过
 *
 * 说明：原来的脚本依赖多个并不存在的 RPC（get_all_policies / get_all_profiles /
 * approve_user 等）和 profiles 表，且用 service_role 去“验证 RLS 是否启用”
 * （service_role 本身绕过 RLS，永远成功），属于假绿。本版只做可被真实证伪的检查。
 *
 * 用法：node scripts/validate-rls.js
 * 环境变量（均有内置默认值，可被仓库 Secrets 覆盖）：
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://uvqjtvonxwsmhntnyest.supabase.co').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2cWp0dm9ueHdzbWhudG55ZXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzE5ODMsImV4cCI6MjA5NzQ0Nzk4M30.mBlPq2xNuHROdT39FQ6cw9t8U6IqrjyWl8IqbRo8QOE';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const COLOR = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(level, msg) {
  const prefix = {
    info: COLOR.blue,
    warn: COLOR.yellow,
    error: COLOR.red,
    pass: COLOR.green,
    fail: COLOR.red,
  }[level] || '';
  console.log(`${prefix}[${level.toUpperCase()}]${COLOR.reset} ${msg}`);
}

// 受保护且含业务数据的表：匿名用户绝不应读到任何行
const PROTECTED_TABLES = ['ReportAutoPrint', 'email_raw_archive'];

let critical = 0;
let warning = 0;
let passed = 0;

async function anonSelect(table, limit = 1) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  let rows = [];
  try {
    const body = await res.json();
    rows = Array.isArray(body) ? body : [];
  } catch (_) {
    // 非 JSON 响应（如 401 页面）忽略
  }
  return { status: res.status, rows };
}

async function adminSelect(table, limit = 1) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  let rows = [];
  try {
    const body = await res.json();
    rows = Array.isArray(body) ? body : [];
  } catch (_) {
    // ignore
  }
  return { status: res.status, rows };
}

async function checkAnonCannotRead() {
  log('info', '检查 1: 匿名用户读取受保护表必须被拒（RLS 核心验证）...');
  for (const table of PROTECTED_TABLES) {
    const { status, rows } = await anonSelect(table);
    if (status === 200 && rows.length > 0) {
      log('fail', `  表 ${table}：匿名用户读到了 ${rows.length} 行数据！RLS 疑似未启用或被放开。`);
      critical += 1;
    } else if (status === 401 || status === 403 || (status === 200 && rows.length === 0)) {
      log('pass', `  表 ${table}：匿名用户无法读取数据（HTTP ${status}），RLS 生效。`);
      passed += 1;
    } else {
      log('warn', `  表 ${table}：匿名查询返回 HTTP ${status}，请人工确认 RLS 状态。`);
      warning += 1;
    }
  }
}

async function checkAdminCanRead() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    log('warn', '检查 2: 未配置 SERVICE_ROLE_KEY，跳过管理员可读性自检（不影响 RLS 判定）。');
    warning += 1;
    return;
  }
  log('info', '检查 2: service_role 可读受保护表（自检表存在且可访问）...');
  for (const table of PROTECTED_TABLES) {
    const { status, rows } = await adminSelect(table);
    if (status === 200) {
      log('pass', `  表 ${table}：service_role 可读（${rows.length} 行），表存在且可访问。`);
      passed += 1;
    } else {
      log('warn', `  表 ${table}：service_role 读取返回 HTTP ${status}。`);
      warning += 1;
    }
  }
}

async function main() {
  console.log(`${COLOR.cyan}========================================`);
  console.log('  AutoPrint RLS 安全验证工具（零依赖版）');
  console.log(`${COLOR.cyan}========================================${COLOR.reset}\n`);

  await checkAnonCannotRead();
  await checkAdminCanRead();

  console.log(`\n${COLOR.cyan}========================================`);
  console.log('  验证总结');
  console.log(`${COLOR.cyan}========================================${COLOR.reset}`);
  console.log(`${COLOR.green}通过: ${passed}${COLOR.reset}`);
  console.log(`${COLOR.yellow}警告: ${warning}${COLOR.reset}`);
  console.log(`${COLOR.red}严重: ${critical}${COLOR.reset}`);

  if (critical > 0) {
    console.log(`\n${COLOR.red}❌ 验证失败：发现 ${critical} 个严重 RLS 安全问题。${COLOR.reset}\n`);
    process.exit(1);
  }
  console.log(`\n${COLOR.green}✅ RLS 安全检查通过（匿名用户无法读取受保护表）。${COLOR.reset}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${COLOR.red}脚本执行失败: ${err.message}${COLOR.reset}`);
  process.exit(1);
});
