# AutoPrint 免登录访问链接 · 第 1 批（后端+数据库）测试记录 v1.0

**关联**：Epic #45 / T1 #46 · T2 #47 · T3 #48 · T6 #51
**测试范围**：数据库 schema + RLS、Edge Function 公开校验、管理端 CRUD、安全加固与审计
**日期**：2026-11-25
**模型**：Tencent Hunyuan Hy
**依据规范**：《AutoPrint 贡献指南 v1.1》§7 测试规范

---

## 1. 测试构成总览

| 层级 | 资产 | 形式 | 项数 | 结果 |
|---|---|---|---|---|
| 纯逻辑单测 | `access_token.test.mjs` | node 断言 | 28 | ✅ 28/28 |
| 集成测试 | `integration.test.mjs` | esbuild 编译 + mock fetch | 25 | ✅ 25/25 |
| 编译检查 | esbuild bundle index.ts | 命令行 | 1 | ✅ 通过（11KB） |
| 数据库验收 | MCP execute_sql 直查 | SQL | 4 项 | ✅ 全通过 |
| anon 越权实测 | curl + anon key | 命令行 | 2 项 | ✅ 401/拒绝 |
| **合计（自动化）** | | | **55 + 7** | **全绿** |

> 口径说明：本批为新增模块，项数独立统计，不与 v2.1.0 的 155 项混算。

---

## 2. 关键用例依据表

### 2.1 逻辑测试（无界面，记输入/预期/实际）

| 用例 | 输入 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| [关键] token 唯一性 | 连续生成 1000 个 token | 无碰撞（集合大小=1000） | 1000 | ✅ |
| [关键] token 格式 | generateToken() | 长度 43、base64url、无 `=` | 符合 | ✅ |
| [关键] 365 天上限 | clampLifetimeDays(400) | 365 | 365 | ✅ |
| [关键] 有效期计算 | computeExpiresAt(0, 400) | 365 天后 ISO | 一致 | ✅ |
| [关键] 有效链接放行 | status=active, 未过期 | `{ok:true}` | 一致 | ✅ |
| [关键] 已停止拒绝 | status=stopped | `{ok:false, reason:stopped}` | 一致 | ✅ |
| [关键] 已过期拒绝 | expires_at < now | `{ok:false, reason:expired}` | 一致 | ✅ |
| [关键] stopped 优先过期 | stopped + 已过期 | reason=**stopped** | 一致 | ✅ |
| 边界：恰好到期时刻 | now == expires_at | 仍有效（不拒） | 一致 | ✅ |
| [关键] 审计前缀 | tokenPrefix(token) | 仅前 8 位 | 一致 | ✅ |

### 2.2 集成测试（mock 网关，覆盖路由与调用顺序）

| 用例 | 输入 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| [关键] 有效 token 公开访问 | GET /public?token=有效 | 200 + 标题 + 数据 | 一致 | ✅ |
| [关键] 停止/过期/删除 | 三种失效 token | 403 + 对应文案 | 一致 | ✅ |
| [关键] 无 JWT 访问管理端 | GET /admin/list | 401 | 401 | ✅ |
| [关键] 非 admin（viewer） | admin JWT | 403 | 403 | ✅ |
| 未批准 admin | approved=false | 403 | 403 | ✅ |
| [关键] 创建钳制天数 | days=400 | expires≈365 天 | 一致 | ✅ |
| [关键] create/stop/delete 审计 | 三个管理动作 | 各写 1 条审计 | 一致 | ✅ |
| [关键] 审计先于硬删 | delete 动作 | 审计 INSERT 在 DELETE 之前 | 一致 | ✅ |

### 2.3 数据库验收（真实生产库）

| 检查项 | 预期 | 实际 | 结果 |
|---|---|---|---|
| 两张表存在 | access_links + access_links_audit | ✅ | ✅ |
| token 唯一索引 | uq_access_links_token | 存在 | ✅ |
| RLS 开启 | 两表 rowsecurity=true | true | ✅ |
| 无公开 policy | deny-all for anon | NONE | ✅ |
| anon 直读 | 401 / permission denied | HTTP 401 | ✅ |

---

## 3. 自动化边界说明（需人工 / 部署后验证）

以下项目**无法在纯本地自动化完成**，已按规范标注，待 Edge Function 部署后由人工验证：

| # | 项目 | 为何不能自动化 | 验证方式 | 负责人 |
|---|---|---|---|---|
| M1 | 真实 Supabase 网关行为 | mock fetch 无法覆盖网关 rewrite / JWT 校验细节 | 部署后 curl 实测 /public 与 /admin | AI+用户 |
| M2 | 真实 admin JWT 端到端 | 需真实登录会话签发 JWT | 浏览器登录后调用 /admin/create | 用户 |
| M3 | `/share/[token]` 前端页面 | 属于第 2 批（T4），本批未实施 | 第 2 批完成后验证 | 用户 |
| M4 | `/admin/access-links` 管理页 | 属于第 2 批（T5），本批未实施 | 第 2 批完成后验证 | 用户 |
| M5 | 对外数据脱敏复核 | 需业务确认哪些字段可对外 | 与用户确认字段白名单 | 用户 |

---

## 4. 本批产物清单

| 类型 | 文件 |
|---|---|
| 数据库迁移 | `supabase/migrations/20261125_access_links_T1.sql` |
| 业务逻辑 | `supabase/functions/access_links/access_token.mjs` |
| 函数入口 | `supabase/functions/access_links/index.ts` |
| 单元测试 | `supabase/functions/access_links/access_token.test.mjs` |
| 集成测试 | `supabase/functions/access_links/integration.test.mjs` |

---

## 5. 遗留与下一步

- 本批**未部署** Edge Function（按纪律留待 merge master 后统一部署）。
- 第 2 批（T4 对外页 + T5 管理页）待本批上线验证效果后启动。
- ⚠️ 待确认：对外数据字段白名单（当前复用主表 site/执行时间/总数/成功/跳过/失败，不含来源邮箱）。
