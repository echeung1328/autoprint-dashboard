# Handoff 文档 — GitHub Issue #24「邮件 → Supabase 入库最小验证 POC」

**日期**：2026-07-23（周四）  
**负责人**：Eric Zhang（PM，非技术）+ 高级开发工程师（吴八哥，执行）  
**状态**：🎉 **POC 端到端验证通过**，待用户收尾（push + issue 评论 + 看板）  

---

## 1. 一句话结论

邮件 → 数据库入库的最小链路已跑通：用 `zhang.hz@comlan.com` 发一封带 `.xlsx` 附件的邮件到 Webhook Relay 收件地址，附件以 base64 原样落入 Supabase 表 `email_inbox_poc`，链路稳定可复用。

---

## 2. 架构链路（已验证）

```
[Outlook/邮件客户端]
   │  发件人: zhang.hz@comlan.com
   │  收件人: 305532a4-a540-47bb-9883-6dc23e1e894c@in.webhookrelay-mail.com
   ▼
[Webhook Relay]  ── 收件 Inbox（Forwarding 状态）
   │  Destination: POST https://uvqjtvonxwsmhntnyest.supabase.co/functions/v1/email_inbox_poc
   │  Headers: Content-Type: application/json
   │           Authorization: Basic <BASIC_AUTH_BASE64>
   ▼
[Supabase Edge Function: email_inbox_poc]  (version 9, ACTIVE, verify_jwt=false)
   │  1. 校验 Basic Auth（poc / 1dxrQ...uP）
   │  2. 白名单校验（仅 zhang.hz@comlan.com）
   │  3. 过滤 xlsx/xls/csv 附件 → 写 2 条：meta 行 + 附件行（raw_base64 原样落库）
   ▼
[Supabase 表: email_inbox_poc]  (RLS 关闭，POC 专用)
```

---

## 3. 关键配置清单（自包含，供明天续接）

| 项 | 值 |
|---|---|
| Supabase 项目 ref | `uvqjtvonxwsmhntnyest` |
| Supabase 项目 URL | `https://uvqjtvonxwsmhntnyest.supabase.co` |
| Edge Function slug | `email_inbox_poc` |
| Function URL | `https://uvqjtvonxwsmhntnyest.supabase.co/functions/v1/email_inbox_poc` |
| Webhook Relay 收件地址 | `305532a4-a540-47bb-9883-6dc23e1e894c@in.webhookrelay-mail.com` |
| Webhook Relay bucket 状态 | Forwarding（Active） |
| Basic Auth user | `poc` |
| Basic Auth pass | `<WEBHOOK_BASIC_PASS>` |
| Basic Auth base64 | `<BASIC_AUTH_BASE64>` |
| 白名单发件邮箱 | `zhang.hz@comlan.com` |
| GitHub 仓库 | `echeung1328/autoprint-dashboard` |
| GitHub Issue | `#24` |

### Supabase Secret（5 个，已配置）

| Secret 名 | 值 / 说明 |
|---|---|
| `PROJECT_URL` | `https://uvqjtvonxwsmhntnyest.supabase.co` |
| `PROJECT_ANON_KEY` | 有效 anon key（通过 `mcp__supabase__get_publishable_keys` 获取） |
| `WEBHOOK_BASIC_USER` | `poc` |
| `WEBHOOK_BASIC_PASS` | `<WEBHOOK_BASIC_PASS>` |
| `ALLOWED_SENDERS` | `zhang.hz@comlan.com` |

> ⚠️ 变量名必须用 `PROJECT_` 前缀（**Supabase CLI v2.109+ 禁止 `SUPABASE_` 前缀**，会静默跳过）。

---

## 4. 完整踩坑清单（4 个连环根因）

| # | 现象 | 真因 | 修复 |
|---|---|---|---|
| 1 | 之前一直 401 | Basic Auth 校验配错 + Webhook Relay Request headers 自定义头不持久化（UI 限制） | Basic Auth 必填 + 头持久化在 Destination Authentication 区 |
| 2 | Webhook Relay 4 次 `giving up`，`invalid header field name "Content type"` | Destination Request headers 里有个**带空格的 `Content type`**（手误），Go net/http 本机拒绝发请求，函数根本收不到 | 删除该非法 header |
| 3 | 删掉后又 4 次 `context deadline exceeded` | v5 部署代码用 `// @ts-nocheck` 单行注释包裹整段，把 `Deno.serve` 注册也吞了，函数永不响应 | 改写代码（去掉行注释包裹，v6/v9 修复） |
| 4 | 函数返 200 但表空 | `PROJECT_ANON_KEY` 是错的（旧值），写库时 Supabase 返 401，错误被 `try/catch` 吞掉 | 通过 `get_publishable_keys` 拿正确 anon key 替换 + v7 起把写库错误暴露到 Response Body |

### 通用教训（迁移到正式版时务必遵守）

