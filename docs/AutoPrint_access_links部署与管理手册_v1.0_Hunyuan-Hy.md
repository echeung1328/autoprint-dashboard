# AutoPrint 免登录访问链接（access_links）部署与管理手册 v1.1

**文档版本**：v1.1
**创建日期**：2026-11-26
**更新日期**：2026-11-26（v2.3.0 数据隔离 / 最近 N 条 / UTC+8 / 数字格式化）
**作者**：WorkBuddy
**模型**：Tencent Hunyuan Hy
**关联**：Epic #45 / T8 #53（本手册即 T8 交付物）· T1 #46 · T2 #47 · T3 #48 · T6 #51 · T7 #52 · Epic #69（v2.3.0 优化：T2 #70 / T3 #71 / T4 #72 / T5 #73）
**适用项目**：Supabase `uvqjtvonxwsmhntnyest` · 生产站 `https://autoprintreport.netlify.app` · UAT 站 `https://autoprintreport.comlanuat.de5.net`

> 面向对象：管理员 / 运维人员。本文说明「这套免登录分享链接怎么部署、怎么在管理页创建/停止/删除、出问题怎么排查」。
> **零明文密钥承诺**：本文所有密钥仅以 `<占位符>` 出现，真实值只存在于本地 `SECRETS_LOCAL.md` 与 Supabase 控制台。

> **v1.1 变更摘要（v2.3.0，commit `773cf8d`）**：新增数据隔离（`site_scope`=ALL/具体站点）、最近 N 条（`row_limit` 1-365，默认 7）、执行时间固定 UTC+8 带星期、每报销单平均耗时（秒）列、数字整数化+右对齐+总数数据条。Edge Function 重新部署（version 3）。测试从 101→156 项全绿。详见第 8 节。

---

## 目录

1. 系统速览
2. 组成部分与部署状态
3. 部署手册（运维）
   - 3.1 前置条件
   - 3.2 数据库迁移（T1）
   - 3.3 Secrets / 环境变量
   - 3.4 部署 Edge Function
   - 3.5 前端部署（分享页 + 管理页）
   - 3.6 部署后验收
4. 管理手册（管理员）
   - 4.1 进入管理页
   - 4.2 创建链接
   - 4.3 复制与分享
   - 4.4 停止链接
   - 4.5 删除链接
   - 4.6 字段与状态说明
5. 访客端体验（分享页）
6. 安全设计与边界
7. 运维与故障排查
8. 变更与回滚
9. 附录：端点速查 / 验收命令 / 证据索引

---

## 1. 系统速览

管理员生成一个免注册、免密码的临时链接，访客打开即可看到**只读**的报表快照。链接最长 365 天有效，可随时停止（访客立即无法访问）或删除（硬删 + 留存审计）。

| 角色 | 入口 | 需要登录？ |
|---|---|---|
| 管理员 | `/admin/access-links` 管理页 | 是（admin 且 approved） |
| 访客 | `/share/<token>` 分享页 | 否 |

三条已确认设计决策（#45，2026-07-31）：
1. 对外展示页复用关键报表卡片（只读），后续可定制；
2. 管理员鉴权复用 Supabase Auth；
3. 删除 = 硬删 + 基础审计（`access_links_audit` 表落库）。

---

## 2. 组成部分与部署状态

| 组件 | 文件 / 位置 | 作用 | 当前状态 |
|---|---|---|---|
| 数据库表 + RLS | `supabase/migrations/20261125_access_links_T1.sql` | 主表 `access_links` + 审计表 `access_links_audit` | ✅ 已执行（2026-11-25） |
| 数据库 migration（v2.3.0） | `supabase/migrations/20261126_access_links_T3_T4.sql` | 加 `site_scope`/`row_limit` 两列 + CHECK 约束，历史回填 ALL/100 | ✅ 已执行（2026-11-26） |
| Edge Function | `supabase/functions/access_links/index.ts` | 公开校验 + 管理端 CRUD + 数据隔离/条数过滤 + `/admin/sites` | ✅ 已部署（生产 version 3，verify_jwt=false） |
| token 逻辑 | `supabase/functions/access_links/access_token.mjs` | token 生成/校验/有效期钳制 | ✅ 随函数部署 |
| 前端页面 | `index.html`（路由 + 样式 + 逻辑） | 分享页 + 管理页（v2.3.0 数字格式化） | ✅ 已上线（v2.3.0，commit `773cf8d`） |
| 测试 | `*.test.mjs` × 3 | 28 + 51 + 77 = 156 项全绿 | ✅ 本地可复跑 |

