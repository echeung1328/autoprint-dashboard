# 复盘：Supabase Edge Function 确认页 Content-Type 4 轮返工根因分析

> 关联 Issue：#39（复盘主文档）｜ 关联改进：#38（浏览器渲染验证留痕）、#40（平台约束预检卡）、#41（SOP 平台限制知识）
> 日期：2026-07-30 ｜ 涉及功能：#35 邮件审批转正（promote_approval）
> 作者：AI 协助整理，Eric Zhang 复核

---

## 1. 摘要（TL;DR）

实现 #35 邮件审批转正时，审批邮件里的"确认页"在浏览器中**直接显示 HTML 源码**而非渲染页面，表现为 `Content-Type: text/plain`。

我们基于"本地测试通过"的假设，连续做了 3 轮 headers/body 层面的修复（R1–R3），全部本地 27/27 PASS，但部署后**真实结果依旧 text/plain**。第 4 轮（R4）才定位到真正的根因：

> **Supabase 默认域名（`*.supabase.co`）的网关会强制把 Edge Function 返回的 `text/html` 改写（rewrite）为 `text/plain`，代码层无法覆盖。**

最终方案：**不靠 Edge Function 返回 HTML**，改为"Edge Function 仅做校验 + 302 跳转到外部静态确认页（GitHub Pages）"。R4 后真实部署验证通过。

**核心教训（元层面）**：本地 mock 测试只能证明代码逻辑正确，证明不了"平台网关行为"正确；"测试通过"≠"部署后真实行为正确"。

---

## 2. 背景与影响

- **功能**：审批人收到邮件，点击"批准/驳回"链接 → Edge Function 校验一次性 HMAC token → 返回 HTML 确认页 → 用户点按钮触发转正。
- **症状**：点击链接后，浏览器把整段 `<!DOCTYPE html>...` 当纯文本显示，且因 `sandbox` 限制脚本不执行，页面无法交互。
- **影响面**：#35 整条审批链路在 R1–R3 期间处于"不可用但本地测试全绿"的危险状态；每次返工都伴随一次部署 + 一封真实业务邮件验证，耗时高、反馈慢。
- **根因归属**：平台能力约束（默认域名禁 HTML），非业务代码 bug。

---

## 3. 时间线（4 轮）

| 轮次 | 当时的假设 | 改动 | 本地测试 | 真实部署结果 |
|---|---|---|---|---|
| R1 | `new Headers()` 实例被网关忽略 | 改用 `new Headers()` 显式设置 Content-Type | 27 PASS | 仍 `text/plain` |
| R2 | Deno 对 string body 推断为 `text/plain` | 用 `TextEncoder` 把 body 编码成 UTF-8 bytes | 27 PASS | 仍 `text/plain` |
| R3 | `new Headers` 实例网关不支持，需普通对象 | 改用普通对象 headers + bytes body | 27 PASS | F12 确认仍 `text/plain`（且 sandbox 报错） |
| R4 | **根因：平台禁止默认域名返回 HTML** | Edge Function 只校验 + `302` 跳转；HTML 移到外部 GitHub Pages 静态页 | 33 PASS | ✅ 成功渲染 |

> 关键转折点：R3 时用户提供了 F12 截图——`Content-Type: text/plain` + `Blocked script execution ... frame is sandboxed`，证明问题在"响应头被平台改写"，而非我们的代码没设对。

---

## 4. 根因分析（5 Whys）

1. **为什么页面显示源码？** → 浏览器收到的 `Content-Type` 是 `text/plain`，不是 `text/html`。
2. **为什么 Content-Type 是 text/plain？** → 我们返回的 `text/html` 在到达浏览器前被改写了。
3. **为什么会被改写？** → Supabase 默认域名的网关层对 Edge Function 响应做了 `html → plaintext` 的安全/规范 rewrite。
4. **为什么前 3 轮没发现？** → 我们只在**本地 mock** 里验证（mock `fetch`/`Response` 不会复现网关行为），且没先查"默认域名到底允不允许返回 HTML"。
5. **为什么没先查？** → 缺一条"平台约束预检"动作——遇到平台相关异常，应先做最小实验或查官方文档确认"此路是否通"，再动手改代码。

**根因结论**：不是代码写错，而是"在一条平台不允许的路径上反复打磨代码"。对策是**改路径（外部静态页 + 302）**，并**在流程里前置"平台约束预检 + 浏览器级真实验证"**。

---

## 5. 元层面失败模式

