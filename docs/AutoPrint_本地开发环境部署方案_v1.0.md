# AutoPrint 本地开发环境部署方案

## 版本信息
- **文档版本**: v1.0
- **创建日期**: 2026-07-02
- **适用环境**: Windows 11
- **项目**: AutoPrint 自动打印任务执行报告系统

---

## 1. 环境概述

### 1.1 项目特点

| 项目属性 | 说明 |
|---------|------|
| 项目类型 | 纯静态站点（HTML + CSS + JavaScript）|
| 后端服务 | Supabase 云端（无需本地数据库）|
| 外部依赖 | Chart.js + Supabase JS（CDN 加载）|
| 开发需求 | 本地 Web 服务器 + 热重载功能 |

### 1.2 推荐方案

**VS Code + Live Server 扩展**（最适合本项目的开发模式）

| 对比方案 | 安装复杂度 | 热重载 | 推荐度 |
|---------|-----------|--------|--------|
| **VS Code Live Server** | ⭐ 简单 | ✅ 自动 | 🔴 **最推荐** |
| Node.js http-server | ⭐⭐ | ❌ 需手动 | 🟡 备选 |
| Python http.server | ⭐ 最简单 | ❌ 需手动 | 🟢 应急 |

---

## 2. 完整部署步骤

### 2.1 第一步：安装 VS Code

1. 访问官网：https://code.visualstudio.com/
2. 下载 Windows 版本（User Installer）
3. 运行安装程序，**务必勾选**：
   - ✅ `Add to PATH`（添加到系统路径）
   - ✅ `Open with Code`（右键菜单集成）
4. 安装完成后，**重启电脑**（确保 PATH 生效）

### 2.2 第二步：安装 Live Server 扩展

1. 打开 VS Code
2. 点击左侧 **扩展图标**（或按 `Ctrl + Shift + X`）
3. 搜索 **`Live Server`**（作者：Ritwick Dey）
4. 点击 **Install**（安装）
5. 安装完成后，底部状态栏会出现 **`Go Live`** 按钮

### 2.3 第三步：打开项目文件夹

1. 在 VS Code 中，点击 **File** → **Open Folder**
2. 选择项目路径：`D:\WBStorage\Projects\AutoPrint`
3. 点击 **Select Folder**

### 2.4 第四步：启动本地服务器

有两种启动方式：

#### 方式 A：右键启动（推荐）

1. 在 VS Code 的**资源管理器**中，找到 `index.html`
2. **右键点击** `index.html`
3. 选择 **`Open with Live Server`**
4. 浏览器自动打开：`http://127.0.0.1:5500`

#### 方式 B：状态栏按钮

1. 点击 VS Code **底部状态栏**的 **`Go Live`** 按钮
2. 服务器启动，默认端口 **5500**
3. 浏览器访问：`http://localhost:5500`

---

## 3. 开发工作流

### 3.1 日常开发流程

```
┌─────────────────────────────────────────────────────┐
│  1. 启动 Live Server（Go Live）                    │
│     → 浏览器自动打开 http://localhost:5500        │
│                                                      │
│  2. 在 VS Code 中编辑 index.html                 │
│     → 保存文件（Ctrl + S）                       │
│                                                      │
│  3. Live Server 自动检测变化                       │
│     → 浏览器自动刷新（热重载）                     │
│                                                      │
│  4. 在浏览器中验证功能                            │
│     → 登录 / 查看 KPI / 测试图表                │
│                                                      │
│  5. 重复步骤 2-4，直到功能完成                   │
└─────────────────────────────────────────────────────┘
```

### 3.2 热重载说明

| 操作 | Live Server 反应 |
|------|-----------------|
| 保存 `.html` 文件 | 浏览器 **立即自动刷新** |
| 保存 `.css` 文件 | 浏览器 **立即自动刷新** |
| 保存 `.js` 文件 | 浏览器 **立即自动刷新** |
| 修改 `supabase` 数据 | 需 **手动刷新**（数据变化）|

### 3.3 常见问题排查

#### 问题 1：端口 5500 被占用

**错误信息**：`Port 5500 is already in use`

**解决方案**：

1. 打开 VS Code 设置（`Ctrl + ,`）
2. 搜索 `Live Server: Port`
3. 修改为其他端口（如 `5501`、`8080`）
4. 重新启动 Live Server

#### 问题 2：浏览器显示"无法访问此网站"

**排查步骤**：

