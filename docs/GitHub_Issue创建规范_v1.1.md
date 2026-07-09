# AutoPrint - GitHub Issue 创建规范 v1.1

**文档版本**: V1.1
**创建日期**: 2026-07-09
**修订日期**: 2026-07-09
**作者**: 高级开发工程师
**触发背景**: 2026-07-09 创建 Issue #21 时只传了 `--title/--body/--assignee`，漏了 label，且未加入 Project 看板、未设 Sprint；同时同会话重复创建了孤儿 #20（与 #21 同标题，早 53 秒）。用户被迫手动补救。本规范防止再犯。

------------------------------------------------------------------------

## v1.1 修订要点（来自 #23 创建实战踩坑）

| # | 踩坑现象 | v1.0 写法 | v1.1 正确写法 |
|---|---------|-----------|---------------|
| A | **PowerShell 不支持 bash heredoc**：`gh issue create ... --body "$(cat <<'EOF' ... EOF)"` 会**静默失败**（issue 建不出来或 body 为空） | 用 `<<'EOF'` 内联 body | 先写 `issue_body.md`，用 `--body-file issue_body.md`（跨 shell 通用） |
| B | **`--raw-field query=@file` 不生效**：报 `DIR_SIGN("@")` 错误 | 用 `--raw-field query=@file.txt` | 用 `-f query="$(cat 文件.txt)"`（命令替换读取文件内容） |
| C | （已排除）Bash 工具误传 `arguments` 参数——属工具调用笔误，与本项目流程无关，不写入规范 | — | — |

> **Shell 兼容性结论**：本机用户环境为 Windows / PowerShell。所有 `gh` 命令统一用「文件法」——`--body-file` 供 issue body、`-f query="$(cat 文件.txt)"` 供 GraphQL 查询/变更——即可在 PowerShell 与 Git Bash 下均无差异执行。

------------------------------------------------------------------------

## 强制流程（每次创建 Issue 必须全套执行）

### 步骤 0：去重检查（先做，避免再现 #20）

同一目的**绝不创建第二个 issue**。先查是否已存在：

```bash
gh issue list --search "标题关键词" --state all
```

确认不存在再继续创建。

### 步骤 1：写 body 文件 + 创建并带 label（必须 --label）

先准备 issue 正文（任意文件名，建议放仓库根或 `.tmp/`）：

```markdown
# issue_body.md
## 背景
...

## 实现方案
...

## 验收标准
- [ ] ...
```

```bash
gh issue create \
  --title "简明标题" \
  --body-file issue_body.md \
  --assignee echeung1328 \
  --label "enhancement"        # 必填！从下方标签清单选
```

**可用 label**：`auth` / `bug` / `documentation` / `duplicate` / `enhancement` / `good first issue` / `help wanted` / `invalid` / `question` / `user-story` / `wontfix`
- 新功能 → `enhancement` 或 `user-story`
- 修 bug → `bug`
- 文档 → `documentation`

> 若你确实在 **Git Bash / bash** 环境下，也可用 heredoc 内联 body；但 PowerShell 下必须改用 `--body-file`（见 v1.1 修订要点 A）。

### 步骤 2：可靠捕获返回的 issue 编号

从命令输出解析真实编号（形如 `https://github.com/echeung1328/autoprint-dashboard/issues/N`）。**绝不凭记忆写编号**。

### 步骤 3：加入 Project 看板 "AutoPrint Sprint Board"

```bash
gh project item-add 1 --owner echeung1328 \
  --url https://github.com/echeung1328/autoprint-dashboard/issues/N
```

> 看板信息：名称 `AutoPrint Sprint Board`，number `1`，id `PVT_kwHOAYl5dM4BcEMT`，owner `echeung1328`。
> 注意：仓库**没有 GitHub milestone**，Sprint 走 Project 的迭代字段。

### 步骤 4：设置 Sprint / Status / Priority（GraphQL mutation）

先取得刚加入的 project item id（查询写法见下，用文件法避免 B 坑）：

```bash
# 1) 把查询写到文件
cat > .q_items.txt <<'QEOF'
{
  user(login: "echeung1328") {
    projectV2(number: 1) {
      items(first: 50) {
        nodes {
          id
          content { ... on Issue { number } }
        }
      }
    }
  }
}
QEOF

# 2) 用命令替换执行（注意：是 -f query="$(cat 文件)"，不是 --raw-field query=@file）
gh api graphql -f query="$(cat .q_items.txt)"
```

从输出里找到对应 issue 的 `id`（形如 `PVTI_lAHOAYl5dM4BcEMTxxxxxxx`），记为 `<ITEM_ID>`。

**设置字段值（一次性设 4 个字段的完整 mutation）**：

