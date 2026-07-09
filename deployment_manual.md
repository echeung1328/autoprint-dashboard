# AutoPrint 系统 - 部署运维手册 v1.0

**文档版本**: V1.0\
**创建日期**: 2026-06-30\
**作者**: 高级开发工程师\
**审核**: 待审核

------------------------------------------------------------------------

## 修订历史

  ----------------------------------------------------------------
  版本            日期            修改内容        作者
  --------------- --------------- --------------- ----------------
  V1.0            2026-06-30      初始版本        高级开发工程师

  ----------------------------------------------------------------

------------------------------------------------------------------------

## 目录

1.  概述
2.  部署架构
3.  部署流程
4.  环境变量配置
5.  监控与告警
6.  备份与恢复
7.  常见问题排查
8.  应急响应流程

------------------------------------------------------------------------

## 1. 概述

本文档描述 AutoPrint
系统的部署架构、发布流程和运维规范，确保系统稳定可靠运行。

**系统组成**: - **前端**: HTML + JavaScript 静态页面（Netlify 托管） -
**后端**: Supabase（数据库 + Auth + API） - **代码仓库**: GitHub
(echeung1328/autoprint-dashboard) - **CI/CD**: GitHub Actions + Netlify
Auto-deploy

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
  环境            用途            URL                                   分支
  --------------- --------------- ------------------------------------- ---------------
  生产环境        正式使用        https://autoprintreport.netlify.app   master

  预发布环境      测试验证        可选配置                              develop

  开发环境        本地开发        localhost                             feature/\*
  -------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 3. 部署流程

### 3.1 前端部署（Netlify）

#### 3.1.1 自动部署（推荐）

**触发条件**: 推送到 `master` 分支

**部署步骤**: 1. 开发者提交代码到 GitHub
`bash    git add .    git commit -m "feat: ``添加新功能"``    git push origin master`

2.  Netlify 自动检测到推送
    - 拉取最新代码
    - 执行构建命令（如有）
    - 部署到 CDN
3.  部署完成
    - 收到 Netlify 邮件通知
    - 访问 https://autoprintreport.netlify.app 验证

**部署时间**: 通常 1-2 分钟

#### 3.1.2 手动部署（紧急情况）

    # 在 Netlify 仪表盘操作
    1. 访问 https://app.netlify.com
    2. 选择 "autoprint-dashboard" 站点
    3. 点击 "Deploys" 标签
    4. 点击 "Trigger deploy" → "Clear cache and deploy site"

#### 3.1.3 回滚部署

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
选择部署上下文（Production / Deploy previews / Branch deploys） 4. 点击
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

    # GitHub 操作
    git status                      # 查看状态
    git add .                       # 添加所有改动
    git commit -m "message"         # 提交
    git push origin master          # 推送到远程

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

### 9.3 检查清单

**部署前检查**: - \[ \] 代码已通过测试 - \[ \] 环境变量已配置 - \[ \]
数据库迁移脚本已验证 - \[ \] 备份已完成

**部署后验证**: - \[ \] 页面可以正常访问 - \[ \] 数据加载正常 - \[ \]
认证功能正常 - \[ \] 响应式布局正常 - \[ \] 控制台没有错误

------------------------------------------------------------------------

**文档结束**

*本文档为 AutoPrint 系统部署运维手册，如有疑问请联系开发团队。*