1. 检查 Live Server 是否已启动（底部状态栏显示 `Port: 5500`）
2. 检查防火墙是否阻止（临时关闭防火墙测试）
3. 尝试用 `127.0.0.1` 替代 `localhost`：
   ```
   http://127.0.0.1:5500
   ```

#### 问题 3：Supabase 连接失败

**错误信息**：`Failed to fetch` 或 `CORS error`

**解决方案**：

1. 检查 `index.html` 中的 Supabase URL 和 anon key 是否正确
2. 登录 Supabase 控制台，检查 **Authentication** → **URL Configuration**
3. 确保 **Site URL** 包含 `http://localhost:5500`

---

## 4. 测试验证清单

### 4.1 功能测试

在本地环境测试以下功能，**全部通过后再推送到 GitHub**：

| 功能模块 | 测试步骤 | 验证标准 |
|---------|---------|------------|
| **登录功能** | 1. 访问 `http://localhost:5500`<br>2. 输入 admin 账号密码<br>3. 点击登录 | ✅ 成功跳转到仪表盘 |
| **用户审批** | 1. 用 admin 登录<br>2. 点击"用户管理"<br>3. 点击"批准"按钮 | ✅ 用户状态变为"已批准" |
| **KPI 指标卡片** | 1. 登录后查看顶部 KPI 区域 | ✅ 渐变边框 + 数字动画 + 趋势指示器 |
| **日期筛选** | 1. 选择日期范围<br>2. 点击"筛选" | ✅ 数据按日期刷新 |
| **图表展示** | 1. 查看底部图表区域 | ✅ Chart.js 渲染正常 |
| **退出登录** | 1. 点击"退出登录" | ✅ 返回登录页面 |

### 4.2 浏览器兼容性测试

| 浏览器 | 推荐版本 | 测试重点 |
|---------|-----------|------------|
| **Microsoft Edge** | 最新版 | ✅ 主测浏览器 |
| **Google Chrome** | 最新版 | ✅ 兼容性验证 |
| **Firefox** | 最新版 | 🟡 可选测试 |

### 4.3 响应式设计测试

1. 按 `F12` 打开开发者工具
2. 点击 **设备模拟图标**（或 `Ctrl + Shift + M`）
3. 测试以下分辨率：
   - 📱 手机：`375px × 667px`（iPhone SE）
   - 📱 手机：`414px × 896px`（iPhone XR）
   - 💻 平板：`768px × 1024px`（iPad）
   - 💻 桌面：`1920px × 1080px`（Full HD）

---

## 5. 手动推送变更到 GitHub

### 5.1 推送前检查

在本地测试**全部通过**后，执行以下步骤：

```bash
# 1. 打开 VS Code 终端（Ctrl + `）
# 2. 检查当前状态
git status

# 3. 查看待提交的文件
git diff

# 4. 运行 RLS 安全验证（重要！）
node scripts/validate-rls.js
```

### 5.2 提交代码

```bash
# 1. 添加所有修改的文件
git add .

# 2. 提交（附上详细的提交信息）
git commit -m "feat: 描述本次修改的功能

- 修改点 1
- 修改点 2
- 关闭的 Issue 编号（如 Closes #8）

✅ 已在本地环境测试通过"

