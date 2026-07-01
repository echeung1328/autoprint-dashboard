# AutoPrint 系统 - 贡献指南 v1.0

**文档版本**: V1.0  
**创建日期**: 2026-06-30  
**作者**: 高级开发工程师  
**审核**: 待审核  

---

## 修订历史

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|----------|------|
| V1.0 | 2026-06-30 | 初始版本 | 高级开发工程师 |

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

### 7.1 测试层级

| 层级 | 工具 | 覆盖范围 |
|------|------|----------|
| 单元测试 | Jest | 工具函数、数据处理逻辑 |
| 集成测试 | Jest + Supabase | API 调用、数据库操作 |
| E2E 测试 | Playwright | 用户流程（登录、查看看板） |

### 7.2 编写测试用例

**示例: 测试数据处理函数**
```javascript
// utils.test.js
import { processData } from './utils.js';

describe('processData', () => {
  it('should group records by date', () => {
    const records = [
      { '执行时间': '2026-06-30T09:00:00', '总数': 100 },
      { '执行时间': '2026-06-30T10:00:00', '总数': 50 },
      { '执行时间': '2026-06-29T09:00:00', '总数': 80 }
    ];

    const result = processData(records);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['2026-06-30'].total).toBe(150);
    expect(result['2026-06-29'].total).toBe(80);
  });

  it('should handle empty input', () => {
    const result = processData([]);
    expect(result).toEqual({});
  });
});
```

### 7.3 手动测试检查清单

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
