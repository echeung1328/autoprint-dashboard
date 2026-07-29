# 设计文档：邮件审批转正（issue #35）v1.0

> 目标：staging 新增 pending 数据后，自动发审批邮件；审批人点击「批准」→ 确认页 → 执行转正，替代手动 SQL（SOP §7 降级为后备通道）。
> 关联：#34（三源导入）、#31（Resend 告警链路）、`docs/design_multi_source_ingest_v1.0.md`、`docs/ops_monitoring_sop.md` §7
> 已确认决策：D1 链接+确认页；D2 每封入库即发；D3 超时 72h 仅提醒不自动转；D4 拒绝=rejected 保留审计

## 1. 架构

```
邮件到达 → email_inbox_poc (v12) 解析入 staging(pending)
              │
              ▼ 新增：创建审批请求 + 发审批邮件（Resend）
   promote_approval_request 表（登记 staging_ids + 过期时间，status=pending）
   审批邮件：数据摘要表 + [✅ 批准] [❌ 拒绝] 两个链接（带 HMAC token）
              │ 点击链接（GET）
              ▼
   Edge Function: promote_approval
   ├─ GET  ?id=<uuid>&t=<token>&a=approve|reject
   │        仅校验 + 渲染确认页 HTML（绝不改数据 ★防 Safe Links 预点击）
   └─ POST （确认页表单提交）
            1. 校验 HMAC token + 未过期 + status=pending（一次性）
            2. approve → 执行 SOP §7 同源 SQL：步骤⓪冲突加权 → UPDATE/INSERT → promoted
               reject  → staging 标 rejected
            3. 更新 promote_approval_request（approved/rejected + 结果）
            4. 回发结果邮件（Resend）
```

## 2. 安全设计

| 项 | 方案 |
|---|---|
| Token | `HMAC-SHA256(id + '.' + expires_epoch, PROJECT_APPROVAL_SECRET)`，hex 输出；URL 携带 `id`、`exp`、`a`(action)、`t`(token) |
| 密钥 | Supabase Secret `PROJECT_APPROVAL_SECRET`（`PROJECT_` 前缀，避开 CLI 护栏），随机 ≥32 字节 |
| 一次性 | DB 表 `promote_approval_request.status` 必须为 `pending` 才可执行；执行后翻转，重复点击提示"已处理" |
| 过期 | `expires_at`（默认 72h）；过期请求提示走 SOP §7 手动通道 |
| GET 无副作用 | GET 仅渲染确认页；企业邮箱安全网关（Office 365 Safe Links 等）自动预点击不会造成误批 ★ |
| 防篡改 | token 覆盖 id+exp+action；改任何参数校验即失败 |
| 权限 | 函数用 service_role 操作 DB；`verify_jwt=false`（邮件点击无 JWT）；安全性完全由 HMAC token 承担 |
| 审计 | 每次审批动作更新 `promote_approval_request`（acted_at / actor_info / action_result） |

## 3. 数据表：promote_approval_request（已建，migration `create_promote_approval_request`）

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 即 token 载荷的一部分 |
| staging_ids | integer[] | 本次待转正的 staging 行 |
| summary | text | 邮件摘要（审计留档） |
| expires_at | timestamptz | 默认 now()+72h |
| status | text | pending / approved / rejected / expired |
| created_at / acted_at | timestamptz | |
| actor_info | text | UA/IP 片段 |
| action_result / error_msg | text | 转正结果或错误 |

RLS：开启；service_role 全权（bypass）；approved 用户只读。

## 4. 转正 SQL（与 SOP §7 同源，函数内执行）

按顺序：步骤⓪ 同日冲突加权（`(email_body)` 权重低）→ A 更新已存在业务日 → B 插入新业务日（`耗时分钟` 生成列不插）→ staging 标 promoted。**范围限定 `id = ANY(staging_ids)` 且 status='pending'**，不影响其他批次。
执行方式：`pg` 无法直接用 REST 跑多语句 → 使用 RPC：新建 `promote_staging_ids(int[])` SQL 函数（SECURITY DEFINER，service_role 调用），一次事务完成，返回 promoted/superseded 计数。

## 5. 邮件模板

- **审批邮件**：主题 `[AutoPrint 待审批] YYYY-MM-DD 数据转正`；正文 HTML 表格（业务日/Title/总数/成功/失败/来源渠道）+ 绿色「✅ 批准转正」/ 灰色「❌ 拒绝」按钮 + 有效期说明 + "误发可忽略，72h 后自动失效"。
- **结果邮件**：主题 `[AutoPrint 审批结果] 已批准/已拒绝`；正文含执行结果（promoted 行数、主表 id）。
- 发件通道复用 `RESEND_API_KEY` + `ALERT_EMAIL_FROM`；收件人 = `ALERT_EMAIL_TO`（白名单审批人）。

## 6. 失败与降级

| 场景 | 行为 |
|---|---|
| 审批邮件发送失败 | 不影响入库；写 `ingest_alert_log`；数据仍可走 SOP §7 手动转正 |
| token 过期 | 确认页提示已过期 + 指引 SOP §7 |
| 重复点击 | 提示"该请求已处理（approved/rejected）"，不重复执行 |
| 转正 SQL 失败 | request 记 error_msg，回发失败邮件，staging 留 pending 可手动处理 |
| 超时提醒（D3） | 后续用 pg_cron 巡检 expires_at 过期且 pending → 发提醒（一期可先不做，标注 TODO） |

## 7. 测试计划

1. `approval_token.mjs` 单测：生成/校验/过期/篡改（id、exp、action 任一变化即失败）。
2. `promote_approval` 集成测试（esbuild 编译 + mock Deno/fetch）：GET 渲染确认页不写库；POST approve 走 RPC；POST reject 标 rejected；过期/重复/坏 token 各分支。
3. `email_inbox_poc` v12 回归：原 26 集成用例 + 新增"入库后发审批邮件"断言。
4. 真实链路：发测试邮件 → 收审批邮件 → 点批准 → 确认页 → 查主表。

## 8. 交付物

- `supabase/functions/promote_approval/index.ts` + `approval_token.mjs` + 测试
- `email_inbox_poc` v12（发审批邮件）
- DB：`promote_approval_request` 表 + `promote_staging_ids(int[])` RPC
- Secret：`PROJECT_APPROVAL_SECRET`
- SOP 更新：§7 标注"后备通道"，新增 §7B 邮件审批说明