```bash
cat > .m_fields.txt <<'MEOF'
mutation {
  s: updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAYl5dM4BcEMT", itemId: "<ITEM_ID>", fieldId: "PVTSSF_lAHOAYl5dM4BcEMTzhWvtts", value: { singleSelectOptionId: "47fc9ee4" } }) { projectV2Item { id } }
  ss: updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAYl5dM4BcEMT", itemId: "<ITEM_ID>", fieldId: "PVTSSF_lAHOAYl5dM4BcEMTzhWvuVA", value: { singleSelectOptionId: "3644648d" } }) { projectV2Item { id } }
  p: updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAYl5dM4BcEMT", itemId: "<ITEM_ID>", fieldId: "PVTSSF_lAHOAYl5dM4BcEMTzhW0v1Y", value: { singleSelectOptionId: "0ee3d77d" } }) { projectV2Item { id } }
  sp: updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAYl5dM4BcEMT", itemId: "<ITEM_ID>", fieldId: "PVTIF_lAHOAYl5dM4BcEMTzhWzu1A", value: { iterationId: "f18571ec" } }) { projectV2Item { id } }
}
MEOF

gh api graphql -f query="$(cat .m_fields.txt)"
```

上面示例把新 issue 设为 **Status=In Progress / Sprint Status=In Progress / Priority=P2 / Sprint=Sprint 1**（即 #23 的实际设定）。按需要替换下方「字段与取值对照表」里的 ID。

**字段与取值对照（含真实 optionId / iterationId，已固化，无需再查）**：

  ------------------------------------------------------------------
  字段             fieldId                            value 包装
  ---------------  ---------------------------------  -------------------
  Status           PVTSSF_lAHOAYl5dM4BcEMTzhWvtts     singleSelectOptionId
  Sprint Status    PVTSSF_lAHOAYl5dM4BcEMTzhWvuVA     singleSelectOptionId
  Priority         PVTSSF_lAHOAYl5dM4BcEMTzhW0v1Y     singleSelectOptionId
  Sprint(迭代)     PVTIF_lAHOAYl5dM4BcEMTzhWzu1A     iterationId
  ------------------------------------------------------------------

  - Status 选项：Todo=`f75ad846` / In Progress=`47fc9ee4` / Done=`98236657`
  - Sprint Status 选项：Backlog=`c2d14681` / Sprint Ready=`fcd11fa8` / In Progress=`3644648d` / In Review=`32d1c4ec` / Done=`34f12c47`
  - Priority 选项：P0=`ea55693d` / P1=`168f5ba4` / P2=`0ee3d77d` / P3=`ac46f47d`
  - Sprint 迭代：Sprint 1: 审批+筛选=`f18571ec`(07-01) / Sprint 2: 图表+导出=`81fd4101`(07-15) / Sprint 3: 登录+认证=`1bba460a`(07-29)

> 迭代周期均为 14 天；新功能通常归入**当前活跃 Sprint**（现为 Sprint 1，07-01 起）。

### 步骤 5：校验

```bash
gh issue view N --json number,state,labels,projectItems
```

确认：
- `labels` 非空
- `projectItems` 含 `AutoPrint Sprint Board`
- （可选）在 GitHub 网页确认 Sprint/Status/Priority 已正确

### 步骤 6：清理临时文件

创建过程中生成的 `issue_body.md` / `.q_items.txt` / `.m_fields.txt` 等临时文件，用完即删，避免污染仓库：

```bash
rm -f issue_body.md .q_items.txt .m_fields.txt
```

------------------------------------------------------------------------

## 一键参考（新功能示例，已按 v1.1 修正）

```bash
# 0) 去重
gh issue list --search "版本号 OR 徽章" --state all

# 1) 写 body 文件（任意编辑器）后创建
gh issue create --title "方案X：..." --body-file issue_body.md --assignee echeung1328 --label "enhancement"

# 2) 加入看板（N = 上一步真实编号）
gh project item-add 1 --owner echeung1328 --url https://github.com/echeung1328/autoprint-dashboard/issues/N

# 3) 查 item id（文件法）
cat > .q_items.txt <<'QEOF'
{ user(login: "echeung1328") { projectV2(number: 1) { items(first: 50) { nodes { id content { ... on Issue { number } } } } } } }
QEOF
gh api graphql -f query="$(cat .q_items.txt)"

# 4) 用步骤 4 的 mutation 设 4 个字段（替换 <ITEM_ID>），再执行
# gh api graphql -f query="$(cat .m_fields.txt)"

# 5) 校验 + 清理
gh issue view N --json number,state,labels,projectItems
rm -f issue_body.md .q_items.txt .m_fields.txt
```

------------------------------------------------------------------------

## 教训（来自 #20/#21/#23 事件）

- `gh issue create` 默认**不会**加 label、不会加 Project、不会设 Sprint —— 这些都要显式做。
- 重复创建 issue 极易留下无法自动清理的孤儿（#20 既没 Project 也没 label，全靠人工发现）。先去重再创建。
- 把 issue 编号写死在后续命令里是高危动作，必须从上一步输出解析。
- **PowerShell 与 Git Bash 语法不同**：body 用 `--body-file`、GraphQL 用 `-f query="$(cat file)"`，可跨 shell 零差异执行（见 v1.1 修订要点 A/B）。
- 临时文件用完即清，别让 `.tmp_*` / `.q_*` / `.m_*` 进仓库。
