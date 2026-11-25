# AutoPrint 免登录访问链接 · 第 2 批（前端页面）测试记录 v1.0

**关联**：Epic #45 / T4 #49（对外展示页）· T5 #50（管理页）
**测试范围**：`/share/[token]` 免登录分享页 + `/admin/access-links` 管理页 + 前端路由分发
**日期**：2026-11-25
**模型**：Tencent Hunyuan Hy
**依据规范**：《AutoPrint 贡献指南 v1.1》§7 测试规范
**回退说明**：本批纯前端改动（单 `index.html`），不改数据库、不改 Edge Function、不改部署配置。发版前回退 = 丢弃 develop commit；发版后回退 = Netlify 历史部署一键还原 + master `git revert`。

---

## 1. 测试构成总览

| 层级 | 资产 | 形式 | 项数 | 结果 |
|---|---|---|---|---|
| 前端纯逻辑 | `ui_logic.test.mjs` | node 断言（从 index.html 提取 AL_UI_PURE 块求值） | 44 | ✅ 44/44 |
| 单元测试回归 | `access_token.test.mjs` | node 断言 | 28 | ✅ 28/28 |
| 集成测试回归 | `integration.test.mjs` | esbuild 编译 + mock fetch | 29 | ✅ 29/29 |
| 语法检查 | 抽取主 `<script>` 块 `node --check` | 命令行 | 1 | ✅ 通过 |
| DOM 完整性 | 10 个新增 id 唯一性 + 引用核对 | 脚本核对 | 10 | ✅ 通过 |
| **合计（自动化）** | | | **112** | **全绿** |

> 口径说明：本批项数独立统计，不与第 1 批 57 项或 v2.1.0 的 155 项混算。前端逻辑测试采用「单一代码源」——被测函数直接生产 `index.html` 的 `AL_UI_PURE` 标记块原文，杜绝测试副本漂移。

---

## 2. 关键用例依据表

### 2.1 路由分发（无界面，记输入/预期/实际）

| 用例 | 输入（pathname） | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| [关键] 分享页解析 token | `/share/<43位>` | 返回 token | 一致 | ✅ |
| 尾斜杠兼容 | `/share/<token>/` | 返回 token | 一致 | ✅ |
| index.html 后缀兼容 | `/share/<token>/index.html` | 返回 token | 一致 | ✅ |
| 首页不误判 | `/` | null | null | ✅ |
| 过短 token 被拒 | `/share/abc` | null（防误匹配） | null | ✅ |
| [关键] 管理页路由识别 | `/admin/access-links` | true | true | ✅ |
| /admin 不误判 | `/admin` | false | false | ✅ |

### 2.2 有效期与状态（T5）

| 用例 | 输入 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| [关键] 超上限钳制 | 400 天 | 365 | 365 | ✅ |
| 下界钳制 | 0 / -5 | 1 | 1 | ✅ |
| 非数字回退 | `abc` | 默认 30 | 30 | ✅ |
| [关键] stopped 优先于过期 | stopped + 过期时间 | 显示「已停止」 | 一致 | ✅ |
| 过期 active | active + 过期时间 | 显示「已过期」 | 一致 | ✅ |

### 2.3 分享页渲染逻辑（T4）

| 用例 | 输入 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| [关键] 停止文案透出 | 403 + "链接已停止访问" | 标题=链接已停止访问 | 一致 | ✅ |
| [关键] 过期文案透出 | 403 + "链接已过期" | 标题=链接已过期 | 一致 | ✅ |
| 网络错误兜底 | status=0 | 标题=暂时无法加载 | 一致 | ✅ |
| [关键] KPI 平均耗时 | 13.08 与 12.0 | 12.5（round 1 位） | 12.5 | ✅ |
| 脏数据安全归零 | null / 非数字 | 0 不崩 | 0 | ✅ |
| [关键] 危险标签转义 | `<img onerror=...>` | `&lt;img...` | 一致 | ✅ |

---

## 3. 自动化边界说明（需人工测试）

以下项目依赖真实登录态/真实链接/视觉渲染，无法在本地自动化完成，按规范标注待线上人工验证：

