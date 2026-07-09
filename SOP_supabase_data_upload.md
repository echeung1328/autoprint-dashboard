# SOP — 通过 Supabase MCP 上传/更新结构化数据到 Postgres 表

> **文档名称**：Supabase MCP 数据上传技能 SOP（操作手册）
> **版本**：v1.1（含 INSERT 与 UPDATE / upsert 双流程）
> **适用技能**：`supabase-mcp-data-upload`
> **适用对象**：ReportAutoPrint 月报数据（项目 `uvqjtvonxwsmhntnyest`，表 `public.ReportAutoPrint`），方法论可推广至其他表
> **维护人**：Eric Zhang
> **最后更新**：2026-07-08

---

## 1. 目的（Purpose）
规范使用 **Supabase 官方 MCP 服务器** 将结构化数据文件（CSV / XLSX / JSON）**上传或更新**到 Supabase Postgres 表的标准作业流程，确保：
- 前置条件就绪、连接可用；
- 数据清洗与冲突判定有章可循；
- 执行具备**原子性**与**可回退性**（零残留）；
- 结果**可验证**；
- 流程可**跨会话复用**并用于**培训**。

## 2. 适用范围（Scope）
| 适用 | 不适用 |
|---|---|
| 数据首次导入、补传遗漏、修正已有记录（insert or update） | 直连生产库（官方建议仅用 dev/test） |
| 中小数据量（数百~数千行）逐批写入 | 超大数据量（十万行+）— 建议用 Supabase 原生 CSV 导入 |
| 单表写入 | 跨多表事务型复杂迁移 |

## 3. 角色与职责（Roles）
- **操作人（用户）**：提供数据源文件、确认清洗/更新策略、最终授权执行。
- **执行助理（AI Agent）**：严格按本 SOP 走「前置检查 → 清洗 → 冲突检测 → 执行 → 校验」，发现数据质量异常**先询问，不擅自写入**。

## 4. 前置条件（Prerequisites）— 仅需做一次
1. Supabase MCP 已在 WorkBuddy **Trust + OAuth 登录**。
   - 验证：问助理「列出我的 Supabase 项目」，若返回项目列表即 OK；否则：
   - 右上角 **连接器 → 自定义连接器 → 找到 `supabase` → Trust → 浏览器完成 OAuth 授权**。
   - 远程 MCP 地址：`https://mcp.supabase.com/mcp`（可加 `?project_ref=<项目ID>` 限定单项目）。
2. 目标表与项目已知（本任务固定：`uvqjtvonxwsmhntnyest` / `public.ReportAutoPrint`）。

## 5. 操作流程（Procedure）

### 5.1 触发技能（3 种说法任选）
| 方式 | 示例 |
|---|---|
| 中文斜杠命令 | `/supabase-mcp-data-upload 上传此数据源 @"D:/路径/文件.xlsx"` |
| 英文斜杠命令 | `/supabase-mcp-data-upload upload this data source @"<path>"` |
| 自然语言 | 「帮我把 xxx.xlsx 上传到 Supabase 的 ReportAutoPrint 表」并 @ 引用文件 |

> 若是**更新/修正**已有数据，明确说「更新（insert or update）」并加「更新前请和我先确认」。

### 5.2 前置检查（Pre-flight）— 必做，不可跳过
**5.2.1 确认 MCP 连通**
- `ToolSearch` 查 `mcp__supabase__list_projects` / `mcp__supabase__execute_sql`；若缺失，回到 §4 重新 Trust。

**5.2.2 描述目标表结构**
```sql
SELECT column_name, data_type, is_nullable, column_default, is_generated
FROM information_schema.columns
WHERE table_name='<TABLE>' AND table_schema='public' ORDER BY ordinal_position;
```
- `is_generated='ALWAYS'` 的列（如本表 `耗时分钟`）→ **绝不**写入，由库自动计算。
- NOT NULL 且无默认值的列 → 必须提供。

