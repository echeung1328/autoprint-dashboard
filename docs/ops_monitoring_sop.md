# 邮件入库系统 · 运维监控 SOP（标准作业程序）

> 适用范围：AutoPrint 邮件入库正式版（Webhook Relay → Edge Function `email_inbox_poc` → 临时表 → 主表 `ReportAutoPrint` → Resend 告警）
> 适用读者：**非技术值班人员 / PM**。所有 SQL 均在 **Supabase 控制台 → SQL Editor** 粘贴执行。
> 关联文档：`docs/email_ingest_方案设计_v1.0.md`；GitHub Issues #27/#28/#29/#30/#31

---

## 0. 文档目的
系统上线后要做到**长期无人盯守也能及时发现并定位问题**。本 SOP 给出三件事：
1. 每天花 3 分钟巡检该看什么；
2. 收到告警邮件后怎么初判；
3. 常见故障对照表 + 密钥/配额管理。

---

## 1. 系统链路一览（一句话版）

```
[业务邮箱] --发带 Excel 附件的邮件-->
[Webhook Relay 收件地址] -->
[Edge Function: email_inbox_poc] --解析--> report_autoprint_staging（临时表）
                                            │
                              ┌─────────────┴─────────────┐
                         确认无误转正                  失败/异常
                              │                            │
                              ▼                            ▼
                   ReportAutoPrint（主表）        Resend 告警邮件 → 值班邮箱
                                                              + ingest_alert_log（诊断表）
[原始邮件] --> email_raw_archive（归档表，status=stored）
```

要点：
- **临时表** `report_autoprint_staging`：每封邮件解析出的数据先放这里，`status='pending'` 表示待确认转正。
- **主表** `ReportAutoPrint`：确认无误后的正式数据，按 `("Title" + 执行时间)` 复合键去重。
- **归档表** `email_raw_archive`：原始邮件原文落库，可重放，不丢数据。
- **诊断表** `ingest_alert_log`：每次告警尝试都写一行（含 success / error_msg），**无需翻函数日志即可判断告警是否真发出**。

---

## 2. 角色与分工

| 角色 | 负责 |
|---|---|
| 值班 / PM（你） | 日常巡检、收到告警后初判、改配置类 Secret、发测试邮件 |
| AI 助手 | 查库定位、改代码/SQL、部署 Edge Function、写诊断 |
| 外部服务 | Webhook Relay（收件）、Resend（发告警）、Supabase（运行环境） |

> 原则：**配置类（Secret）你改，代码/部署类 AI 做**。涉及主表写数据的 SQL 建议让 AI 代执行或复核。

---

## 3. 日常巡检（每日 1 次，约 3 分钟）

在 Supabase → SQL Editor 依次执行以下 4 条，对照「正常/异常」判断。

### 3.1 是否有卡住待转正的临时数据
```sql
SELECT id, "Title", 执行时间, 总数, 成功, 跳过, 失败, status, error_msg
FROM report_autoprint_staging
WHERE status = 'pending'
ORDER BY received_at DESC;
```
- **正常**：0 行（无积压）。
- **异常**：有行 → 这些 Excel 已解析但未转正。确认数据无误后执行转正 SQL（见 §7）。

### 3.2 主表最近数据是否正常
```sql
SELECT "Title", 执行时间, 总数, 成功, 跳过, 失败, 耗时分钟, "CreatedBy"
FROM "ReportAutoPrint"
ORDER BY 执行时间 DESC
LIMIT 10;
```
- **正常**：最近有业务日数据，总数/成功数合理，`失败 = 0`。
- **异常**：长时间无新数据、或 `失败 > 0` → 见 §6 排障。

### 3.3 归档是否进账
```sql
SELECT received_at, from_email, subject, filename, row_count, status, error_msg
FROM email_raw_archive
ORDER BY received_at DESC
LIMIT 10;
```
- **正常**：每次发测试/业务邮件后这里多一行，`status = 'stored'`。
- **异常**：发了邮件但这里没新行 → 邮件没进系统（Webhook Relay / 收件地址问题），见 §6.1。

