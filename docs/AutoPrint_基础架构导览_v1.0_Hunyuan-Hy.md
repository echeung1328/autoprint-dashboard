# AutoPrint 基础架构导览 v1.1（非技术版）

> 面向对象：项目管理者 / 非开发人员
> 生成日期：2026-11-19 ｜ 修订日期：2026-11-26 ｜ 工具：WorkBuddy ｜ 模型：Tencent Hunyuan Hy
> 用途：用最少术语讲清「这个系统由什么组成、数据怎么流动、每个东西在哪」，配套《技术组件访问核实清单》一起用。
> 本次修订（v1.1）：新增「域名与 DNS 设置」章节；纠正「UAT 域名由 Netlify 承载」的错误（实为 Cloudflare Worker，见 issue #67）；更新第五节已解决的待核实项。文件名沿用 v1.0 以保持引用不变。

---

## 一句话概括

AutoPrint 是一个**"邮件进、看板出"的自动报表系统**：系统自动收取带 Excel 附件的邮件 → 云端程序解析附件 → 数据存进数据库 → 网页看板展示成图表。全程不需要人工下载附件、复制粘贴数据。

---

## 一、四层结构总览

| 层 | 作用（大白话） | 包含的东西 |
|---|---|---|
| ① 访问入口 | 人从哪里进来用 | 用户的浏览器、开发者的 VS Code 本地环境 |
| ② 前端应用 | 你看到的网页长什么样 | 一个 `index.html` 文件（登录页 + 3 个看板 Tab + 分享页 + 管理页） |
| ③ 托管平台 | 网页放在哪给别人访问 | Netlify（主）、Vercel（后备）、Cloudflare Worker（UAT）、GitHub Pages（审批确认页） |
| ④ 后端服务 | 数据在哪存、逻辑在哪跑 | Supabase：账号认证 + 数据库 + 云端函数 |

**为什么这样分层？** 前端只负责"显示"，后端只负责"存数据和算逻辑"，分开后网页本身很轻、改界面不影响数据。

---

## 二、逐层拆解

### ① 访问入口

- **用户浏览器**：打开网址、登录、看报表。
- **本地 VS Code**（仅开发者用）：装了 Live Server 插件，在本机 `http://127.0.0.1:5500` 预览网页，改代码后自动刷新。普通用户不需要。

### ② 前端应用（index.html）

整个网页就是**一个 HTML 文件**，包含：

| 功能 | 说明 |
|---|---|
| 登录 / 注册 / 审批 | 邮箱密码登录、魔法链接登录；新用户注册后需管理员批准 |
| 📊 数据概览 | KPI 卡片 + 每日打印量/成功率/耗时图表 + 失败明细 |
| 📅 年度负载高峰 | 按日/周/月统计全年打印峰值 |
| 📋 版本记录 | 展示每次发版记录（来源数据库 `app_versions` 表） |
| CSV 导出 | 把筛选结果导出成表格文件 |
| 🔗 对外分享页 `/share/<token>` | 免登录访问链接（access-links，v2.2.0） |
| ⚙️ 访问链接管理页 `/admin/access-links` | 管理员生成/管理分享链接 |

依赖两个从 CDN（公共加速网络）加载的现成库：**Chart.js**（画图）、**Supabase JS**（连数据库）。

### ③ 托管平台（网页放哪）

| 平台 | 网址 | 当前角色 | 承载域名 / 备注 |
|---|---|---|---|
| Netlify（主生产） | `autoprintreport.netlify.app` | 主生产站 | 另承载 `comlantest.de5.net` 等 4 个域名；手动部署 |
| Vercel（后备） | `autoprint-dashboard.vercel.app` | 故障切换备用 | 平时不主动访问，Netlify 不可用时切换 |
| **Cloudflare Worker（UAT）** | `autoprintreport.comlanuat.de5.net` | **UAT 测试站** | ⚠️ **由 Cloudflare Worker 承载，不是 Netlify**（v1.1 纠正）；分享链接/管理页所在站 |
| GitHub Pages | `echeung1328.github.io/autoprint-dashboard/approval.html` | 邮件审批确认页 | 公开 |

> **v1.1 纠偏**：旧版本把 `autoprintreport.comlanuat.de5.net` 误标为「Netlify（UAT）」。2026-11-26 排查确认该域名不受 Netlify 管理（Netlify Domain management 里没有它），而是由 Cloudflare 的一条 **Worker 记录**接管。这是本次「域名与 DNS 设置」章节补充的直接原因（issue #67）。
>
> **文档冲突提醒（已澄清）**：旧文档《AutoPrint_本地开发环境部署方案_v1.0.md》（7-02）写"Vercel 为主、Netlify 弃用"，但《版本发布 SOP v1.2》写"Netlify 主 + Vercel 后备"。**以后者为准**，旧文档已过时。

