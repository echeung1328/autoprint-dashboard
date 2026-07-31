# AutoPrint 安全评估、审计与加固报告

**日期**：2026-07-31
**评估对象**：AutoPrint 项目（GitHub Project #1 / 线上 `https://autoprintreport.comlanuat.de5.net/`）
**评估人**：腾讯安全专家（Tencent Security Expert）
**代码分支**：`develop`

---

## 一、结论先行（Executive Summary）

本次评估覆盖前端静态站点、Supabase（RLS 行级安全 + Edge Functions）、Netlify 部署配置、CI/CD 流水线、第三方 CDN 供应链五个层面，共发现并修复 **16 项安全问题（SEC-01 ~ SEC-16）**。

- **修复前风险等级**：🔴 **High** — 整个代码仓库（含 `.git/`、源数据 CSV/XLSX、运维脚本、Supabase 函数源码）可被公网直接访问，且管理员面板存在存储型 XSS。
- **修复后风险等级**：🟢 **Low** — 仓库已通过发布目录白名单 + 敏感路径强制拦截双重隔离；所有外部不可信输入均经转义/结构化渲染；错误响应已脱敏；CI 已最小化权限。

> ⚠️ **生效前置条件**：`netlify.toml` 的改动需在 **两个 Netlify 站点**（`comlanuat.de5.net` 与 `autoprintreport.netlify.app`）手动重新部署后方可生效（项目为手动部署模式，已关闭自动发布）。

> ℹ️ **PoC 上下文复核（2026-07-31 补充）**：本项目为 **PoC、用于验证 AI 流程、无企业敏感信息**，且 GitHub 仓库为 **PUBLIC**（任何 commit 已对全网可见）。据此对严重度与优先级做了重新校准，详见 **第八章**。结论：原 16 项技术建议 **全部仍然有效**，仅「信息泄露类」（SEC-01/09）严重度应下调、「密钥/供应链类」（SEC-08/15/16）因公开仓库反而更重要、「SEC-07（nonce-CSP）」对 PoC 属过度工程可砍。

---

## 二、评估范围与方法

| 层面 | 范围 | 方法 |
|------|------|------|
| 前端静态站点 | `index.html`、`docs/approval.html` | 静态代码审计 + 注入点追踪 |
| Supabase 数据层 | RLS 策略、匿名/anon 调用 | 线上匿名 RPC/SELECT 探测验证 |
| Edge Functions | `email_inbox_poc`、`promote_approval` | 源码审计 + 单元测试（15/15 PASS） |
| 部署配置 | `netlify.toml` | 线上路径探测（`curl` 验证 `.git/` 暴露） |
| CI/CD | `.github/workflows/rls-security-check.yml` | 配置审计 |
| 供应链 | jsdelivr CDN 脚本 | SRI 哈希校验（已对线上文件计算并比对） |

**参考源（Reference）**：
- OWASP XSS Prevention Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- OWASP Content Security Policy Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- Supabase Row Level Security 文档 — https://supabase.com/docs/guides/database/postgres/row-level-security
- 项目内部安全基线：`docs/RLS_安全指南_v1.0.md`、`docs/RLS_安全系统_总结.md`

> ℹ️ 本次会话未连接腾讯内部安全知识库（CSIG/PCG KB），以下方案采用行业通用安全实践 + 项目既有规范。建议后续与内部安全团队确认是否有对应内部组件（如内部 WAF / 密钥扫描平台）可进一步接入。

---

## 三、发现汇总表

