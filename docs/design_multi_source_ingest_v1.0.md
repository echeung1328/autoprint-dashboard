# 多源数据导入架构设计 v1.0（三源统一入 staging）

> 关联 Issue：#34（新增邮件正文数据导入）
> 状态：**设计已冻结**（2026-07-29，四点决策已确认），进入实施阶段
> 适用读者：维护者 / AI 助手 / 值班 PM
> 关联文档：`docs/ops_monitoring_sop.md`（运维 SOP，转正流程 §7）、`docs/email_ingest_方案设计_v1.0.md`（邮件链路总体设计）

---

## 1. 背景与目标

现有系统仅支持**邮件 Excel 附件**导入。业务需求扩展为三种数据来源：

| 来源 | 使用场景 | 状态 |
|---|---|---|
| ① 邮件正文（body） | **业务日（周一至五）日常通知**，每日一封 | 本期实现（#34） |
| ② 邮件 Excel 附件 | **批量调整 / 多日数据补导入** | 已上线 |
| ③ API（JSON） | 未来系统直连导入 | 预留设计 |

目标：三个来源**统一产出同一份规范化记录（normalized record）**，共用 staging → 转正 → 告警 → 监控全链路；未来新增来源零改动下游。

## 2. 总体架构

```
            ┌─────────── 邮件渠道 (Webhook Relay) ───────────┐
            │  ① 正文(body)  → body_parser.mjs   [本期新增]  │
            │  ② Excel附件   → xlsx.mjs 解析      [现有]      │
            └───────────────────────┬───────────────────────┘
                                    │
            ┌─────────── API 渠道 (未来) ────────────────────┐
            │  ③ JSON        → json_parser.mjs   [预留]      │
            └───────────────────────┬───────────────────────┘
                                    ▼
                      统一规范化记录 (normalized record)
                                    ▼
                   report_autoprint_staging (status='pending')
                                    ▼
                   人工确认 / 转正 (SOP §7) → ReportAutoPrint 主表
                                    ▼
              告警 (Resend / ingest_alert_log) + 归档 (email_raw_archive)
```

**关键原则**：parser 只负责「原始输入 → normalized record」，转正 / 去重 / 告警逻辑与渠道无关。

## 3. 已确认决策（2026-07-29 拍板）

| # | 决策项 | 结论 |
|---|---|---|
| D1 | 触发优先级 | 邮件渠道内 **正文 > Excel 附件**；JSON 走独立 API 端点，不与邮件混。正文仅在**完整 schema 匹配**时触发（见 §5 Guard），否则回落附件解析 |
| D2 | CreatedBy | 正文 → 正文「创建人」字段；**Excel → 发件人 `from_email`**（改自原 batchTag）；JSON → payload `operator`，缺省 API 身份 |
| D3 | 记录ID/SharePoint 链接 | **免改表**：`标签` 列存 token `SRC=BODY/XLSX/API` + `SP_REC=<记录ID>`；SharePoint URL 由固定基址 + ID 重建，不存整条 URL |
| D4 | 同日冲突 | 主表 `UNIQUE(execution_date)`（每业务日一条）。同一业务日多来源到达时 **Excel/API（补导/更正）覆盖 正文（日报）**；同渠道后到覆盖先到 |
| D5 | 导入日范围 | **不限星期**，任何到达的有效数据都入 staging（与现有逻辑一致） |

## 4. 数据源限制（铁律，勿改）

| # | 限制 | 实现要求 |
|---|---|---|
| L1 | `执行时间` / `完成时间` **恒为 UTC+8，永不带 Z** | 解析一律拼 `+08:00`（复用现有 `parseTs()`）。**禁止写「检测 Z 再分支」逻辑**（已验证是误解产物）。Excel 路径 `parseTs()` 已实测无重复 +8 问题 |
| L2 | `Title` 为 AI 随机生成，**不可信** | 禁止从 Title 推导时间/业务日；仅原样存 `Title` 列 |
| L3 | 唯一可信时间源 = 正文/表格中显式的 `执行时间` 字段 | 缺失 → 该记录归档 `status='parse_error'`，不入 staging |

## 5. 邮件正文解析规范（body_parser）

### 5.1 触发 Guard（防误命中）

正文解析**仅当**正文完整匹配通知 schema 才触发，需同时提取到以下 7 个必备键：
`Title`、`执行时间`、`总数`、`成功`、`跳过`、`失败`、`完成时间`。
否则（如签名、转发、闲聊正文）回落到附件解析路径，正文忽略。

### 5.2 正文格式（键值对，全角/半角冒号均兼容）

