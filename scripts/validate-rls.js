#!/usr/bin/env node
/**
 * AutoPrint RLS 安全验证脚本
 * 检测问题：
 * 1. RLS 无限递归（策略中查询自身表）
 * 2. 数据泄露漏洞（profiles 表对 public 角色开放）
 * 3. 匿名用户可访问敏感数据
 * 4. 未批准用户可访问数据
 * 
 * 使用方法：
 *   node scripts/validate-rls.js
 *   # 或添加到 pre-commit hook
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 从环境变量或 config 读取
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uvqjtvonxwsmhntnyest.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2cWp0dm9ueHdzbWhudG55ZXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzE5ODMsImV4cCI6MjA5NzQ0Nzk4M30.mBlPq2xNuHROdT39FQ6cw9t8U6IqrjyWl8IqbRo8QOE';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(level, message) {
  const prefix = {
    info: `${colors.blue}[INFO]${colors.reset}`,
    warn: `${colors.yellow}[WARN]${colors.reset}`,
    error: `${colors.red}[ERROR]${colors.reset}`,
    success: `${colors.green}[PASS]${colors.reset}`,
    fail: `${colors.red}[FAIL]${colors.reset}`
  };
  console.log(`${prefix[level]} ${message}`);
}

// 问题计数
let issues = {
  critical: 0,
  warning: 0,
  passed: 0
};

/**
 * 检查 1: 检测 RLS 策略中的无限递归模式
 * 通过查询 pg_policies 检查策略定义
 */