| # | 测试项 | 操作步骤 | 期望结果 | 为何不能自动化 | 执行人 | 状态 |
|---|---|---|---|---|---|---|
| M1 | 有效链接分享页渲染 | 管理员创建链接 → 无痕窗口打开 `/share/<token>` | 免登录看到标题/7字段 KPI/明细表 | 需真实 token + 真实报表数据 | 用户 | ✅ 已完成（见 §3.2） |
| M2 | admin JWT CRUD 端到端 | 登录 admin → 访问链接管理页 → 创建/停止/删除/复制 | 列表实时反映状态，URL 可复制 | 需真实 admin 登录会话签发 JWT | 用户 | ✅ 已完成（见 §3.2） |
| M3 | 失效链接友好提示 | 打开已停止的链接 | 显示对应友好页 | 需真实链接状态 | 用户 | ✅ 已完成（停止态；过期/不存在态由 §2.3 逻辑测试覆盖） |
| M4 | 直达管理页路由 | 已登录 admin 浏览器输入 `/admin/access-links` | 直接进入管理页 | 需真实登录态 + 域名路由 | 用户 | ✅ 已完成（见 §3.3；已登录态直达成功，未登录态跳登录页兜底亦正确） |
| M5 | 视觉渲染与响应式 | 桌面查看分享页与管理页 | 品牌色正确、无错位 | 浏览器视觉渲染 | 用户 | ✅ 桌面端已完成（见 §3.2）；移动端未覆盖，按非阻塞项处理 |

> M2 已关闭第 1 批遗留项「真实 admin JWT 端到端」——真实签名校验线上实测通过（创建/停止/删除全链路）。

### 3.1 线上部署与部分实测（2026-11-25 17:45，用户回传截图）

部署链路：本地 `git push origin develop`（17cee43）→ merge master（`f748cea`）→ `git push origin master` → Netlify 手动部署（Published 5:45 PM）→ 线上 https://autoprintreport.netlify.app

| 项 | 预期 | 实际 | 依据 | 结果 |
|---|---|---|---|---|
| master push + merge | 远端 master 含第2批 | f748cea(HEAD→master) ← 17cee43(develop) | 终端 git log 截图 | ✅ |
| Netlify 手动部署 | master@f748cea 发布 | Activity: Published master@f748cea 5:45 PM | Netlify 截图 | ✅ |
| 前端生效 | 新按钮出现 | 顶部「🔗 访问链接」admin 按钮可见 | 应用截图 | ✅ |
| 数据加载正常 | KPI 有值 | 总 4500 / 成功 4453 / 失败 17 / 平均 11.2 | 应用截图 | ✅ |
| 管理页渲染 | 表单+空表格 | 标题、创建表单(1~365)、空状态表格正常 | 管理页截图 | ✅ |
| **/admin/list 真实 JWT** | 鉴权通过返回空数组 | 表格显示「暂无访问链接，请在上方创建」 | 管理页截图 | ✅ |

**GitHub 截图依据**（已上传 #49/#50，均为打码版）：
- push master：https://github.com/user-attachments/assets/b6811256-4cab-46d2-b810-67925b38c8e0（纯 git 终端，无浏览器/邮箱，无需打码）
- Netlify 部署：https://github.com/user-attachments/assets/0ca5858d-a2d5-47a2-bf76-d7711ae72c5b
- 应用数据概览：https://github.com/user-attachments/assets/d16a9274-30b6-4cbf-8017-a973e425be14
- 管理页：https://github.com/user-attachments/assets/515d6edc-d228-44ac-a734-f23ee96d33e0

> 🔒 脱敏说明（2026-11-25 18:05）：所有浏览器截图已打码替换——遮盖书签栏内部系统名、公开邮箱 echeung1328@hotmail.com、Netlify 提交作者；地址栏 URL 与页面数据保留。GitHub 评论中的原图引用已全部替换为打码版。

### 3.2 端到端实测（2026-11-25 18:00，用户回传 7 截图）

测试链接：`/share/KRQya_fq4...`（token 前 8 位），标题「Eric测试」，有效期 30 天。验证后已停止 + 硬删清理。