### ④ 后端服务（Supabase 云端）

Supabase 是一个"后端即服务"平台，本项目用它代替自己搭服务器。项目 ID：`uvqjtvonxwsmhntnyest`（区域 ap-southeast-2）。包含三块：

**A. Auth 认证** —— 管账号、登录、发魔法链接、控制谁能看数据。

**B. 数据库（PostgreSQL 17.6）+ RLS** —— 存所有业务数据。核心表：

| 表名 | 存什么 |
|---|---|
| `ReportAutoPrint` | 主表：每条打印执行记录（看板的数据源） |
| `profiles` | 用户及审批状态 |
| `app_versions` | 版本发布记录 |
| `email_inbox_poc` | 邮件原始入库表（POC 遗留，仍在使用链路中） |
| `access_links` / `access_links_audit` | 对外分享链接及其审计日志（v2.2.0） |

**RLS（行级安全）**：可以理解为"数据库自带的门禁"——即使有人绕过网页直接查数据库，没批准的用户也看不到数据。这是本项目的安全基石。

**C. Edge Functions（云端小程序）** —— 用 Deno/TypeScript 写的功能：

| 函数 | 作用 |
|---|---|
| `email_inbox_poc` | 收邮件 → 校验发件人 → 解析 XLSX/CSV 附件 → 写入数据库；失败时写错误状态并发告警邮件 |
| `promote_approval` | 审批转正：验证一次性令牌 → 跳转到确认页 → 把 staging 数据转正到主表 |
| `access_links` | 分享链接：公开 token 校验、admin 增删改查、字段白名单、审计（v2.2.0） |

---

## 三、域名与 DNS 设置（谁在承载这些网址）【v1.1 新增】

> 这一节回答三个问题：**有哪些网址、每个网址由谁托管、DNS 是怎么指的**。看懂这节，以后遇到「某个网址 404」就知道该去哪个平台查。

### 3.1 五个网址各归谁管

| 网址 | 承载平台 | 用途 | 谁负责部署 |
|---|---|---|---|
| `autoprintreport.netlify.app` | Netlify | 主生产站（文档里说的"主站"） | Netlify 手动触发 |
| `comlantest.de5.net` | Netlify | Netlify 站点的自定义**主域名** | 随 Netlify 站 |
| `www.comlantest.de5.net` | Netlify | 重定向到主域名 | 随 Netlify 站 |
| `autoprintreport.comlantest.de5.net` | Netlify | 别名域名 | 随 Netlify 站 |
| `autoprintreport.comlanuat.de5.net` | **Cloudflare Worker** | **UAT 测试站**（分享链接/管理页） | Cloudflare Git 集成自动部署 |

> **关键结论**：`comlanuat`（UAT）和 `comlantest`（测试/准生产）是**两个分开注册的域名**，走的也是**两条完全不同的托管链路**——前者 Cloudflare Worker，后者 Netlify。切勿混为一谈。

### 3.2 DNS 是怎么指的（大白话版）

```
DNSPod（域名注册商）
   ├─ comlantest.de5.net   → 指到 Netlify（Netlify 后台管理域名）
   └─ comlanuat.de5.net    → NS 已委派给 Cloudflare
                                 → Cloudflare DNS 里只有一条 Worker 记录：
                                   名称 autoprintreport.comlanuat.de5.net
                                   类型 Worker，指向 Worker「autoprint-dashboard」
                                   代理状态：橙云（Proxied，源站被隐藏）
```

- **NS 委派**：`comlanuat.de5.net` 的域名服务器在 DNSPod 被改成了 Cloudflare 的两台（`adi.ns.cloudflare.com` / `damian.ns.cloudflare.com`），意思是"这个域名的解析权交给 Cloudflare 了"。
- **橙云代理（Proxied）**：访问流量先经过 Cloudflare，真实源站被隐藏。所以 `curl` 看到的响应头是 `Server: cloudflare`。

### 3.3 UAT 站（Cloudflare Worker）的关键配置

| 配置项 | 值 | 作用 / 由来 |
|---|---|---|
| Worker 名称 | `autoprint-dashboard` | Cloudflare 里静态 Worker，无脚本代码，不能在后台"Edit code" |
| 发布内容 | 只发 `public/` 目录 | 由 `wrangler.jsonc` 的 `assets.directory = "./public"` 指定，**防止整个仓库源码被发布到公网** |
| SPA 回退 | `not_found_handling = "single-page-application"` | 未知路径（如 `/share/<token>`）回退到 `index.html`，**修复深链 404** |
| Build command（Cloudflare 后台） | `rm -rf public && mkdir -p public && cp index.html public/index.html` | 构建时只把 `index.html` 放进 `public/`，从源头杜绝源码外泄 |
| Deploy command | `npx wrangler deploy` | Cloudflare Git 集成的部署命令 |
| Production 分支 | `master` | master 推送即自动部署 |

