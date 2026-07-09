# AutoPrint - GitHub Issue 创建规范 v1.0

**文档版本**: V1.0
**创建日期**: 2026-07-09
**作者**: 高级开发工程师
**触发背景**: 2026-07-09 创建 Issue #21 时只传了 `--title/--body/--assignee`，漏了 label，且未加入 Project 看板、未设 Sprint；同时同会话重复创建了孤儿 #20（与 #21 同标题，早 53 秒）。用户被迫手动补救。本规范防止再犯。

------------------------------------------------------------------------

## 强制流程（每次创建 Issue 必须全套执行）

### 步骤 1：创建并带 label（必须 --label）

```bash
gh issue create \
  --title "简明标题" \
  --body "$(cat <<'EOF'
## 背景
...

## 实现方案
...

## 验收标准
- [ ] ...
EOF
)" \
  --assignee echeung1328 \
  --label "enhancement"        # 必填！从下方标签清单选
```

**可用 label**：`auth` / `bug` / `documentation` / `duplicate` / `enhancement` / `good first issue` / `help wanted` / `invalid` / `question` / `user-story` / `wontfix`
- 新功能 → `enhancement` 或 `user-story`
- 修 bug → `bug`
- 文档 → `documentation`

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

先取得刚加入的 project item id（以及各字段的 optionId / iterationId）：

```bash
# 列出看板条目，找到对应 issue 的 item id
gh api graphql -f query='
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
}'
```

设置字段值（把 `<ITEM_ID>` / `<FIELD_ID>` / `<VALUE_ID>` 替换为实际值）：

```bash
gh api graphql -f query='
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "PVT_kwHOAYl5dM4BcEMT"
    itemId: "<ITEM_ID>"
    fieldId: "<FIELD_ID>"
    value: { <VALUE_WRAPPER>: "<VALUE_ID>" }
  }) {
    projectV2Item { id }
  }
}'
```

字段与取值对照：

  ------------------------------------------------------------------
  字段             fieldId                            值类型
  ---------------  ---------------------------------  -------------------
  Status           PVTSSF_lAHOAYl5dM4BcEMTzhWvtts     singleSelectOptionId
  Sprint Status    PVTSSF_lAHOAYl5dM4BcEMTzhWvuVA     singleSelectOptionId
  Priority         PVTSSF_lAHOAYl5dM4BcEMTzhW0v1Y     singleSelectOptionId
  Sprint(迭代)     PVTIF_lAHOAYl5dM4BcEMTzhWzu1A     iterationId
  ------------------------------------------------------------------

- 单选字段（Status/Sprint Status/Priority）：`value: { singleSelectOptionId: "<OPTION_ID>" }`
  - 常见选项：Status=`Todo`/`In Progress`/`Done`；Sprint Status=`Backlog`/`Planned`/`In Progress`/`Done`；Priority=`P0`/`P1`/`P2`
- 迭代字段（Sprint）：`value: { iterationId: "<ITERATION_ID>" }`
  - 迭代示例：`Sprint 1: 审批+筛选` / `Sprint 2: 图表+导出` / `Sprint 3: 登录+认证`

> 取 optionId / iterationId：在 `gh project field-list 1 --owner echeung1328` 基础上，对迭代字段用 GraphQL 查 `configuration { iterations { id title startDate } }`（注：个别 GraphQL 查询偶发 401，重试即可；REST `gh issue`/`gh project` 命令不受影响）。

### 步骤 5：校验

```bash
gh issue view N --json number,state,labels,projectItems
```

确认：
- `labels` 非空
- `projectItems` 含 `AutoPrint Sprint Board`
- （可选）在 GitHub 网页确认 Sprint/Status/Priority 已正确

### 步骤 6：去重纪律

同一目的**绝不创建第二个 issue**。若前一次 `gh issue create` 输出不清，先查：

```bash
gh issue list --search "标题关键词" --state all
```

确认不存在再创建。避免再现 #20（同标题重复 issue，一个被关联、一个成孤儿）。

------------------------------------------------------------------------

## 一键参考（新功能示例）

```bash
# 1) 建 issue（带 label）
gh issue create --title "方案X：..." --body "$(cat <<'EOF'
## 背景
...
## 实现方案
...
## 验收标准
- [ ] ...
EOF
)" --assignee echeung1328 --label "enhancement"

# 2) 加入看板（把 N 换成上一步真实编号）
gh project item-add 1 --owner echeung1328 --url https://github.com/echeung1328/autoprint-dashboard/issues/N

# 3) 设 Sprint/Status/Priority（用步骤 4 的 mutation，ITEM_ID 从步骤 3 后查询得到）
# 4) 校验
gh issue view N --json number,state,labels,projectItems
```

------------------------------------------------------------------------

## 教训（来自 #20/#21 事件）

- `gh issue create` 默认**不会**加 label、不会加 Project、不会设 Sprint —— 这些都要显式做。
- 重复创建 issue 极易留下无法自动清理的孤儿（#20 既没 Project 也没 label，全靠人工发现）。
- 把 issue 编号写死在后续命令里是高危动作，必须从上一步输出解析。