1. **Webhook Relay Request headers 严禁自定义 header 名带空格**（如 `Content type`）→ 用标准 `Content-Type`
2. **Deno Edge Function 代码不能用 `//` 单行注释包裹整段** → 多行格式或注释放代码前
3. **Supabase CLI v2.109+ 禁止 `SUPABASE_` 前缀环境变量** → 改用 `PROJECT_` 前缀 + 启动期 `checkEnv()` 缺失即 500
4. **错误要暴露不要吞**：写库失败写进 Response Body（`wr_status=4xx,body=...`），外部 UI 直接可见
5. **沙箱 `curl` 无外网** → 自测函数必须走真实 Webhook Relay 邮件链路
6. **失败邮件不自动重试** → 修好 bug 后必须发新邮件触发

---

## 5. 代码与部署状态

| 项 | 状态 |
|---|---|
| 本地代码 | `D:\WBStorage\Projects\AutoPrint\supabase\functions\email_inbox_poc\index.ts`（v9 完整版） |
| 本地 commit | `8597653` — `feat(email_inbox_poc): v9 final POC, end-to-end verified` ✅ |
| 已 push？ | ❌ **待用户本地 `git push origin master`** |
| 部署版本 | version 9, ACTIVE, verify_jwt=false |
| 数据库表 | `email_inbox_poc` 已建（字段见下），RLS 关闭，POC 专用 |
| 真实数据 | 2 条（来自 19:10 邮件：meta 行 + 附件行，b64_len=14532） |

### 数据库表结构 `email_inbox_poc`

```sql
id            uuid (PK, default gen_random_uuid())
received_at  timestamptz
from_email    text
subject       text
filename      text
content_type  text
raw_base64    text        -- 附件原文件 base64（POC 阶段不解析）
row_count     int4
status        text        -- 'received' | 'stored' | 'whitelist-rejected' | 'error'
error_msg     text
```

---

## 6. 今日未完成项（用户未执行，明天可续）

```powershell
# 1) 推代码
git push origin master

# 2) 评论 Issue #24 验收结果（模板见第 7 节）

# 3) 更新 GitHub Project 看板 → Done
gh project item-edit --project <PROJECT_ID> --id <ITEM_ID> --field-id <STATUS_FIELD_ID> --single-select-option-id <DONE_OPTION_ID>
```

---

## 7. Issue #24 评论模板（验收通过）

```
✅ POC 端到端验证通过：Webhook Relay → Supabase Edge Function → email_inbox_poc 表入库成功。

验证证据：
- Webhook Relay Response Body: ok-stored-1（200 OK）
- 数据库表 email_inbox_poc 新增 2 条记录（meta 行 + 附件行）
- 附件 ReportAutoPrint_v20260723.xlsx 14.5KB base64 完整存储（b64_len=14532）
- Basic Auth 鉴权、白名单发件人过滤均生效

代码 commit: 8597653 (v9 完整版：精简 + Basic Auth + 白名单 + 错误暴露)
部署状态: version 9 ACTIVE, verify_jwt=false

主要踩坑（写给团队参考）：
1. Webhook Relay Request headers 严禁自定义 header 名带空格（如 `Content type`）
2. Deno Edge Function 代码不能用 `//` 单行注释包裹整段（会吞掉 Deno.serve 注册）
3. Supabase CLI v2.109+ 禁止 SUPABASE_ 前缀环境变量，改用 PROJECT_ 前缀
4. anon key 设错会导致写库 401 但 Response Body 200（不易发现，需写库失败时暴露错误）
```

---

## 8. 下一步方向（等用户指令）

**A. 收尾（Issue #24 → Done）**：用户执行 push + issue comment + 看板更新

**B. 正式版（不再 POC）** — 关键改造：
- 换 `service_role` key（Supabase MCP 已自动管理 `SUPABASE_SERVICE_ROLE_KEY`，免找）
- 表开 RLS（仅 service_role 可写）
- 把 SOP 数据质量铁律写进函数代码：复合键去重 / 冲突检测 / `+08:00` 时区 / 生成列 / `CreatedBy`
- staging 两阶段：先落 staging 表 → 人工确认 → 转正 `ReportAutoPrint` 主表
- 参考 `D:\WBStorage\Projects\AutoPrint\SOP_supabase_data_upload.md`

---

## 9. 必读文件（明天续接前先读）

- `D:\WBStorage\Projects\AutoPrint\HANDOFF_2026-07-23_issue24_email_poc.md`（本文件）
- `D:\WBStorage\Projects\AutoPrint\SOP_supabase_data_upload.md`（SOP 数据质量铁律）
- `C:\Users\Eric Zhang\WorkBuddy\2026-06-27-22-49-35\.workbuddy\memory\2026-07-23.md`（今日工作日志）
- `C:\Users\Eric Zhang\.workbuddy\MEMORY.md`（跨项目长期笔记，含 Supabase / Webhook Relay 踩坑）

---

## 10. 自动可用工具

- **Supabase MCP**：`list_projects` / `execute_sql` / `get_logs` / `get_edge_function` / `deploy_edge_function` / `get_publishable_keys`
- **GitHub gh CLI**：用户已登录 `echeung1328`，有 repo 写权限