> 三平台分工（详见《部署运维手册 V1.2》2.3）：Netlify = 生产主站（手动部署）；Vercel = 后备；Cloudflare Worker = UAT 站（分享/管理页测试）。分享页 SPA fallback 已三平台对齐（#67）。

---

## 3. 部署手册（运维）

### 3.1 前置条件

- Supabase CLI 已登录并 link 到项目：`uvqjtvonxwsmhntnyest`（若 `supabase secrets list` 报 `Cannot find project ref`，先在项目根目录执行 `supabase link --project-ref uvqjtvonxwsmhntnyest`）。
- 拥有 service_role key 与 anon key（从 Supabase 控制台 → Project Settings → API 获取，或本地 `SECRETS_LOCAL.md`）。
- 代码在 `master` 分支（发版流程见《版本发布 SOP》）。

### 3.2 数据库迁移（T1）

迁移 SQL 已在项目内。若新环境需要重建，在 Supabase SQL Editor 或直连执行 `supabase/migrations/20261125_access_links_T1.sql`。要点：

- 建 `public.access_links`（token 唯一索引 + status/expires 索引）与 `public.access_links_audit`（link_id/action 索引）。
- 两表开启 RLS，**不建任何 policy**；显式 `REVOKE ALL FROM anon, authenticated`、`GRANT ALL TO service_role`。
- 所有对外读取都经 service_role 的 Edge Function，anon 直读永远为空。

执行后验收：

```sql
SELECT * FROM access_links;         -- 空表，无报错
SELECT * FROM access_links_audit;   -- 空表，无报错
```

### 3.3 Secrets / 环境变量

在 Supabase 控制台 → Project Settings → Edge Functions → Secrets 设置，或用 CLI `supabase secrets set`。函数读取以下变量：

| 变量名 | 是否必需 | 说明 | 真实值来源 |
|---|---|---|---|
| `SUPABASE_URL` | 有代码兜底 | 项目 URL，兜底 `https://uvqjtvonxwsmhntnyest.supabase.co` | 控制台 / `SECRETS_LOCAL.md` |
| `SUPABASE_SERVICE_ROLE_KEY` 或 `PROJECT_SERVICE_ROLE_KEY` | **必需** | 服务端写库、绕过 RLS；两者取其一 | 控制台 → API → service_role key |
| `SUPABASE_ANON_KEY` 或 `PROJECT_ANON_KEY` | **必需** | 校验用户 JWT 用；两者取其一 | 控制台 → API → anon key |
| `PROJECT_PUBLIC_BASE` | 有代码兜底 | 生成分享 URL 的域名前缀，兜底 `https://autoprintreport.netlify.app` | 按实际部署域名 |

> **坑位提醒（历史经验）**：CLI v2.109+ 禁止用 `SUPABASE_` 前缀设置函数 secret（护栏拦截）。若 `supabase secrets set SUPABASE_...` 被拒，改用 `PROJECT_` 前缀名（代码已兼容 `PROJECT_SERVICE_ROLE_KEY` / `PROJECT_ANON_KEY`）。另外函数启动有 `checkEnv()`：缺 SERVICE_ROLE 或 ANON_KEY 会直接 500。

### 3.4 部署 Edge Function

在仓库根目录、本地终端执行（**必须带 `--no-verify-jwt`**：公开端点 `/public` 不带 JWT，交给函数内部自行鉴权）：

```powershell
cd D:\WBStorage\Projects\AutoPrint
supabase functions deploy access_links --project-ref uvqjtvonxwsmhntnyest --no-verify-jwt --use-api
```

预期回显：`Deployed access_links`（或版本递增）。生产上当前为 **version 3**（v2.3.0 于 2026-11-26 重新部署）。

> 若改了 `index.ts` 需重新部署覆盖（无停机）；若只改 `access_token.mjs`，同样需重新部署（它是函数的 import 依赖）。

### 3.5 前端部署（分享页 + 管理页）

前端改动在 `index.html`，随常规发版走：

```powershell
git checkout develop
git add .
git commit -m "..."
git push origin develop
# 发版时（用户本地执行合并与推送）
git checkout master
git merge develop
git push origin master
```

随后到 Netlify 控制台 → Deploys → Trigger deploy → **Deploy project without cache**（生产站手动部署）。UAT 站由 Cloudflare Worker 在 master 推送后自动构建，无需手动触发。

> **易漏点**：分享页 `/share/<token>` 与管理页 `/admin/access-links` 是深层路由，必须保证各平台 SPA fallback（未知路径回退 `index.html`）。三平台已配置（Netlify `netlify.toml`、Cloudflare `wrangler.jsonc` 的 `not_found_handling: single-page-application`），若迁移托管平台务必复核，否则会 404（#67 根因）。