| # | 用例 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| 1 | 创建+复制URL | 列表出现、URL可复制 | toast「链接已创建，URL已复制到剪贴板」，列表出现「生效中」行，创建者=707eeaeb | ✅ |
| 2 | 分享页免登录渲染 | 无登录看到7字段KPI+明细表 | 标题/总数1923/成功1914/失败4/平均9.4+明细表7列（含每次执行分钟）全部可见 | ✅ |
| 3 | 数据守恒复核 | KPI=真实数据 | SQL查100行：总数1923/成功1914/跳过5/失败4/平均9.4，1914+5+4=1923 ✅ | ✅ |
| 4 | 停止 | 状态变已停止 | 状态「已停止」，操作列去掉停止按钮 | ✅ |
| 5 | 停止后分享页 | 友好提示 | 红圈⛔+「链接已停止访问」+联系分享方文案，header元数据清空 | ✅ |
| 6 | 删除二次确认 | 弹确认框 | 「确定删除链接...此操作不可恢复（保留审计记录）」 | ✅ |
| 7 | 删除生效 | 从列表消失 | 空状态「暂无访问链接，请在上方创建」 | ✅ |
| 8 | 管理页直达路由（未登录态） | 未登录访问应跳登录页 | 跳登录页（安全兜底正确） | ✅ |

**GitHub 截图依据**（已上传 #49/#50，均为打码版）：
- 创建：https://github.com/user-attachments/assets/9b5e851e-7b01-4eaa-a238-911d9aecd742
- 分享页数据：https://github.com/user-attachments/assets/b7df4a72-533d-4626-8a9a-394656dc7659
- 停止后列表：https://github.com/user-attachments/assets/652779a5-0069-4cdf-ba11-e2dd3a6bd225
- 停止友好提示：https://github.com/user-attachments/assets/9f672b5e-e52e-4e48-8023-473e6f2e0233
- 删除确认：https://github.com/user-attachments/assets/c838ae8f-74e6-4b49-9cb3-dee1943c4fe6
- 删除后空列表：https://github.com/user-attachments/assets/d94e6a61-f9d9-4a93-9401-b57a70ca08e0
- 管理页直达（未登录态，跳登录页）：https://github.com/user-attachments/assets/bec670d7-43e2-40c5-87bd-2d4c90ec0f1b

> **M4 首轮说明**：第 5 步首张截图显示登录页——`bootstrap()` → `getSession()` 无 session → `showLogin()`，这是**未登录访问管理页的正确安全兜底**；已登录 admin 则在 `checkApproval()` 中由 `alIsAdminLinksPath()` 判定直达管理页（逻辑测试 §2.1 已覆盖）。

### 3.3 M4 补测通过（2026-11-25 18:05，用户回传 1 截图）

已登录 admin 态下，地址栏直接输入 `https://autoprintreport.netlify.app/admin/access-links` 回车 → 直接进入「对外访问链接管理」页（标题 + 创建表单 + 空表格，右上角显示登录头像），未出现登录页。

| # | 用例 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| 9 | 已登录 admin 直达管理页 | 直接进入管理页，不再跳登录 | 直达「对外访问链接管理」页，登录头像可见 | ✅ |

![已登录直达管理页（打码）](https://github.com/user-attachments/assets/55879624-ff0d-4b54-b2c9-e0608df58692)

> **M4 ✅ 关闭**：已登录态直达成功 + 未登录态跳登录页兜底正确，两条分支均符合预期。至此 T4/T5 全部人工测试项通过。

---

## 4. 本批产物清单

| 类型 | 文件 |
|---|---|
| 前端页面（分享页 + 管理页 + 样式 + 路由） | `index.html`（原地修改） |
| 前端纯逻辑测试 | `supabase/functions/access_links/ui_logic.test.mjs` |
| 本测试记录 | `docs/AutoPrint_access_links第2批_测试记录_v1.0_Hunyuan-Hy.md` |

**不变项**：数据库 schema、Edge Function、netlify.toml、任何部署配置——均未改动。

---

## 5. 下一步

- ✅ 已 push develop（17cee43）→ merge master（f748cea）→ Netlify 手动部署（5:45 PM）。
- ✅ 端到端实测（§3.2 + §3.3）：M1/M2/M3/M4/M5（桌面）全部通过，数据守恒 SQL 复核一致；测试链接已清理。
- ✅ M4 补测通过（§3.3）：已登录 admin 直达管理页成功；未登录态跳登录页兜底亦正确。
- ✅ 截图已全部打码替换并嵌入 #49 / #50 验证报告（2026-11-25 18:05）。
- ✅ #49/#50 看板卡片已移 Done（用户确认后）；版本 v2.2.0 已登记（见云端版本记录）；本测试记录已同步资料库云端权威版。
- 剩余非阻塞项：M5 移动端视觉未覆盖（非本批验收必需）；T8 #53「部署 + 管理手册」文档待启动。