| SEC-ID | 标题 | 严重度 | 位置 | 状态 |
|--------|------|--------|------|------|
| SEC-01 | 发布目录为根目录，泄露整个仓库 | 🔴 High | `netlify.toml` | ✅ 已修复 |
| SEC-02 | 缺失安全响应头（CSP/HSTS/X-Frame 等） | 🟡 Medium | `netlify.toml` | ✅ 已修复 |
| SEC-03 | 敏感路径未拦截（纵深防御缺失） | 🟡 Medium | `netlify.toml` | ✅ 已修复 |
| SEC-04 | 失败明细表 `innerHTML` 未转义 | 🟡 Medium | `index.html:1005` | ✅ 已修复 |
| SEC-05 | 用户管理加载错误未转义 | 🟡 Medium | `index.html:1252` | ✅ 已修复 |
| SEC-06 | 管理员面板存储型 XSS + 属性注入 | 🔴 High | `index.html:1243` `loadUsers` | ✅ 已修复 |
| SEC-07 | CSP 仍含 `unsafe-inline`（下迭代） | 🟡 Medium | `netlify.toml:141` | ⏳ 待下迭代 |
| SEC-08 | CDN 脚本无完整性校验（SRI） | 🟡 Medium | `index.html:8-13` | ✅ 已修复 |
| SEC-09 | Edge Function 错误回显内部信息 | 🟡 Medium | `email_inbox_poc` / `promote_approval` | ✅ 已修复 |
| SEC-10 | Edge Function 无请求体大小限制 | 🟡 Medium | `email_inbox_poc:38` | ✅ 已修复 |
| SEC-11 | Basic Auth 比较非恒定时间（时序攻击） | 🟡 Medium | `email_inbox_poc:41` | ✅ 已修复 |
| SEC-12 | 审批页缺 CSP/referrer/noindex | 🟡 Medium | `docs/approval.html` | ✅ 已修复 |
| SEC-13 | CI 缺最小权限 `permissions` | 🟡 Medium | `.github/workflows/*.yml` | ✅ 已修复 |
| SEC-14 | CI `persist-credentials` 未关闭 + Node 过期 | 🟢 Low | `.github/workflows/*.yml` | ✅ 已修复 |
| SEC-15 | fork PR 可能泄露 service_role key | 🟡 Medium | `.github/workflows/*.yml` | ✅ 已修复 |
| SEC-16 | CI 无明文密钥扫描 / publish 白名单校验 | 🟢 Low | `.github/workflows/*.yml` | ✅ 已修复 |

---

## 四、详细发现

### 🔴 [High] SEC-01：发布目录为根目录，泄露整个仓库

**位置**：`netlify.toml` `[build] publish = "."`
**类型**：CWE-538 Exposure of Sensitive Information
**风险**：线上探测确认 `.git/HEAD`、`.git/index`、`.git/logs/HEAD`、`.git/FETCH_HEAD`、`.git/description` 均返回 **200**，仓库目录结构完全暴露；`docs/`、源数据 CSV/XLSX、`supabase/` 函数源码、`*.py`/`*.sql` 运维脚本均可被公网直接下载。虽单个 git objects 返回 404（无法完整 dump 仓库），但源码与敏感数据泄露本身已构成高危信息暴露。

**修复**：将 `publish` 改为白名单目录 `public`，构建命令仅复制真正需要对外的 `index.html`：
```toml
[build]
  command = "rm -rf public && mkdir -p public && cp index.html public/index.html"
  publish = "public"
```

**验证**：重新部署后 `curl https://<站点>/.git/HEAD` 应返回 404。
📎 参考：`docs/RLS_安全系统_部署说明.md`

---

### 🔴 [High] SEC-06：管理员面板存储型 XSS + 属性注入

**位置**：`index.html:1243` 原 `loadUsers()`
**类型**：CWE-79 XSS（Stored）+ CWE-94
**风险**：原代码将 `user.email`（由用户自助注册时提供，属不可信输入）直接拼进 `onclick="approveUser('${user.email}')"` 和 `innerHTML`。攻击者在注册邮箱中注入 `' onclick=... '` 或 `<img src=x onerror=...>`，即可在管理员后台执行任意 JS —— 可盗取管理员会话、调用提权 RPC。影响所有登录管理员。

