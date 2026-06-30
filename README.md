# AutoPrint Dashboard

> 自动打印任务执行报告系统 - WorkBuddy 工具链集成 PoC

[![Netlify Status](https://api.netlify.com/api/v1/badges/autoprintreport.netlify.app/deploy-status)](https://autoprintreport.netlify.app)

## 项目简介

AutoPrint 是一个自动打印任务执行报告系统，前端基于 HTML + Chart.js + Supabase JS Client v2，后端使用 Supabase（PostgreSQL + Auth + RLS）。

## 线上预览

- **Netlify**：https://autoprintreport.netlify.app

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | HTML + Chart.js + Supabase JS Client v2 |
| 后端 | Supabase（PostgreSQL + Auth + RLS）|
| 部署 | Netlify |
| 代码托管 | GitHub |

## 敏捷项目管理

本项目使用 Scrum 敏捷框架管理开发，完整 PM 方法论文档位于：

- **框架文档**：[`docs/agile-pm/`](./docs/agile-pm/)
  - Scrum 指南、仪式操作、工件管理、团队规范、指标跟踪
- **模板**：[`docs/agile-pm/templates/`](./docs/agile-pm/templates/)
  - 用户故事、DoD、DoR 模板
- **GitHub 模板**：[`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/)
  - 创建 Issue 时自动加载对应模板

### Sprint 节奏（2 周）

| 活动 | 频率 | 时长 |
|------|------|------|
| Sprint Planning | 每 Sprint 开始 | 2-4h |
| Daily Standup | 每日 | 15min |
| Sprint Review | 每 Sprint 结束 | 1-2h |
| Retrospective | Review 后 | 1-1.5h |

## 快速开始

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/echeung1328/autoprint-dashboard.git
cd autoprint-dashboard

# 用 Live Server 或任何静态文件服务器预览
# index.html 已内置 Supabase 连接配置
```

### Supabase 配置

- **项目 ID**：`uvqjtvonxwsmhntnyest`
- **区域**：`ap-southeast-2`
- **PG 版本**：17.6

## 用户与权限

| 邮箱 | 角色 | 审批状态 |
|------|------|----------|
| echeung1328@hotmail.com | admin | ✅ approved |
| schan1328@139.com | viewer | ⏳ pending |

## 相关链接

- **仓库**：https://github.com/echeung1328/autoprint-dashboard
- **线上预览**：https://autoprintreport.netlify.app
- **Supabase 控制台**：https://app.supabase.com/project/uvqjtvonxwsmhntnyest