**5.2.3 检查 RLS 策略（关键风险点）**
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE tablename='<TABLE>';
```
- 若策略要求 `profiles.approved=true` 的已批准用户，则执行账户须为 approved；否则 INSERT/UPDATE 会被 RLS 拒绝。
- 规避：用**单条原子语句**执行——RLS 要么全过要么全拒，**失败不产生任何残留**。

### 5.3 读取与清洗源文件
**5.3.1 读取**：XLSX 用 `openpyxl`（托管 Python 已含）；CSV/JSON 用标准库。
**5.3.2 双语列映射（大小写不敏感，按关键词模糊匹配）**：
- `标题`/`title` → `Title`；`执行时间`/`start` → `执行时间`；`完成时间`/`end` → `完成时间`；
- `创建时间`/`created` → `Created`；`总数`/`total` → `总数`；`成功`/`success` → `成功`；
- `跳过`/`skip` → `跳过`；`失败`/`fail` → `失败`；`附件`/`attach` → `附件Excel表格`；
- `邮件`/`mail`/`notify` → `任务完成通知邮件`；`标签`/`tag` → `标签`。
- **忽略源文件中的 `ID` 列**（表 id 为自增）。

**5.3.3 时间戳解析**：统一为 `YYYY-MM-DDTHH:MM:SS+08:00`（假定源为本地 +08）。
- 支持格式：`%Y-%m-%d %H:%M`、`%Y/%m/%d %H:%M`、`%m/%d/%Y %I:%M %p`、`%Y%m%d %H%M`、`%Y年%m月%d日 %H:%M`、Excel datetime。
- 解析失败必须**标注告警**，不得静默。

**5.3.4 剔除**：空行、表头串入的垃圾标题（如 `AutoPrint-执行时间`、`执行时间`）。

**5.3.5 复合键去重（极易踩坑）**：
- 按 **`(Title + 执行时间)`** 联合去重，**绝不**只按 Title 去重。
- 原因：`每日报销单据打印` 这类标题在不同日期会重复出现，属正常独立运行，必须全部保留；只有 Title 与 执行时间都相同时才是真重复（漏发重发），才剔除。

### 5.4 冲突检测（Conflict detection）
1. 先按 Title 粗查：
```sql
SELECT "Title", COUNT(*) FROM "<TABLE>" WHERE "Title" IN (...) GROUP BY "Title";
```
2. 对命中的 Title，再用 `(Title, 执行时间)` 精细比对，区分「真重复」与「同标题不同运行」：
```sql
SELECT "执行时间" FROM "<TABLE>" WHERE "Title"='<TITLE>';
```
- **真重复** = Title 与 执行时间 都命中已有行 → 跳过（或 UPDATE）。
- **同标题不同运行** = Title 命中但 执行时间 不同 → 保留为新增。

### 5.5 决策：INSERT 还是 UPDATE（Upsert 判定）— 关键决策点
对源文件**每一行**，按复合键 `(Title + 执行时间)` 查询目标表：
- **命中（唯一匹配）** → 该行为 **UPDATE**（修正已有记录）。
- **未命中** → 该行为 **INSERT**（新增记录）。
- 同一文件可能**混合**：部分行 UPDATE、部分行 INSERT。

> 由于本表**无唯一约束**，无法用 `ON CONFLICT DO UPDATE`，UPDATE 必须用 `WHERE "Title"=... AND "执行时间"=...` 精确定位。

### 5.6 执行（单条原子语句）

**5.6.1 INSERT 模式（新增）**
```sql
INSERT INTO "<TABLE>" ("Title","执行时间","完成时间","Created","总数","成功","跳过","失败","附件Excel表格","任务完成通知邮件","标签","CreatedBy")
VALUES
 ('...',...,'AUTOUPLOAD_YYYYMM'),
 ('...',...,'AUTOUPLOAD_YYYYMM');
```
- 必须带 **回退标签列** `CreatedBy='<BATCH_TAG>'`。

**5.6.2 UPDATE 模式（修正已有）**
```sql
UPDATE "<TABLE>"
SET "完成时间" = '2026-03-19T09:34:00+08:00'   -- 仅改需修正的字段
WHERE "Title" = 'AutoPrint-2026-03-19T01:30:00Z'
  AND "执行时间" = '2026-03-19T09:30:00+08:00';
```
- 生成列（如 `耗时分钟`）随所改字段**自动重算**，无需手动写。
- `CreatedBy` 建议**保持不变**，使原批次回退仍覆盖该行。

### 5.7 校验（Verify）— 执行后立即做
```sql
-- 总行数 + 本批条数
SELECT (SELECT COUNT(*) FROM "<TABLE>") AS total,
       (SELECT COUNT(*) FROM "<TABLE>" WHERE "CreatedBy"='<BATCH_TAG>') AS batch;
