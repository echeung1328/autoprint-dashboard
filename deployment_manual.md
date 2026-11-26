# AutoPrint 系统 - 部署运维手册 v1.0

**文档版本**: V1.2\
**创建日期**: 2026-06-30\
**修订日期**: 2026-11-26\
**作者**: 高级开发工程师\
**审核**: 待审核

------------------------------------------------------------------------

## 修订历史

  ----------------------------------------------------------------
  版本            日期            修改内容        作者
  --------------- --------------- --------------- ----------------
  V1.0            2026-06-30      初始版本        高级开发工程师
  V1.1            2026-07-30      对齐实际部署策略：Netlify 改手动部署(自动发布关闭省额度)；新增 Vercel 后备平台(Ignored Build Step 仅构建 production)；明确 develop/master 分支模型；修正"自动部署(推荐)"为按需手动部署        高级开发工程师
  V1.2            2026-11-26      新增第 2.3 节 CI/CD 链路全景(Netlify 手动/Vercel 自动/Cloudflare Worker 自动三链路)；新增第 2.4 节域名与 DNS 设置(5 域名归属 + DNS 层级 + UAT Worker 配置)；环境划分补 UAT 站；对齐三平台安全配置；新增第 10 节专项手册索引(引用 access_links 部署与管理手册)        高级开发工程师
  V1.2.1          2026-11-26      v2.3.0 发版链路核实：master push 后 Netlify 与 Cloudflare Worker 两站均自动部署新代码(commit 773cf8d)，/share 深链 200；access_links Edge Function 重新部署 ver 3；第 10 节手册索引同步 v1.1(含数据隔离/最近 N 条/UTC8/格式化变更)        高级开发工程师

  ----------------------------------------------------------------

------------------------------------------------------------------------

## 目录

1.  概述
2.  部署架构
    2.1 架构图
    2.2 环境划分
    2.3 CI/CD 链路全景（v1.2 新增）
    2.4 域名与 DNS 设置（v1.2 新增）
3.  部署流程
4.  环境变量配置
5.  监控与告警
6.  备份与恢复
7.  常见问题排查
8.  应急响应流程
9.  附录
10. 专项手册索引（v1.2 新增）

------------------------------------------------------------------------

## 1. 概述

本文档描述 AutoPrint
系统的部署架构、发布流程和运维规范，确保系统稳定可靠运行。

**系统组成**: - **前端**: HTML + JavaScript 静态页面（Netlify 托管） -
**后端**: Supabase（数据库 + Auth + API） - **代码仓库**: GitHub
(echeung1328/autoprint-dashboard) - **CI/CD**: 无自动部署 GitHub
Action（仓库仅含 Supabase RLS 安全检查，非部署）；Netlify **手动部署**（自动发布已关闭以节省免费额度，发版时仪表盘 Trigger deploy）；Vercel 作**后备平台**（Ignored Build Step 仅构建 production 分支，故障切换用）

------------------------------------------------------------------------

## 2. 部署架构

### 2.1 架构图

    ┌─────────────────────────────────────────────────────────────┐
    │                         用户浏览器                          │
    └───────────────────────┬───────────────────────────────────┘
                            │ HTTPS
                            ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                      Netlify CDN                            │
    │  - 静态资源托管 (HTML, CSS, JS)                             │
    │  - 自动 HTTPS 证书                                          │
    │  - 全球边缘节点加速                                          │
    └───────────────────────┬───────────────────────────────────┘
                            │ Supabase REST API
                            ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    Supabase (Backend)                       │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
    │  │  Database   │  │    Auth     │  │    API      │        │
    │  │  (Postgres) │  │  (JWT)      │  │  (REST)     │        │
    │  └─────────────┘  └─────────────┘  └─────────────┘        │
    │  - ReportAutoPrint 表                                       │
    │  - profiles 表                                              │
    │  - RLS 安全策略                                             │
    └─────────────────────────────────────────────────────────────┘

