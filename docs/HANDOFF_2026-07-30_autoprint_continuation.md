# HANDOFF — AutoPrint 审批工作流（续做指引）

> 用途：本文件供**全新会话**接手 AutoPrint 项目时阅读，读完即可继续，无需回溯历史。
> 生成日期：2026-07-30 ｜ 关联：#35（已关闭）、#38/#39/#40/#41（已 Done）、#36/#37（待做）
> 安全约束：本仓库 `echeung1328/autoprint-dashboard` 为 **PUBLIC**，文档与提交中**严禁出现任何明文密钥 / token / anon key / Basic Auth 密码**；密钥只存在于 Supabase Secret 与本地 `.gitignore` 排除的文件。

---

## 1. 项目速览

- **项目**：AutoPrint（昆仑联通内部数据导入 + 审批工作流）
- **仓库**：`echeung1328/autoprint-dashboard`（默认分支 `master`，GitHub Pages 也用 `master`）
- **核心能力**：
  1. 多源数据摄取（邮件/Excel 等）→ Supabase
  2. **邮件审批转正**：给审批人发邮件，点击链接在浏览器确认"批准/驳回"，触发后台转正
- **技术栈**：Supabase Edge Function（Deno）、Supabase DB、GitHub Pages（静态确认页）、HMAC-SHA256 一次性令牌

---

## 2. 当前状态快照（2026-07-30）

| 项 | 状态 | 说明 |
|---|---|---|
| #35 邮件审批转正 | ✅ 已关闭 | v2 方案已真实邮件验证通过 |
| #38 浏览器渲染验证留痕 | ✅ Done | `docs/deploy_verification_checklist_v1.0.md` + `scripts/verify_edge_function_ui.sh` + `shots/*.png` |
| #39 复盘主文档 | ✅ Done | `docs/retro_content-type-4rounds_2026-07-30.md`（本文档 §4 提炼） |
| #40 平台约束预检卡 | ✅ Done | `docs/platform_constraints_preckeck.md`（C1–C6） |
| #41 SOP 平台限制知识 | ✅ Done | `SOP_supabase_data_upload.md` §9 |
| #36 回复邮件审批 | ⬜ 待做 | backlog，应复用 v2 模式 |
| #37 仪表盘审批按钮 | ⬜ 待做 | backlog，应复用 v2 模式 |
| 本地提交 | ⚠️ 领先远端 1 | commit `16c4ac2`（#39 文档）+ 本 handoff 提交，均**待用户 push** |

> **用户待办**：`git push`（把 `16c4ac2` 及本 handoff 推上远端），否则 GitHub 上的文档/raw 链接不可达。

---

## 3. 人 / AI 协作分工（铁律）

- **AI 负责**：写代码、写文档、本地 `git commit`、建/更新 GitHub Issue、操作 Projects 看板、加证据评论。
- **用户（Eric）负责**：`git push`、Supabase 部署、发真实业务邮件验证、关闭 Issue（AI 不主动关 Issue）。
- **部署纪律**：Edge Function 用 `mcp__supabase__deploy_edge_function` 或 CLI 部署时**必须 `--no-verify-jwt`**（外部 webhook/邮件链接不发 JWT）。
- **安全纪律**：任何 commit 前自查是否含密钥；含则脱敏为占位符（如 `<SUPABASE_SERVICE_ROLE_KEY>`）。

---

## 4. 必读：关键架构决策与技术约束（不读会重蹈覆辙）

### 4.1 头号坑：Supabase 默认域名禁止 Edge Function 返回 HTML
- **现象**：Edge Function 返回 `text/html` 会被网关**强制改写**为 `text/plain`，浏览器显示源码、脚本被 sandbox 拦截。
- **错误做法（我们踩过 3 轮）**：改 `Headers` 实例、改 bytes body、改普通对象 headers —— 本地 mock 测试 27/27 PASS，但部署后依旧 `text/plain`。
- **正确做法（v2 模式，已验证）**：
  - Edge Function **只做校验 + 302 跳转**，不返回 HTML。
  - HTML 确认页放到**外部静态托管**（本仓库 GitHub Pages，分支 `master`），由 302 跳过去。
  - 流程：`GET /promote_approval?id=..&exp=..&a=approve&t=<hmac>` → 校验 HMAC → `302` 跳到 `APPROVAL_UI_URL?...` → 静态页渲染 → 用户点按钮 `POST` 回 Edge Function 执行 → 再 `302` 跳回结果页。
- **可迁移规则**：任何要在浏览器渲染的页面，**别让 Edge Function 直接吐 HTML**，一律走"外部静态页 + 302"。

