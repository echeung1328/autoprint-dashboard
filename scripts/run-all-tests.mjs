#!/usr/bin/env node
// run-all-tests.mjs — AutoPrint 统一测试入口 (issue #66, Sprint 6)
//
// 一键运行 supabase/functions/**/*.test.mjs 全部套件，解析 PASS/FAIL 行，
// 产出 JUnit XML + JSON 汇总到 test-results/，供 GitHub Actions Checks 逐用例展示。
//
// 用法：
//   node scripts/run-all-tests.mjs              # 跑全部套件，写入 test-results/
//   node scripts/run-all-tests.mjs --list       # 仅列出发现的套件
//   node scripts/run-all-tests.mjs --filter abc # 仅跑文件路径含 abc 的套件
//   node scripts/run-all-tests.mjs --no-write   # 不写文件（dry-run）
//
// 设计约束（贡献指南 7.1 / 7.8）：
//   - 零额外依赖：Node 原生 fs/child_process，不引入 Jest/Mocha
//   - 兼容项目现存 4 种输出风格：'  PASS label' / 'PASS — desc' / 'PASS name' / 'N/N PASS'
//   - 套件声明 SKIP（依赖缺失等）必须显式标红，禁止「没跑 = 通过」（2026-11-27 CI 告警教训）
//   - 退出码反映真实结果：任一套件非零退出或存在 FAIL 用例 → exit 1
//   - 用例耗时按套件耗时均摊（JUnit 需 time 字段），JSON 中标注为估算值

import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const resultsDir = path.join(repoRoot, 'test-results');
const functionsDir = path.join(repoRoot, 'supabase', 'functions');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const filterArg = (() => {
  const i = args.indexOf('--filter');
  return i >= 0 && args[i + 1] ? args[i + 1] : '';
})();

function discoverTests(dir, base) {
  const found = [];
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return found;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      found.push(...discoverTests(full, base));
    } else if (e.isFile() && e.name.endsWith('.test.mjs')) {
      const rel = path.relative(base, full).split(path.sep).join('/');
      if (!filterArg || rel.includes(filterArg)) found.push(rel);
    }
  }
  return found.sort();
}

function parseOutput(text) {
  const cases = [];
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    // 匹配 PASS/FAIL 行：允许前导空格，允许 '—' / '-' 分隔符
    const m = line.match(/^\s*(PASS|FAIL)\s+(?:[—-]\s*)?(.+?)\s*$/);
    if (!m) continue;
    const status = m[1] === 'PASS' ? 'passed' : 'failed';
    let name = m[2].trim();
    // FAIL 行常带 ' | 预期=... 实际=...'，保留为用例名的一部分便于复核
    cases.push({ name, status });
  }
  return cases;
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtSeconds(ms) {
  return (Math.max(0, ms) / 1000).toFixed(3);
}

function buildXml(suites, totals) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<testsuites name="AutoPrint" tests="${totals.tests}" failures="${totals.failed}" errors="0" time="${fmtSeconds(totals.durationMs)}">`);
  for (const s of suites) {
    lines.push(`  <testsuite name="${xmlEscape(s.name)}" tests="${s.tests}" failures="${s.failed}" errors="0" skipped="0" time="${fmtSeconds(s.durationMs)}" timestamp="${xmlEscape(s.startedAt)}">`);
    for (const c of s.cases) {
      const time = fmtSeconds(s.tests ? s.durationMs / s.tests : 0);
      lines.push(`    <testcase name="${xmlEscape(c.name)}" classname="${xmlEscape(s.name)}" time="${time}">`);
      if (c.status === 'failed') {
        lines.push(`      <failure message="${xmlEscape(c.name)}" type="assertion">${xmlEscape(c.name)}</failure>`);
      }
      lines.push('    </testcase>');
    }
    lines.push('  </testsuite>');
  }
  lines.push('</testsuites>');
  return lines.join('\n') + '\n';
}

function main() {
  const tests = discoverTests(functionsDir, repoRoot);
  if (has('--list')) {
    console.log(`发现 ${tests.length} 个测试套件:`);
    tests.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    return 0;
  }
  if (!tests.length) {
    console.error('未发现任何 *.test.mjs 测试套件，请检查目录: ' + functionsDir);
    return 1;
  }

  const suites = [];
  console.log(`AutoPrint 统一测试入口 — 共 ${tests.length} 个套件\n`);
  for (const rel of tests) {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [rel], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 120000,
      env: process.env
    });
    const durationMs = Date.now() - t0;
    const output = ((r.stdout || '') + '\n' + (r.stderr || ''));
    let cases = parseOutput(output);

    // 套件异常退出但没有解析到 FAIL 行时，补一条失败用例，避免 JUnit 漏报
    if (r.status !== 0 && !cases.some((c) => c.status === 'failed')) {
      cases.push({ name: `[套件异常] 进程退出码=${r.status} signal=${r.signal || 'none'}`, status: 'failed' });
    }
    // 套件声明 SKIP（如 esbuild 缺失）即使 exit 0 也必须标红，禁止静默跳过被当成通过
    const skipNote = output.match(/SKIP\s+[—-]\s*([^\r\n]+)/);
    if (skipNote) {
      cases.push({ name: `[套件跳过] ${skipNote[1].trim()}`, status: 'failed' });
    }
    // 套件正常退出但一行 PASS/FAIL 都没解析到时，提示解析口径可能漂移
    if (r.status === 0 && cases.length === 0) {
      cases.push({ name: '[解析告警] 未识别到 PASS/FAIL 用例行，请检查输出格式是否变更', status: 'failed' });
    }

    const failed = cases.filter((c) => c.status === 'failed').length;
    suites.push({
      name: rel,
      startedAt,
      durationMs,
      exitCode: r.status,
      cases,
      tests: cases.length,
      failed
    });
    console.log(`  ${failed ? 'FAIL' : ' OK '} ${rel.padEnd(58)} ${String(cases.length).padStart(3)} 项 / ${durationMs}ms${failed ? ` (${failed} 失败)` : ''}`);
  }

  const totals = {
    suites: suites.length,
    tests: suites.reduce((a, s) => a + s.tests, 0),
    failed: suites.reduce((a, s) => a + s.failed, 0),
    durationMs: suites.reduce((a, s) => a + s.durationMs, 0)
  };
  totals.passed = totals.tests - totals.failed;

  console.log(`\n合计: ${totals.suites} 套件 / ${totals.tests} 项 (${totals.passed} PASS / ${totals.failed} FAIL) / ${totals.durationMs}ms`);

  if (!has('--no-write')) {
    mkdirSync(resultsDir, { recursive: true });
    const xmlPath = path.join(resultsDir, 'junit.xml');
    const jsonPath = path.join(resultsDir, 'summary.json');
    writeFileSync(xmlPath, buildXml(suites, totals), 'utf8');
    writeFileSync(jsonPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      nodeVersion: process.version,
      note: 'testcase time = suite duration / case count (估算值，非单项精确耗时)',
      totals,
      suites: suites.map(({ cases, ...rest }) => ({ ...rest, cases }))
    }, null, 2) + '\n', 'utf8');
    console.log(`已写入: ${path.relative(repoRoot, xmlPath)}`);
    console.log(`已写入: ${path.relative(repoRoot, jsonPath)}`);
  }

  return totals.failed > 0 ? 1 : 0;
}

try {
  process.exit(main());
} catch (e) {
  console.error('统一测试入口异常: ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
}
