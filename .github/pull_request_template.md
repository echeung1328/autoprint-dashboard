## 📋 变更描述
<!-- 请简要描述本次 PR 的变更内容 -->

## 🔒 安全自查清单（必须完成）
<!-- 在提交 PR 前，请确认已完成以下所有检查 -->

### RLS 安全验证（Critical）
- [ ] 我已运行 `node scripts/validate-rls.js` 并验证通过
- [ ] 未引入新的 RLS 策略，或已验证新策略无无限递归风险
- [ ] 未对 `public` 或 `anon` 角色开放 `profiles` 表的读取权限
- [ ] 所有 RLS 策略使用 `auth.uid()` 而非子查询自身表

### 数据权限验证
- [ ] 匿名用户无法访问敏感数据（已测试）
- [ ] 未批准用户无法访问数据（已测试）
- [ ] Service role 仅在后端使用，不在前端暴露

### SQL 迁移文件检查
- [ ] 所有 SQL 迁移文件已通过脚本检查（`scripts/check-migration.sql`）
- [ ] 新的 RLS 策略已在测试环境验证

### 测试
- [ ] 已在本地测试批准/未批准用户的数据访问
- [ ] 已测试匿名用户访问（应被拒绝）

## 📸 测试结果截图
<!-- 如果涉及 RLS 策略变更，请附上测试截图 -->

## 📚 相关 Issue
<!-- 关联相关的 GitHub Issue，例如: Closes #4 -->

## ✅ 代码审查要求
- [ ] 涉及 RLS 或安全相关的变更，必须由 Senior Developer 审查
- [ ] 所有检查通过后才能合并

---

### ⚠️ 重要提醒
**RLS 无限递归和数据泄露是严重安全问题！**
- 每次提交前必须运行 `node scripts/validate-rls.js`
- 如果 CI 检查失败，PR 将被阻止合并
- 如有疑问，请联系 @echeung1328 或查阅 `docs/RLS_SECURITY_GUIDE.md`

**常见错误模式（避免）：**
```sql
-- ❌ 错误：导致无限递归
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- ✅ 正确：使用 SECURITY DEFINER 函数
USING (EXISTS (SELECT 1 FROM use_get_user_role(auth.uid()) WHERE role = 'admin'));
```
