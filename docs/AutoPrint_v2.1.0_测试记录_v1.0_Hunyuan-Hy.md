# AutoPrint v2.1.0 测试记录 v1.0

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.0 |
| 创建日期 | 2026-11-25 |
| 关联版本 | v2.1.0（可切换审批模式 manual/auto） |
| 关联 Issue | #65 |
| 作者 | 高级开发工程师（Hunyuan-Hy） |
| 测试分工 | AI：自动化测试 + 本记录整理；用户：线上手动测试 + 提供截图；AI：截图上传 GitHub 并嵌入 |
| 数据来源 | 2026-11-25 本地实测（`node *.test.mjs`）+ #65 验证报告 + Supabase 数据库交叉核实 |

---

## 一、测试构成总览

> **口径修订说明（本次透明性改进的真实发现）**：此前记录的「107 项全绿」只统计了 `email_inbox_poc` 的 4 个套件（22+37+10+38），**遗漏了 `promote_approval` 目录下的 `approval_token` 15 项 + `integration` 33 项（共 48 项）**。本次实测补齐，全量应为 **155 项自动化测试全绿**。特此纠正，避免历史口径以讹传讹。

| # | 测试套件 | 项数 | 结果 | 运行命令 |
|---|---|---|---|---|
| 1 | approval_mode 单元测试 | 22/22 | ✅ 全绿 | `node approval_mode.test.mjs` |
| 2 | body_parser 回归测试 | 37/37 | ✅ 全绿 | `node body_parser.test.mjs` |
| 3 | row_filter 回归测试 | 10/10 | ✅ 全绿 | `node row_filter.test.mjs` |
| 4 | integration（email_inbox_poc） | 38/38 | ✅ 全绿 | `node integration.test.mjs` |
| 5 | approval_token 单元测试（promote_approval） | 15/15 | ✅ 全绿 | `node approval_token.test.mjs` |
| 6 | integration（promote_approval） | 33/33 | ✅ 全绿 | `node integration.test.mjs` |
| | **自动化测试小计** | **155/155** | **✅ 全绿** | |
| 7 | JS 语法检查（node --check） | 全文件 | ✅ 通过 | 遍历 12 个 .mjs + validate-rls.js |
| 8 | esbuild 编译 | 721KB bundle | ✅ 通过 | 集成测试内编译 |
| 9 | 前端逻辑自测 | 7/7 | ✅ 通过 | 会话内自测（非脚本，见备注） |
| 10 | 线上端到端（manual / auto 合规 / auto 异常） | 3 条路径 | ✅ 全通过 | 见第四节 + #65 |

**备注**：第 9 项「前端逻辑自测 7 项」为 v2.1.0 开发时在会话内执行的临时断言（非仓库脚本），无独立可复跑文件——这正是 7.7「改进路线」要补的能力（统一入口 + 结果落盘）。

---

## 二、关键用例依据表

> 依据类型说明：`逻辑断言` = node 测试输出；`数据库核实` = Supabase 查询结果；`截图` = GitHub user-attachments 稳定链接。逻辑测试不截图（终端文本无复核价值）。

### 2.1 自动化关键用例（逻辑依据）

| 用例 ID | 被测行为 | 输入 | 预期 | 实际 | 结果 | 依据 |
|---|---|---|---|---|---|---|
| AM-01 | 数值守恒校验 | 总数5/成功4/跳过1/失败1 | 拒绝 | ok=false，含「数值不守恒」 | ✅ | approval_mode.test.mjs 输出 |
| AM-02 | 站点合法性 | site='广州' | 拒绝 | ok=false，含「站点非法」 | ✅ | 同上 |
| AM-03 | 站点缺失 fail-safe | site=undefined | 放行（入库层默认北京） | ok=true | ✅ | 同上 |
| AM-04 | 模式解析 fail-safe | resolveMode('bogus') | 回退 manual | manual | ✅ | 同上 |
| AM-05 | 自动转正触发 | shouldAutoPromote('auto') | true | true | ✅ | 同上 |
| AM-06 | 未配置默认人工 | shouldAutoPromote(undefined) | false | false | ✅ | 同上 |
| AM-07 | 重复行不硬阻断 | 同日同站两行 | 放行交 RPC supersede | ok=true | ✅ | 同上 |
| IT-01 | auto 合规转正 | auto 模式 + 合规 payload | promote RPC 被调用、auto_approved 审计写入、不发人工审批邮件 | 符合预期 | ✅ | integration.test.mjs（email_inbox_poc）H 场景 |
| IT-02 | auto 异常阻断 | auto 模式 + 数值不守恒 | promote RPC 不调用、触发阻断告警、数据留 staging | 符合预期 | ✅ | integration.test.mjs I 场景 |
| AT-01 | HMAC token 一次性 | 签名 token 二次使用 | 第二次校验失败 | 符合预期 | ✅ | approval_token.test.mjs（15 项） |

