# Netlify 手动部署指南

## 🎯 目标
节省 Netlify 免费额度，改为本地手动部署模式。

---

## 📋 方法 1：在 Netlify 仪表板禁用自动发布（推荐）

### 步骤：

1. **登录 Netlify**
   - 访问 https://app.netlify.com
   - 进入站点：`autoprintreport`

2. **禁用自动发布**
   - 点击 **Site settings**
   - 选择 **Build & deploy**
   - 找到 **Deploy contexts** 部分
   - 点击 **Edit settings**
   - 设置：
     - **Branch deploys**: `None`
     - **Deploy previews**: `None`
   - 保存

3. **锁定发布（可选）**
   - 进入 **Deploys** 标签
   - 点击 **Lock publish** 按钮
   - 这样每次部署都需要手动解锁

---

## 📋 方法 2：断开 GitHub 连接

如果不需要自动部署，可以完全断开连接：

1. **Site settings** → **Build & deploy** → **Continuous deployment**
2. 点击 **Disconnect repository**
3. 以后手动上传构建文件

---

## 🚀 手动部署方式

### 方式 A：使用 Netlify CLI（推荐）

```bash
# 1. 安装 CLI
npm install -g netlify-cli

# 2. 登录
netlify login

# 3. 链接站点
netlify link --git-remote-url https://github.com/echeung1328/autoprint-dashboard.git

# 4. 预览部署（测试）
netlify deploy --dir=.

# 5. 生产部署（正式）
netlify deploy --prod --dir=.
```

### 方式 B：在 Netlify 仪表板手动上传

1. 进入 **Deploys** 标签
2. 拖拽文件到部署区域
3. 或点击 **Browse files** 选择文件

---

## 💡 节省额度的建议

### 1. 累积多次提交后一次性部署
```bash
# 在本地开发测试
# 确认无误后，再手动部署到 Netlify
```

### 2. 使用 Draft 模式
- 在 Netlify CLI 中使用 `--dir` 指定本地目录
- 先预览，确认后再生产部署

### 3. 监控额度使用
- 访问 https://app.netlify.com/teams/[your-team]/billing
- 查看剩余构建分钟数和带宽

---

## 📊 Netlify 免费额度（2026）

| 资源 | 免费额度 |
|------|----------|
| 构建分钟数 | 300 分钟/月 |
| 带宽 | 100 GB/月 |
| 站点数 | 无限 |
| 团队成员 | 1 人 |

---

## 🔧 故障排查

### 问题 1：部署后站点空白
**原因**：发布目录错误  
**解决**：确认 `--dir=.` 指向包含 `index.html` 的目录

### 问题 2：CLI 部署失败
**原因**：未登录或未链接站点  
**解决**：
```bash
netlify status  # 检查状态
netlify login   # 重新登录
netlify link    # 重新链接
```

### 问题 3：自动部署仍然触发
**原因**：未在仪表板禁用  
**解决**：按照"方法 1"在仪表板中禁用

---

## ✅ 检查清单

部署前确认：
- [ ] 已在 Netlify 仪表板禁用自动发布
- [ ] 本地测试通过
- [ ] 所有文件已提交到 Git
- [ ] 已安装 Netlify CLI
- [ ] 已登录并链接站点

---

## 📞 支持

如遇问题，查阅：
- Netlify 文档：https://docs.netlify.com
- CLI 文档：https://cli.netlify.com

---

**最后更新**：2026-07-01