### 2.2 环境划分

  -------------------------------------------------------------------------------------
  环境            用途            URL                                              分支            部署方式
  --------------- --------------- -------------------------------------------------- --------------- -------------------------------
  生产环境(主)    正式使用        https://autoprintreport.netlify.app               master          手动部署(自动发布关闭，发版时 Trigger deploy → Deploy without cache)

  后备环境        Netlify 故障时   https://autoprint-dashboard.vercel.app            master          生产分支推送即自动构建(Ignored Build Step 放行)

  UAT 测试环境    测试/对外分享    https://autoprintreport.comlanuat.de5.net          master          Cloudflare Worker，master 推送自动部署(非 Netlify)

  开发环境        本地开发/记进度  http://127.0.0.1:5500                              develop/feature/\* 不部署(零额度)；仅本地 Live Server 预览
  -------------------------------------------------------------------------------------

> **关键约定**：`develop` 分支**永不自动部署**（Netlify 已关 Branch Deploys/Deploy Previews，Vercel 的 Ignored Build Step 跳过非 production 分支）。日常改动都在 `develop` 上频繁 commit/push，不消耗任何平台额度；只有合并到 `master` 并手动触发后，线上才更新。

### 2.3 CI/CD 链路全景（v1.2 新增）

本项目**没有**"推代码即全站自动更新"的统一流水线，而是三条平台链路各有各的触发方式。理解这一点是避免"以为发版了其实没生效"的关键。

**三链路对照表**

| 平台 | 环境 | 触发条件 | 部署动作 | 构建产物 |
|------|------|----------|----------|----------|
| Netlify | 主生产 | **手动**（自动发布已关闭） | 仪表盘 Deploys → Trigger deploy → Deploy project without cache | `public/`（仅 index.html） |
| Vercel | 后备 | master 推送**自动** | Ignored Build Step 仅放行 production，自动构建 | `public/`（仅 index.html） |
| Cloudflare Worker | UAT | master 推送**自动** | Git 集成 → `npx wrangler deploy` | `public/`（仅 index.html） |

**分支 → 部署映射**

| 分支 | Netlify | Vercel | Cloudflare Worker |
|------|---------|--------|-------------------|
| `develop` / `feature/*` | ❌ 不部署（Branch Deploys 已关） | ❌ 跳过构建 | ❌ 不部署 |
| `master` | ⚠️ 代码上去但**需手动 Trigger** 才生效 | ✅ 自动构建 | ✅ 自动部署 |

> **一句话记忆**：develop 随便推不花钱；master 合并后——**Vercel 和 UAT 自动更新，Netlify 主站必须手动点一下**。

**GitHub Actions 的角色（非部署）**

仓库仅有一个工作流 `.github/workflows/rls-security-check.yml`：

- **作用**：安全门禁——扫描 RLS 策略、检查明文凭证泄露（已针对公开的 `SUPABASE_ANON_KEY` 做精准放行，避免误报，见 CI run #45557702153）。
- **不是**部署流水线：它不推送代码、不触发任何平台发版。
- **触发时机**：push / PR 到受保护分支时运行，结果在仓库 Actions 页查看。

**三平台安全配置对齐**（SEC-01/02 原则，三处一致）

| 平台 | 发布目录白名单 | SPA 兜底 | 安全响应头 |
|------|---------------|----------|-----------|
| Netlify | `publish = "public"`（`netlify.toml`） | `/* → /index.html (200)` + 敏感路径强制 404 | CSP/HSTS 等（SEC-02） |
| Vercel | `outputDirectory = "public"`（`vercel.json`） | 框架默认 SPA 回退 | 同 Netlify（`vercel.json` headers） |
| Cloudflare Worker | `assets.directory = "./public"`（`wrangler.jsonc`） | `not_found_handling = "single-page-application"` | 由 Cloudflare 平台默认提供 |

> **共同产物**：三平台构建命令均为 `rm -rf public && mkdir -p public && cp index.html public/index.html`——只把 index.html 放进 `public/`，确保 `.git/`、`docs/`、`supabase/`、源数据等**永不进入公网**。这是 2026-11-26 UAT 源码暴露事故（issue #67）后的统一加固基线。

**发版动作速查**

```bash
# 1. 日常开发（不部署）
git checkout develop
git add . && git commit -m "feat(#N): 说明 ✅ 已在本地环境测试通过"
git push                              # 仅推进度

# 2. 发版（master）
git checkout master && git merge develop
git push origin master                # Vercel + UAT 自动部署
# Netlify 主站还需手动：Deploys → Trigger deploy → Deploy without cache

# 3. 验证（三处都要看）
# Netlify: https://autoprintreport.netlify.app
# Vercel:  https://autoprint-dashboard.vercel.app
# UAT:     https://autoprintreport.comlanuat.de5.net/share/<token>
```