### 3.6 部署后验收

线上 curl 快速校验（无 token 应 403，属预期鉴权行为）：

```powershell
# 无 token → 期望 403（链接不存在或已删除）
curl -s -o NUL -w "%{http_code}" "https://uvqjtvonxwsmhntnyest.supabase.co/functions/v1/access_links/public"

# 公开端点非法 token → 期望 403
curl -s -o NUL -w "%{http_code}" "https://uvqjtvonxwsmhntnyest.supabase.co/functions/v1/access_links/public?token=abc123"

# 管理端无 JWT → 期望 401（缺少访问令牌）
curl -s -o NUL -w "%{http_code}" "https://uvqjtvonxwsmhntnyest.supabase.co/functions/v1/access_links/admin/list"

# 分享页深层路由 → 期望 200（返回 index.html）
curl -s -o NUL -w "%{http_code}" "https://autoprintreport.netlify.app/share/test"
```

本地自动化测试（101 项，约数秒）：

```powershell
cd supabase/functions/access_links
node access_token.test.mjs
node integration.test.mjs
node ui_logic.test.mjs
```

验收基准：`28 PASS` + `29 PASS` + `44/44 passed`。

---

## 4. 管理手册（管理员）

### 4.1 进入管理页

1. 用 **admin 账号**登录仪表盘（非 admin 或 approved=false 无法进入）。
2. 登录后，顶部导航栏点击 **「🔗 访问链接」** 按钮；或浏览器直接输入 `https://autoprintreport.netlify.app/admin/access-links`。
3. 未登录状态访问管理页会被引导到登录页（安全兜底，属正常行为）。

管理页标题为「🔗 对外访问链接管理」，包含：创建表单 + 链接列表（列：标题 / 状态 / 有效期至 / 创建者 / 分享 URL / 操作）。

### 4.2 创建链接

1. 在「链接标题」填入便于识别的名称（如「9月报表-客户A」）——**访客会在分享页看到此标题**。
2. 在「有效期（天，1-365）」填入天数。服务端强制钳制到 1–365 天：填 400 会按 365 天，填 0/负数按 1 天，填非数字按 30 天。
3. 点击 **「➕ 创建链接」**。
4. 成功标志：toast 提示「✅ 链接已创建，URL 已复制到剪贴板」，列表新增一行「生效中」，创建者显示为当前用户。

> 系统在服务端用 32 字节随机数生成 token（43 位 base64url），不可逆推、全局唯一；管理员无需也不能自定义 token。

### 4.3 复制与分享

- 创建时 URL **自动复制到剪贴板**，可直接粘贴发送给访客。
- 之后在列表中，任意链接的「操作」列点 **「复制」**，可再次复制其完整分享 URL（`https://<域名>/share/<token>`）。
- 分享 URL 含 token，等同于访问凭证——请像对待密码一样通过可信渠道发送，不要公开发布。

### 4.4 停止链接

1. 在列表中找到目标链接，点 **「停止」**。
2. 确认弹窗「确定停止该链接访问吗？停止后访客将无法打开。」→ 确定。
3. 成功标志：状态变为「已停止」，该行不再显示「停止」按钮（仅保留复制/删除）。
4. 访客此时打开原链接：显示友好提示「⛔ 链接已停止访问，请联系分享方获取新链接」。

> 停止是**可逆性较弱**的操作：本系统没有「重新启用」按钮，需恢复访问请新建一个链接。stopped 状态优先于过期判断。

### 4.5 删除链接

1. 在列表中找到目标链接，点 **「删除」**。
2. 二次确认弹窗：「确定删除链接「xxx」吗？此操作不可恢复（保留审计记录）。」
3. 确定后该行从列表消失，回到空状态「暂无访问链接，请在上方创建」。

> 删除为**硬删**（记录从 `access_links` 表物理移除），但删除前会先写一条 `action='delete'` 审计到 `access_links_audit`（含 link_id、token 前 8 位、操作人、时间、详情），可追溯。**不要对仍在对外分发的链接执行删除**——删除后访客打开会显示「链接不存在或已删除」。

### 4.6 字段与状态说明

| 项 | 取值 / 含义 |
|---|---|
| 状态 | 生效中（active）/ 已停止（stopped） |
| 有效期至 | 创建时按天数算出的到期时间；到期后访客显示「链接已过期」 |
| 创建者 | 管理员的用户标识 |
| 对外数据字段（7 字段白名单） | 站点、执行时间、总数、成功、跳过、失败、耗时分钟（即「每次执行（分钟）」，round 到 1 位小数）。**不含**来源邮箱等内部字段 |
| 数据量 | 分享页展示最近 100 行报表数据 |

