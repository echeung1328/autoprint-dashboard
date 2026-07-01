# AutoPrint 敏捷项目管理培训手册

> 本文档总结 AutoPrint 项目从零建立敏捷 PM 体系的完整过程，可用于培训团队成员按相同流程在新项目中实施。

---

## 目录

1. [项目背景](#1-项目背景)
2. [前置准备（手动完成）](#2-前置准备手动完成)
3. [Agent 协助实施步骤](#3-agent-协助实施步骤)
4. [全程提示词汇总](#4-全程提示词汇总)
5. [手动操作清单](#5-手动操作清单)
6. [常见问题与排错](#6-常见问题与排错)
7. [可复用提示词模板](#7-可复用提示词模板)

---

## 1. 项目背景

| 项目 | 说明 |
|------|------|
| 项目名称 | AutoPrint 自动打印任务执行报告系统 |
| 技术栈 | Supabase + HTML/JS + Chart.js + Netlify |
| 团队规模 | 2-5人小型团队 |
| 管理目标 | 从 Excel 管理升级为专业敏捷 Scrum 流程 |

**实施成果**：
- ✅ 完整 Scrum PM 框架文档（12个文件）
- ✅ GitHub Project #1 看板（Sprint Status + Sprint 迭代字段）
- ✅ 13 个用户故事 Issue，分配到 3 个 Sprint
- ✅ Roadmap 时间线视图可用

---

## 2. 前置准备（手动完成）

> ⚠️ 以下事项 **必须手动完成**，Agent（AI助手）无法代替操作。

### 2.1 GitHub 授权

**用途**：让 Agent 有写入 GitHub 的权限（创建 Issue、操作 Project 看板）。

**步骤**：
1. 打开终端，执行：
   ```bash
   gh auth login
   ```
2. 选择 `GitHub.com` → `HTTPS` → `Login with a web browser`
3. 复制终端显示的验证码，在浏览器中粘贴授权
4. 授权范围勾选：`repo`、`project`、`read:org`
5. 验证：
   ```bash
   gh auth status
   ```
   应显示 `Logged in to github.com as echeung1328`

**⚠️ 注意**：`gh auth login` 是 **交互式命令**，Agent 无法执行（需要浏览器授权），必须手动完成。

---

### 2.2 确认 GitHub 仓库已存在

Agent 可以创建仓库，但需要先确认目标仓库名。本项目中：
- 主仓库：`echeung1328/autoprint-dashboard`（已存在）
- PM 框架先建了独立仓库，后合并到主仓库

---

### 2.3 GitHub Project 看板：部分 UI 操作需手动

以下操作 **GraphQL API 不支持**，需手动在 GitHub UI 完成：

| 操作 | 是否可 API 操作 | 说明 |
|------|----------------|------|
| 创建 Project | ✅ 可以 | Agent 可通过 `gh api` 创建 |
| 添加自定义字段 | ✅ 可以 | `createProjectV2Field` mutation |
| 配置迭代周期 | ✅ 可以 | `updateProjectV2Field(iterationConfiguration)` |
| Roadmap 视图选择 Date fields | ❌ **不可** | 必须手动在 UI 点击设置 |
| 隐藏默认 Status 字段 | ❌ **不可** | 必须手动在 UI 操作 |

---

## 3. Agent 协助实施步骤

以下是实际执行顺序，**每一步都附提示词示例**。

---

### 步骤 1：创建 Scrum PM 框架文档

**目的**：建立完整的敏捷开发文档体系，让团队有章可循。

**提示词示例**：
```
我们的项目管理需要升级，需要更专业的PM方法论和团队管理，
请帮我建立一套完整的 Scrum 敏捷项目管理框架，
包括：Scrum 指南、四大仪式操作指南、工件管理、团队规范、度量指标。
参考 Scrum 官方指南，结合 2-5 人小型团队特征。
```

**Agent 会做什么**：
- 生成 12 个文档/模板文件
- 保存到本地 `docs/agile-pm/` 目录
- 推送到 GitHub 仓库

**产出文件**：
```
docs/agile-pm/
├── README.md                        # PM 框架入口说明
├── docs/
│   ├── scrum-guide.md             # Scrum 三大支柱、角色、工件
│   ├── ceremonies.md               # Sprint Planning/Review/Retro 指南
│   ├── artifacts.md                # Product Backlog/Sprint Backlog 管理
│   ├── team-norms.md              # GitHub + Teams 团队规范
│   └── metrics.md                 # Velocity/Burndown 指标说明
├── templates/
│   ├── user-story.md              # 用户故事模板
│   ├── definition-of-done.md      # DoD 完成定义
│   └── definition-of-ready.md     # DoR 就绪定义
└── sprints/
    └── sprint-2026-07-01.md     # Sprint Planning 模板
```

---

### 步骤 2：合并 PM 框架到主仓库

**目的**：PM 文档和代码放在同一个仓库，方便管理。

**提示词示例**：
```
把 autoprint-agile-pm 仓库中的 PM 框架文件迁移到
autoprint-dashboard 仓库的 docs/agile-pm/ 目录，
保持目录结构不变。
```

**Agent 会做什么**：
- 读取源仓库文件内容
- 通过 GitHub API（`gh api repos/.../contents/... -X PUT` + base64）写入目标仓库
- 注意：Agent 无法用 `git push`（沙箱环境凭证问题），必须用 API 上传

---

### 步骤 3：创建 GitHub Project 看板

**目的**：用 GitHub Project V2 管理 Sprint 和 Issue 状态。

**提示词示例**：
```
创建 GitHub Project V2 看板，要求：
1. 项目名：AutoPrint Sprint Board
2. 添加自定义字段 "Sprint Status"（Single Select）：
   - 选项：Backlog / Sprint Ready / In Progress / In Review / Done
3. 确认创建成功后返回 Project ID 和字段 ID
```

**Agent 会做什么**：
- 调用 `gh api graphql` 执行 `createProjectV2` mutation
- 创建 `Sprint Status` 自定义字段
- 返回 Project ID（`PVT_kwHOAYl5dM4BcEMT`）和字段 ID

**⚠️ 可能遇到的问题**：
- 如果 `gh` 未授权，Agent 会提示手动授权（见 2.1）
- 如果 GraphQL mutation 名写错，返回 `undefinedField` 错误（见第 6 节排错）

---

### 步骤 4：创建用户故事 Issue

**目的**：把产品功能拆成可跟踪的 Issue。

**提示词示例**：
```
基于 AutoPrint 现有功能（查看 index.html 了解已实现内容），
拆解用户故事，要求：
1. 每个 Issue 按模板格式（User Story / Enhancement）
2. 包含 Acceptance Criteria
3. 估算 Story Points（Fibonacci）
4. 创建后自动添加到 GitHub Project 看板
```

**Agent 会做什么**：
- 读取 `index.html` 评估现有功能完成度
- 生成 Issue 标题和描述
- 调用 `gh issue create` 创建 Issue
- 调用 `gh project item-add` 将 Issue 加入 Project

**本项目中创建的 Issue**：

| # | 类型 | 标题 | Story Points |
|---|------|------|-------------|
| #2 | User Story | 用户登录和认证 | 5 |
| #3 | User Story | 查看打印报告列表 | 3 |
| #4 | User Story | 管理员审批用户注册 | 5 |
| #5 | User Story | Magic Link 免密码登录 | 3 |
| #6 | User Story | 用户注册及审批流程 | 5 |
| #7 | User Story | KPI 指标卡片 | 3 |
| #8 | User Story | 每日打印量趋势图表 | 5 |
| #9 | User Story | 每日成功率趋势图表 | 5 |
| #10 | User Story | 平均执行耗时图表 | 3 |
| #11 | User Story | 失败记录明细表 | 5 |
| #12 | User Story | 退出登录功能 | 1 |
| #13 | Enhancement | 日期范围筛选器 | 3 |
| #14 | Enhancement | 数据导出为 CSV | 3 |

---

### 步骤 5：配置 Sprint 迭代字段（Roadmap 关键步骤）

**目的**：让 Roadmap 视图显示时间线，必须配置迭代字段。

**提示词示例**：
```
在 GitHub Project 中添加 "Sprint" 迭代字段，
配置 3 个 Sprint 周期：
- Sprint 1: 2026-07-01 ~ 2026-07-14
- Sprint 2: 2026-07-15 ~ 2026-07-28
- Sprint 3: 2026-07-29 ~ 2026-08-11
```

**Agent 会做什么**：
1. 调用 `createProjectV2Field(dataType: ITERATION)` 创建迭代字段
2. 调用 `updateProjectV2Field(iterationConfiguration: ...)` 配置周期
3. 返回字段 ID（`PVTIF_lAHOAYl5dM4BcEMTzhWzu1A`）

**⚠️ 关键 GraphQL 写法**（Agent 容易写错）：
```graphql
# ✅ 正确：用 updateProjectV2Field + iterationConfiguration
mutation {
  updateProjectV2Field(input: {
    fieldId: "PVTIF_xxx"
    iterationConfiguration: {
      startDate: "2026-07-01"
      duration: 14
      iterations: [
        { title: "Sprint 1", startDate: "2026-07-01", duration: 14 }
      ]
    }
  }) {
    projectV2Field { ... on ProjectV2IterationField { id name } }
  }
}
```

---

### 步骤 6：分配 Issue 到 Sprint

**目的**：把用户故事分配到对应 Sprint，Roadmap 上显示时间线。

**提示词示例**：
```
把 Issue 分配到 Sprint：
- Sprint 1（审批+筛选）：#3, #4, #13
- Sprint 2（图表+导出）：#7, #8, #9, #10, #11, #14
- Sprint 3（登录+认证）：#2, #5, #6, #12

使用 `gh project item-edit --iteration-id` 命令。
```

**Agent 会做什么**：
- 先通过 GraphQL 获取每个 Issue 的 Project Item ID
- 执行 `gh project item-edit --field-id <迭代字段ID> --iteration-id <Sprint ID>`
- 注意：Windows 上此命令无输出，需用 GraphQL 验证结果

**验证分配结果**（让 Agent 执行）：
```
验证所有 Issue 是否已正确分配到 Sprint，
读取 Project 看板，输出每个 Issue 的 Sprint 和 Status。
```

---

### 步骤 7：Sprint Planning

**目的**：选取本 Sprint 要开发的用户故事，制定计划。

**提示词示例**：
```
做 Sprint Planning，选取第一批要开发的用户故事。
要求：
1. 评估团队速率（参考 Story Points）
2. 选取 Sprint Goal
3. 将选中的 Issue 状态更新为 "Sprint Ready"
4. 生成 Sprint Planning 文档，保存到 docs/agile-pm/sprints/
```

**Agent 会做什么**：
- 分析 Issue 优先级和依赖关系
- 选取本 Sprint 的 Issue（本项目中选了 #4 和 #13）
- 更新 Project 看板状态
- 创建 `sprint-2026-07-01.md` 文档并提交到仓库

---

### 步骤 8：配置 Roadmap 视图（手动 + Agent 协助）

**目的**：在 Project 看板中看到时间线。

**步骤**：
1. Agent 已完成：创建 Sprint 迭代字段 + 分配所有 Issue 到 Sprint
2. **手动操作**（Agent 无法代替）：
   - 打开 `https://github.com/users/echeung1328/projects/1/views/3`
   - 点击右上角 **Settings（齿轮图标）**
   - 找到 **Date fields** 设置
   - Start date → 选择 `Sprint start`
   - Target date → 选择 `Sprint end`
   - 点击 **Save**
3. 验证：Roadmap 视图现在应显示 3 个 Sprint 时间线和 Issue 条

**提示词**（让 Agent 验证）：
```
检查 Roadmap 视图配置，确认 Sprint 迭代字段已创建、
所有 Issue 已分配 Sprint、Sprint Status 字段正常。
```

---

## 4. 全程提示词汇总

> 按使用顺序排列，可直接复制使用。

---

### 提示词 1：建立 PM 框架

```
我们的项目管理需要升级，需要更专业的PM方法论和团队管理，
请高级项目经理帮我们提升项目管理水平。
目前此PoC软件开发没有按敏捷开发管理。
请帮我建立一套完整的 Scrum 敏捷项目管理框架。
```

**用途**：触发 Agent（SeniorProjectManager 专家）生成 PM 文档
**预期产出**：12 个 Scrum 框架文档文件

---

### 提示词 2：合并仓库

```
把 autoprint-agile-pm 迁移到 autoprint-dashboard，
PM 框架放到 docs/agile-pm/ 目录。
```

**用途**：将独立 PM 仓库合并到主仓库
**注意**：需确认两个仓库名和默认分支名（`main` 或 `master`）

---

### 提示词 3：创建 GitHub Project 看板

```
创建 GitHub Project V2 看板，要求：
1. 项目名：AutoPrint Sprint Board
2. 添加自定义字段 "Sprint Status"（Single Select）
3. 选项：Backlog / Sprint Ready / In Progress / In Review / Done
```

**用途**：建立 Sprint 管理看板
**前置条件**：`gh auth login` 已完成

---

### 提示词 4：拆解用户故事

```
把现有功能拆成更多用户故事，
先读取 index.html 了解已实现功能，
再按 INVEST 原则创建 Issue，包含 Acceptance Criteria 和 Story Points。
```

**用途**：生成 Issue 并推送到 GitHub
**Agent 行为**：`gh issue create` + `gh project item-add`

---

### 提示词 5：配置 Sprint 迭代字段

```
在 GitHub Project 中添加 Sprint 迭代字段，
配置 3 个 Sprint：
- S1: 2026-07-01 ~ 2026-07-14
- S2: 2026-07-15 ~ 2026-07-28
- S3: 2026-07-29 ~ 2026-08-11
```

**用途**：让 Roadmap 视图有时间线
**关键**：必须用 `updateProjectV2Field(iterationConfiguration)` mutation

---

### 提示词 6：分配 Issue 到 Sprint

```
把 Issue 分配到 Sprint：
- Sprint 1：#3, #4, #13
- Sprint 2：#7, #8, #9, #10, #11, #14
- Sprint 3：#2, #5, #6, #12
```

**用途**：将用户故事分配到对应迭代
**验证**：让 Agent 用 GraphQL 读取 fieldValues 确认

---

### 提示词 7：Sprint Planning

```
做 Sprint Planning，选取第一批要开发的用户故事，
生成 Sprint Planning 文档，并把选中的 Issue 状态更新为 Sprint Ready。
```

**用途**：正式开始一个 Sprint
**产出**：Sprint Planning 文档 + 看板状态更新

---

### 提示词 8：检查 Roadmap 配置

```
先帮我看一下 Project Roadmap 没有时间线，提示需要 date or iteration field
```

**用途**：触发 Agent 诊断 Roadmap 问题并修复
**本项目实际修复**：创建 Sprint 迭代字段 + 配置周期

---

## 5. 手动操作清单

> ⚠️ 以下操作 **必须人工完成**，Agent 无法代替。

---

### 5.1 首次设置（每个新项目一次）

| 序号 | 操作 | 说明 |
|------|------|------|
| 1 | `gh auth login` | GitHub 授权，交互式，必须手动 |
| 2 | 确认仓库已创建 | Agent 可创建，但需确认名称正确 |
| 3 | Roadmap 视图 Date fields 设置 | GitHub UI 操作，API 不支持 |

---

### 5.2 每个 Sprint 开始

| 序号 | 操作 | 说明 |
|------|------|------|
| 1 | Sprint Planning 会议 | 人工讨论，Agent 可生成文档 |
| 2 | 把 Issue 拖到 `In Progress` | 可在 GitHub UI 手动拖，或让 Agent 用 CLI 更新 |

---

### 5.3 每个 Sprint 结束

| 序号 | 操作 | 说明 |
|------|------|------|
| 1 | Sprint Review 会议 | 人工演示，Agent 不参与 |
| 2 | Sprint Retrospective 会议 | 人工讨论，Agent 可生成回顾文档模板 |
| 3 | 更新 Velocity 记录 | 人工记录，Agent 可帮忙计算 |

---

## 6. 常见问题与排错

---

### 问题 1：`gh api graphql` 返回 `undefinedField` 错误

**原因**：GraphQL mutation/query 的字段名写错，或类型不匹配。

**解决方法**：
- 用 `__schema` 内省查询确认正确的 mutation 名：
  ```graphql
  {
    __schema {
      mutationType {
        fields(includeDeprecated: true) {
          name
        }
      }
    }
  }
  ```
- 用 `__type` 查看 Input 类型支持的字段：
  ```graphql
  {
    __type(name: "UpdateProjectV2FieldInput") {
      inputFields { name }
    }
  }
  ```

**本项目踩过的坑**：
- ❌ `createProjectV2Iteration` → ✅ 用 `updateProjectV2Field(iterationConfiguration)`
- ❌ `iterationConfig` → ✅ `iterationConfiguration`
- ❌ `projectId` in `UpdateProjectV2FieldInput` → ✅ 此 Input 不接受 `projectId`

---

### 问题 2：`gh project item-edit` 在 Windows 上无输出

**原因**：`gh` CLI 在 Windows 上某些操作静默执行，不返回结果。

**解决方法**：用 GraphQL API 验证结果：
```graphql
{
  user(login: "echeung1328") {
    projectV2(number: 1) {
      items(first: 20) {
        nodes {
          content { ... on Issue { number title } }
          fieldValues(first: 10) {
            nodes {
              ... on ProjectV2ItemFieldIterationValue { title }
            }
          }
        }
      }
    }
  }
}
```

---

### 问题 3：Roadmap 视图提示 "needs at least one date or iteration field"

**原因**：Roadmap 视图需要日期或迭代字段才能显示时间线，但字段已创建却仍报错。

**解决方法**：
1. 确认 Sprint 迭代字段已创建（用 GraphQL 查询 `fields`）
2. 确认 Issue 已分配到 Sprint（`fieldValues` 中有迭代值）
3. **手动**在 Roadmap 视图设置 Date fields（见 2.3 节）

---

### 问题 4：`gh issue create` 中文内容乱码（Windows）

**原因**：Windows 终端编码（GBK）与 GitHub API 期望的 UTF-8 不匹配。

**解决方法**：不要用 stdin 传递内容，改用命令行参数：
```bash
gh issue create \
  --title "标题" \
  --body "描述内容" \
  --repo echeung1328/autoprint-dashboard
```

---

### 问题 5：Agent 说"已完成的操作"但实际未生效

**原因**：某些 GitHub API 操作是异步的，或 Agent 混淆了"计划执行"和"已执行"。

**解决方法**：
- 让 Agent 用 GraphQL 读取最新状态验证
- 直接到 GitHub UI 查看结果
- 如果确实未生效，让 Agent 重新执行并输出完整命令和返回结果

---

## 7. 可复用提示词模板

> 复制以下模板，修改项目名称和功能描述，即可在新项目中复用。

---

### 模板 A：新项目从零建立敏捷 PM 体系

```
请帮我为 [项目名称] 建立完整的敏捷项目管理体系。

项目背景：
- 项目类型：[Web应用 / 移动应用 / API服务]
- 技术栈：[技术栈描述]
- 团队规模：[2-5人 / 5-10人]
- 当前管理方式：[Excel / 无 / 其他工具]

请完成以下步骤：
1. 创建 Scrum PM 框架文档（参考 AutoPrint 项目 docs/agile-pm/ 目录结构）
2. 创建 GitHub Project V2 看板，添加 Sprint Status 自定义字段
3. 基于产品需求拆解用户故事 Issue（按 INVEST 原则）
4. 创建 Sprint 迭代字段，配置第一个 Sprint 周期
5. 制定第一个 Sprint Planning 文档

注意：
- `gh auth login` 我已手动完成
- 仓库名是 [github.com/你的用户名/仓库名]
- 文档保存到仓库的 docs/agile-pm/ 目录
```

---

### 模板 B：已有 Project 看板，补充 Roadmap 配置

```
我的 GitHub Project 看板 Roadmap 视图没有时间线，
提示需要 "at least one date or iteration field"。

请帮我：
1. 检查当前 Project 字段配置（用 GraphQL API）
2. 如果缺少迭代字段，创建 Sprint 迭代字段并配置周期
3. 把所有 Issue 分配到对应 Sprint
4. 告诉我需要手动在 UI 完成哪一步（Date fields 设置）

Project 信息：
- 所有者：[你的 GitHub 用户名]
- Project 编号：[编号]
```

---

### 模板 C：Sprint 中期，更新 Issue 状态

```
请帮我更新 GitHub Project 看板中的 Issue 状态：

已完成：
- Issue #[编号] → 状态改为 "Done"

进行中：
- Issue #[编号] → 状态改为 "In Progress"

新发现 Bug（创建新 Issue）：
- 标题：[Bug 描述]
- 关联到 Issue #[编号]
```

---

### 模板 D：Sprint 结束，生成 Sprint Review 文档

```
Sprint [X] 已结束，请帮我生成 Sprint Review 文档。

已完成 Issue：#[编号列表]
未完成 Issue：#[编号列表]（原因：[说明]）

请生成：
1. Sprint Review 文档（保存到 docs/agile-pm/sprints/）
2. Velocity 计算（已完成 Story Points / 计划 Story Points）
3. 建议下一个 Sprint 的 Goal
```

---

## 8. 附录：完整文件清单

### 8.1 PM 框架文档（Agent 生成）

```
docs/agile-pm/
├── README.md                        # 框架说明
├── docs/
│   ├── scrum-guide.md             # Scrum 理论
│   ├── ceremonies.md               # 四大仪式指南
│   ├── artifacts.md                # 工件管理
│   ├── team-norms.md              # 团队规范
│   └── metrics.md                 # 度量指标
├── templates/
│   ├── user-story.md              # 用户故事模板
│   ├── definition-of-done.md      # DoD
│   └── definition-of-ready.md     # DoR
├── sprints/
│   └── sprint-2026-07-01.md     # Sprint Planning
└── .github/
    ├── ISSUE_TEMPLATE/
    │   ├── user-story.md          # Issue 模板
    │   └── bug-report.md
    └── PULL_REQUEST_TEMPLATE.md
```

### 8.2 GitHub Project 配置（Agent 创建）

| 配置项 | ID | 说明 |
|--------|----|------|
| Project | `PVT_kwHOAYl5dM4BcEMT` | AutoPrint Sprint Board |
| Sprint Status 字段 | `PVTSSF_lAHOAYl5dM4BcEMTzhWvuVA` | Backlog/Ready/In Progress/Review/Done |
| Sprint 迭代字段 | `PVTIF_lAHOAYl5dM4BcEMTzhWzu1A` | 3 个 Sprint 周期 |

---

## 9. 培训自测题

1. **`gh auth login` 为什么必须手动执行？**
   > 答案：因为它是交互式命令，需要浏览器授权，Agent 沙箱环境无法完成浏览器交互。

2. **Roadmap 视图的 Date fields 为什么必须手动设置？**
   > 答案：GitHub GraphQL API 不提供设置视图配置的 mutation，只能 UI 操作。

3. **创建迭代字段后，为什么 Roadmap 仍报错？**
   > 答案：还需用 `updateProjectV2Field(iterationConfiguration)` 配置具体周期，且 Issue 需分配到 Sprint，最后手动设置 Date fields。

4. **`gh project item-edit` 在 Windows 上如何验证结果？**
   > 答案：用 `gh api graphql` 查询 Project item 的 `fieldValues` 节点。

---

*文档版本*：v1.0
*创建日期*：2026-07-01
*适用项目*：AutoPrint 及后续同类 Web 开发项目
*作者*：SeniorProjectManager Agent