### 4.2 其他 Supabase Edge Function 约束（速查）
- 环境变量禁用 `SUPABASE_` 前缀（CLI 护栏）→ 用 `PROJECT_` 前缀 + 启动期 `checkEnv()` 缺失即 500。
- 部署必须 `--no-verify-jwt`（或 MCP `verify_jwt:false`）。
- 运行时不动态 import 外部 CDN（esm.sh/jsdelivr 等可能 `Module not found`）→ 关键依赖 vendor 到函数目录。
- Deno 代码避免 `//` 单行注释包裹整段（同行后代码会被吞）；用多行或注释放代码前。
- GitHub Pages 分支是 `master`（不是 `main`）。

### 4.3 静态确认页（`docs/approval.html`）
- 读取 URL 参数 `id/exp/a/t`，渲染摘要 + 按钮，POST 到 Edge Function。
- 已存在，#36/#37 可直接复用或复制改造。

---

## 5. 关键文件地图

| 文件 | 角色 |
|---|---|
| `supabase/functions/promote_approval/index.ts` | #35 v2 实现（GET 校验+302 / POST 执行+302） |
| `docs/approval.html` | GitHub Pages 静态确认页（浏览器渲染层） |
| `docs/retro_content-type-4rounds_2026-07-30.md` | #39 复盘主文档（含 5 Whys + 失败模式） |
| `docs/platform_constraints_preckeck.md` | #40 预检卡 C1–C6 |
| `docs/deploy_verification_checklist_v1.0.md` | #38 部署验证清单 |
| `scripts/verify_edge_function_ui.sh` | #38 浏览器级渲染验证脚本（agent-browser 截图留痕） |
| `shots/*.png` | #38 验证留痕（PASS / FAIL 样例） |
| `SOP_supabase_data_upload.md` | 主 SOP，§9 为 Edge Function 平台约束 |
| `docs/design_promote_approval_v1.0.md` | #35 设计文档 |
| `docs/design_multi_source_ingest_v1.0.md` | 摄取整体设计 |

---

## 6. 看板操作速查（GitHub Projects）

- Project node id：`PVT_kwHOAYl5dM4BcEMT`（project 1，owner `echeung1328`）
- Status 字段 id：`PVTSSF_lAHOAYl5dM4BcEMTzhWvtts`
- 选项：Todo=`f75ad846` / In Progress=`47fc9ee4` / Done=`98236657`
- 置 Done 命令示例：
  `gh project item-edit --project-id PVT_kwHOAYl5dM4BcEMT --id <ITEM_ID> --field-id PVTSSF_lAHOAYl5dM4BcEMTzhWvtts --single-select-option-id 98236657`
- 取 item id：`gh project item-list 1 --owner echeung1328 --format json > f.json` 后解析（管道直连 python 会被截断，须落文件再读）。

---

## 7. 如何继续（Next Steps）

### 步骤 0（用户做）
```
cd <repo> && git push
```
确保 `16c4ac2` 及本 handoff 上远端。

### 步骤 1（可选）先读这些，建立上下文
- 本文件 §4（约束）→ `docs/retro_content-type-4rounds_2026-07-30.md` → `docs/design_promote_approval_v1.0.md` → `supabase/functions/promote_approval/index.ts`。

### 步骤 2：做 #36 / #37（复用 v2 模式）
- **不要**让新 Edge Function 直接返回 HTML。
- 复制 `promote_approval` 的"校验 + 302 + 外部静态页"骨架；静态页新增/复制 `docs/approval.html` 改造。
- 新建 issue（按 `docs/GitHub_Issue创建规范_v1.1.md`），建好后入看板（Todo→In Progress→Done）。
- 部署：`--no-verify-jwt`；部署后**必须**用 `scripts/verify_edge_function_ui.sh` 做浏览器级验证留痕（这正是 #38 踩坑换来的流程）。
- 完成后：AI commit + 看板置 Done + 加证据评论；**用户 push**。

---

## 8. 风险与待确认

- ⚠️ 本地领先远端 2 个提交（含本 handoff），未 push 前 GitHub 看板/文档链接不完整。
- ⚠️ PUBLIC 仓库：任何时候不要在新代码/文档里贴密钥；如必须示意，用 `<...>` 占位符。
- ❓ #36/#37 的确认页 UI 是否与 #35 共用同一 `approval.html`，还是各自独立页？建议新会话先与用户确认。
- ❓ 是否要把 `verify_edge_function_ui.sh` 接入发版 SOP（文档 §10 待办）？可单独排期。

---

## 9. 一句话给新会话

> "AutoPrint 的审批确认页**绝不让 Edge Function 直接返回 HTML**（默认域名会被网关改写成 text/plain）；统一走『外部静态确认页 + 302 跳转』的 v2 模式。继续做 #36/#37 时照此骨架复制即可，且每次部署后必须用浏览器级脚本验证留痕。"
