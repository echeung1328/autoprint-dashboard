# 邮件 → Supabase 入库 方案设计（方向 B 正式版）

> 版本：v1.0 ｜ 最后更新：2026-07-24 ｜ 维护人：Eric Zhang
> 关联 Issue：#24（POC，Done）／ #25（正式版，Done）

---

## 1. 背景与目标

- **POC（Issue #24）** 已完成最小验证：邮件能到达、Edge Function 能跑、数据能入库（原始归档表 `email_raw_archive`，POC 时期曾名 `email_inbox_poc`，已验证 2 行）。
- **正式版（Issue #25，方向 B）** 目标：把 POC 升级为**生产可用**管道，满足四项要求：
  1. **安全**：写库身份合规、密钥不落地代码/文档；
  2. **可审计**：每一批数据有批次标签、可追述来源；
  3. **可回退**：错误数据不污染主表，整批可一键撤销；
  4. **可迭代**：SOP 数据质量铁律固化到代码与 SQL，后续改需求有章可循。
- **核心链路**：白名单邮箱发带 xlsx/csv 附件的邮件 → 自动解析 → 应用数据质量铁律 → 进入 staging（人工确认闸）→ 用户「确认转正」后写入主表 `ReportAutoPrint`。

---

## 2. 总体架构（数据流向）

```
白名单邮箱  <ALLOWED_SENDERS>
   │  发邮件（带 xlsx / csv 附件）
   ▼
Webhook Relay 收件地址  <WEBHOOK_RELAY_ADDRESS>
   │  HTTP POST（携带 Basic Auth 头）
   ▼
Supabase Edge Function：email_inbox_poc（v10）
   │  ① Basic Auth 门禁 + 发件白名单校验
   │  ② service_role 写库（绕过 ReportAutoPrint 既有 RLS）
   │  ③ 解析 xlsx（SheetJS 本地 vendor）/ csv
   │  ④ 应用 SOP 数据质量铁律
   │      · 双语列映射  · 时间戳统一 +08:00
   │      · 复合键(Title+执行时间)去重  · 冲突检测 INSERT/UPDATE
   │  ⑤ 清洗后落 report_autoprint_staging（status=pending，带 conflict_action 标记）
   │  ⑥ 原始 base64 归档 email_raw_archive（保留，不删，用于排错/重放）
   ▼
report_autoprint_staging（待人工确认）
   │  用户确认后 → AI 执行 supabase/promote_staging.sql
   ▼
ReportAutoPrint（主表，生成列「耗时分钟」由库自动算）
```

---

## 3. 组件说明

### 3.1 Webhook Relay 收件地址（邮件入站）
- **作用**：把收到的邮件转成 HTTP POST，触发 Edge Function。
- **认证**：函数侧做 Basic Auth 校验（`WEBHOOK_BASIC_USER` / `WEBHOOK_BASIC_PASS`）；Webhook Relay 出站请求带上该头。
- **配置位置**：Webhook Relay 控制台（真实地址见**本地密钥文档 `SECRETS_LOCAL.md`**，不入库）。

### 3.2 Edge Function `email_inbox_poc`（v10 正式版）
- **入口**：`https://uvqjtvonxwsmhntnyest.supabase.co/functions/v1/email_inbox_poc`
- **鉴权**：`verify_jwt=false`（外部 webhook 不发 JWT），改由 **Basic Auth + 发件白名单** 做门禁。
- **写库身份**：`SUPABASE_SERVICE_ROLE_KEY`（绕过主表/ staging 的 RLS 实现自动入库）。
- **关键依赖**：xlsx 库以 `xlsx.mjs` 形式 **vendor 在函数目录**（不再依赖外部 CDN，原因见经验教训文档 §1）。

### 3.3 表 `report_autoprint_staging`（中转 / 确认闸）
- 镜像主表业务列 + 元数据列：`source_email` / `source_filename` / `batch_tag` / `conflict_action` / `status` / `error_msg`。
- **RLS**：已启用；approved 用户只读；`service_role` 写库自动绕过。
- `status` 取值：`pending`（待转正）／ `promoted`（已转正）／ `error`。
- 索引：`(Title, 执行时间)` 复合键；`status`。