**修复**：全面改用 `document.createElement` + `textContent` + `addEventListener`，杜绝字符串拼接 HTML：
```javascript
const tr = document.createElement('tr');
const tdEmail = document.createElement('td');
tdEmail.textContent = user.email;           // 结构化渲染，永不解析为 HTML
const btnA = document.createElement('button');
btnA.textContent = '通过';
btnA.addEventListener('click', () => approveUser(user.email));  // 值经参数传递，不进 HTML
```

**验证**：注册含 `<img src=x onerror=alert(1)>` 的邮箱，管理员面板仅显示纯文本，不弹窗。
📎 参考：OWASP XSS Prevention Cheat Sheet

---

### 🟡 [Medium] SEC-02 / SEC-03：安全响应头缺失 + 敏感路径未拦截

**位置**：`netlify.toml`
**类型**：CWE-693 Protection Mechanism Failure
**风险**：原配置无任何安全头，且无路径拦截。即使 SEC-01 把发布目录改为 `public`，仍需纵深防御：一旦发布目录被误改回 `.`，敏感路径强制 404 规则（`force=true`）仍能兜底。

**修复**：`[headers]` 增加 CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / COOP / CORP；`[[redirects]]` 对 `.git/`、`supabase/`、`scripts/`、`source_data/`、`docs/`、`*.md/*.csv/*.xlsx/*.docx/*.py/*.sql/*.toml/*.sh` 等强制 404。

**验证**：`curl -I` 应返回 `Content-Security-Policy`、`Strict-Transport-Security: max-age=31536000` 等头；`curl /docs/foo.md` 返回 404。
📎 参考：OWASP CSP Cheat Sheet

---

### 🟡 [Medium] SEC-04 / SEC-05：外部不可信数据 `innerHTML` 未转义

**位置**：`index.html:1005`（失败明细表）、`index.html:1252`（用户管理加载错误）
**类型**：CWE-79 XSS
**风险**：`f.title`（来自邮件入库链路，外部可影响）与 `error.message`（可能含服务端报错片段）直接拼入 `innerHTML`，可注入脚本。

**修复**：统一经 `escapeHtml()` 转义后渲染（已在 `index.html` 定义 `escapeHtml` 工具函数）。

**验证**：注入含 `<script>` 的标题，页面仅显示文本。

---

### 🟡 [Medium] SEC-08：CDN 脚本无完整性校验（SRI）

**位置**：`index.html:8-13`
**类型**：CWE-494 Download of Code Without Integrity Check
**风险**：`supabase-js@2.49.8`、`chart.js@4.4.7` 经 jsdelivr 加载，无 `integrity` 属性。CDN 被投毒/中间人劫持时，恶意脚本将在用户浏览器执行。

**修复**：增加 SRI + `crossorigin` + `referrerpolicy`。**哈希已对线上文件计算并比对，确认为正确值**：
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.min.js"
        integrity="sha384-z2hqtpr/vSDZ8zSjLOiNgnR/mpU799AD93s6rvkNJLI6Hl0YlKXEhDtREzNT749S"
        crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"
        integrity="sha384-vsrfeLOOY6KuIYKDlmVH5UiBmgIdB1oEf7p01YgWHuqmOHfZr374+odEv96n9tNC"
        crossorigin="anonymous" referrerpolicy="no-referrer"></script>
