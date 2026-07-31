# AutoPrint 安全变更回退预案（2026-07-31）

配套文档：`docs/security_audit_2026-07-31.md`（变更清单 SEC-01~SEC-16）。
适用场景：按安全加固变更 **push 并重新部署后**，线上出现不兼容 / 功能异常，需要回退。

> 关键事实：本次变更已 commit 至 `develop`（提交 `a63c780`），但**尚未 push、尚未在 Netlify 重新部署**。
> 如果你还没 push + 重新部署，就**不存在线上回退问题** —— 直接不要部署即可。
> 本预案假设你已经部署，现在要撤回。

---

## 0. 先判断：要不要真的回退

| 现象 | 建议 |
|------|------|
| 页面白屏 / 完全打不开 / 控制台报脚本加载失败 | 需要回退（优先方案零） |
| 某个图表/功能不显示，但页面能开 | 多半是 CSP 头拦了某资源 → 走「方案 B1 只回退 netlify.toml 的 headers」 |
| SRI 报错（脚本被拒绝执行） | 理论上不会发生（哈希已比对正确）；若发生 → 走「方案 B2 只回退 index.html」 |
| 邮件入库 / 审批转正失败 | Edge Function 问题 → 走「方案 4 只回退函数」 |
| 只是想微调某条规则 | 不要整体回退，直接改对应文件后重新部署 |

**回退的代价（权衡）**：
- 回退 `netlify.toml` → `.git/`、源数据等**会重新暴露到公网**（SEC-01 失效）。
- 回退 `index.html` 的转义/SRI → 存储型 XSS 风险**会回来**（SEC-04/05/06/08 失效）。
- 因此：**优先用「方案 B 部分回退」保留安全收益，只有在整体不兼容时才用「方案 A 整体回退」。**

---

## 1. 方案零：Netlify 控制台一键回滚（推荐，最快，不动 git）

适合：线上已部署、站点异常，想**立刻**恢复上次正常版本，且不想碰 git。

对 **两个站点各做一次**（`comlanuat.de5.net` 与 `autoprintreport.netlify.app`）：

1. 打开 Netlify 仪表板 → 进入对应 Site。
2. 左侧 **Deploys** → 看到部署列表（顶部是当前线上版本）。
3. 找到**本次安全加固之前的最后一个正常部署**（部署摘要里没有「security: 全面安全加固」字样）。
4. 点开该部署 → 右上角 **Options / Publish deploy**（有的版本叫 **Rollback**）。
5. 确认后，该旧版本立即变为线上版本（通常几秒生效）。

> 这一步**不需要 git、不需要命令行**，是 PM 也能 30 秒完成的止血操作。
> 回滚后，git 里的 `a63c780` 提交仍在 —— 等你定位问题修好后再重新部署即可。

---

## 2. 方案 A：Git 整体回退本次提交（代码也还原）

适合：确认本次变更整体不兼容，连安全项都先不要了，彻底回到变更前。

> 以下命令在 **Git Bash** 中逐条执行（每条独立，不用续行）。项目路径按你本机调整。

```
cd /d/WBStorage/Projects/AutoPrint
```

```
git status
```

```
git log --oneline -3
```

确认 `a63c780` 是最近一次提交后，二选一：

- **(a) 已 push 到远端 → 用 revert（安全，保留历史）：**
```
git revert --no-edit a63c780
```

- **(b) 还没 push → 用 reset 直接抹掉该提交（干净）：**
```
git reset --hard HEAD~1
```

然后提交/推送并重新部署（让回退生效）：

```
git push
```

```
git push --force-with-lease
```

> 注意：`--force-with-lease` 只在用了 (b) reset 且已 push 过时才需要；用 (a) revert 直接 `git push` 即可。

最后按「方案零」或正常 Deploy 流程在 Netlify 重新部署，使回退后的代码上线。

---

## 3. 方案 B：只回退部分文件（保留大部分安全收益）

适合：只有某一类改动不兼容，其余安全项继续保留。

### B1. 只回退 `netlify.toml`（保留 SEC-01 发布白名单，去掉安全头/强制 404）

> 用途：线上因 CSP 等响应头拦了正常资源，但**不想让 `.git/` 重新暴露**。此方案保留 `publish = "public"` 这个最大安全收益。