# 3. 推送到 GitHub
git push origin master
```

### 5.3 推送失败时的备用方案

如果 `git push` 失败（如之前的凭证问题），使用 **GitHub API 推送**：

#### 方案 A：通过 WorkBuddy 推送

告诉我："请帮我推送代码到 GitHub"，我会用 Python + GitHub API 方式推送。

#### 方案 B：在本地手动推送

1. 配置 Git 使用 GitHub CLI 凭证：
   ```bash
   git config --global credential.helper "!gh auth git-credential"
   ```
2. 重新执行 `git push origin master`

#### 方案 C：使用 GitHub Desktop

1. 下载：https://desktop.github.com/
2. 登录 GitHub 账号
3. 克隆仓库：`echeung1328/autoprint-dashboard`
4. 在 GitHub Desktop 中提交并推送

---

## 6. 部署到生产环境

### 6.1 当前生产环境

| 平台 | URL | 部署方式 |
|------|-----|-----------|
| **Vercel** | https://autoprint-dashboard.vercel.app | ✅ 自动部署（推荐）|
| ~~Netlify~~ | ~~https://autoprintreport.netlify.app~~ | ❌ 已弃用 |

### 6.2 Vercel 自动部署流程

```
本地开发 → 测试通过 → git push → GitHub → Vercel 自动检测 → 构建部署 → 线上更新
```

**无需手动操作**，推送代码后约 **30 秒** 自动上线。

### 6.3 验证生产环境

推送代码后：

1. 访问 Vercel 仪表板：https://vercel.com/dashboard
2. 查看 **Deployments** 列表
3. 等待最新部署状态变为 **"Ready"**
4. 访问 https://autoprint-dashboard.vercel.app 验证

---

## 7. 完整工作流总结

```
┌──────────────────────────────────────────────────────────┐
│                   完整开发周期                                │
│                                                          │
│  1. 启动本地环境                                       │
│     → VS Code: Go Live                                 │
│     → 浏览器: http://localhost:5500                   │
│                                                          │
│  2. 开发功能                                           │
│     → 编辑 index.html                                  │
│     → 保存 → 自动刷新                                 │
│     → 在浏览器中验证                                    │
│                                                          │
│  3. 本地测试                                           │
│     → 运行 scripts/validate-rls.js                     │
│     → 测试所有功能点                                    │
│     → 测试不同浏览器                                    │
│                                                          │
│  4. 提交代码                                           │
│     → git add .                                        │
│     → git commit -m "..."                              │
│     → git push origin master                           │
│                                                          │
│  5. 验证生产环境                                       │
│     → 访问 Vercel 仪表板                               │
│     → 等待部署完成                                      │
│     → 访问线上 URL 验证                                 │
│                                                          │
│  6. 更新 GitHub Issues                                │
│     → 关闭已完成的 Issue                               │
│     → 更新 Project 看板                                │
└──────────────────────────────────────────────────────────┘
```

---

## 8. 附录

### 8.1 常用 VS Code 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Shift + X` | 打开扩展面板 |
| `Ctrl + Shift + E` | 打开资源管理器 |
| `Ctrl + `` ` | 打开终端 |
| `Ctrl + S` | 保存文件 |
| `Ctrl + Shift + P` | 打开命令面板 |

### 8.2 Live Server 配置（可选）

如果需要自定义 Live Server 行为，创建 `.vscode/settings.json`：

```json
{
    "liveServer.settings.port": 5500,
    "liveServer.settings.root": "/",
    "liveServer.settings.CustomBrowser": "chrome",
    "liveServer.settings.AdvanceCustomBrowserCmdLine": "--incognito"
}
```

### 8.3 项目文件结构

```
D:\WBStorage\Projects\AutoPrint\
│
├── index.html              # 主页面（唯一需要编辑的文件）
├── .git\                  # Git 版本控制
├── .github\               # GitHub Actions + PR 模板
├── .husky\               # Git 钩子（RLS 验证）
├── scripts\               # 工具脚本
│   ├── validate-rls.js    # RLS 安全验证
│   └── manual-deploy.bat # 手动部署（备用）
├── docs\                  # 项目文档
└── .workbuddy\            # WorkBuddy 配置
```

---

## 9. 故障排查

### 9.1 Live Server 无法启动

| 症状 | 解决方案 |
|------|-----------|
| 端口被占用 | 修改 Live Server 端口号 |
| 底部无 "Go Live" 按钮 | 重新安装 Live Server 扩展 |
| 点击后无反应 | 重启 VS Code |

### 9.2 修改未生效

| 症状 | 解决方案 |
|------|-----------|
| 浏览器显示旧版本 | `Ctrl + Shift + R`（强制刷新）|
| 代码已保存但无变化 | 检查是否编辑了正确的文件 |
| Supabase 数据未更新 | 手动刷新浏览器（数据变化需手动）|

### 9.3 Git 推送失败

参考 **第 5.3 节**：推送失败时的备用方案

---

## 10. 联系与支持

| 资源 | 链接 |
|------|------|
| **VS Code 文档** | https://code.visualstudio.com/docs |
| **Live Server 扩展** | https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer |
| **Supabase 文档** | https://supabase.com/docs |
| **Chart.js 文档** | https://www.chartjs.org/docs/ |
| **项目 GitHub** | https://github.com/echeung1328/autoprint-dashboard |
| **生产环境** | https://autoprint-dashboard.vercel.app |

---

**文档结束**

_本文档由 Senior Developer（高级开发工程师）创建，适用于 AutoPrint 项目本地开发环境配置。_