-- 抽样：确认生成列算对、数值与源一致
SELECT "Title","总数","成功","失败","耗时分钟"
FROM "<TABLE>" WHERE "CreatedBy"='<BATCH_TAG>' ORDER BY "执行时间" LIMIT 8;
```
- INSERT：本批 `batch` 应等于源清洗后行数，总行数相应增加。
- UPDATE：表总行数**不变**，仅被改字段与生成列变化。

### 5.8 回退（Rollback）
- **INSERT 批次**：一键撤销
  ```sql
  DELETE FROM "<TABLE>" WHERE "CreatedBy"='<BATCH_TAG>';
  ```
- **UPDATE 行**：用执行前记录的旧值还原（见 §6 / 计划文件 ROLLBACK 段），例如：
  ```sql
  UPDATE "<TABLE>" SET "完成时间"='2026-03-19T10:49:00+08:00'
  WHERE "Title"='AutoPrint-2026-03-19T01:30:00Z' AND "执行时间"='2026-03-19T09:30:00+08:00';
  ```

## 6. 已知批次标签（Batch tags）— 回退/核对参考
| 标签 | 内容 | 条数 |
|---|---|---|
| `AUTOUPLOAD_20260501` | 2026年5月 | 21 |
| `AUTOUPLOAD_202604` | 2026年4月 + 部分7月 | 26 |
| `AUTOUPLOAD_202603` | 2026年3月（含1处完成时间笔误修正 07→03） | 18 |
| `AUTOUPLOAD_20260708ADD` | 补传遗漏（03-27/03-30/06-30） | 3 |

- 当前表累计约 **91 行**。
- **新批次务必另起新标签**（如 `AUTOUPLOAD_202608`），禁止复用历史标签，避免回退误删。

## 7. 疑难排查（Troubleshooting）
| 现象 | 原因 / 处理 |
|---|---|
| 工具找不到 `mcp__supabase__*` | MCP 未 Trust / 未 OAuth → 回 §4 |
| INSERT/UPDATE 返回权限拒绝 | RLS 要求 approved 用户 → 确认执行账户在 `profiles` 中为 approved |
| `耗时分钟` 算出几万分钟 | 源文件 `完成时间` 年份/月份笔误 → 修正后重传或 UPDATE |
| 同标题记录被误删 | 去重用了 Title 单列 → 改回 `(Title+执行时间)` 复合键 |
| 时间戳差 8 小时 | 未带 `+08:00` 偏移 → 写入时显式加时区 |
| 部分行重复写入 | 未做冲突检测 → 执行前先 §5.4 |

## 8. 培训检查清单（Training checklist）
- [ ] 能说出 MCP 前置条件（Trust + OAuth）验证方法
- [ ] 能写出「描述表结构」SQL 并识别生成列
- [ ] 能解释为何要查 RLS 策略
- [ ] 能说明「复合键去重」与「Title 单列去重」的区别
- [ ] 能判断某行该 INSERT 还是 UPDATE（upsert 决策）
- [ ] 能写出带 `CreatedBy` 回退标签的 INSERT
- [ ] 能写出按复合键定位的 UPDATE
- [ ] 能执行校验（COUNT + 抽样）并解读结果
- [ ] 能使用批次标签做回退

## 附录 A：数据质量规则（Data quality rules）
1. 剔除表头串入的垃圾标题（`AutoPrint-执行时间` 等）。
2. 完成时间年份/月份明显错误的（如 3 月任务写成 7 月）→ 修正后再写，否则生成列荒谬。
3. 源 `创建时间` 往往是**导出时间**而非任务实际时间，默认原样保留；若用户要求改实际日期，另行 UPDATE。
4. 布尔值 `TRUE/FALSE` 与整数 `总数/成功` 必须与源一致，校验时逐行抽查。

## 附录 B：关键 SQL 模板速查
```sql
-- 描述表
SELECT column_name, data_type, is_generated FROM information_schema.columns
WHERE table_name='<T>' AND table_schema='public' ORDER BY ordinal_position;

-- RLS 策略
SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='<T>';

-- 冲突粗检
SELECT "Title", COUNT(*) FROM "<T>" WHERE "Title" IN (...) GROUP BY "Title";

-- upsert 判定（单行是否命中）
SELECT 1 FROM "<T>" WHERE "Title"='<T>' AND "执行时间"='<TS>';

-- 校验
SELECT COUNT(*) FROM "<T>" WHERE "CreatedBy"='<TAG>';

-- 回退（整批）
DELETE FROM "<T>" WHERE "CreatedBy"='<TAG>';
```