### 2.4 域名与 DNS 设置（v1.2 新增）

**五个域名归属**

| 域名 | 承载平台 | 用途 |
|------|----------|------|
| `autoprintreport.netlify.app` | Netlify | 主生产站 |
| `comlantest.de5.net` | Netlify | Netlify 站点自定义主域名 |
| `www.comlantest.de5.net` | Netlify | 重定向 |
| `autoprintreport.comlantest.de5.net` | Netlify | 别名 |
| `autoprintreport.comlanuat.de5.net` | **Cloudflare Worker** | UAT 测试站（分享链接/管理页） |

> ⚠️ `comlanuat`（UAT）与 `comlantest`（测试）是两个分开注册的域名，走两条完全不同的托管链路。**comlanuat 不在 Netlify Domain management 里**。

**DNS 层级**

```
DNSPod（注册商）
   ├─ comlantest.de5.net → Netlify 托管
   └─ comlanuat.de5.net  → NS 委派 Cloudflare（adi.ns / damian.ns.cloudflare.com）
                              → Cloudflare DNS 一条 Worker 记录：
                                 autoprintreport.comlanuat.de5.net → Worker「autoprint-dashboard」
                                 代理状态：橙云 Proxied
```

**UAT Worker 关键配置**（详见 `wrangler.jsonc` + Cloudflare 后台 Builds）

| 项 | 值 |
|---|---|
| 发布目录 | `./public`（白名单，防源码暴露） |
| SPA 回退 | `not_found_handling = "single-page-application"` |
| Build command | `rm -rf public && mkdir -p public && cp index.html public/index.html` |
| Deploy command | `npx wrangler deploy` |
| Production 分支 | `master` |

> 背景：2026-11-26 UAT 分享链接 404 + 源码暴露，根因即上述配置缺失，补齐后一并解决（issue #67）。

------------------------------------------------------------------------

## 3. 部署流程

### 3.1 前端部署（双平台：Netlify 主 + Vercel 备）

#### 3.1.1 分支策略与部署模型

  -------------------------------------------------------------------------------------
  分支            日常操作                          部署行为
  --------------- --------------------------------- -------------------------------
  `develop`       功能开发、Bug 修复、频繁 commit    不部署、不消耗额度（本地 5500 预览）
  `master`        发版时合并 develop 后手动触发       Netlify 手动部署 + Vercel 自动构建
  -------------------------------------------------------------------------------------

**为什么这样设计**：Netlify 免费版构建额度有限，且日常本地频繁改动，故关闭自动发布、按需手动部署；Vercel 作故障切换后备，平时不主动访问，仅当 Netlify 不可用时启用其域名。

**日常开发节奏（诉求：频繁 commit 记进度 + 省额度）**:

    # 在 develop 分支
    git checkout develop
    git add .
    git commit -m "feat(#42): 添加XX功能 ✅ 已在本地环境测试通过"
    git push            # 仅推进度，不部署、不烧额度

#### 3.1.2 手动部署到生产（Netlify，主要方式）

**触发条件**: 发版时，将 `develop` 合并到 `master` 后**手动触发**（非自动）。

**部署步骤**:

    # 1. 合并开发分支
    git checkout master
    git merge develop
    git push origin master

    # 2. 在 Netlify 仪表盘手动部署
    1. 访问 https://app.netlify.com
    2. 选择 "autoprint-dashboard" 站点
    3. 点击 "Deploys" 标签
    4. 点击 "Trigger deploy" → "Deploy project without cache"
    5. 等待 1-2 分钟，访问 https://autoprintreport.netlify.app 验证

> **重要纪律**：本地（http://127.0.0.1:5500/）看到 ≠ 线上已生效。部署后必须打开线上 URL 确认新功能确实生效（防止"本地有、线上缺"的分叉，详见版本发布 SOP 第 4 节「发版前确认已部署」）。

#### 3.1.3 后备部署（Vercel）