```
创建人：张怀忠(Zhang Huaizhong 昆仑联通)
邮箱：zhang.hz@comlan.com
Title：AutoPrint-2026-07-29 09:30
执行时间：2026-07-29 09:30:00
总数：6
成功：6
跳过：0
失败：0
完成时间：2026-07-29 09:30:54
附件Excel表格：TRUE
任务完成通知邮件：TRUE
耗时（分钟）：1
查看 SharePoint 记录：https://comlanoffice.sharepoint.com/...&ID=139
记录ID：139
```

### 5.3 字段映射（正文键 → staging 列）

| 正文键 | staging 列 | 处理 |
|---|---|---|
| Title | `Title` | 原样存（L2：不解析时间） |
| 执行时间 / 完成时间 | `执行时间` / `完成时间` | `parseTs()` 恒 +08:00（L1） |
| 总数/成功/跳过/失败 | 同名 | parseInt，非法置 0；**总数=0 合法** |
| 附件Excel表格 / 任务完成通知邮件 | 同名 | `/^(是\|true\|yes\|1\|y)$/i` → boolean |
| 耗时（分钟） | `耗时分钟` | staging 存预览值；主表为生成列**不插** |
| 创建人 | `CreatedBy` / `ModifiedBy` | 正文创建人（D2） |
| 邮箱 | `source_email` | 发件人以 webhook `from` 为准，正文邮箱仅参考 |
| 记录ID | `标签` 追加 `SP_REC=<id>` | D3 |
| （渠道标识） | `source_filename='(email_body)'` + `标签` 追加 `SRC=BODY` | 免改表的渠道溯源 |

### 5.4 渠道标识约定（零 DDL）

| 渠道 | source_filename | 标签 token |
|---|---|---|
| 邮件正文 | `(email_body)` | `SRC=BODY` |
| Excel 附件 | 实际文件名 | `SRC=XLSX` |
| JSON API（未来） | `(api_json)` | `SRC=API` |

转正 SQL 以 `source_filename = '(email_body)'` 识别 BODY 渠道做同日冲突加权（D4），无需新增列。

## 6. 各渠道 CreatedBy 与溯源（D2 汇总）

| 渠道 | CreatedBy | 批次溯源 |
|---|---|---|
| 正文 | 正文「创建人」 | `batch_tag = EMAIL_YYYYMM` 保留 |
| Excel 附件 | `from_email`（**行为变更**，原为 batchTag） | `batch_tag` 保留 |
| JSON API | payload `operator`，缺省 `API-Import` | `batch_tag = API_YYYYMM` |

## 7. 同日冲突转正规则（D4）

主表约束：`UNIQUE(execution_date)`（业务日 = `(执行时间 AT TIME ZONE 'Asia/Shanghai')::date`）。

转正时同一业务日有多条 pending：
1. **渠道加权**：`XLSX/API（source_filename ≠ '(email_body)'） > BODY`；
2. 同渠道多条：`received_at` 最新者胜；
3. 落选记录标记 `status='superseded'`（不转正、保留审计）。

详见 SOP §7 的转正 SQL（已同步更新）。

## 8. 监控与告警

- 每渠道解析失败/0 行均写 `ingest_alert_log`，`detail` 内含渠道标识；
- 正文 guard 未命中且无附件 → 视为「无数据邮件」，仅归档 meta，不告警（正常场景：其他往来邮件）；
- 正文 guard 命中但字段解析失败（如缺执行时间）→ 归档 `parse_error` + 告警。

## 9. JSON API 预留设计（不在本期实施）

- 独立 Edge Function 路径 + 独立鉴权（非 Webhook Basic Auth）；
- payload 字段与 normalized record 一一对应；`source_filename='(api_json)'`、`标签` 加 `SRC=API`；
- 复用同一 staging / 转正 / 告警链路，零下游改动。

## 10. 实施拆解（#34 子任务）

| 步骤 | 内容 | 验证方式 |
|---|---|---|
| T1 | 本设计文档 + SOP §7 更新 | 文档评审 |
| T2 | `body_parser.mjs` + `body_parser.test.mjs` | 本地 Node 单测全绿（含 Title 随机中文、无 Z 时间、缺执行时间、guard 未命中） |
| T3 | `index.ts` 主流程：正文>附件分支、SRC/SP_REC 标签、Excel CreatedBy→from_email | 本地逻辑自测 + 部署前 review |
| T4 | 转正 SQL 冲突加权（SOP §7） | Supabase 构造测试数据实跑后清理 |
| T5 | 部署 + 真实邮件链路验证 | 发正文格式测试邮件 → 查 staging 入库、SRC=BODY、时间正确 |

---

## 附录：变更历史

| 日期 | 版本 | 说明 |
|---|---|---|
| 2026-07-29 | v1.0 | 初版：三源架构、D1–D5 决策、L1–L3 数据源限制冻结 |