### 2.2 线上端到端关键用例（截图 + 数据库依据）

| 用例 ID | 被测行为 | 截图依据 | 数据库核实 | 结果 |
|---|---|---|---|---|
| E2E-01 | manual 待审批邮件（站点前缀生效） | ![待审批邮件](https://github.com/user-attachments/assets/ac79a410-ebcd-4b88-b197-d491a17a359b) | staging #126 status=promoted；摘要「站点 上海 · 业务日 2026-11-25」 | ✅ |
| E2E-02 | 二次确认页（防误触） | ![二次确认页](https://github.com/user-attachments/assets/efde37e3-e1aa-4e89-a9c4-d9abbff23e8c) | — | ✅ |
| E2E-03 | 审批结果邮件 | ![审批结果邮件](https://github.com/user-attachments/assets/fe08bac8-21d2-45f2-8e4a-5133390e919d) | 主表 #196 update 转正；审批请求 fe7d6d95... status=approved | ✅ |
| E2E-04 | 模式切换（manual→auto，审计留痕） | ![模式设置](https://github.com/user-attachments/assets/af6c9c71-8a3b-400d-979d-95f85471c460) | approval_mode_log 14:24:58 记录，操作人 echeung1328@hotmail.com | ✅ |
| E2E-05 | 规范邮件 → 自动转正 | ![规范邮件](https://github.com/user-attachments/assets/67280680-e439-43bd-bd6b-d9553f429eba) | staging #127 status=promoted；alert #3 自动审批转正 success=true | ✅ |
| E2E-06 | 自动转正告警邮件 | ![自动转正告警](https://github.com/user-attachments/assets/21b72486-9dc4-4972-a60c-5870cf23baea) | 同上 | ✅ |
| E2E-07 | 不规范邮件（总数105≠4+1+0） | ![不规范邮件](https://github.com/user-attachments/assets/9ae91218-b784-4732-a81e-3ec3affea966) | staging #128 status=pending（未转正） | ✅ |
| E2E-08 | 阻断告警邮件（垃圾箱） | ![阻断告警](https://github.com/user-attachments/assets/fcf7a376-2e25-4efd-996f-d683707f24ae) | alert #4 kind=自动审批阻断 success=true | ✅ |

**截图索引**：以上 8 张截图均为用户手动测试时提供、AI 上传至 GitHub，首次发布于 [#65 验证报告](https://github.com/echeung1328/autoprint-dashboard/issues/65)（issuecomment-7155184874）。此表建立「用例 ↔ 截图 ↔ 数据库证据」的对应关系，便于团队回顾时逐项复核。

---

## 三、自动化边界说明

| 环节 | 能否自动化 | 说明 |
|---|---|---|
| 纯逻辑（校验/模式解析/token/解析） | ✅ 能 | 已覆盖，155 项中绝大部分 |
| Edge Function 端到端逻辑（RPC 调用参数、分流、审计写入） | ✅ 能（mock） | 用 mock fetch/Deno，不发真实网络请求 |
| 语法 / 编译 | ✅ 能 | node --check + esbuild |
| 真实邮件投递（Webhook Relay → Edge Function） | ❌ 需人工 | 依赖外部 webhook 服务与真实邮件，mock 无法覆盖 |
| 审批邮件点击 + 二次确认 | ❌ 需人工 | 依赖真实 HMAC 链接与浏览器交互 |
| 告警邮件是否落入垃圾箱 | ❌ 需人工 | 依赖 Resend 真实投递 + Outlook 分类 |
| 看板视觉渲染 / 浏览器兼容 | ❌ 需人工 | 需人眼确认布局与样式 |
| 跨天稳定性观察 | ❌ 需人工 | 时间维度，无法即时验证 |

---

## 四、人工测试清单（需人工执行）

> 来源：v2.1.0 上线验证，用户已全部执行完毕（2026-11-25）。此清单作为后续回归的基线模板。

| # | 测试项 | 操作步骤 | 期望结果 | 为何不能自动化 | 执行人 | 证据（截图 / 数据） |
|---|---|---|---|---|---|---|
| 1 | manual 人工审批链路 | 保持 manual → 发上海测试邮件 → 点批准 → 二次确认 → 确认转正 | 待审批邮件→确认页→结果邮件；主表 update 转正 | 依赖真实邮件 + HMAC 链接点击 | 用户 | E2E-01/02/03；staging #126、主表 #196 |
| 2 | auto 模式切换 | 看板 ⚙️ 审批设置 → 切 auto → 二次确认 | 切换成功，approval_mode_log 有记录 | 依赖 admin 登录与浏览器交互 | 用户 | E2E-04；审计日志 14:24:58 |
| 3 | auto 合规转正 | 发规范邮件（5/4/1/0） | 自动转正、发转正告警、不发现人工审批邮件 | 依赖真实邮件链路 | 用户 | E2E-05/06；staging #127、alert #3 |
| 4 | auto 异常阻断 | 发不规范邮件（总数105） | 数据留 staging(pending)、发阻断告警 | 依赖真实邮件链路 | 用户 | E2E-07/08；staging #128、alert #4 |
| 5 | 告警邮件查收 | 查 Outlook 收件箱/其他/垃圾箱 | 找到告警邮件，正文与日志一致 | 依赖 Resend 投递 + Outlook 分类 | 用户 | E2E-08（垃圾箱找到） |
| 6 | 跨天稳定性观察 | 保持 auto 观察 1-2 天 | 无异常转正、无误报 | 时间维度 | 用户 | 待回填 |

**遗留 / 建议**：
- staging #128 为测试脏数据（pending），可按 SOP §7 人工处理或忽略，不影响生产。
- Resend 测试域名 `onboarding@resend.dev` 邮件易落垃圾箱；如要求告警必达，后续改用已验证域名发件。
- 观察期结束后由用户把 #65 移 Done（AI 不主动关闭）。

---

## 五、回顾与追踪（应对「Issue 段落无法细粒度追踪」）

按《贡献指南 v1.1》§7.6 的分层方式，本记录的追踪入口如下：

| 追踪需求 | 落点 |
|---|---|
| 全局测试结果单一来源 | 本文档（可版本化、逐用例可标注） |
| 团队回顾入口 | #65 结构化验证报告评论（分路径 + 证据表 + 截图） |
| 单个用例需补测 / 转人工 | 在本文「依据/备注」列追加 `⚠️ 需人工补测` 并说明原因，同时在 #65 留评论 |
| 自动化结果可视化（未来） | JUnit XML + `dorny/test-reporter`（本期脚本不动，未启用） |

### 本次回顾产生的补测/改进项

| 用例/项 | 类型 | 说明 | 状态 |
|---|---|---|---|
| 测试项数口径 | ⚠️ 口径修订 | 「107 项」漏算 promote_approval 48 项，已纠正为 155 项 | ✅ 已在本文档修订 |
| 前端逻辑自测 7 项 | ⚠️ 需脚本化 | 临时断言无可复跑文件，待补统一入口脚本（§7.8） | 待办（后续迭代） |
| 告警邮件投递稳定性 | ⚠️ 需人工持续观察 | 测试域名易落垃圾箱，观察 1-2 天 | 进行中（用户） |

---

*本文档遵循《AutoPrint 贡献指南 v1.1》第 7 节测试规范；数据来源为 2026-11-25 本地实测与 #65 验证报告，关键数据均经数据库交叉核实。*