---

## 5. 访客端体验（分享页）

访客打开 `/share/<token>`（免登录）会看到：

- 标题（管理员创建时填写的名称）+ 生成时间 + 到期时间；
- KPI 卡片：总数 / 成功 / 失败 / 平均耗时（数值取最近 100 行）；
- 明细表格：7 列（含「每次执行（分钟）」）。

各失效状态的访客提示：

| 状态 | 分享页表现 |
|---|---|
| 有效 | 正常展示标题 + KPI + 明细表 |
| 已停止 | ⛔「链接已停止访问，请联系分享方获取新链接」，元数据清空 |
| 已过期 | ⛔「链接已过期」 |
| 不存在/已删除 | 🔒「链接不存在或已删除，请核对后重试」 |
| 网络错误 | 「暂时无法加载」 |

> 访客端危险标签（如 `<img onerror=...>`）会被转义，不会执行脚本。

---

## 6. 安全设计与边界

| 措施 | 实现 |
|---|---|
| token 不可猜 | 32 字节 crypto 随机 + base64url（43 字符），唯一索引 |
| 有效期上限 | 服务端强制 ≤365 天（前端也钳制，但以服务端为准） |
| 停止优先 | `status=stopped` 优先于过期判断（#51） |
| 管理端鉴权 | Supabase Auth JWT + `profiles.role=admin` + `approved=true`；非管理员 403 |
| 数据不出库白名单 | 对外只返回 7 个字段，经 service_role 读取，anon 直读为空 |
| RLS | 两张表开启 RLS，无 policy；anon/authenticated 显式 REVOKE ALL |
| 审计 | create/stop/delete 均写 `access_links_audit`；只存 token 前 8 位，不存完整 token |
| 部署 | `verify_jwt=false`（公开端点无 JWT），鉴权由函数内部完成 |
| 前端转义 | 分享页对标题/数据做 HTML 转义，防 XSS |

**已知边界**：分享 URL 本身即凭证，持有者可在有效期内在任何地方访问——系统不绑定 IP、不做访客身份验证。这是「免登录分享」的固有取舍，请通过可信渠道分发并把控有效期。

---

## 7. 运维与故障排查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 打开 `/share/<token>` 报 404 | 托管平台缺 SPA fallback | 检查 netlify.toml / Cloudflare wrangler.jsonc 的回退规则（#67）；深层路由必须回退 index.html |
| 公开端点 500 `missing env` | Secrets 未配置或用了被禁的 `SUPABASE_` 前缀 | 按 3.3 用 `PROJECT_` 前缀重设 secret，重新部署 |
| 管理页提示「仅管理员可执行此操作」 | 账号 role 非 admin 或 approved=false | 由超级管理员在 `profiles` 表修正角色/审批状态 |
| 分享页显示「链接已过期」 | 超过 expires_at | 新建链接（不支持续期） |
| 停止后仍可访问 | 浏览器缓存了旧页面 | 访客强刷；后端校验为实时，停止立即生效 |
| 前端列表不刷新 | 浏览器缓存 | 强刷（Ctrl+F5） |
| UAT 站分享页异常而生产正常 | Cloudflare Worker 静态资源/回退配置 | 对照 #67 的 wrangler 配置与 Build command 复核 |

审计查询示例（service_role / SQL Editor）：

```sql
SELECT link_id, token_prefix, action, performed_by, performed_at, detail
FROM access_links_audit
ORDER BY performed_at DESC
LIMIT 50;
```

> 审计表只保存 token 前 8 位，无法从审计反推完整 token——这是设计使然。

---

## 8. 变更与回滚

### 8.1 版本变更记录

| 版本 | 日期 | 主要变更 | commit |
|---|---|---|---|
| v2.2.0 | 2026-11-25 | access_links 首次上线：公开校验 + 管理端 CRUD + 审计 + 分享页/管理页 | `f748cea` |
| **v2.3.0** | **2026-11-26** | **数据隔离（site_scope）、最近 N 条（row_limit 1-365）、执行时间 UTC+8 带星期、每报销单平均耗时（秒）列、数字整数化+右对齐+总数数据条、Edge Function ver 3（+`/admin/sites`）、migration T3_T4** | **`773cf8d`** |

### 8.2 v2.3.0 变更详情

