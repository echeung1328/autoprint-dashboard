# AutoPrint Edge Function 部署验证检查清单 v1.0

**文档版本**: V1.0
**创建日期**: 2026-07-30
**作者**: Eric Zhang / AI 协作
**关联 Issue**: #38（部署验证新增浏览器真实渲染检查）、#35（邮件审批转正）、#41（SOP 平台约束）

------------------------------------------------------------------------

## 1. 适用范围

**任何会返回 UI / HTML 的 Supabase Edge Function 部署后，都必须走本清单**，
不能仅凭「本地集成测试 PASS」结案。

> ⚠️ **血泪教训（#35）**：本地 mock 集成测试 27/27、33/33 全绿，却连续 3 轮没解决
> 确认页显示 HTML 源码的问题。根因是 **Supabase 默认 `*.supabase.co` 域名禁止 Edge
> Function 返回 HTML**（网关强制 rewrite 成 `text/plain`），这是**平台行为**，
> 本地测试根本反映不了。详见 `SOP_supabase_data_upload.md` §9。

------------------------------------------------------------------------

## 2. 平台约束预检（动手改代码前必看）

| 检查项 | 结论 | 说明 |
|---|---|---|
| 函数是否需要直接返回 HTML 页面？ | 默认域名**不行** | 见 `SOP_supabase_data_upload.md` §9.1 |
| 正确架构 | **外部静态页 + 302 redirect** | 静态页托管在 GitHub Pages / Netlify |
| 若坚持函数内返回 HTML | 必须配**自定义域名** | 否则 GET 一律被 rewrite 成 text/plain |

**预检门禁**：在改 Response headers / 返回 HTML 之前，先确认上面这张表——
不要像 #35 那样在 Content-Type 上反复返工 4 轮。

> 📌 **开发前完整预检卡**：`docs/platform_constraints_preckeck.md`（Issue #40）
> 包含 C1（默认域名禁止返回 HTML）+ C2–C6 全部已知平台/部署约束，以及预检门禁流程。
> **动手改代码前先查这张卡**，命中任何约束就按卡上「正确做法」调整架构，别先写代码再返工。

------------------------------------------------------------------------

## 3. 部署验证检查清单

### 3.1 部署前

- [ ] 代码已 `git commit`（AI 提交，用户 `git push`）
- [ ] `PROJECT_` 前缀密钥已 `supabase secrets set`（禁用 `SUPABASE_` 前缀）
- [ ] 需要返回 HTML 的函数已采用「外部静态页 + 302」架构（非默认域名直出 HTML）
- [ ] GitHub Pages / 静态托管源已包含最新静态页（如 `docs/approval.html`）

### 3.2 部署中

```bash
# 邮件点击无 JWT，必须 --no-verify-jwt
supabase functions deploy <函数名> --no-verify-jwt
```

- [ ] 部署命令输出无报错
- [ ] 若涉及静态页：确认远程分支（**注意主分支是 `master`，不是 `main`**）已 push
- [ ] 静态托管已重新发布（GitHub Pages 等 1–3 分钟）

### 3.3 部署后 — 浏览器真实渲染检查（**关键，不可跳过**）

**本地 mock 测试通过 ≠ 部署后真实行为正确。** 必须用真实浏览器验证：

#### 方式 A：运行可复用脚本（推荐，留痕自动化）

```bash
# 在项目根目录
bash scripts/verify_edge_function_ui.sh "<待验证的 URL>" "./verify_shot.png"
```

脚本会自动：打开页面 → 等待加载 → 抓取 `Content-Type` / 标题 / DOM → 截图 →
打印 `PASS` / `FAIL` 结论。把截图 `verify_shot.png` 作为验证证据附到对应 Issue。

#### 方式 B：手动逐步（无脚本时）

```bash
agent-browser open "<URL>"
agent-browser wait --load networkidle
agent-browser screenshot --screenshot-dir ./shots page.png
agent-browser get title
agent-browser eval 'document.contentType'
agent-browser close
```

然后人工核对：
- [ ] 截图显示**渲染后的页面**（不是 HTML 源码）
- [ ] `document.contentType` 应为 `text/html`（若为 `text/plain` 即失败，见 §2）
- [ ] 页面关键元素（form / div / 按钮）存在且可交互
- [ ] F12 → Network → 响应标头 `Content-Type` 与 `document.contentType` 一致

### 3.4 通过标准

| 项 | 必须通过 |
|---|---|
| 截图 | 渲染正常，非源码 |
| `Content-Type` | `text/html`（非 `text/plain`） |
| DOM | 含可交互元素 |
| 端到端 | 如含 302 跳转，跳转后最终页满足以上三点 |

**任一项不通过 → 不视为部署成功**，回到 §2 排查架构，不要只调 headers。

------------------------------------------------------------------------

## 4. 证据留存

- 每次浏览器验证截图保存到 `./shots/` 或随 Issue 评论上传
- 在对应 GitHub Issue 评论里贴：截图 + `Content-Type` 取值 + 结论（PASS/FAIL）
- 日志写入本仓库记忆（`.workbuddy/memory/YYYY-MM-DD.md`），便于后续回顾

------------------------------------------------------------------------

## 5. 与现有 SOP 的关系

- `SOP_supabase_data_upload.md` §9：平台约束知识（**为什么**默认域名不能返回 HTML）
- 本清单：部署验证**操作规范**（**怎么做**浏览器级验证 + 脚本）
- #40（平台约束预检门禁）：把 §2 的预检做成流程卡点（后续专项）

------------------------------------------------------------------------

## 6. 修订历史

  ----------------------------------------------------------------
  版本    日期         修改内容               作者
  ------- ------------ ---------------------- ----------------
  V1.0    2026-07-30   初始版本（Issue #38）  Eric Zhang / AI
  ----------------------------------------------------------------