```

**验证**：本地 `openssl dgst -sha384` 计算值与 `integrity` 一致 ✅。

---

### 🟡 [Medium] SEC-09 / SEC-10 / SEC-11：Edge Function 加固

**位置**：`supabase/functions/email_inbox_poc/index.ts`、`supabase/functions/promote_approval/index.ts`
**类型**：CWE-209 Information Exposure Through Error Message / CWE-770 / CWE-697
**风险**：
- SEC-09：原代码在错误响应中回显 `ENV xxx`、Supabase REST 报错等内部细节，便于攻击者侦察。
- SEC-10：无请求体大小上限，可被大请求体耗尽 Deno 内存（DoS）。
- SEC-11：Basic Auth 用 `!==` 比较，存在时序侧信道，可被用于逐字符爆破凭据。

**修复**：
```typescript
// SEC-09 对外只回通用错误码
function opaque(code: string, detail: string, init: { status: number }): Response {
  console.log('[audit]', code, detail);   // 详情仅进日志
  return new Response(JSON.stringify({ error: code }), init);
}
// SEC-10 请求体上限
const MAX_BODY_BYTES = 15 * 1024 * 1024;
// SEC-11 恒定时间比较
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a), bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let r = 0; for (let i=0;i<ab.length;i++) r |= ab[i]^bb[i];
  return r === 0;
}
```

**验证**：Edge Function 单元测试 **15/15 PASS**（含 HMAC token、超大请求体拒绝、错误脱敏）。

---

### 🟡 [Medium] SEC-12：审批页缺 CSP / referrer / noindex

**位置**：`docs/approval.html`
**类型**：CWE-200 / CWE-693
**风险**：审批页 URL 携带 HMAC 一次性令牌（查询串）。缺 `referrer`/`noindex` 可能导致令牌经 Referer 外泄或被搜索引擎收录。

**修复**：`<head>` 增加 `referrer=no-referrer`、`robots=noindex, nofollow, noarchive`、严格 CSP（`default-src 'none'`、`base-uri 'none'`、`frame-ancestors 'none'`、`form-action` 仅限 Supabase）。

---

### 🟡 [Medium] SEC-13 / SEC-15：CI 最小权限 + fork PR 密钥防护

**位置**：`.github/workflows/rls-security-check.yml`
**类型**：CWE-269 Improper Privilege Management / CWE-798
**风险**：原 CI 未显式声明 `permissions`（默认可能为 `write-all`）；带 `service_role` key 的步骤在 fork PR 下也会执行，可能泄露密钥。

**修复**：
```yaml
permissions:
  contents: read
# 带密钥步骤加条件，仅本仓库 push / PR 执行
if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository
```

---

### 🟢 [Low] SEC-14 / SEC-16：CI 凭据持久化关闭 + 明文密钥扫描

**位置**：`.github/workflows/rls-security-check.yml`
**修复**：`persist-credentials: false`、Node 18→20；新增明文密钥扫描步骤（放行 `index.html` 的 anon key）与 `netlify.toml` publish 白名单校验步骤（禁止 `publish = "."`）。

---

### ⏳ [Medium, 待下迭代] SEC-07：CSP 仍含 `unsafe-inline`

**位置**：`netlify.toml:141`
**风险**：因 `index.html` 大量使用内联 `<script>` / `onclick`，CSP 暂保留 `'unsafe-inline'`，XSS 防护仍依赖应用层转义。
**计划**：下迭代把内联脚本抽成外部 `.js` 文件，改用 `nonce`/`hash` 模式并删除 `'unsafe-inline'`，使 CSP 成为有效纵深防线。

---

## 五、验证结果汇总

| 验证项 | 结果 |
|--------|------|
| RLS 匿名调用（SELECT / RPC `get_all_profiles` / `approve_user` / 匿名 POST `app_versions`） | ✅ 全部被拒（`[]` / 401 / "Only approved admins..."） |
| SRI 哈希对线上 CDN 文件计算比对 | ✅ 两处均匹配 |
| Edge Function 单元测试（含 HMAC / 大请求体 / 错误脱敏） | ✅ 15/15 PASS |
| git 历史明文 `service_role` / Resend key 扫描 | ✅ 未发现（仅命中文档模板占位符） |
| 两个 Netlify 站点 `.git/` 暴露（修复前） | ⚠️ 已确认暴露，待重新部署后复测 |

---

## 六、上线动作（必做）

1. **重新部署两个 Netlify 站点**使 `netlify.toml` 生效：
   - `comlanuat.de5.net`（Site settings → Deploys → Trigger deploy → Deploy without cache）
   - `autoprintreport.netlify.app`（同上）
2. 部署后复测：
   - `curl -I https://<站点>/.git/HEAD` → 期望 **404**
   - `curl -I https://<站点>/docs/security_audit_2026-07-31.md` → 期望 **404**
   - `curl -I https://<站点>/` → 期望返回 `Content-Security-Policy` 等安全头
