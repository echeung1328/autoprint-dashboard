# 邮件 → Supabase 入库 部署实施文档（方向 B 正式版）

> 版本：v1.0 ｜ 最后更新：2026-07-24 ｜ 维护人：Eric Zhang

---

## 0. 重要声明

- 本文档**不含任何明文密钥**。所有 `<...>` 占位符的真实值见 **本地密钥文档 `SECRETS_LOCAL.md`**（仅本地、不入库）。
- 部署前请确保本地密钥文档已就位且内容完整。

---

## 1. 前置条件（一次性）

- 已安装：**Supabase CLI**（`supabase` 命令）、**Git**、**GitHub CLI**（`gh`）。
- 已登录：
  - Supabase CLI：`supabase login`（或函数部署用 OAuth token）
  - `gh auth login`（账号 `echeung1328`，含 repo/project 权限）
- 已具备仓库本地副本：`D:\WBStorage\Projects\AutoPrint`（clone 或已有）。
- 已连通：**Supabase MCP**（WorkBuddy 连接器 Trust + OAuth），用于后续「确认转正」由 AI 执行。

---

## 2. 一次性配置（密钥）

在 Supabase 项目 `uvqjtvonxwsmhntnyest` 中设置 Secrets（Supabase 控制台 → Project Settings → Edge Functions → Secrets，或用 `supabase secrets set`）。需要：

| Secret 名 | 说明 | 真实值来源 |
|---|---|---|
| `SUPABASE_URL` | 项目 URL | 本地密钥文档 `<SUPABASE_URL>` |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端角色密钥（写库绕过 RLS） | Supabase 控制台 → API → service_role key |
| `WEBHOOK_BASIC_USER` | Webhook Relay Basic Auth 用户名 | 本地密钥文档 |
| `WEBHOOK_BASIC_PASS` | Webhook Relay Basic Auth 密码 | 本地密钥文档 |
| `ALLOWED_SENDERS` | 发件白名单（逗号分隔邮箱） | 本地密钥文档 |

> 注：函数同时兼容 `PROJECT_SERVICE_ROLE_KEY` 作为 service_role 兜底名；`SUPABASE_URL` 也有代码内兜底（不建议长期依赖）。

---

## 3. 部署步骤（在你本地终端执行）

进入仓库目录：

```powershell
cd D:\WBStorage\Projects\AutoPrint
```

部署函数（沿用 POC 工作流，slug/URL 不变；**`--no-verify-jwt` 必带**，外部 webhook 不发 JWT）：

```powershell
supabase functions deploy email_inbox_poc --no-verify-jwt
```

- 预期回显：`Deploying functions...` / `Deployed email_inbox_poc`。
- 若提示未登录，先 `supabase login`。

（可选）确认密钥已注入运行时：

```powershell
supabase secrets list
```

应能看到上面 5 个 secret。若函数联调报 `ENV missing env: ...`，多半是某个 secret 没设。

---

## 4. 联调步骤（真实邮件）

1. 从白名单邮箱 `<ALLOWED_SENDERS>` 发一封**带 xlsx 附件**的邮件到 `<WEBHOOK_RELAY_ADDRESS>`（与 POC 同一地址）。
2. 打开 Webhook Relay 控制台 → 该收件地址的 Request Details → Response Summary，查看函数返回。
3. 预期正常返回：`ok-staged-N (update=M)`（N=解析出的数据行，M=其中将 UPDATE 主表的行）。
4. 异常返回与处理见 SOP 操作手册「排错」章节。

> **重测无需重新写邮件**：在 Webhook Relay 同一请求上点 **Resend** 即可重发。

---

## 5. 验收标准（Definition of Done）

- [ ] 函数部署成功且 `verify_jwt=false`。
- [ ] 5 个 secret 均已注入运行时。
- [ ] 真实测试邮件返回 `ok-staged-N`。
- [ ] `report_autoprint_staging` 出现 `status='pending'` 行，字段映射/时区/去重正确。
- [ ] 用户「确认转正」后，`ReportAutoPrint` 新增对应行，`耗时分钟` 自动算出。
- [ ] 全程无明文密钥进入 GitHub 仓库。

---

## 6. 回滚 / 重新部署

- **仅代码改动**：直接重新 `supabase functions deploy ...` 覆盖部署（无停机）。
- **回退函数到旧版**：Supabase 控制台 Functions → 选择历史版本 Deploy；或用 git 历史恢复 `index.ts` 后重新部署。
- **数据库结构变更**（建表/改表）需谨慎：先用 `execute_sql` 在测试查询确认影响范围，再执行；改动应写入迁移并记录在档。

---

## 7. 后续「确认转正」

见 `docs/email_ingest_SOP操作手册_v1.0.md` 的「确认转正」章节，以及仓库 `supabase/promote_staging.sql`。