| # | 失败模式 | 表现 |
|---|---|---|
| 1 | **本地测试无法反映平台网关行为** | mock fetch/Response 只验代码逻辑，验不了 Supabase 网关的 html→plaintext rewrite。 |
| 2 | **"测试通过"被误当"修复成功"** | 27/27 PASS 只证明代码逻辑对，不证明部署后真实行为对。 |
| 3 | **未先查"此路是否通"** | 应在改 headers 前先用官方文档/最小实验确认"默认域名能否返回 HTML"。 |
| 4 | **缺浏览器级验证** | 直到用户手动 F12 才拿到 Content-Type 铁证；我们自己的测试没有"看一眼真实浏览器"这一步。 |
| 5 | **反馈链路过长** | 每轮都需"部署 + 发真实邮件 + 等用户反馈"，单轮成本高，掩盖了"测试与真实脱节"。 |

---

## 6. 改进措施与落地（映射到 #38 / #40 / #41）

| 改进项 | 落地 Issue | 产出物 | 状态 |
|---|---|---|---|
| 浏览器真实渲染验证 + 截图留痕 | #38 | `docs/deploy_verification_checklist_v1.0.md`、`scripts/verify_edge_function_ui.sh`、`shots/*.png` 留痕 | ✅ Done |
| 开发期平台约束预检卡 | #40 | `docs/platform_constraints_preckeck.md`（C1–C6） | ✅ Done |
| SOP / 知识库补充平台限制 | #41 | `SOP_supabase_data_upload.md` §9（Edge Function 默认域名禁 HTML + 外部静态页+302 模板） | ✅ Done |

**#38 验证脚本要点**：用 `agent-browser` 打开 URL → 等待渲染 → 读取 `document.contentType` / `document.title` / DOM → 截图 → 判定 PASS/FAIL。它专门捕获"网关把 html 改写成 plain"这类本地 mock 测不出的问题（对照 `shots/verify_failcase_textplain_2026-07-30.png` 的 FAIL 样例）。

**#40 预检卡要点**（C1 即本次根因）：任何 Edge Function 若要返回 HTML，先确认是否用默认域名——默认域名禁 HTML，须走"外部静态页 + 302"或自定义域名。

**#41 SOP 要点**：§9 固化"默认域名禁止返回 HTML"这条平台事实，并给出标准解法模板，避免后人重蹈 4 轮覆辙。

---

## 7. 证据与留痕

- ✅ 真实部署通过截图（PASS）：`shots/verify_approval_2026-07-30.png`
  - raw 链接（push 后可访问）：`https://raw.githubusercontent.com/echeung1328/autoprint-dashboard/master/shots/verify_approval_2026-07-30.png`
- ❌ 反例留痕（FAIL，证明脚本能抓出问题）：`shots/verify_failcase_textplain_2026-07-30.png`
- 最终可用代码：`supabase/functions/promote_approval/index.ts`（v2：302 跳转）、`docs/approval.html`（GitHub Pages 静态确认页）

---

## 8. 验收对照（Issue #39）

- [x] 输出复盘文档 → 本文档
- [x] 三项改进均建 issue 并排期 → #38 / #40 / #41 全部 Done（已入 Projects 看板）
- [x] 至少一次用 agent-browser 演示浏览器级验证留痕 → `shots/*.png` + `scripts/verify_edge_function_ui.sh`

---

## 9. 可迁移经验（适用于一切"平台网关 / 托管运行时"类问题）

1. **遇到平台相关异常，先做"最小实验"确认能力边界**，再改业务代码。例如：先用一个只返回 `text/html` 的空函数部署，看网关有没有改写——比连改 3 轮 headers 更快定位。
2. **本地测试与"部署后真实行为"是两层验证**，必须分开。mock 测试只守逻辑；平台行为要靠"真实环境探针"（如浏览器级渲染检查）兜底。
3. **把"平台约束"前置成开发期门禁**（预检卡 / SOP），而不是等出了线上问题再补。
4. **留痕用证据说话**：浏览器截图（含 Content-Type、Console 报错）比"我觉得改对了"可靠得多，也便于非技术同学直接复核。

---

## 10. 后续待办

- [ ] #36 回复邮件审批、#37 仪表盘审批按钮：实现时直接复用本复盘结论（外部静态页 + 302 模式，避免再踩默认域名禁 HTML 的坑）。
- [ ] 将 `scripts/verify_edge_function_ui.sh` 接入发版前的自动检查清单（与版本发布 SOP 联动）。
- [ ] 定期复查 `docs/platform_constraints_preckeck.md`，补充新踩到的平台约束。
