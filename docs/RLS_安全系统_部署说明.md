# AutoPrint RLS 安全验证系统 - 部署指南

## 已完成的工作

已创建完整的 RLS 安全验证系统，防止 RLS 无限递归和数据泄露漏洞。

### 新增文件

1. **scripts/validate-rls.js** - RLS 安全验证脚本
   - 自动检测 RLS 无限递归
   - 检测数据泄露漏洞
   - 测试匿名用户访问权限
   - 验证 SECURITY DEFINER 函数

2. **.husky/pre-commit** - Git 预提交钩子
   - 每次 `git commit` 前自动运行验证
   - 如果检查失败，阻止提交

3. **.github/workflows/rls-security-check.yml** - GitHub Action CI
   - 每次 PR 时自动运行验证
   - 检查失败会阻止合并

4. **.github/pull_request_template.md** - PR 模板
   - 包含 RLS 安全检查清单
   - 提醒审查者检查安全事项

5. **docs/RLS_安全指南_v1.0.md** - 详细安全指南
   - RLS 无限递归原理和修复方法
   - 数据泄露漏洞说明和防护
   - SECURITY DEFINER 函数使用指南
   - 验证工具使用方法

6. **AutoPrint_贡献指南_v1.0.md** (已更新)
   - 添加 RLS 安全强制检查章节 (6.0)
   - 所有开发人员必须阅读

7. **.gitignore** - Git 忽略文件
   - 排除 node_modules
   - 排除临时文件

## 如何使用

### 1. 安装依赖

```bash
cd /d/WBStorage/Projects/AutoPrint
npm install
```

### 2. 手动运行验证

```bash
node scripts/validate-rls.js
```

### 3. 提交代码（自动验证）

```bash
git add .
git commit -m "your commit message"
# 预提交钩子会自动运行验证
```

### 4. 推送代码

由于沙箱环境限制，请从本地机器推送：

```bash
git push origin master
```

或在本地执行：
```bash
cd D:\WBStorage\Projects\AutoPrint
git push origin master
```

## 验证内容

脚本会检查以下项目：

1. **RLS 无限递归** - 策略中查询自身表
2. **数据泄露漏洞** - profiles 表对 public 角色开放
3. **匿名用户访问** - 未认证用户可读取数据
4. **未批准用户访问** - 已认证但未批准的用户可访问
5. **SECURITY DEFINER 函数** - 管理员操作函数存在且正常

## 团队成员注意事项

1. **每次提交前必须运行验证**
   ```bash
   node scripts/validate-rls.js
   ```

2. **如果验证失败，必须修复后再提交**

3. **Code Review 时必须检查 RLS 策略**

4. **疑问联系** - @echeung1328 或查阅 `docs/RLS_安全指南_v1.0.md`

## 下一步

1. 将这些文件推送到 GitHub
2. 通知团队成员阅读新文档
3. 在下次站会中强调 RLS 安全重要性
4. 考虑在 Supabase 后台添加策略变更通知

---

**创建日期**: 2026-07-01  
**创建者**: Senior Developer  
**优先级**: Critical