### 3.4 告警是否健康
```sql
SELECT created_at, kind, channel, success, error_msg
FROM ingest_alert_log
ORDER BY created_at DESC
LIMIT 20;
```
- **正常**：只有你主动测告警时才有行，且 `success = true`。
- **异常**：出现 `success = false` → 告警本身发不出去了，见 §6.3。

---

## 4. 收到告警邮件后怎么办

告警邮件主题形如「入库告警：解析成功但 0 行」等。处理流程：

1. 打开 Supabase → SQL Editor，执行 §3.4 查 `ingest_alert_log`，看最新一行：
   - `kind` = 失败类型（解析异常 / 解析成功但 0 行 / 写库失败）
   - `detail` = 具体说明（含邮件主题、发件人）
   - `success` / `error_msg` = 告警是否真发出、失败原因
2. 按 §6 对照表定位原因。
3. 修复后（如改 Secret、重发邮件），重新发一封测试邮件验证，再查 `ingest_alert_log` 确认 `success = true`。

---

## 5. 故障分级

| 级别 | 定义 | 响应 |
|---|---|---|
| **P0** | 数据丢失风险：邮件进了但主表缺数据、或 staging 有 pending 长时间不转正 | 当日处理 |
| **P1** | 告警失灵：`ingest_alert_log` 出现 `success=false`，或该告警却没收到邮件 | 当日处理 |
| **P2** | 一般异常：单封邮件解析失败但不影响其他邮件 | 有空处理 |

---

## 6. 排障手册（现象 → 原因 → 处理）

| 现象 | 可能原因 | 处理（负责人） |
|---|---|---|
| 巡检 3.1 有 `pending` 行 | Excel 解析成功但未转正 | 确认数据无误 → 执行转正 SQL（§7，建议 AI 代执行） |
| 巡检 3.2 长时间无新数据 | 没人发邮件 / 邮件没进系统 | 先查 3.3 归档；无新行 → 查 Webhook Relay（§6.1） |
| 巡检 3.3 发了邮件但无新归档行 | Webhook Relay 收件地址变更/失效、或 Edge Function 未部署 | 见 §6.1 |
| 巡检 3.4 `success=false`，error_msg 含 `403 validation_error` | Resend test mode 只允许发往账户持有者邮箱 | 把 Secret `ALERT_EMAIL_TO` 改为 `echeung1328@hotmail.com`（§6.2） |
| 告警邮件主题/内容不对 | Edge Function 代码问题 | 交给 AI 查代码 + 改 + 部署 |
| 主表某天 `失败 > 0` | Excel 数据异常/缺列 | 查该邮件归档的 `error_msg`，必要时重发正确附件 |

### 6.1 Webhook Relay 收件检查
- 登录 Webhook Relay → 确认收件 bucket 仍存在、入站地址未变。
- 当前收件地址（实际值在本地 `SECRETS_LOCAL.md`，**不入库**）：形如 `305532a4-xxxx@in.webhookrelay-mail.com`。
- 若地址变更，需同步更新 Edge Function 配置并**重新部署**。

### 6.2 Resend 告警收件配置
- 位置：**Supabase → Edge Functions → `email_inbox_poc` → Secrets**
- 关键项：
  - `RESEND_API_KEY`：Resend 发送密钥
  - `ALERT_EMAIL_TO`：**必须是 Resend 账户持有者邮箱** `echeung1328@hotmail.com`（test mode 限制；验证域名后可改任意地址）
  - `ALERT_EMAIL_FROM`：可选，默认 `onboarding@resend.dev`（合法）
- 改完 Secret 后**必须重新部署一次 `email_inbox_poc`** 才生效。

### 6.3 告警自身失败排查
执行 §3.4：
- 有行且 `success=false` → 看 `error_msg`：
  - `403 validation_error` = 收件人不对（§6.2）
  - `401` = API Key 错（重填 `RESEND_API_KEY`）
  - 其他 = 交给 AI
- 完全没行但**应该**告警 → Edge Function 未部署/代码未更新 → 交给 AI 重新部署。

---

## 7. 紧急恢复：数据转正

仅当 `report_autoprint_staging` 有**已确认无误**的 `pending` 数据需要写入主表时执行（建议 AI 代执行或复核）。逻辑：按 `("Title" + 执行时间)` 复合键去重，已存在则更新、不存在则插入。