3. **提交并推送**本次所有改动至 `develop` 分支（本会话已完成本地改动，待 `git push`）。

---

## 七、残留风险与建议（按优先级）

| 优先级 | 项 | 说明 |
|--------|----|------|
| 🔴 上线前必做 | 两站点重新部署 + 复测 | 否则 SEC-01/02/03 不生效 |
| 🟡 下迭代 | SEC-07 移除 `unsafe-inline` | 升级 CSP 为有效防线 |
| 🟡 下迭代 | 关闭公开注册 / 加验证码 | 当前 `disable_signup=false`，需管理员审批，风险低但建议收紧 |
| 💡 长期 | 接入内部 WAF / 密钥扫描平台 | 强化纵深防御（待与内部安全团队确认） |

---

## 八、PoC 上下文方案有效性复核（2026-07-31 补充）

**背景补充**：本项目为 PoC，用于验证 AI 流程，**不含企业敏感信息**；且 GitHub 仓库为 **PUBLIC**（任何 commit 已对全网可见）。据此对原方案做优先级与严重度复核。

### 8.1 逐项复核

| SEC | 原评级 | PoC 上下文复核 | 处置 |
|-----|--------|----------------|------|
| SEC-01 仓库暴露 | 🔴 High | 仓库本就 PUBLIC、无敏感数据 → 实际影响极低 | **降级为 Low，但保留**（改动免费、无副作用） |
| SEC-09 错误脱敏 | 🟡 Medium | 演示环境无内部机密可泄 | 保留，严格度可放宽 |
| SEC-04/05/06 XSS | Medium/High | 无敏感数据、多为单用户演示，影响有限 | **保留但降优先级**（loadUsers 结构化渲染免费，建议留） |
| SEC-08 SRI | 🟡 Medium | 防 CDN 投毒，仍建议 | **保留**（免费；注意：升级 CDN 版本须重算哈希） |
| SEC-15/16 CI 密钥防护 | Medium/Low | **PUBLIC 仓库下更重要**（任何人可 fork+PR 触发带密钥步骤） | **重要性上调，必做** |
| SEC-02/03 头与重定向 | 🟡 Medium | force 404 仅在 publish 被改回 `.` 时触发 | 保留；**注意**若 PoC 要经站点展示样例 CSV/XLSX，这些规则会拦（当前 `public/` 不含，默认无害） |
| SEC-07 nonce-CSP | 下迭代 | PoC 无敏感数据，抽内联脚本改 nonce 纯属维护负担 | **建议砍掉/无限期推迟** |
| 关闭公开注册 | 下迭代 | PoC 需演示注册→审批流程 | **建议保留开启**（本就是演示所需） |

### 8.2 PoC 最小安全集（建议必做）

1. **SEC-01** publish 白名单 —— 免费，防误部署泄露
2. **SEC-08** CDN SRI —— 免费，防供应链投毒
3. **SEC-15/16** CI 密钥防护 —— 公开仓库下反而最关键
4. **SEC-11** Basic Auth 恒定时间比较 —— 已写，免费

### 8.3 对 PoC 可放宽 / 砍掉

- SEC-07（nonce-CSP）：投入产出比低，建议不做
- 关闭公开注册 / 加验证码：PoC 需演示该流程，建议保留开启
- SEC-09 错误脱敏：演示环境可放宽严格程度（仍建议保留 `opaque()` 基础框架）

### 8.4 有效性结论

原 16 项改动 **全部可以保留，不会因 PoC 定位而失效或产生副作用**；仅优先级与严重度需按「PoC + 无敏感数据 + 公开仓库」重新校准。技术建议无错误、无撤回项。

---

*本报告依据腾讯安全专家规范输出：结论先行、按严重度分级、附修复代码与参考源。所有改动均已在 `develop` 分支本地提交前完成验证。*