**数据库（migration `20261126_access_links_T3_T4.sql`）**
- `access_links` 新增 `site_scope text NOT NULL DEFAULT 'ALL'`、`row_limit int NOT NULL DEFAULT 7` + CHECK（`row_limit BETWEEN 1 AND 365`）。
- 历史链接回填 `site_scope='ALL'`、`row_limit=100`（保持 v2.2.0 展示 100 条的原有行为）。
- 回滚：需谨慎，两列有 NOT NULL + DEFAULT；新增列不影响旧数据读取，一般不回滚 schema，只回退前后端代码。

**后端 Edge Function（version 3）**
- `/public`：按 `site_scope` 过滤（`ALL` 不过滤，否则 `site=eq.<站点>`），`limit` 用 `row_limit`；响应新增 `site_scope`/`row_limit` 字段。
- 新增 `GET /admin/sites`：从报表 `DISTINCT site` 动态返回站点列表（admin JWT 保护）。
- `/admin/create`：body 新增 `site_scope`（白名单校验防注入）与 `row_limit`（服务端 clamp 1-365）。

**前端（`index.html`）**
- 管理页：创建表单加「数据范围」下拉（动态站点）+「最近条数」输入（默认 7，1-365）；列表加「数据范围/条数」两列。
- 分享页：头部显示数据范围、标题联动「最近 N 条」；执行时间固定 UTC+8 带星期；新增「每报销单平均耗时（秒）」列。
- Prototype 格式化：数字四舍五入整数（含 KPI）、6 个数字列右对齐 + tabular-nums、总数列 Excel 式数据条（品牌主蓝 #002FA7 16% 透明，不新增颜色）。

### 8.3 回滚操作

| 变更类型 | 做法 |
|---|---|
| 逻辑改动（白名单/鉴权/审计） | 改 `index.ts` → 重跑测试 → `supabase functions deploy access_links --no-verify-jwt --use-api` 覆盖（无停机） |
| 前端改动 | 改 `index.html` → 走 develop→master→Netlify 手动部署发版 |
| 数据库 schema 改动 | 新增 migration，不要在既有表上直接改；注意 `access_links` 与审计表的外键关系 |
| 回滚 | 从 git 恢复上一版 `index.ts`/`index.html` 后重新部署；数据库 schema 回滚需谨慎（审计数据不可丢） |

> 发版纪律：Edge Function 部署必须 `--no-verify-jwt`；生产站 Netlify 手动触发 Deploy without cache；版本登记见《版本发布 SOP》。

---

## 9. 附录

### 9.1 端点速查

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/functions/v1/access_links/public?token=<token>` | 无（按 token） | 公开校验并返回报表数据（响应含 `site_scope`/`row_limit`） |
| GET | `/functions/v1/access_links/admin/list` | admin JWT | 列出所有链接（含 `site_scope`/`row_limit`） |
| GET | `/functions/v1/access_links/admin/sites` | admin JWT | v2.3.0 新增：动态站点列表（DISTINCT site） |
| POST | `/functions/v1/access_links/admin/create` | admin JWT | body: `{title, days, site_scope, row_limit}` → 返回 token + 分享 URL |
| POST | `/functions/v1/access_links/admin/stop` | admin JWT | body: `{token}` |
| POST | `/functions/v1/access_links/admin/delete` | admin JWT | body: `{token}`（先审计后硬删） |

### 9.2 验收命令速查

```powershell
# 本地 156 项测试（v2.3.0）
cd supabase/functions/access_links
node access_token.test.mjs   # 期望 28 PASS
node integration.test.mjs    # 期望 51 PASS
node ui_logic.test.mjs       # 期望 77/77 passed

# 线上端点冒烟
curl -s -o NUL -w "%{http_code}" "https://uvqjtvonxwsmhntnyest.supabase.co/functions/v1/access_links/public"                 # 403
curl -s -o NUL -w "%{http_code}" "https://autoprintreport.netlify.app/share/test"                                            # 200
```

### 9.3 证据索引

| 证据 | 位置 |
|---|---|
| T1 第1批测试记录（线上实测 11 场景） | `docs/AutoPrint_access_links第1批_测试记录_v1.0_Hunyuan-Hy.md` |
| T4/T5 第2批测试记录（端到端 9 用例 + 7 截图） | `docs/AutoPrint_access_links第2批_测试记录_v1.0_Hunyuan-Hy.md` |
| 部署与 CI/CD、域名设置 | 《部署运维手册 V1.2》2.3 / 2.4 |
| UAT 404 与源码暴露修复 | issue #67 |
| v2.3.0 优化（隔离/条数/UTC8/格式化） | Epic #69 · T2 #70 / T3 #71 / T4 #72 / T5 #73 |

---

**文档结束** · 本手册为 T8 #53 交付物（v1.1 同步 v2.3.0 变更）；#53 与 Epic #45 已于 2026-11-26 关闭。