```sql
-- ① 转正：staging(pending) → 主表 ReportAutoPrint
INSERT INTO "ReportAutoPrint"
  ("Title", 执行时间, 总数, 成功, 跳过, 失败, 完成时间, "附件Excel表格", 任务完成通知邮件, 耗时分钟, 标签, "CreatedBy", "ModifiedBy")
SELECT
  "Title", 执行时间, 总数, 成功, 跳过, 失败, 完成时间, "附件Excel表格", 任务完成通知邮件, 耗时分钟, 标签, "CreatedBy", "ModifiedBy"
FROM report_autoprint_staging
WHERE status = 'pending'
ON CONFLICT ("Title", 执行时间) DO UPDATE SET
  总数 = EXCLUDED.总数, 成功 = EXCLUDED.成功, 跳过 = EXCLUDED.跳过, 失败 = EXCLUDED.失败,
  完成时间 = EXCLUDED.完成时间, "ModifiedBy" = EXCLUDED."ModifiedBy", "Modified" = now();

-- ② 标记已转正
UPDATE report_autoprint_staging SET status = 'promoted' WHERE status = 'pending';
```

⚠️ 执行前请 AI 或懂 SQL 的人**先复核 staging 数据**，避免脏数据进主表（例如总数/成功数为 0 的空行）。

---

## 8. 密钥与配置管理

| 配置项 | 位置 | 轮转建议 |
|---|---|---|
| `RESEND_API_KEY` | Supabase Secrets | Resend 控制台可重置；重置后在 Supabase 同步更新并**重部署** |
| `ALERT_EMAIL_TO` | Supabase Secrets | 验证域名后可改为工作邮箱（如 `zhang.hz@comlan.com`） |
| `ALERT_EMAIL_FROM` | Supabase Secrets（可选） | 验证域名后设置该域下地址 |
| Webhook Relay 收件地址 | Webhook Relay 控制台 | 一般不轮转；变更需同步 Edge Function 并重新部署 |
| Supabase `service_role` key | Supabase 项目设置 | 由 AI/管理员保管，**不进代码/文档** |

**通用轮转步骤**：Supabase → Edge Functions → `email_inbox_poc` → Secrets 改值 → 重新部署该函数 → 发测试邮件验证。

**Resend 配额**：免费版每月 3000 封；**test mode 仅能发往持有者邮箱**。监控用量：Resend 控制台 → Usage。超量或需发往多邮箱时，去 `resend.com/domains` 验证一个域名，然后把 `ALERT_EMAIL_FROM` 设为该域下地址、即可发往任意收件人。

---

## 9. 升级与联系人

- **代码 / 部署 / SQL 类问题** → 找 AI 助手（提供 issue 编号与现象）。
- **外部服务账号**（Resend / Webhook Relay / Supabase 项目权限）→ 找项目管理员。
- **所有故障处置建议在 GitHub 建 issue 追踪**，关联 AutoPrint Sprint Board，便于复盘。

---

## 附录 A：一键巡检 SQL（复制整段执行）

```sql
-- 1) 待转正积压
SELECT id, "Title", 执行时间, 总数, 成功, 跳过, 失败, status
FROM report_autoprint_staging WHERE status = 'pending' ORDER BY received_at DESC;

-- 2) 主表最近数据
SELECT "Title", 执行时间, 总数, 成功, 跳过, 失败, 耗时分钟, "CreatedBy"
FROM "ReportAutoPrint" ORDER BY 执行时间 DESC LIMIT 10;

-- 3) 归档进账
SELECT received_at, from_email, subject, filename, row_count, status
FROM email_raw_archive ORDER BY received_at DESC LIMIT 10;

-- 4) 告警健康
SELECT created_at, kind, channel, success, error_msg
FROM ingest_alert_log ORDER BY created_at DESC LIMIT 20;
```

## 附录 B：本 SOP 关联交付物

| 文档/Issue | 内容 |
|---|---|
| `docs/email_ingest_方案设计_v1.0.md` | 总体架构设计（含 Resend 旁路） |
| #27 | 监控告警任务（Resend/通用 Webhook） |
| #28 | junk filter 回归测试加固 |
| #29 | 邮件入库正式版生产验证 |
| #30 | RLS Security Check CI 修复 |
| #31 | 入库告警送达（Resend 403）修复 |