Vercel 已导入同一 GitHub 仓库 `autoprint-dashboard`，作为 Netlify 的故障切换后备。

**配置要点**（已在 Vercel 仪表盘完成）:

  - Settings → Environments：Production 跟踪 `master`，Preview 跟踪所有其他分支
  - Settings → Build and Deployment → Ignored Build Step：
    - Behavior = `Only build production`
    - Command = `if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi`
    - 效果：push 到 `develop`（preview 环境）→ 脚本 exit 0 → 跳过构建；push 到 `master`（production 环境）→ 脚本 exit 1 → 正常构建

**后备启用方式**：当 Netlify 不可用时，直接访问 Vercel 生产域名
https://autoprint-dashboard.vercel.app 即可（master 推送已自动同步）。如需长期使用，可在 DNS 将自定义域名指向 Vercel。

#### 3.1.4 回滚部署

    # 在 Netlify 仪表盘操作
    1. 访问 "Deploys" 标签
    2. 找到要回滚到的历史版本
    3. 点击 "Publish deploy"

### 3.2 后端部署（Supabase）

#### 3.2.1 数据库迁移

**方法1: 使用 Supabase 仪表盘（推荐用于小改动）**

1.  访问
    https://supabase.com/dashboard/project/uvqjtvonxwsmhntnyest/editor
2.  点击 "New query"
3.  输入 SQL 语句
4.  点击 "Run"

**方法2: 使用 MCP 工具（推荐用于自动化）**

    // 通过 WorkBuddy 执行
    mcp__supabase__execute_sql({
      project_id: "uvqjtvonxwsmhntnyest",
      query: `
        ALTER TABLE "ReportAutoPrint"
        ADD COLUMN IF NOT EXISTS "新字段" TEXT;
      `
    })

#### 3.2.2 RLS 策略更新

    -- 示例：添加新策略
    CREATE POLICY "新策略名称"
      ON "ReportAutoPrint"
      FOR SELECT
      USING (auth.role() = 'authenticated');

**验证策略**:

    SELECT * FROM pg_policies WHERE tablename = 'ReportAutoPrint';

#### 3.2.3 Edge Function 部署（access_links）

免登录访问链接（对外分享）系统的 Edge Function `access_links`、其 DB 迁移与 Secrets 配置，因内容独立且面向管理员运维，已成文专项手册：

> 📘 **《AutoPrint 免登录访问链接（access_links）部署与管理手册 v1.1》**（v2.3.0 已同步）
> 仓库路径：`docs/AutoPrint_access_links部署与管理手册_v1.0_Hunyuan-Hy.md`
> 资料库权威版：https://www.workbuddy.cn/space/d/zKcgtlkV0o06ElzCgopZy4
> 覆盖：DB 迁移 / Secrets（PROJECT_ 前缀）/ 函数部署（`--no-verify-jwt`）/ 管理页创建·停止·删除 / 访客端状态 / 故障排查；v1.1 新增数据隔离（site_scope）/ 最近 N 条（row_limit）/ UTC+8 / 每单耗时列 / 数字格式化变更记录。

------------------------------------------------------------------------

## 4. 环境变量配置

### 4.1 Supabase 密钥管理

**重要密钥列表**:

  -------------------------------------------------------------------------
  密钥名称             用途                 使用位置        权限
  -------------------- -------------------- --------------- ---------------
  `ANON_KEY`           公开访问（读）       前端代码        受 RLS 限制

  `SERVICE_ROLE_KEY`   管理员访问（读写）   后端代码        绕过 RLS
  -------------------------------------------------------------------------

**获取方式**: 1. 访问
https://supabase.com/dashboard/project/uvqjtvonxwsmhntnyest/settings/api
2. 复制 `anon` 和 `service_role` 密钥

**安全注意事项**: - ✅ 前端代码可以包含 `ANON_KEY` - ❌
前端代码**绝对不能**包含 `SERVICE_ROLE_KEY` - ✅ 后端使用
`SERVICE_ROLE_KEY` 时，从环境变量读取

### 4.2 Netlify 环境变量

**配置路径**: Netlify 仪表盘 → Site settings → Environment variables

**常用变量**:

    SUPABASE_URL=https://uvqjtvonxwsmhntnyest.supabase.co
    SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

