# AutoPrint RLS 安全指南

**文档版本**: v1.0  
**创建日期**: 2026-07-01  
**作者**: Senior Developer  
**适用范围**: 所有涉及 Supabase RLS 策略的开发和审查

---

## 目录

1. [概述](#1-概述)
2. [严重问题说明](#2-严重问题说明)
3. [预防措施](#3-预防措施)
4. [验证工具使用](#4-验证工具使用)
5. [常见问题与解决方案](#5-常见问题与解决方案)
6. [最佳实践](#6-最佳实践)

---

## 1. 概述

### 1.1 什么是 RLS

**Row Level Security (RLS)** 是 PostgreSQL 的行级安全机制，Supabase 用它来控制数据访问权限。

**核心原则**:
- 启用 RLS 后，表默认拒绝所有访问
- 必须通过策略（Policy）明确允许访问
- 策略中使用 `auth.uid()` 获取当前用户 ID

### 1.2 为什么需要特别关注

AutoPrint 项目曾遇到两个严重问题：
1. **RLS 无限递归** - 导致所有数据库查询失败
2. **数据泄露漏洞** - 匿名用户可读取所有用户资料

**后果**:
- 系统完全不可用（递归导致 DB 查询崩溃）
- 用户隐私数据泄露（GDPR 合规风险）
- 需要紧急修复和通知受影响用户

---

## 2. 严重问题说明

### 2.1 RLS 无限递归

**问题描述**:  
RLS 策略中查询定义了策略的表自身，导致无限循环。

**错误示例**:
```sql
-- ❌ 错误：策略查询 profiles 表，而 profiles 表启用了 RLS
CREATE POLICY "Admin can do everything" ON public.profiles
  FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
    -- ^^^^ 这里查询了 profiles 自身！
  );
```

**执行流程**:
1. 查询 `profiles` 表
2. 触发 RLS，检查策略
3. 策略中查询 `profiles` 表
4. 再次触发 RLS，检查策略
5. ... 无限循环 ...

** symptom**:
- 所有数据库查询返回错误: `infinite recursion detected in policy`
- 应用完全无法加载数据
- 浏览器控制台显示 500 错误

### 2.2 数据泄露漏洞

**问题描述**:  
RLS 策略对 `public` 或 `anon` 角色开放，导致未认证用户可读取数据。

**错误示例**:
```sql
-- ❌ 错误：对 public 角色开放 profiles 表的读取
CREATE POLICY "Public profiles access" ON public.profiles
  FOR SELECT
  TO public  -- ^^^^ 任何人都可读取！
  USING (true);
```

**后果**:
- 匿名用户可调用 `supabase.from('profiles').select('*')`
- 所有用户的邮箱、角色、批准状态泄露
- 攻击者可以枚举用户列表

**正确做法**:
```sql
-- ✅ 正确：仅允许已认证用户读取自己的资料
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
```

---

## 3. 预防措施

### 3.1 使用 SECURITY DEFINER 函数

**核心思想**:  
将管理员操作封装到数据库中，绕过 RLS 检查。

**示例: 获取所有用户资料（仅管理员）**
```sql
CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS TABLE(
  id UUID,
  email TEXT,
  role TEXT,
  approved BOOLEAN,
  created_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID
) AS $$
BEGIN
  -- SECURITY DEFINER 会以函数创建者的权限执行（绕过 RLS）
  RETURN QUERY 
    SELECT 
      p.id,
      p.email,
      p.role,
      p.approved,
      p.created_at,
      p.approved_at,
      p.approved_by
    FROM public.profiles p
    WHERE EXISTS (
      -- 检查调用者是否是已批准的管理员
      SELECT 1 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role = 'admin' 
        AND approved = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

**前端调用**:
```javascript
// ✅ 正确：通过 RPC 调用 SECURITY DEFINER 函数
const { data, error } = await supabase
  .rpc('get_all_profiles');

// ❌ 错误：直接查询会触发 RLS
const { data, error } = await supabase
  .from('profiles')
  .select('*');
```

### 3.2 RLS 策略设计模式

**模式 1: 用户只能访问自己的数据**
```sql
CREATE POLICY "User access own data" ON public.table_name
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);
```

**模式 2: 已批准用户可以访问某些数据**
```sql
CREATE POLICY "Approved users can access" ON public.table_name
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND approved = true
    )
  );
```

**模式 3: 管理员通过 SECURITY DEFINER 函数操作**
```sql
-- 不创建管理员策略，而是创建函数
CREATE OR REPLACE FUNCTION public.admin_operation(...)
RETURNS ... AS $$
BEGIN
  -- 在函数内检查调用者权限
  IF NOT EXISTS (...) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- 执行操作
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. 验证工具使用

### 4.1 预提交验证脚本

**文件位置**: `scripts/validate-rls.js`

**使用方法**:
```bash
# 安装依赖（首次）
npm install

# 运行验证
node scripts/validate-rls.js
```

**检查项目**:
1. RLS 无限递归
2. 数据泄露漏洞
3. 未批准用户访问权限
4. SECURITY DEFINER 函数存在性
5. RLS 启用状态

**输出示例**:
```
========================================
  AutoPrint RLS 安全验证工具
========================================

[INFO] 检查 1: 检测 RLS 无限递归模式...
[PASS]  RLS 无限递归检查通过
[INFO] 检查 2: 检测数据泄露漏洞...
[PASS]  匿名用户无法读取 profiles (预期行为): new row violates...
[PASS]  数据泄露漏洞检查通过
...

========================================
  验证总结
========================================
通过: 5
警告: 0
严重问题: 0

✅ 所有安全检查通过！
```

### 4.2 Git 预提交钩子

**文件位置**: `.husky/pre-commit`

**自动运行**:
```bash
# 每次 git commit 时自动运行
git commit -m "feat: add new feature"
# 输出: 🔒 运行 RLS 安全验证...
```

**跳过检查（不推荐）**:
```bash
git commit --no-verify -m "emergency fix"
```

### 4.3 GitHub Action CI 检查

**文件位置**: `.github/workflows/rls-security-check.yml`

**触发时机**:
- 创建 PR 到 `master` 或 `main` 分支
- 推送到 `master` 或 `main` 分支

**查看结果**:
1. 访问 GitHub 仓库
2. 点击 "Actions" 标签
3. 查看最近一次运行结果

**如果失败**:
- PR 页面会显示 "Some checks were not successful"
- 点击 "Details" 查看详细错误日志
- 修复问题后推送到同一 PR，CI 会自动重新运行

---

## 5. 常见问题与解决方案

### 5.1 如何快速检测递归问题

**方法 1: 使用脚本**
```bash
node scripts/validate-rls.js
```

**方法 2: 手动测试**
```javascript
// 在浏览器控制台测试
const { data, error } = await supabase
  .from('profiles')
  .select('id')
  .limit(1);

if (error && error.message.includes('recursion')) {
  console.error('检测到 RLS 递归！');
}
```

**方法 3: 检查 Supabase 日志**
1. 访问 Supabase 后台
2. 点击 "Logs" → "Postgres Logs"
3. 搜索 "infinite recursion"

### 5.2 如何修复递归策略

**步骤**:
1. 删除有问题的策略
   ```sql
   DROP POLICY IF EXISTS "policy_name" ON public.table_name;
   ```

2. 创建 SECURITY DEFINER 函数
   ```sql
   CREATE OR REPLACE FUNCTION ... SECURITY DEFINER ...
   ```

3. 修改前端代码，使用 RPC 调用函数
   ```javascript
   const { data, error } = await supabase.rpc('function_name');
   ```

4. 重新运行验证脚本
   ```bash
   node scripts/validate-rls.js
   ```

### 5.3 如何检测数据泄露

**测试脚本**:
```javascript
// 使用匿名客户端测试
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

const { data, error } = await anonClient
  .from('profiles')
  .select('*');

if (!error && data && data.length > 0) {
  console.error('数据泄露！匿名用户可以读取', data.length, '条记录');
}
```

**修复方法**:
```sql
-- 删除对 public/anon 开放的策略
DROP POLICY IF EXISTS "policy_name" ON public.profiles;

-- 确保只有 authenticated 角色可以访问
CREATE POLICY "Authenticated users only" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);
```

---

## 6. 最佳实践

### 6.1 策略编写规范

**DO**:
- ✅ 使用 `auth.uid()` 直接比较
- ✅ 使用 SECURITY DEFINER 函数处理管理员操作
- ✅ 明确指定 `TO authenticated` 或 `TO service_role`
- ✅ 测试匿名用户访问（应被拒绝）
- ✅ 在测试环境先验证策略

**DON'T**:
- ❌ 在策略中查询启用了 RLS 的表
- ❌ 对 `public` 或 `anon` 角色开放敏感表
- ❌ 使用 `USING (true)` 而不指定角色
- ❌ 在前端代码中使用 `service_role` key

### 6.2 Code Review 检查清单

**审查者必须验证**:
- [ ] 新的 RLS 策略不包含递归模式
- [ ] 策略中明确指定了角色（`TO authenticated`）
- [ ] 管理员操作使用 SECURITY DEFINER 函数
- [ ] 前端代码通过 RPC 调用函数，而非直接查询
- [ ] 验证脚本通过（`node scripts/validate-rls.js`）

**如何测试**:
1. 在本地运行验证脚本
2. 手动测试匿名用户访问
3. 检查 Supabase 后台的策略定义

### 6.3 紧急情况处理

**如果发现安全问题**:
1. **立即通知团队** (Microsoft Teams / 电话)
2. **回滚有问题的代码**
   ```bash
   git revert <commit-hash>
   git push origin master
   ```
3. **修复问题**
4. **通知受影响用户**（如果数据泄露）
5. **编写事后分析报告**

---

## 附录

### A. 有用的 SQL 查询

**查看所有 RLS 策略**:
```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**检查表是否启用 RLS**:
```sql
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('ReportAutoPrint', 'profiles');
```

### B. 相关链接

- **Supabase RLS 文档**: https://supabase.com/docs/learn/auth-deep-dive/auth-row-level-security
- **PostgreSQL RLS 文档**: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- **AutoPrint 验证脚本**: `scripts/validate-rls.js`
- **AutoPrint PR 模板**: `.github/pull_request_template.md`

---

**文档结束**

*本文档为 AutoPrint 项目 RLS 安全指南，所有开发人员必须阅读并遵守。*