```
cd /d/WBStorage/Projects/AutoPrint
```

```
git checkout HEAD~1 -- netlify.toml
```

回退后手动编辑 `netlify.toml`：保留 `[build]` 段（`publish = "public"`），**删除整个 `[[headers]]` 段和所有 `[[redirects]]` 段**。然后：

```
git add netlify.toml
```

```
git commit -m "rollback: 仅移除 netlify.toml 安全头与重定向（保留发布白名单）"
```

```
git push
```

重新部署后复测：`.git/HEAD` 仍为 404（白名单仍在），但响应头中无 CSP/HSTS。

### B2. 只回退 `index.html`（去掉 SRI / 转义，XSS 防护回到变更前）

> 用途：极少数情况下 SRI 或转义导致功能异常。**回退后存储型 XSS 风险会回来**，仅作临时止血，修好应立刻恢复。

```
cd /d/WBStorage/Projects/AutoPrint
```

```
git checkout HEAD~1 -- index.html
```

```
git add index.html
```

```
git commit -m "rollback: 临时回退 index.html（SRI/转义），待修复后恢复"
```

```
git push
```

重新部署。

### B3. 只回退某个 Edge Function

见「方案 4」。

---

## 4. 方案 4：Supabase Edge Function 单独回退

Edge Function 由 CLI/MCP 部署到 Supabase，**不在 Netlify 站点里**。回退 = 用变更前的函数代码重新 deploy。

两个函数文件：
- `supabase/functions/email_inbox_poc/index.ts`（SEC-09/10/11）
- `supabase/functions/promote_approval/index.ts`（SEC-09）

回退某一函数（以 `email_inbox_poc` 为例）：

```
cd /d/WBStorage/Projects/AutoPrint
```

```
git checkout HEAD~1 -- supabase/functions/email_inbox_poc/index.ts
```

然后用 Supabase CLI 重新部署该函数（需本地有 `supabase` CLI 且已登录）：

```
npx supabase functions deploy email_inbox_poc --project-ref uvqjtvonxwsmhntnyest
```

> 若你是用 WorkBuddy 的 Supabase MCP 部署的，回退后同样用 MCP 重新 deploy 该文件即可。
> 部署后建议跑一遍原单元测试确认行为恢复：`node --test supabase/functions/email_inbox_poc/*.test.mjs`

---

## 5. 回退后验证

| 回退方式 | 验证命令（Git Bash） | 期望结果 |
|----------|----------------------|----------|
| 整体回退（方案 A） | `curl -s -o /dev/null -w "%{http_code}" https://<站点>/.git/HEAD` | `200`（仓库重新暴露，符合预期） |
| 仅 B1（保留白名单） | `curl -s -o /dev/null -w "%{http_code}" https://<站点>/.git/HEAD` | `404`（白名单仍生效） |
| 仅 B1 | `curl -sI https://<站点>/ \| grep -i content-security-policy` | 无输出（头已移除） |
| 任意回退后 | 浏览器打开站点，控制台无报错、图表/邮件功能正常 | 功能恢复 |

---

## 6. 紧急止血清单（线上完全不可用）

1. **立即**用「方案零」在 Netlify 控制台把两个站点回滚到上次正常部署 → 站点 30 秒内恢复。
2. 不要在慌乱中改 git 强制推送，先恢复可用。
3. 恢复后，按「方案 B」做最小化回退定位问题项，修好再重新部署。
4. 若怀疑是 `publish = "public"` 导致（站点缺资源），临时把 `netlify.toml` 的 `publish` 改回 `.` 并重新部署（代价：仓库重新暴露，仅作应急，事后务必改回）。

---

## 7. 重要提醒

- **回退 `netlify.toml` = `.git/` 重新暴露公网**，属高危倒退，仅在确实必要时做，且事后尽快恢复白名单。
- **回退 `index.html` 的转义/SRI = XSS 风险回来**，仅作临时止血。
- 所有回退操作后，都必须**重新部署 Netlify**（且函数类需重新 deploy 函数）才能生效 —— 改 git 不等于改线上。
- 本次变更提交号：`a63c780`（在 `develop` 分支，本地已提交，待你 `git push`）。

---

*本预案依据腾讯安全专家规范输出，目标是「先止血、再最小化回退、保留安全收益」。*