### 3.4 表 `email_raw_archive`（原始归档，POC 延续）
- **RLS 已启用**（仅 service_role 可写、approved 用户可读），仅存原始投递元数据与 base64 附件，用于排错与重放。
- 字段：`from_email` / `subject` / `filename` / `content_type` / `raw_base64` / `row_count` / `status` / `error_msg` / `received_at`。

### 3.5 表 `ReportAutoPrint`（主表，最终数据）
- **RLS 已启用**（approved 用户 read/insert/update/delete 四条策略）。
- `耗时分钟` 为 `GENERATED ALWAYS` **生成列**，写入时跳过，由库按 `完成时间 − 执行时间` 自动算。
- `CreatedBy` / `ModifiedBy` 用于批次回退标签。

---

## 4. 关键设计决策

| 维度 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 写库身份 | anon vs service_role | **service_role** | 主表 RLS 仅放行 approved 用户；anon 写会被拒。service_role 绕过 RLS 实现自动入库 |
| 数据落点 | 直接写主表 vs staging 闸 | **staging 两阶段** | 保留「人工确认」安全文化，错误数据不污染主表 |
| 附件解析 | 函数内 vs 外部步骤 | **函数内** | 链路全自动，减少人工触发；代价是改动需真实邮件联调 |
| xlsx 库 | CDN 动态 import vs 本地 vendor | **本地 vendor** | Edge Function 运行时无法稳定 import 外部 CDN（经验教训 §1） |
| 错误暴露 | 吞错 vs Response Body | **Response Body** | 非技术用户可在 Webhook Relay 直接看到失败原因 |

---

## 5. SOP 数据质量铁律在代码中的落地

对应 `SOP_supabase_data_upload.md` 的规定，已固化为代码/SQL：

| SOP 条款 | 代码/SQL 落地位置 |
|---|---|
| 双语列映射（§5.3.2） | `index.ts` 的 `RULES` 数组，大小写/空白不敏感、关键词模糊匹配 |
| 时间戳 `+08:00`（§5.3.3） | `index.ts` 的 `parseTs()`，统一输出 `...+08:00`，支持 Excel 序列值/多种格式 |
| 复合键去重（§5.3.5） | `index.ts` 的 `cleanMatrix()`，文件内按 `(Title+执行时间)` 去重，绝不单列 Title |
| 冲突检测 INSERT/UPDATE（§5.4/§5.5） | `index.ts` 的 `reportExists()` + `conflict_action` 标记 |
| 生成列不写（§5.2.2） | staging 仅预览 `耗时分钟`；`promote_staging.sql` INSERT/UPDATE 均不含该列 |
| 批次标签 `CreatedBy`（§5.6.1） | `batch_tag = EMAIL_YYYYMM`，用于回退 |

---

## 6. 安全模型

- **入站门禁**：Basic Auth（函数侧校验）+ 发件白名单 `ALLOWED_SENDERS`。
- **写库隔离**：`service_role` 仅函数运行时使用，绝不下发到前端/客户端。
- **RLS**：主表与 staging 均启用，approved 用户可读；`service_role` 绕过写。
- **密钥管理**：所有密钥经 Supabase Secrets / Webhook Relay 配置存储；**代码与文档不含明文**（真实值仅在本地密钥文档）。

---

## 7. 关联文档与 Issue

- Issue #24（POC，Done）／ Issue #25（正式版，Done）
- `SOP_supabase_data_upload.md`（数据质量总 SOP）
- `supabase/promote_staging.sql`（转正脚本，两阶段人工闸）
- `docs/email_ingest_部署实施_v1.0.md`
- `docs/email_ingest_SOP操作手册_v1.0.md`
- `docs/email_ingest_经验教训_v1.0.md`
- `SECRETS_LOCAL.md`（**本地密钥文档，绝不入库**）
