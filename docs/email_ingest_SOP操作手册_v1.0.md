# 邮件 → Supabase 入库 SOP 操作手册（方向 B 正式版）

> 版本：v1.0 ｜ 最后更新：2026-07-24 ｜ 维护人：Eric Zhang
> 面向：日常运维、排错、确认转正、后续迭代。所有密钥用 `<...>` 占位，真实值见本地密钥文档 `SECRETS_LOCAL.md`。

---

## 1. 每次发完邮件后：如何确认？

### 方法 1（最快，无需工具）：看 Webhook Relay Response Body
在 Webhook Relay 控制台 → 收件地址 → 该请求的 Response Summary，看一行返回：

| 返回内容 | 含义 | 处理 |
|---|---|---|
| `ok-staged-N (update=M)` | N 行进 staging，其中 M 行将 UPDATE 主表 | 正常 ✅ |
| `ok-no-rows` | 没解析出数据 | 需排查（见 §3） |
| `ok-no-rows; parse-errors: <文件>: <错>` | 解析失败，错误信息已显示 | 发截图给 AI |
| `ENV missing env: ...` | 某 secret 没注入 | 见 §3 |
| `auth-fail` | Basic Auth 不匹配 | 见 §3 |
| `ok-not-allowed` | 发件不在白名单 | 见 §3 |

### 方法 2（自己查数据库）：Supabase Dashboard → SQL Editor
```sql
-- staging 里待转正的批次
SELECT batch_tag, status, conflict_action, "Title", "执行时间"
FROM report_autoprint_staging WHERE status='pending';

-- 主表是否已转正
SELECT "Title", "执行时间", "耗时分钟", "CreatedBy"
FROM "ReportAutoPrint" ORDER BY "执行时间" DESC LIMIT 5;
```

### 方法 3（找 AI 代为确认转正）：直接说一句话
提示词模板：
> **「确认转正」** —— 我会执行 promote_staging.sql 并给出执行前后校验。

更具体：
> 「把 report_autoprint_staging 里 status='pending' 的批次转正到 ReportAutoPrint，并给我校验结果。」

整轮重跑（换了新函数重新联调）：
> 「重新跑一遍邮件 → Supabase 入库联调：我先部署，发完邮件告诉你，你查 staging。」

---

## 2. 「确认转正」标准流程（两阶段人工闸）

**触发条件**：方法 1/2 确认 staging 数据无误（无 `error_msg`、字段正确）。
**谁执行**：用户确认后，由 AI 通过 Supabase MCP `execute_sql` 执行 `supabase/promote_staging.sql`。

步骤（脚本已固化，此处为说明）：
1. **执行前校验**：`SELECT batch_tag, COUNT(*), inserts/updates/check_err/warn_rows FROM ... WHERE status='pending' GROUP BY batch_tag;`
2. **INSERT**：复合键 (Title+执行时间) 在主表不存在的行 → 新增。
3. **UPDATE**：复合键已存在的行 → 仅改业务字段（保留原 CreatedBy 以便回退）。
4. **标记**：staging 置 `promoted`。
5. **执行后校验**：主表本批条数 + 抽样（含生成列 `耗时分钟`）。
6. **回退**（如需撤销本批）：`DELETE FROM "ReportAutoPrint" WHERE "CreatedBy"='<BATCH_TAG>';` 并 staging 复位 `pending`。

**铁律**：
- 绝不写生成列 `耗时分钟`（主表自动算）。
- 必须带 `CreatedBy` 批次标签（回退依据）。
- staging 不自动落主表——必须人工/AI 确认。

---

## 3. 排错指南（现象 → 原因 → 处理）

| 现象（Response Body / 症状） | 原因 | 处理 |
|---|---|---|
| `ENV missing env: SERVICE_ROLE` | service_role secret 没设/没注入 | `supabase secrets list` 确认 `SUPABASE_SERVICE_ROLE_KEY` 存在；重部署 |
| `auth-fail` | Basic Auth 不匹配 | 核对 `WEBHOOK_BASIC_USER/PASS` 与 Webhook Relay 出站配置一致 |
| `ok-not-allowed` | 发件不在白名单 | 确认发件箱在 `ALLOWED_SENDERS`；或加白 |
| `ok-no-rows` | 附件未被识别为 xlsx/csv | 确认附件扩展名/Content-Type；函数按 `(excel\|spreadsheet\|csv)` / `.xlsx,.xls,.csv` 过滤 |
| `ok-no-rows; parse-errors: ... Module not found` | xlsx 库未 vendor / 版本错 | 确认函数目录有 `xlsx.mjs` 且静态 import；用 0.18.5 社区版 |
| `STAGE_FAIL ...` | 写 staging 失败 | 看错误信息；多为字段类型/约束；查 staging 表结构 |
| staging 行 `error_msg` 含 `execTime-unparsed` | 时间字段解析失败 | 检查源文件时间格式；`parseTs` 支持多种格式但不含的需补 |
| 主表 `耗时分钟` 异常大 | 完成时间年份/月份笔误 | 修正源数据后重新发/UPDATE |
| 时间戳差 8 小时 | 未带 +08:00 | 代码已固定 +08:00；若仍差，查源格式是否被误判 |
| 同标题记录被误覆盖 | 去重用了单列 Title | 代码已用 (Title+执行时间) 复合键，检查是否旧版 |

---

## 4. 后续迭代建议（Best Practice）

1. **附件格式校验增强**：当前仅按扩展名/Content-Type 粗筛，建议加 MIME 校验与「空附件/损坏文件」明确报错。
2. **失败可观测**：把关键错误同时写一张诊断表（或复用 `email_raw_archive` 的 `error_msg`），非技术用户可在 Supabase Dashboard 直接看，无需盯 Webhook Relay。
3. **监控告警**：对 `ok-no-rows`（连续无数据）、`STAGE_FAIL`、白名单拒绝做阈值告警（如 Teams webhook）。
4. **批次管理视图**：提供一个 SQL 视图，列出各 `batch_tag` 的 pending/promoted 状态与条数，方便批量确认转正。
5. **多收件地址/多表**：若未来不同邮件对应不同目标表，建议用「收件地址 → 目标表」映射配置，而非硬编码。
6. **Schema 迁移安全**：任何改表必须先 `SELECT` 确认影响范围，迁移脚本纳入版本库与评审；严禁在生产直接手写破坏性 SQL。
7. **自动化测试**：为函数补充单元测试（列映射/时间解析/去重），减少「靠真实邮件联调」的成本；可用 Deno 本地 `deno test`。
8. **密钥轮换**：定期轮换 `WEBHOOK_BASIC_PASS` 与 `SERVICE_ROLE_KEY`，并更新本地密钥文档与 Supabase Secrets，确保两者一致。
9. **文档与代码同步**：函数或 SOP 变更时，同步更新本手册与 `SOP_supabase_data_upload.md`，避免文档漂移。

---

## 5. 紧急回退

- **整批撤销转正**：`DELETE FROM "ReportAutoPrint" WHERE "CreatedBy"='<BATCH_TAG>';` 后 staging 复位为 `pending`。
- **函数异常**：重新部署上一稳定版本（`supabase functions deploy` 指定历史，或 git 恢复 `index.ts` 后部署）。
- **密钥泄露**：立即在 Supabase / Webhook Relay 轮换对应密钥，并更新本地密钥文档。
