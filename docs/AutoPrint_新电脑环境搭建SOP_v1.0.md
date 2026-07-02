# AutoPrint 新电脑环境搭建 SOP

**文档版本**: v1.0  
**更新日期**: 2026-07-02  
**适用项目**: AutoPrint Dashboard (https://autoprint-dashboard.vercel.app)

---

## 前提条件

- Windows 10/11
- 能访问 GitHub.com（或通过手机热点）
- 有 GitHub 账户 `echeung1328` 的访问权限

---

## 第一步：安装必要软件

### 1.1 安装 Git

1. 下载：https://git-scm.com/download/win
2. 安装时选择：
   - ✅ **Use Git from the command line and also from 3rd-party software**
   - ✅ **Checkout as-is, commit Unix-style line endings**
3. 验证安装：
   ```powershell
   git --version
   # 预期输出: git version 2.x.x.windows.1
   ```

### 1.2 安装 VS Code

1. 下载：https://code.visualstudio.com/download
2. 安装后打开 VS Code，安装扩展：
   - **Live Server** (ritwickdey.LiveServer) — 搜索 "Live Server" 点击 Install

### 1.3 配置 Git 用户信息

```powershell
git config --global user.name "Eric Zhang"
git config --global user.email "echeung1328@hotmail.com"
```

---

## 第二步：生成并配置 SSH Key

### 2.1 生成 SSH Key

```powershell
ssh-keygen -t ed25519 -C "echeung1328@hotmail.com" -f ~/.ssh/id_ed25519 -N ""
```

输出示例：
```
Generating public/private ed25519 key pair.
Your identification has been saved in C:\Users\Eric Zhang\.ssh\id_ed25519
```

### 2.2 复制公钥内容

```powershell
cat ~/.ssh/id_ed25519.pub
```

**复制输出的完整一行**（以 `ssh-ed25519` 开头，以邮箱结尾）

### 2.3 添加公钥到 GitHub

1. 浏览器访问：https://github.com/settings/ssh/new
2. **Title**: `AutoPrint-Dev-[电脑名]`
3. **Key type**: `Authentication Key`
4. **Key**: 粘贴刚才复制的公钥
5. 点击 **Add SSH key**

### 2.4 验证 SSH 连接

```powershell
ssh -T git@github.com
```

**首次运行**会提示：
```
The authenticity of host 'github.com (20.205.243.166)' can't be established.
...
Are you sure you want to continue connecting (yes/no)?
```
输入 `yes` 回车

**预期输出**：
```
Hi echeung1328! You've successfully authenticated, but GitHub does not provide shell access.
```

✅ 看到这个就说明 SSH 配置成功！

---

## 第三步：克隆项目到本地

### 3.1 选择项目目录

```powershell
# 建议放在 D:\WBStorage\Projects\
mkdir D:\WBStorage\Projects -Force
cd D:\WBStorage\Projects
```

### 3.2 克隆仓库（SSH 协议）

```powershell
git clone git@github.com:echeung1328/autoprint-dashboard.git
cd autoprint-dashboard
```

### 3.3 验证克隆成功

```powershell
git status
# 预期输出: On branch master, nothing to commit, working tree clean
```

---

## 第四步：配置 VS Code Live Server

### 4.1 打开项目

1. 打开 VS Code
2. **File** → **Open Folder** → 选择 `D:\WBStorage\Projects\autoprint-dashboard`

### 4.2 启动 Live Server

**方式 A：右键菜单**
1. 在 VS Code 中打开 `index.html`
2. 右键 → **Open with Live Server**

**方式 B：快捷键**
1. 打开 `index.html`
2. 按 `Alt+L` 然后 `Alt+O`

**预期结果**：
- 浏览器自动打开：http://127.0.0.1:5500/index.html
- VS Code 右下角显示 **"Port: 5500"** (Go Live)

### 4.3 验证功能

- 修改 `index.html` 任意内容 → 保存 → 浏览器自动刷新 ✅
- 打开浏览器控制台（F12）→ 确认无报错 ✅

---

## 第五步：测试 Git 推送权限

### 5.1 创建一个测试提交

```powershell
cd D:\WBStorage\Projects\autoprint-dashboard
echo "# Test from new machine" >> TEST.md
git add TEST.md
git commit -m "test: verify push access from new machine"
git push origin master
```

### 5.2 验证推送成功

1. 浏览器访问：https://github.com/echeung1328/autoprint-dashboard/commits/master
2. 确认看到刚才的提交 ✅
3. 删除测试文件：
   ```powershell
   git rm TEST.md
   git commit -m "chore: remove test file"
   git push origin master
   ```

---

## 第六步：验证 Vercel 自动部署

推送后，Vercel 会自动部署：

1. 访问：https://vercel.com/echeung1328/autoprint-dashboard
2. 查看 **Deployments** 标签
3. 确认最新 commit 正在部署或已部署 ✅

---

## 日常开发工作流

### 拉取最新代码

```powershell
cd D:\WBStorage\Projects\autoprint-dashboard
git pull origin master
```

### 开发 → 提交 → 推送

```powershell
# 1. 启动 Live Server 开发
# 2. 修改文件后...

# 3. 查看修改
git status

# 4. 添加修改
git add -A

# 5. 提交
git commit -m "feat: 描述你的修改"

# 6. 推送
git push origin master
```

### 处理冲突

如果 `git pull` 提示冲突：

```powershell
# 先把本地修改暂存
git stash

# 拉取最新代码
git pull origin master

# 恢复本地修改
git stash pop

# 手动解决冲突后...
git add -A
git commit -m "merge: resolve conflicts"
git push origin master
```

---

## 常见问题排查

### Q1: `ssh -T git@github.com` 提示 "Connection timed out"

**原因**：公司防火墙阻断 SSH 端口 22  
**解决**：
1. 使用手机热点
2. 或配置 SSH 通过 HTTPS 端口（443）：
   ```powershell
   # 编辑 ~/.ssh/config
   notepad ~/.ssh/config
   ```
   添加：
   ```
   Host github.com
     Hostname ssh.github.com
     Port 443
   ```

### Q2: `git push` 提示 "Authentication failed"

**原因**：SSH Key 未添加到 GitHub 或使用了错误的 remote URL  
**解决**：
```powershell
# 检查 remote URL
git remote -v
# 应该是: git@github.com:echeung1328/autoprint-dashboard.git

# 如果不是，重新设置
git remote set-url origin git@github.com:echeung1328/autoprint-dashboard.git
```

### Q3: Live Server 无法启动

**原因**：端口 5500 被占用  
**解决**：
1. 打开 VS Code 设置（Ctrl+,）
2. 搜索 `liveServer.settings.port`
3. 修改为其他端口（如 5501）

### Q4: 修改后浏览器不自动刷新

**原因**：Live Server 未正确启动  
**解决**：
1. 右下角点击 **"Port: 5500"** → **Stop Live Server**
2. 重新右键 `index.html` → **Open with Live Server**

---

## 项目结构速查

```
autoprint-dashboard/
├── index.html              # 主页面（唯一入口）
├── .gitignore              # Git 忽略规则
├── netlify.toml            # Netlify 配置（已弃用）
├── scripts/                # 工具脚本
│   └── validate-rls.js     # RLS 安全验证
├── docs/                   # 项目文档
├── .github/                # GitHub 配置
│   ├── pull_request_template.md
│   └── workflows/          # CI/CD
└── .workbuddy/             # WorkBuddy 内部文件（不入库）
```

---

## 关键链接

| 项目 | 链接 |
|------|------|
| 线上站点 | https://autoprint-dashboard.vercel.app |
| GitHub 仓库 | https://github.com/echeung1328/autoprint-dashboard |
| Vercel 部署 | https://vercel.com/echeung1328/autoprint-dashboard |
| Supabase 后台 | https://supabase.com/dashboard/project/uvqjtvonxwsmhntnyest |
| GitHub Issues | https://github.com/echeung1328/autoprint-dashboard/issues |

---

## 附录 A：本地测试与推送完整流程

⚠️ **重要原则**：所有代码修改必须先在本地 Live Server 测试通过，再推送到 GitHub！

### 为什么需要先本地测试？

| 风险 | 说明 |
|------|------|
| 破坏线上功能 | 直接推送可能导致 Vercel 部署后功能异常 |
| 调试困难 | 线上报错比本地难定位 |
| 影响用户体验 | 用户可能看到报错页面 |

### 完整工作流（每次开发都必须遵循）

```
┌─────────────────┐
│ 1. 启动 Live Server                              │
│    - 打开 index.html                              │
│    - 右键 → Open with Live Server                 │
│    - 浏览器访问 http://127.0.0.1:5500          │
└─────────────────┘
                        ↓
┌─────────────────┐
│ 2. 本地开发 + 实时预览                          │
│    - 修改代码 → Ctrl+S 保存                      │
│    - 浏览器自动刷新                               │
│    - 检查功能是否正常                             │
└─────────────────┘
                        ↓
┌─────────────────┐
│ 3. 测试检查清单                                 │
│    ✅ 页面能正常加载（无 JS 报错）              │
│    ✅ 登录功能正常（Supabase Auth）              │
│    ✅ KPI 卡片数据正确显示                       │
│    ✅ 图表/表格功能正常（如有）                  │
│    ✅ 浏览器控制台（F12）无红色报错              │
└─────────────────┘
                        ↓
              ┌──────────┐
              │ 测试通过？│
              └──────────┘
                   ↓ Yes
                        ↓
┌─────────────────┐
│ 4. 提交并推送                                   │
│    git add -A                                   │
│    git commit -m "feat: 描述修改内容"           │
│    git push origin master                        │
└─────────────────┘
                        ↓
┌─────────────────┐
│ 5. 验证 Vercel 部署                            │
│    - 访问 https://autoprint-dashboard.vercel.app│
│    - 确认功能与本地测试一致                      │
└─────────────────┘
```

### 本地测试详细步骤

#### A. 启动 Live Server

```powershell
# 方式 1：VS Code 右键菜单
#   1. 打开 index.html
#   2. 右键 → Open with Live Server

# 方式 2：快捷键
#   1. 打开 index.html
#   2. 按 Alt+L, 然后 Alt+O

# 预期结果：
#   - 浏览器自动打开 http://127.0.0.1:5500/index.html
#   - VS Code 右下角显示 "Port: 5500" (Go Live)
```

#### B. 验证核心功能

| 功能模块 | 测试方法 | 通过标准 |
|----------|----------|------------|
| 页面加载 | 打开 http://127.0.0.1:5500 | 无白屏，KPI 卡片显示 |
| 登录功能 | 点击登录按钮 | 能成功登录，显示用户信息 |
| 数据获取 | 查看 KPI 数字 | 数字正确，无 404/500 报错 |
| 响应式布局 | 缩小浏览器窗口 | 布局自适应，无横向滚动条 |
| 控制台报错 | 按 F12 打开 Console | 无红色错误信息 |

#### C. 常见本地测试问题

**Q: 修改代码后浏览器不刷新？**
- 解决：手动刷新（Ctrl+F5 强制刷新）
- 检查：Live Server 是否还在运行（右下角显示 "Port: 5500"）

**Q: 控制台显示 "Failed to fetch"？**
- 原因：Supabase 数据库连接失败
- 解决：检查 `index.html` 中的 Supabase URL 和 anon key 是否正确

**Q: 登录后页面空白？**
- 原因：可能是 RLS 策略问题
- 解决：查看控制台具体报错，对比 Supabase 后台数据

### 推送时机与提交规范

#### ✅ 应该推送的情况

- 本地测试通过，功能正常
- 完成一个独立功能模块
- 修复一个 Bug
- 文档更新（不需要测试）

#### ❌ 不应该推送的情况

- 本地测试未通过
- 代码有语法错误
- 只是想"先推送，再修复"（会破坏线上版本）
- 包含敏感信息（Token、密码等）

#### 📝 提交信息规范

```powershell
# 功能开发
git commit -m "feat: 新增数据表格分页功能"

# Bug 修复
git commit -m "fix: 修复 KPI 卡片数字显示错误"

# 文档更新
git commit -m "docs: 更新环境搭建 SOP"

# 代码重构
git commit -m "refactor: 优化 Supabase 查询逻辑"

# 样式调整
git commit -m "style: 升级 KPI 卡片为 Premium UI"
```

### 快速检查脚本

在推送前，运行这个检查清单（**5 秒钟完成**）：

```powershell
# 1. 检查是否有未提交的文件（可选）
git status

# 2. 确认 Live Server 测试已通过（手动验证）
#    - 打开 http://127.0.0.1:5500
#    - 确认功能正常

# 3. 推送
git add -A
git commit -m "feat: 描述你的修改"
git push origin master
```

---

## 检查清单（新电脑首次配置）

- [ ] Git 已安装并配置用户信息
- [ ] VS Code 已安装 Live Server 扩展
- [ ] SSH Key 已生成
- [ ] SSH Key 已添加到 GitHub
- [ ] `ssh -T git@github.com` 返回成功
- [ ] 项目已克隆到本地
- [ ] `git status` 显示干净
- [ ] Live Server 能正常启动
- [ ] 浏览器能访问 http://127.0.0.1:5500/index.html
- [ ] `git push` 测试成功
- [ ] Vercel 自动部署成功

---

**文档结束** — 如有问题，参考"常见问题排查"或联系开发团队。