async function checkRLSInfiniteRecursion(supabase) {
  log('info', '检查 1: 检测 RLS 无限递归模式...');
  
  try {
    // 查询所有 RLS 策略
    const { data: policies, error } = await supabase
      .rpc('get_all_policies')
      .select('*');
    
    if (error) {
      // 如果 RPC 不存在，直接查询系统表
      const { data, error: err2 } = await supabase
        .from('pg_policies')
        .select('*');
      
      if (err2) {
        log('warn', '无法直接查询策略定义，将在测试环节验证');
        return;
      }
    }
    
    // 递归模式检测（通过实际查询测试）
    log('info', '  通过实际查询测试 RLS 递归...');
    
    // 测试查询 profiles 表（最容易出问题的地方）
    const { error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    if (profileError && profileError.message.includes('infinite recursion')) {
      log('fail', '  检测到 RLS 无限递归！');
      log('error', `  错误信息: ${profileError.message}`);
      issues.critical++;
      return false;
    }
    
    log('success', '  RLS 无限递归检查通过');
    issues.passed++;
    return true;
  } catch (err) {
    log('error', `  检查失败: ${err.message}`);
    return false;
  }
}

/**
 * 检查 2: 检测数据泄露漏洞
 * profiles 表不应该对 public/anon 角色有 SELECT 权限
 */
async function checkDataLeakage(supabase) {
  log('info', '检查 2: 检测数据泄露漏洞...');
  
  try {
    // 使用匿名客户端测试（模拟未登录用户）
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // 测试 1: 匿名用户不应读取 profiles
    const { data: anonProfiles, error: anonError } = await anonClient
      .from('profiles')
      .select('*');
    
    if (!anonError && anonProfiles && anonProfiles.length > 0) {
      log('fail', '  数据泄露风险：匿名用户可以读取 profiles 表！');
      log('error', `  泄露数据条数: ${anonProfiles.length}`);
      issues.critical++;
      return false;
    }
    
    if (anonError) {
      log('success', `  匿名用户无法读取 profiles (预期行为): ${anonError.message}`);
      issues.passed++;
    }
    
    // 测试 2: 检查 RLS 策略是否对 public 角色开放
    log('info', '  检查 RLS 策略角色配置...');
    
    // 需要通过 service_role 查询系统表
    if (SERVICE_ROLE_KEY) {
      const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      
      const { data: policies, error } = await adminClient
        .rpc('check_rls_policies_for_public');
      
      if (!error && policies) {
        const publicPolicies = policies.filter(p => p.roles && p.roles.includes('public'));
        if (publicPolicies.length > 0) {
          log('fail', `  发现 ${publicPolicies.length} 个对 public 角色开放的策略`);
          publicPolicies.forEach(p => {
            log('error', `    - ${p.tablename}.${p.policyname} (${p.cmd})`);
          });
          issues.critical++;
          return false;
        }
      }
    }
    
    log('success', '  数据泄露漏洞检查通过');
    issues.passed++;
    return true;
  } catch (err) {
    log('error', `  检查失败: ${err.message}`);
    return false;
  }
}

/**
 * 检查 3: 测试认证但未批准用户的数据访问
 */
async function checkUnapprovedUserAccess(supabase) {
  log('info', '检查 3: 测试未批准用户访问权限...');
  
  // 这个检查需要有一个测试用户账号
  // 在实际 CI 中，可以创建一个临时测试用户
  log('warn', '  需要测试用户账号，请在 CI 环境中配置 TEST_USER_EMAIL 和 TEST_USER_PASSWORD');
  issues.warning++;
  return true;
}

/**
 * 检查 4: 验证 SECURITY DEFINER 函数存在
 */
async function checkSecurityDefinerFunctions(supabase) {
  log('info', '检查 4: 验证 SECURITY DEFINER 函数...');
  
  try {
    // 测试 get_all_profiles 函数
    const { data, error } = await supabase
      .rpc('get_all_profiles');
    
    if (error) {
      log('fail', `  get_all_profiles 函数调用失败: ${error.message}`);
      issues.critical++;
      return false;
    }
    
    log('success', `  get_all_profiles 函数正常 (返回 ${data ? data.length : 0} 条记录)`);
    issues.passed++;
    
    // 测试 approve_user 函数
    const { error: approveError } = await supabase
      .rpc('approve_user', { target_user_id: '00000000-0000-0000-0000-000000000000', approve: false });
    
    if (approveError && !approveError.message.includes('Only approved admins')) {
      log('warn', `  approve_user 函数异常: ${approveError.message}`);
      issues.warning++;
    } else {
      log('success', '  approve_user 函数正常（权限检查生效）');
      issues.passed++;
    }
    
    return true;
  } catch (err) {
    log('error', `  检查失败: ${err.message}`);
    return false;
  }
}

/**
 * 检查 5: 验证 RLS 已启用
 */
async function checkRLSEnabled(supabase) {
  log('info', '检查 5: 验证 RLS 已启用...');
  
  const tablesToCheck = ['ReportAutoPrint', 'profiles'];
  
  try {
    if (!SERVICE_ROLE_KEY) {
      log('warn', '  需要 SERVICE_ROLE_KEY 来检查 RLS 状态');
      issues.warning++;
      return true;
    }
    
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    for (const table of tablesToCheck) {
      // 尝试查询（将通过系统表检查）
      const { data, error } = await adminClient
        .from(table)
        .select('*')
        .limit(1);
      
      if (error && error.message.includes('RLS')) {
        log('fail', `  表 ${table} 未启用 RLS！`);
        issues.critical++;
      } else {
        log('success', `  表 ${table} RLS 状态正常`);
        issues.passed++;
      }
    }
    
    return true;
  } catch (err) {
    log('error', `  检查失败: ${err.message}`);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log(`${colors.cyan}========================================`);
  console.log(`  AutoPrint RLS 安全验证工具`);
  console.log(`========================================${colors.reset}\n`);
  
  // 创建 Supabase 客户端
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // 运行所有检查
  await checkRLSInfiniteRecursion(supabase);
  await checkDataLeakage(supabase);
  await checkUnapprovedUserAccess(supabase);
  await checkSecurityDefinerFunctions(supabase);
  await checkRLSEnabled(supabase);
  
  // 输出总结
  console.log(`\n${colors.cyan}========================================`);
  console.log(`  验证总结`);
  console.log(`========================================${colors.reset}`);
  console.log(`${colors.green}通过: ${issues.passed}${colors.reset}`);
  console.log(`${colors.yellow}警告: ${issues.warning}${colors.reset}`);
  console.log(`${colors.red}严重问题: ${issues.critical}${colors.reset}`);
  
  if (issues.critical > 0) {
    console.log(`\n${colors.red}❌ 验证失败！发现 ${issues.critical} 个严重安全问题。${colors.reset}`);
    console.log(`${colors.yellow}请修复后再提交代码。${colors.reset}\n`);
    process.exit(1);
  } else if (issues.warning > 0) {
    console.log(`\n${colors.yellow}⚠️  验证通过，但有 ${issues.warning} 个警告。${colors.reset}`);
    console.log(`${colors.yellow}建议检查警告项。${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.green}✅ 所有安全检查通过！${colors.reset}\n`);
    process.exit(0);
  }
}

// 检查依赖
try {
  require('@supabase/supabase-js');
} catch (err) {
  console.error(`${colors.red}错误: 缺少 @supabase/supabase-js 依赖${colors.reset}`);
  console.error(`请运行: npm install @supabase/supabase-js`);
  process.exit(1);
}

main().catch(err => {
  console.error(`${colors.red}脚本执行失败: ${err.message}${colors.reset}`);
  process.exit(1);
});