> **2026-11-26 事故小结（issue #67）**：UAT 站曾出现分享链接 404 + 整个仓库源码可访问。根因就是上表前三项配置缺失——发布目录指向了仓库根目录、且没有 SPA 回退。补齐后两问题一并解决。**排查"某域名 404"时，第一步永远是确认它到底由哪个平台承载**。

---

## 四、数据流向（一封邮件如何变成图表）

```
Outlook 收到带 XLSX 的邮件
   ↓ （Webhook Relay 把邮件转成 HTTP 请求）
Edge Function 校验签名 + 发件人白名单
   ↓ （解析附件，junk filter 过滤垃圾行，复合键去重）
写入 Supabase 主表
   ↓ （清洗 / staging 暂存）
管理员邮件审批 → promote_approval 转正
   ↓
看板 3 个 Tab 展示 + CSV 导出（+ 对外分享页）
```

关键纪律（来自 SOP）：复合键去重、service_role 兜底写入、失败写 status=error、staging→主表需审批。本 PoC 阶段已跑通，正式版按 SOP 铁律重写。

---

## 五、技术组件与访问地址速查

| # | 组件 | 类型 | 访问地址 | 是否需登录 |
|---|---|---|---|---|
| 1 | GitHub 仓库 | 代码托管 | `github.com/echeung1328/autoprint-dashboard` | 公开可读 |
| 2 | UAT 看板（Cloudflare Worker） | 站点 | `autoprintreport.comlanuat.de5.net` | 需账号登录 / 分享链接免登录 |
| 3 | Netlify 主站 | 站点 | `autoprintreport.netlify.app` | 需账号登录 |
| 4 | Vercel 后备 | 站点 | `autoprint-dashboard.vercel.app` | 需账号登录 |
| 5 | GitHub Pages 确认页 | 站点 | `echeung1328.github.io/autoprint-dashboard/approval.html` | 公开 |
| 6 | Supabase 控制台 | 云端后台 | `supabase.com/dashboard/project/uvqjtvonxwsmhntnyest` | 需登录 |
| 7 | Supabase REST API | 数据接口 | `uvqjtvonxwsmhntnyest.supabase.co/rest/v1/` | 公开（401=在线） |
| 8 | Edge Function | 云端函数 | `uvqjtvonxwsmhntnyest.supabase.co/functions/v1/` | 公开（401=在线） |
| 9 | CDN - Chart.js | 依赖 | `cdn.jsdelivr.net/npm/chart.js@4.4.7/...` | 公开 |
| 10 | CDN - Supabase JS | 依赖 | `cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/...` | 公开 |
| 11 | 本地开发环境 | 本机 | `127.0.0.1:5500`（需先开 VS Code Live Server） | 本机 |
| 12 | Webhook Relay | 邮件中转 | webhooks.io 控制台 | 需登录 |
| 13 | Resend | 发信服务 | resend.com 控制台 | 需登录 |
| 14 | GitHub Actions | 自动化检查 | 仓库 Actions 页（rls-security-check.yml） | 需登录 |

---

## 六、原「已知不一致 / 待核实项」— 处理状态【v1.1 更新】

> 以下为 2026-11-19 探测时记录的待核实项，v1.1 补注当前状态。详细分析见《AutoPrint_项目健康盘点报告》与《AutoPrint_v2.0.0部署复盘与经验教训》。

1. ~~**Vercel 站连不上**~~ → **已澄清**：当时是沙箱网络问题；Vercel 作为后备站仍在用，浏览器本地可访问。
2. ~~**两站代码大小不同**~~ → **已澄清**：差异仅来自 Netlify 自动注入的托管注释，非代码版本分叉。
3. ~~**安全加固未上线**~~ → **已完成**：SEC-01~16 三个 commit 已 push 并部署，v1.3.1 上线（issue #58）；源码暴露路径已封堵。
4. ~~**版本记录 commit 不存在**~~ → **已规范**：v1.3.1 之后的版本登记已按 SOP 走 `app_versions` 表，commit 哈希可核对。
5. **本地文档过时** → **部分处理中**：本导览已更新；旧《本地开发环境部署方案》仍标"Vercel 为主"，以《版本发布 SOP v1.2》为准。文档整体更新已登记 issue #68。

---

*文档结束 ｜ 所有访问核实步骤见配套文件《AutoPrint_技术组件访问核实清单_v1.0_Hunyuan-Hy.md》*
