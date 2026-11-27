# AutoPrint 系统 - 贡献指南 v1.2

**文档版本**: V1.2  
**创建日期**: 2026-06-30  
**最后更新**: 2026-11-27  
**作者**: 高级开发工程师  
**审核**: 待审核  

---

## 修订历史

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|----------|------|
| V1.0 | 2026-06-30 | 初始版本 | 高级开发工程师 |
| V1.1 | 2026-11-25 | 第 7 节「测试规范」迭代：对齐项目实际 node 测试体系；新增测试记录透明性要求（关键用例依据+截图索引）、人工测试标注、GitHub 测试记录方式 | 高级开发工程师 |
| V1.2 | 2026-11-27 | 第 7.6/7.8 节：统一测试入口 `scripts/run-all-tests.mjs`（9 套件 / 311 项）+ JUnit XML + GitHub Actions Checks 报告（issue #66）；纠正历史用例数口径（107/155/156 → 311） | 高级开发工程师 |

---

## 目录

1. 概述
2. 开发环境搭建
3. 分支管理策略
4. 代码规范
5. 提交规范
6. Pull Request 流程
7. Code Review 指南
8. 测试规范
9. 发布流程

---

## 1. 概述

本文档定义 AutoPrint 项目的开发协作规范，确保团队成员能够高效协作、保持代码质量。

**适用项目**: AutoPrint 自动打印执行报告系统

**目标读者**: 所有参与 AutoPrint 项目开发的工程师

---

## 2. 开发环境搭建

### 2.1 前置要求