**添加步骤**: 1. 点击 "Add a variable" 2. 输入 Key 和 Value 3.
选择部署上下文（当前仅 **Production** 生效；Deploy previews / Branch deploys 已关闭以节省额度） 4. 点击
"Save"

------------------------------------------------------------------------

## 5. 监控与告警

### 5.1 Supabase 监控

**访问路径**:
https://supabase.com/dashboard/project/uvqjtvonxwsmhntnyest/logs

**监控指标**: - **API 请求数**: 每秒查询数 (QPS) - **数据库性能**:
慢查询、连接数 - **错误率**: 4xx/5xx 响应比例 - **认证活动**:
登录成功/失败次数

**设置告警**:

    // 在 Supabase 仪表盘操作
    1. 访问 "Settings" → "API"
    2. 滚动到 "Rate limiting" 部分
    3. 配置请求限制和告警阈值

### 5.2 Netlify 监控

**部署状态通知**:

    # 在 Netlify 仪表盘配置
    1. 访问 "Site settings" → "Build & deploy" → "Deploy notifications"
    2. 点击 "Add notification"
    3. 选择事件类型（Deploy succeeded / Deploy failed）
    4. 输入邮箱或 Webhook URL

**性能监控**: - 访问
https://app.netlify.com/sites/autoprintreport/analytics -
查看页面加载时间、CDN 命中率

### 5.3 自定义监控脚本

    // 定期检查系统健康状态
    async function healthCheck() {
      const results = {
        supabase: false,
        netlify: false,
        timestamp: new Date().toISOString()
      };

      // 检查 Supabase
      try {
        const { data, error } = await supabase
          .from('ReportAutoPrint')
          .select('count', { count: 'exact', head: true });
        
        results.supabase = !error;
      } catch (err) {
        results.supabase = false;
      }

      // 检查 Netlify（检查页面可访问性）
      try {
        const response = await fetch('https://autoprintreport.netlify.app');
        results.netlify = response.ok;
      } catch (err) {
        results.netlify = false;
      }

      // 发送告警
      if (!results.supabase || !results.netlify) {
        await sendAlert(results);
      }

      return results;
    }

    // 每5分钟检查一次
    setInterval(healthCheck, 5 * 60 * 1000);

------------------------------------------------------------------------

## 6. 备份与恢复

### 6.1 数据库备份

#### 6.1.1 自动备份（Supabase 托管）

**Supabase 免费版**: - 每天自动备份 - 保留最近 7 天的备份

**查看备份**: 1. 访问
https://supabase.com/dashboard/project/uvqjtvonxwsmhntnyest/settings/addons
2. 查看 "Database backups" 部分

#### 6.1.2 手动备份（推荐定期执行）

    # 使用 Supabase CLI 导出数据库
    supabase db dump --db-url "postgresql://postgres:[PASSWORD]@db.uvqjtvonxwsmhntnyest.supabase.co:5432/postgres" > backup_$(date +%Y%m%d).sql

**或者通过仪表盘导出**: 1. 访问 "Database" → "Backups" 2. 点击 "Download
backup"

### 6.2 数据恢复

#### 6.2.1 恢复整个数据库

    # 警告：会覆盖现有数据
    supabase db reset --db-url "..."

#### 6.2.2 恢复单表数据

    -- 1. 先备份当前数据
    CREATE TABLE "ReportAutoPrint_backup_20260630" AS
    SELECT * FROM "ReportAutoPrint";

    -- 2. 清空原表
    TRUNCATE "ReportAutoPrint";

    -- 3. 从备份文件恢复
    \copy "ReportAutoPrint" FROM '/path/to/backup.csv' CSV HEADER;

### 6.3 代码备份

**GitHub 自动备份**: - 所有代码都在 GitHub 上 - 每次 commit
都是一次备份 - 可以回滚到任意历史版本

**额外备份（可选）**:

    # 克隆仓库到本地备份
    git clone https://github.com/echeung1328/autoprint-dashboard.git

------------------------------------------------------------------------

## 7. 常见问题排查

### 7.1 部署失败

#### 问题1: Netlify 部署卡住

**症状**: 部署状态一直显示 "Building"

