# AutoPrint 敏捷项目管理框架

> 基于 Scrum 框架的专业 PM 方法论，适用于 2-5 人小型 Web 开发团队

本目录包含完整的敏捷项目管理框架，可独立使用，也可与 autoprint-dashboard 代码仓库配合使用。

## 目录结构

```
docs/agile-pm/
├── README.md                 # 本文件
├── docs/
│   ├── scrum-guide.md    # Scrum 框架完整指南
│   ├── ceremonies.md      # 四大仪式操作指南
│   ├── artifacts.md       # 三大工件管理规范
│   ├── team-norms.md    # 团队规范（Teams + GitHub）
│   └── metrics.md        # 进度跟踪和质量指标
└── templates/
    ├── user-story.md          # 用户故事模板
    ├── definition-of-done.md    # DoD 完成定义
    └── definition-of-ready.md  # DoR 就绪定义
```

## 快速开始

### 1. 创建 GitHub Project 看板
在 https://github.com/echeung1328/autoprint-dashboard/projects 创建看板，列设置：
- **Backlog** - 待 Refine 的产品待办事项
- **Sprint Ready** - 符合 DoR、可进入 Sprint
- **In Progress** - 开发中（WIP ≤ 2/人）
- **In Review** - PR 已提交，等待 Code Review
- **Done** - 符合 DoD，Sprint 完成

### 2. 撰写用户故事
使用 `templates/user-story.md` 模板，遵循 INVEST 原则。

### 3. Sprint 节奏（建议 2 周）
| 活动 | 频率 | 时长 |
|------|------|------|
| Sprint Planning | 每 Sprint 开始 | 2-4h |
| Daily Standup | 每日 | 15min |
| Sprint Review | 每 Sprint 结束 | 1-2h |
| Retrospective | Review 后 | 1-1.5h |

## 工具链

| 用途 | 工具 |
|------|------|
| 代码托管 | GitHub (echeung1328/autoprint-dashboard) |
| 任务看板 | GitHub Projects |
| 团队沟通 | Microsoft Teams |
| 数据库 | Supabase |
| 前端部署 | Netlify |