**必需软件**:
- **Git**: 版本控制 (https://git-scm.com/)
- **Node.js**: v18+ (https://nodejs.org/)
- **Python**: v3.10+ (https://python.org/) - 可选，用于数据处理脚本
- **VS Code**: 推荐编辑器 (https://code.visualstudio.com/)

**推荐 VS Code 插件**:
- Live Server (实时预览 HTML)
- ESLint (JavaScript 代码检查)
- Prettier (代码格式化)
- GitLens (Git 增强)

### 2.2 获取代码

```bash
# 1. Fork 仓库（如果是外部贡献者）
# 访问 https://github.com/echeung1328/autoprint-dashboard/fork

# 2. 克隆仓库到本地
git clone https://github.com/echeung1328/autoprint-dashboard.git
cd autoprint-dashboard

# 3. 安装依赖（如果有的话）
npm install
```

### 2.3 本地开发

```bash
# 启动本地开发服务器
# 方法1: 使用 VS Code Live Server 插件
# 右键点击 index.html → "Open with Live Server"

# 方法2: 使用 Python 简易服务器
python -m http.server 8000
# 然后访问 http://localhost:8000

# 方法3: 使用 Node.js http-server
npx http-server -p 8000
```

### 2.4 配置 Supabase 连接

**本地开发使用相同的 Supabase 项目**（共享后端）:

在 `index.html` 中确认以下配置正确：
```javascript
const SUPABASE_URL = 'https://uvqjtvonxwsmhntnyest.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';  // 公开的 anon key
```

**注意**: 不要修改 `ANON_KEY`，它是公开的，受 RLS 保护。

---

## 3. 分支管理策略

### 3.1 分支模型

```
master (生产分支)
  ↑
  │
  ├── develop (开发分支)
        ↑
        │
        ├── feature/功能名称
        ├── bugfix/问题描述
        └── hotfix/紧急修复
```

### 3.2 分支命名规范

| 分支类型 | 命名格式 | 示例 |
|----------|----------|------|
| 新功能 | `feature/简短描述` | `feature/add-filter` |
|  bug 修复 | `bugfix/问题描述` | `bugfix/fix-chart-display` |
| 紧急修复 | `hotfix/问题描述` | `hotfix/critical-auth-bug` |
| 文档 | `docs/文档类型` | `docs/update-readme` |
| 重构 | `refactor/范围` | `refactor/optimize-query` |

### 3.3 分支权限

| 分支 | 保护规则 | 合并要求 |
|------|----------|----------|
| `master` | 受保护 | 至少 1 个 review 批准 |
| `develop` | 受保护 | 至少 1 个 review 批准 |
| 其他分支 | 无保护 | 自由推送 |

---

## 4. 代码规范

### 4.1 JavaScript 规范

**使用 ESLint + Prettier 自动格式化**

**.eslintrc.js** (推荐配置):
```javascript
module.exports = {
  env: {
    browser: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-unused-vars': 'warn',
    'indent': ['error', 2],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
  },
};
```

**代码风格示例**:
```javascript
// ✅ 推荐
const fetchData = async () => {
  try {
    const { data, error } = await supabase
      .from('ReportAutoPrint')
      .select('*');
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    return data;
  } catch (err) {
    console.error('Unexpected error:', err);
  }
};

// ❌ 不推荐
function fetchData() {
  const data = supabase.from('ReportAutoPrint').select('*');  // 缺少错误处理
  return data;
}
```

### 4.2 HTML 规范

**格式要求**:
- 使用 2 空格缩进
- 标签名小写
- 属性值使用双引号
- 闭合所有标签

**示例**:
```html
<!-- ✅ 推荐 -->
<div class="container">
  <h1>标题</h1>
  <p>段落内容</p>
</div>

<!-- ❌ 不推荐 -->
<DIV class='container'>
  <H1>标题
  <P>段落内容
</DIV>
```

### 4.3 CSS 规范

**命名规范**: 使用 BEM (Block Element Modifier)

```css
/* ✅ 推荐：BEM 命名 */
.kpi-card { }
.kpi-card__title { }
.kpi-card--highlighted { }

/* ❌ 不推荐：模糊命名 */
.card { }
.title { }
.red { }
```

**组织方式**:
```css
/* 1. 变量定义 */
:root {
  --primary-color: #002FA7;
  --secondary-color: #00C3FF;
}

/* 2. 重置样式 */
* { margin: 0; padding: 0; }

/* 3. 布局样式 */
.header { }
.main { }

/* 4. 组件样式 */
.kpi-card { }
.chart-box { }

/* 5. 响应式 */
@media (max-width: 768px) { }
```

### 4.4 数据库规范

**表命名**:
- 使用 PascalCase（每个单词首字母大写）
- 不使用复数形式
- 示例: `ReportAutoPrint`, `UserProfile`

**字段命名**:
- 使用中文描述性名称（项目特定需求）
- 或 use English with underscore（如果团队偏好英文）
- 示例: `执行时间`, `created_at`

**索引规范**:
```sql
-- 为常用查询字段创建索引
CREATE INDEX idx_column_name ON "TableName" ("column_name");

-- 为外键创建索引
CREATE INDEX idx_foreign_key ON "TableName" ("foreign_key_id");
```

---

## 5. 提交规范

### 5.1 Commit Message 格式

**使用 Conventional Commits 规范**:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型 (type)**:
- `feat`: 新功能
- `fix`: bug 修复
- `docs`: 文档更新
- `style`: 代码格式调整（不影响功能）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具链相关

**示例**:
```bash
# 新功能
git commit -m "feat(auth): add magic link login"

# bug 修复
git commit -m "fix(chart): resolve tooltip not showing

The chart tooltip was not displaying due to incorrect positioning.
Fixed by updating Chart.js configuration.

Closes #123"

# 文档更新
git commit -m "docs(readme): update installation instructions"
```

### 5.2 提交频率

**推荐实践**:
- 小步提交，频繁推送
- 每个提交只做一件事
- 提交前先拉取最新代码

**避免**:
```bash
# ❌ 不要在一个提交里做多件事
git commit -m "fix bug and add feature and update docs"

# ✅ 拆分成多个提交
git commit -m "fix(auth): resolve login redirect issue"
git commit -m "feat(dashboard): add date filter"
git commit -m "docs(readme): update API examples"
```

---

## 6. Pull Request 流程

### 6.0 🔒 RLS 安全强制检查（Critical）

**⚠️ 所有涉及数据库的变更必须通过此项检查！**

每次提交代码前，必须运行 RLS 安全验证脚本：

```bash
# 安装依赖（首次使用）
npm install

# 运行 RLS 安全验证
node scripts/validate-rls.js
```

**检查项目**:
- [ ] 无 RLS 无限递归（策略中查询自身表）
- [ ] 无数据泄露漏洞（profiles 表对 public 角色开放）
- [ ] 匿名用户无法访问敏感数据
- [ ] 未批准用户无法访问数据
- [ ] SECURITY DEFINER 函数正常

**如果验证失败**:
1. 检查 `.husky/pre-commit` 钩子输出的错误信息
2. 修复 RLS 策略定义
3. 重新运行验证直到通过
4. 如果紧急情况需要跳过检查（不推荐），使用 `git commit --no-verify`

**CI 自动检查**:
- GitHub Action (`.github/workflows/rls-security-check.yml`) 会在每次 PR 时自动运行
- 如果检查失败，PR 将被阻止合并
- 查看 CI 日志了解失败原因

**详细文档**: 参见 `docs/RLS_SECURITY_GUIDE.md`

### 6.1 创建 PR 前的检查清单

- [ ] 代码符合规范要求
- [ ] 已在本地测试通过
- [ ] 提交信息符合规范
- [ ] 相关文档已更新
- [ ] 没有合并冲突

### 6.2 PR 模板

```markdown
## 描述
简要描述本次改动的内容和目的。

## 变更类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 重构
- [ ] 文档更新
- [ ] 性能优化

## 测试计划
描述如何测试这些改动：
1. 步骤1
2. 步骤2
3. 预期结果

## 截图（如果适用）
添加前后对比截图。

## 相关问题
Closes #123
Relates to #456
```

### 6.3 Code Review 流程

**Reviewer 职责**:
1. 检查代码逻辑是否正确
2. 检查是否符合代码规范
3. 检查是否有潜在性能问题
4. 检查测试覆盖率
5. 提供建设性反馈

**Author 职责**:
1. 及时回应 review 意见
2. 对每条意见进行回复（已修改/有不同意见）
3. 修改后重新请求 review

**合并时机**:
- 所有 review 意见已解决
- CI 检查通过
- 至少 1 个 reviewer 批准

---

## 7. 测试规范

> **分工原则（2026-11-25 确立）**：AI 负责自动化测试（单元测试 / 集成测试 / 语法编译）与测试记录整理；用户负责线上手动测试并提供测试结果截图；需要在 GitHub Issue 评论中引用截图时，由 AI 负责上传并嵌入。详见「7.5 截图依据与上传」。

### 7.1 测试层级（项目实际体系）

本项目为静态前端 + Deno Edge Function，测试以 Node 原生 `.test.mjs` 为主，**不引入 Jest/Playwright**（无构建链、避免额外依赖）。

| 层级 | 实际工具 | 覆盖范围 | 位置示例 |
|------|----------|----------|----------|
| 单元测试 | `node *.test.mjs`（Node 内置断言风格） | 工具函数、解析逻辑、模式判断 | `approval_mode.test.mjs`、`body_parser.test.mjs`、`row_filter.test.mjs` |
| 集成测试 | `node *.test.mjs` + esbuild 编译 + mock `fetch`/`Deno` | Edge Function 端到端逻辑（不发真实网络请求） | `email_inbox_poc/integration.test.mjs`、`promote_approval/integration.test.mjs` |
| 静态检查 | `node --check`、esbuild 编译 | 语法正确性、可编译性 | 发布前必跑 |
| 线上端到端 | 人工实操 + 数据库交叉核实 | 真实邮件链路、审批转正/阻断、看板渲染 | GitHub Issue 验证报告（见 7.6） |

### 7.2 编写/运行测试用例

- 每个测试文件头部必须写清运行命令与关联 Issue 号，例如 `// Run: node approval_mode.test.mjs (issue #65)`。
- 用统一的 `check(cond, desc)` / `ok(cond, name)` 风格逐条断言，每条陈述**描述被测行为**（如「数值不守恒被拒绝」），而非「test case 1」。
- 结尾打印 `N/M passed` 并以 `process.exit(failed === 0 ? 0 : 1)` 退出，便于 CI/脚本判定。
- 新增功能必须同时补单测（纯逻辑）与集成测试场景（涉及 RPC / 分流）；改动现有函数必须补回归用例。
- 关键用例（安全闸、fail-safe、阻断）建议在描述前加 `[关键]` 标记，便于测试记录中重点呈现。

**示例**（沿用项目实际风格）：
```javascript
// approval_mode.test.mjs — Run: node approval_mode.test.mjs (issue #65)
let failed = 0, total = 0;
function check(cond, desc, extra) {
  total++;
  if (cond) console.log('PASS — ' + desc);
  else { console.error('FAIL — ' + desc + (extra !== undefined ? ' | got=' + JSON.stringify(extra) : '')); failed++; }
}
check(validateRows([badSum]).ok === false, '[关键] 数值不守恒被拒绝');
console.log('\n--- ' + (total - failed) + '/' + total + ' passed ---');
process.exit(failed === 0 ? 0 : 1);
```

### 7.3 测试记录文档（透明性核心）

每次发版或功能验证必须产出一份测试记录文档，作为「测了什么、依据在哪」的**可追溯单一来源**：

- **命名**：`docs/AutoPrint_vX.Y.Z_测试记录_v主.次_模型名.md`（如 `AutoPrint_v2.1.0_测试记录_v1.0_Hunyuan-Hy.md`）。
- **必备四板块**：
  1. **测试构成总览**——各套件项数与合计（如 22+37+10+38+语法+编译 = 107 项）；
  2. **关键用例依据表**——逐条列「用例 / 输入 / 预期 / 实际 / 结果 / 依据」；
  3. **自动化边界说明**——明确哪些能自动化、哪些必须人工；
  4. **人工测试清单**——见 7.4。
- **关键用例必须可复核**：
  - 逻辑测试（无界面）：记录输入 / 预期 / 实际三条即可，**不截图**（终端文本截图无复核价值，且易过时）；
  - UI / 端到端测试（有界面）：必须附截图依据，链接指向 GitHub 上传后的稳定 URL（见 7.5）。
- **数据类功能**：验收截图中的数字必须有数据库 SQL 复核（如「汇总 25 = 京 8 + 沪 17」）才算通过——沿用 v2.0.0 复盘教训。

### 7.4 人工测试标注（无法自动化测试的处理）

**凡无法自动化验证的项目，必须在测试记录中显式标注「需人工测试」，禁止留白或默认省略。**

常见需人工的场景：真实邮件投递与收件箱分类、审批邮件点击与二次确认、看板视觉渲染、跨浏览器兼容、跨天稳定性观察、告警邮件是否落入垃圾箱。

标注格式（写入测试记录「人工测试清单」表）：

| 测试项 | 操作步骤 | 期望结果 | 为何不能自动化 | 执行人 | 证据 |
|--------|----------|----------|----------------|--------|------|
| 告警邮件投递 | 发不规范邮件 → 查收件箱 | 收到阻断告警 | 依赖真实 Resend 投递 + Outlook 分类，mock 无法覆盖 | 用户 | 截图链接 |

- 标注后由用户按清单执行，结果回填 Issue 验证报告（7.6）。
- **回顾发现某用例需补充人工测试时**：在该用例依据表的「依据/备注」列追加 `⚠️ 需人工补测` 并说明原因，同时在对应 GitHub Issue 留评论，形成可追溯闭环——这正是「Issue 评论段落」做不到的细粒度追踪，故用 7.6 的结构化报告承载。

### 7.5 截图依据与上传

- **何时截图**：仅 UI / 端到端测试；逻辑测试用文本记录（7.3）。
- **上传流程**：用户把测试截图以剪贴板图片附上 → AI 上传到 GitHub 附件 → 返回稳定 URL → 嵌入测试记录与 Issue 评论。
- **上传命令**（仓库需 push 权限；`$REPO_ID` 用 `gh api repos/<owner>/<repo> --jq .id` 获取，本仓库为 `1284825802`）：
  ```bash
  gh api --method POST "https://uploads.github.com/user-attachments/assets?repository_id=$REPO_ID&name=<文件名>&content_type=image/png" --input "<截图绝对路径>" --jq .url
  ```
- 返回 `https://github.com/user-attachments/assets/...` 直接写进 Markdown `![说明](URL)` 即可渲染。
- **脱敏**：本仓库为 PUBLIC，截图含邮箱 / SharePoint 链接 / token 时需评估；敏感信息打码或改用文字描述。

### 7.6 GitHub 上的测试记录方式

**问题**：把测试结果零散写在 Issue 的某个评论段落，无法对单个用例做「需补测 / 转人工」的细粒度追踪。

**分层做法**：

| 目标 | 载体 | 做法 |
|------|------|------|
| 单一可追溯来源 | 仓库 `docs/` 测试记录文档 | 7.3 四板块，逐用例可标注、可版本化 |
| 团队回顾入口 | 功能 Issue 的**结构化验证报告评论** | 标题 + 分路径小节 + 证据表 + 截图；每条路径对应测试用例，可 `@` 负责人讨论 |
| 细粒度追踪 | 测试记录文档的依据表 + Issue 评论 | 单个用例的补测/转人工在「依据/备注」列标注 `⚠️ 需人工补测`，并在 Issue 留评论留痕 |
| 自动化结果可视化（✅ v1.2 已启用，issue #66） | 统一入口 + GitHub Actions + JUnit | `node scripts/run-all-tests.mjs` 一键跑全部套件并产出 `test-results/junit.xml` + `summary.json`；`.github/workflows/test-results.yml` 用 `dorny/test-reporter` 在 Checks/PR 逐用例显示。当前 **9 套件 / 311 项全绿**（此前 156 项口径只算了 access_links 3 套件，已纠正） |

### 7.7 手动测试检查清单（基线）

**功能测试**:
- [ ] 登录功能正常（密码 + 魔法链接）
- [ ] 数据加载正常
- [ ] 图表渲染正确
- [ ] 响应式布局正常

**兼容性测试**:
- [ ] Chrome (最新版)
- [ ] Edge (最新版)
- [ ] Firefox (最新版)
- [ ] Safari (最新版，如适用)

**性能测试**:
- [ ] 页面加载时间 < 2 秒
- [ ] 图表渲染时间 < 1 秒
- [ ] 无明显卡顿

### 7.8 统一测试入口（v1.2 / issue #66，已交付）

```bash
# 一键运行全部 9 个测试套件（约 1.3 秒），产出结构化结果
node scripts/run-all-tests.mjs

# 仅列出套件 / 仅跑某类套件 / dry-run 不写文件
node scripts/run-all-tests.mjs --list
node scripts/run-all-tests.mjs --filter access_links
node scripts/run-all-tests.mjs --no-write
```

- 产物：`test-results/junit.xml`（逐用例 JUnit，含名称/状态/耗时/失败详情）+ `test-results/summary.json`（机器可读汇总）。`test-results/` 已加入 `.gitignore`，CI 每次重新生成。
- 用例数口径：**9 套件 / 311 项**（access_links 156 + email_inbox_poc 107 + promote_approval 48）。历史文档中的 107/155/156 均为部分套件口径，以统一入口输出为准。
- CI：`.github/workflows/test-results.yml` 在 PR 与 develop/master 推送时运行，`checks: write` 最小权限，失败用例在 Checks 内联标注；Job Summary 显示套件/用例/通过/失败汇总。
- 兼容现存 4 种输出风格（`PASS label` / `PASS — desc` / `PASS name` / `N/N PASS`），新增套件沿用 `check()` 风格即可自动纳入。

### 7.9 改进路线（后续迭代）

- ~~统一测试入口脚本~~ ✅ 已完成（7.8）
- ~~JUnit XML + Actions 报告~~ ✅ 已完成（7.8）
- 关键用例（安全闸 / fail-safe）补 `test-case` Issue 模板，实现 Issue 级别的用例跟踪。

---

## 8. 发布流程

### 8.1 版本号规范

**使用语义化版本号**: `MAJOR.MINOR.PATCH`

- `MAJOR`: 不兼容的 API 修改
- `MINOR`: 向后兼容的功能性新增
- `PATCH`: 向后兼容的问题修正

**示例**:
- `v1.0.0`: 首次发布
- `v1.1.0`: 添加新功能
- `v1.1.1`: bug 修复

### 8.2 发布步骤

```bash
# 1. 更新版本号
# 编辑 package.json (如有)

# 2. 更新 CHANGELOG.md
# 添加本次发布的变更记录

# 3. 创建 release 分支
git checkout master
git pull origin master
git tag v1.1.0
git push origin v1.1.0

# 4. Netlify 自动部署
# 等待部署完成

# 5. 验证生产环境
# 访问 https://autoprintreport.netlify.app
# 检查核心功能是否正常

# 6. 编写发布说明
# 在 GitHub Releases 页面创建 release note
```

### 8.3 Hotfix 流程

**适用于生产环境紧急 bug**:

```bash
# 1. 从 master 创建 hotfix 分支
git checkout master
git pull origin master
git checkout -b hotfix/critical-bug

# 2. 修复 bug 并提交
git add .
git commit -m "fix: critical bug in auth flow"
git push origin hotfix/critical-bug

# 3. 创建 PR 合并到 master
# 4. 合并后立即部署
# 5. 同时合并到 develop 分支
```

---

## 9. 团队沟通规范

### 9.1 沟通渠道

| 事项 | 渠道 |
|------|------|
| 日常讨论 | Microsoft Teams |
| 代码审查 | GitHub PR 评论 |
| 紧急问题 | 电话/ Teams 呼叫 |
| 文档协作 | 腾讯文档 / GitHub Wiki |

### 9.2 会议规范

**每日站会** (15 分钟):
- 昨天做了什么
- 今天计划做什么
- 遇到什么阻碍

**每周复盘** (1 小时):
- 回顾本周工作
- 讨论技术问题
- 规划下周任务

**Sprint 规划** (1-2 小时):
- 确定 Sprint 目标
- 拆解任务
- 评估工作量

---

## 10. 附录

### 10.1 有用链接

- **项目仓库**: https://github.com/echeung1328/autoprint-dashboard
- **看板地址**: https://autoprintreport.netlify.app
- **Supabase 后台**: https://supabase.com/dashboard/project/uvqjtvonxwsmhntnyest
- **Conventional Commits**: https://www.conventionalcommits.org/
- **JavaScript 规范**: https://github.com/airbnb/javascript

### 10.2 常见问题

**Q: 如何解决合并冲突？**

A: 参考以下步骤：
```bash
# 1. 拉取最新代码
git pull origin develop

# 2. 手动解决冲突（编辑冲突文件）

# 3. 标记冲突已解决
git add .
git commit -m "chore: resolve merge conflict"
git push origin feature/your-feature
```

**Q: 如何修改已提交的 commit？**

A: 如果是最后一个 commit：
```bash
git commit --amend  # 修改提交信息
git push --force-with-lease  # 强制推送（谨慎使用）
```

**Q: 如何撤销已推送的 commit？**

A: 创建新的 revert commit（不要强制推送）：
```bash
git revert <commit-hash>
git push origin feature/your-feature
```

---

**文档结束**

*本文档为 AutoPrint 系统贡献指南，如有疑问请联系开发团队。*