**排查步骤**: 1. 检查 Netlify 构建日志 - 访问 "Deploys" → 点击最新的部署
→ "View log" 2. 常见问题： - 构建命令错误 → 检查 `netlify.toml`
或构建设置 - 依赖安装失败 → 检查 `package.json` - 超时 →
优化构建流程或增加超时时间

**解决方案**:

    # 清除 Netlify 缓存并重新部署
    在 Netlify 仪表盘：Deploys → Trigger deploy → Clear cache and deploy site

#### 问题2: 页面显示 404

**症状**: 访问 https://autoprintreport.netlify.app 显示 "Page not found"

**原因**: Netlify 找不到 `index.html`

**解决方案**: 1. 确认仓库根目录有 `index.html` 文件 2. 检查 Netlify
部署设置： - Build command: 留空（纯静态站点） - Publish directory: `.`
（根目录）

### 7.2 数据加载失败

#### 问题3: Supabase 返回空数据

**症状**: 看板显示为空，控制台没有报错

**排查步骤**:

    // 1. 检查 anon key 是否正确
    console.log('ANON_KEY:', ANON_KEY);

    // 2. 检查 RLS 策略
    const { data, error } = await supabase
      .from('ReportAutoPrint')
      .select('*');
    console.log('Data:', data);
    console.log('Error:', error);

    // 3. 在 Supabase 仪表盘手动执行查询，对比结果

**常见原因**: - RLS 策略阻止了访问 → 检查 `pg_policies` 表 - 用户未登录
→ 检查认证状态 - 用户未批准 → 检查 `profiles` 表的 `approved` 字段

#### 问题4: 权限错误 (403)

**错误信息**: `new row violates row-level security policy`

**解决方案**:

    -- 检查当前用户的 RLS 策略
    SELECT * FROM pg_policies WHERE tablename = 'ReportAutoPrint';

    -- 临时禁用 RLS（仅用于调试）
    ALTER TABLE "ReportAutoPrint" DISABLE ROW LEVEL SECURITY;

    -- 调试完成后重新启用
    ALTER TABLE "ReportAutoPrint" ENABLE ROW LEVEL SECURITY;

### 7.3 认证问题

#### 问题5: 魔法链接点击后无反应

**症状**: 用户收到魔法链接邮件，点击后没有登录

**排查步骤**: 1. 检查邮件中的链接是否完整 2.
检查浏览器是否阻止了弹出窗口 3. 检查 Supabase Auth 设置： - 访问
"Authentication" → "URL Configuration" - 确认 "Redirect URLs" 包含
`https://autoprintreport.netlify.app`

**解决方案**: 在 Supabase 后台添加重定向 URL：

    Site URL: https://autoprintreport.netlify.app
    Redirect URLs:
      - https://autoprintreport.netlify.app
      - http://localhost:3000  (开发环境)

------------------------------------------------------------------------

## 8. 应急响应流程

### 8.1 故障等级定义

  -----------------------------------------------------------------------
  等级            描述             响应时间        示例
  --------------- ---------------- --------------- ----------------------
  P0              系统完全不可用   立即响应        网站宕机、数据库崩溃

  P1              核心功能受损     1小时内         看板无法加载数据

  P2              部分功能异常     4小时内         图表显示错误

  P3              界面问题         24小时内        样式错乱、文字错误
  -----------------------------------------------------------------------

### 8.2 应急联系人

  -------------------------------------------------------------------
  角色                 姓名                 联系方式
  -------------------- -------------------- -------------------------
  系统管理员           Eric Zhang           echeung1328@hotmail.com

  开发负责人           高级开发工程师       通过 WorkBuddy 联系
  -------------------------------------------------------------------

### 8.3 故障处理流程

    故障发生
        ↓
    1. 确认故障等级
        ↓
    2. 通知相关人员
        ↓
    3. 定位问题根因
        ↓
    4. 实施修复方案
        ↓
    5. 验证修复效果
        ↓
    6. 编写事故报告
        ↓
    7. 复盘与改进

### 8.4 快速修复检查清单

**前端问题**: - \[ \] 检查 Netlify 部署状态 - \[ \]
查看浏览器控制台错误 - \[ \] 清除浏览器缓存重试 - \[ \]
回滚到上一个稳定版本

