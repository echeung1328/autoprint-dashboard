# 邮件 → Supabase 入库 经验教训文档（方向 B 正式版）

> 版本：v1.0 ｜ 整理日期：2026-07-24 ｜ 维护人：Eric Zhang
> 目的：沉淀本次从 POC 到正式版落地过程中的真问题，供后续迭代与类似项目复用。

---

## 1. Edge Function 运行时无法稳定 import 外部 CDN

- **现象**：函数内 `import('https://esm.sh/xlsx')` 等动态导入，联调时全部报 `Module not found`（先报 0.20.3 Pro 找不到，改 0.18.5 后仍报 jsdelivr 找不到）。
- **根因**：Supabase Edge Function（Deno）运行时对动态外部 import 有网络/模块解析限制，不能依赖运行时拉取 CDN。
- **对策**：将依赖（如 `xlsx@0.18.5` 的 ESM 构建，约 876KB）**下载到函数目录 `xlsx.mjs`**，用静态 `import * as XLSX from './xlsx.mjs'`。
- **教训**：凡 Edge Function 的关键依赖，**一律 vendor 本地**，不要赌 CDN 可达。

---

## 2. SheetJS 版本陷阱：0.20.x 是 Pro 付费版

- **现象**：最初用 `xlsx@0.20.3`，esm.sh / cdn.sheetjs.com 公开镜像均无此版本 → 404。
- **教训**：SheetJS 自 0.19+ 后社区版停留在 0.18.5 左右，0.20.x 是商业 Pro。用到 xlsx 时**默认用社区版 0.18.5**，需要高级特性再评估付费。

---

## 3. 主表 RLS 早已开启，方向 B 关键是换 service_role

- **现象**：HANDOFF 预设「表开 RLS（仅 service_role 可写）」，实测 `ReportAutoPrint` 早就启用 RLS 并有 4 条 approved-user 策略。
- **影响**：POC 用 anon key 写主表会 401；正式版正确做法是 Edge Function 改用 `service_role` 写库（绕过 RLS），而非「再开一次 RLS」。
- **教训**：动手前先 `SELECT ... FROM pg_policies` 看真实策略，别凭文档假设。

---

## 4. 公开仓库不能存明文密钥

- **现象**：仓库 `echeung1328/autoprint-dashboard` 是 **PUBLIC**。交接文档里原有 `WEBHOOK_BASIC_PASS` 明文和 Basic Auth base64。
- **风险**：一旦 commit 即全网可见，等于把密码发给所有人。
- **对策**：提交前 `grep` 搜密码/token/key → 替换为 `<...>` 占位符；真实值仅在 **本地密钥文档** 与 Supabase Secrets / Webhook Relay 配置中保留。
- **教训**：凡进 PUBLIC 仓库的文档，提交前必须脱敏。这是铁律。

---

## 5. 错误暴露到 Response Body 优于吞错

- **现象**：初版解析失败只写库、Response Body 返回 `ok-no-rows`，非技术用户看不到原因。
- **改进**：无 staging 行且有解析错误时，Response Body 直接返回 `ok-no-rows; parse-errors: <文件名>: <错误>`。
- **教训**：把失败原因暴露到调用方可见的响应体（或诊断表），排错效率大幅提升。

---

## 6. POC Issue 与 Production Issue 应分离

- **现象**：#24 是 POC（DoD=最小验证），方向 B 是生产可用（DoD 完全不同）。
- **做法**：新建 Issue #25 承载正式版，#24 保留为 POC 记录，看板均置 Done。
- **教训**：阶段不同、验收标准不同，用不同 Issue 承载，可追溯、看板干净。

---

## 7. 联调依赖真实邮件，沙箱无法自测

- **现象**：本机沙箱无 Deno、无外网，不能像单测那样跑函数；只能靠真实邮件经 Webhook Relay 联调。
- **对策**：代码逻辑自检 + 部署后真实邮件验证；提交信息如实标注「待真实邮件联调」，不谎称本地测试通过。
- **教训**：涉及外部 webhook/邮件的链路，规划时就把「真实联调」算进验证步骤。

---

## 8. SOP 铁律必须写进代码，而非仅靠人脑

双语列映射 / 显式 +08:00 / 复合键去重 / 冲突检测 / 生成列不写 / 批次标签——这些在 `SOP_supabase_data_upload.md` 里的规定，最终以代码（`index.ts` 的 `RULES` / `parseTs` / `cleanMatrix` / `conflict_action`）和 SQL（`promote_staging.sql`）形式固化，才能真正「落到实地、可复用、可审计」。