**后端问题**: - \[ \] 检查 Supabase
服务状态（https://status.supabase.com） - \[ \] 查看 Supabase 日志 - \[
\] 检查数据库连接数 - \[ \] 验证 RLS 策略

**认证问题**: - \[ \] 检查 Supabase Auth 设置 - \[ \] 确认邮件服务正常 -
\[ \] 手动批准用户账号（如有需要）

------------------------------------------------------------------------

## 9. 附录

### 9.1 常用命令速查表

    # GitHub 操作（日常在 develop 分支）
    git checkout develop            # 切换到开发分支
    git status                      # 查看状态
    git add .                       # 添加所有改动
    git commit -m "message"         # 提交（频繁 commit 记进度，不部署）
    git push                        # 推送到 origin/develop（已设 upstream）

    # 发版时合并到 master 并部署
    git checkout master
    git merge develop
    git push origin master          # 代码上 master（Netlify 自动发布已关，尚未部署）
    # 随后在 Netlify 仪表盘 Trigger deploy → Deploy without cache

    # Netlify CLI（如已安装）
    netlify status                  # 查看部署状态
    netlify open                    # 打开站点
    netlify logs                    # 查看日志

    # Supabase CLI（如已安装）
    supabase status                 # 查看项目状态
    supabase db dump                # 备份数据库

### 9.2 相关链接

- **Netlify 仪表盘**: https://app.netlify.com
- **Supabase 仪表盘**:
  https://supabase.com/dashboard/project/uvqjtvonxwsmhntnyest
- **GitHub 仓库**: https://github.com/echeung1328/autoprint-dashboard
- **Netlify 文档**: https://docs.netlify.com
- **Supabase 文档**: https://supabase.com/docs
- **access_links 部署与管理手册**: https://www.workbuddy.cn/space/d/zKcgtlkV0o06ElzCgopZy4

### 9.3 检查清单

**发版前检查**: - \[ \] 代码已在 develop 测试通过（本地 127.0.0.1:5500） - \[ \]
develop 已合并到 master 并 push - \[ \] 部署方式已确认（Netlify 手动
Trigger deploy → Deploy without cache；Vercel 后备随 master 自动构建）

**部署后验证**: - \[ \] **打开 https://autoprintreport.netlify.app
确认新功能/变更确实生效**（防止"本地有、线上缺"分叉） - \[ \]
数据加载正常 - \[ \] 认证功能正常 - \[ \] 响应式布局正常 - \[ \]
控制台没有错误 - \[ \] （如启用 Vercel 后备）打开
https://autoprint-dashboard.vercel.app 确认已同步

------------------------------------------------------------------------

## 10. 专项手册索引（v1.2 新增）

本手册为部署运维总入口。以下专项主题因内容独立、面向特定运维场景，另立手册，需要时按链接查阅：

| 专项手册 | 适用场景 | 仓库路径 | 资料库权威版 |
|---|---|---|---|
| 免登录访问链接（access_links）部署与管理手册 v1.1 | 分享链接/管理页的部署、创建·停止·删除、访客端状态、故障排查（含 v2.3.0 数据隔离/条数/UTC8/格式化） | `docs/AutoPrint_access_links部署与管理手册_v1.0_Hunyuan-Hy.md` | https://www.workbuddy.cn/space/d/zKcgtlkV0o06ElzCgopZy4 |
| 版本发布 SOP v1.2 | 发版登记、版本号语义、app_versions 登记 | `docs/AutoPrint_版本发布SOP_v1.0.md` | https://www.workbuddy.cn/space/d/2nbHi0lc2V80qyS0j1GNS6 |
| 回滚保险操作清单 v1.0 | 变更前的回滚保险与应急操作 | — | https://www.workbuddy.cn/space/d/rZyDdLdZwY1vGCq04F0IaW |
| 邮件摄取（email_ingest）SOP 操作手册 v1.0 | 邮件→Webhook→Supabase 摄取链路运维 | `docs/email_ingest_SOP操作手册_v1.0.md` | — |

> 资料库链接为云端权威版本（内容更新以云端为准）；仓库路径为源文件位置（代码改动走 Git 流程）。两者应保持一致。

------------------------------------------------------------------------

**文档结束**

*本文档为 AutoPrint 系统部署运维手册，如有疑问请联系开发团队。*
