# Sprint 1 开发 Handoff 文档

> 本文档用于交给开发 Agent，包含所有必要的上下文和任务分解。
> 交付日期：2026-07-01 | Sprint 周期：2026-07-01 ~ 2026-07-14

---

## Sprint 基本信息

| 项目 | 内容 |
|------|------|
| **Sprint Goal** | 实现管理员审批界面，支持日期范围筛选仪表盘数据 |
| **周期** | 2026-07-01 ~ 2026-07-14（2 周）|
| **涉及 Issue** | #4 管理员审批用户注册 / #13 日期范围筛选器 |
| **代码仓库** | `echeung1328/autoprint-dashboard` master 分支 |
| **线上地址** | https://autoprintreport.netlify.app |
| **看板** | https://github.com/users/echeung1328/projects/1 |

---

## 技术上下文

### Supabase 配置

| 项目 | 说明 |
|------|------|
| **项目 ID** | `uvqjtvonxwsmhntnyest` |
| **区域** | `ap-southeast-2` |
| **Anon Key** | 已内嵌在 `index.html` 第 142 行 |
| **JS Client** | `@supabase/supabase-js@2.49.8`（CDN 引入）|

### 数据库表结构

**`profiles` 表**（用户审批表）：
```sql
id UUID PRIMARY KEY REFERENCES auth.users(id)
email TEXT
role TEXT DEFAULT 'viewer'  -- 'admin' 或 'viewer'
approved BOOLEAN DEFAULT false
approved_at TIMESTAMP
```

**`ReportAutoPrint` 表**（打印报告数据）：
```sql
id BIGSERIAL PRIMARY KEY
title TEXT
执行时间 TIMESTAMPTZ
总数 INTEGER
成功 INTEGER
失败 INTEGER
跳过 INTEGER
耗时分钟 INTEGER  -- GENERATED 列
```

### RLS 策略（重要！）

- `profiles` 表：仅本人可读，仅 `service_role` 可全权限写入
- `ReportAutoPrint` 表：仅 `approved=true` 的用户可读写
- **开发注意**：admin 用户读取 profiles 表需要确认 RLS 是否允许，若否需调整策略

### 现有代码架构（`index.html`）

单文件应用，关键函数和区域：

| 函数/区域 | 行号 | 用途 |
|-----------|------|------|
| `SUPABASE_URL` / `ANON_KEY` | 141-142 | Supabase 连接配置 |
| `checkApproval(user)` | 158-185 | 检查用户审批状态 |
| `showDashboard(user)` | 199-205 | 显示仪表盘主页面 |
| `loadData()` | 283-299 | **核心**：从 Supabase 加载数据 |
| `groupByDate(records)` | 301-315 | 按日期聚合数据 |
| `render(records)` | 317-341 | 渲染 KPI 卡片 + 触发图表 |
| `renderCharts(grouped)` | 343-367 | 渲染 3 个 Chart.js 图表 |
| `renderFailTable(grouped)` | 369-379 | 渲染失败记录明细表 |
| CSS 响应式 | 68 | `@media (max-width: 900px)` |

---

## Issue #4：管理员审批用户注册

### 用户故事

> **角色**：管理员（admin）
> **功能**：审批新用户注册申请
> **价值**：确保只有授权用户能访问系统

### 验收标准

```
Given 管理员已登录
When 管理员访问用户管理页面
Then 显示所有 pending 审批的用户（approved=false）
And 管理员可以批准或拒绝用户注册
```

### 任务分解（执行顺序）

#### Task 4.1：添加管理员导航入口（30min）
- **文件**：`index.html`
- **操作**：在 `.header-right` 区域（第 112-116 行）添加"用户管理"按钮
- **权限控制**：仅 `role=admin` 的用户可见（在 `showDashboard()` 中判断）
- **接受标准**：admin 用户能看到"用户管理"按钮，普通用户看不到

#### Task 4.2：创建用户审批列表页面（1h）
- **文件**：`index.html`（在 `dashboardPage` div 内添加新页面区域）
- **操作**：
  1. 添加 `#adminPage` div（初始 `display:none`）
  2. 读取 `profiles` 表，筛选 `approved=false` 的记录
  3. 渲染待审批用户列表（邮箱 + 注册时间 + 批准/拒绝按钮）
- **Supabase 查询**：
  ```js
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, created_at')
    .eq('approved', false)
    .order('created_at', { ascending: false });
  ```
- **接受标准**：列表显示所有待审批用户，无报错

#### Task 4.3：实现批准/拒绝功能（1h）
- **操作**：
  1. "批准"按钮：调用 Supabase 更新 `profiles` 表 `approved=true, approved_at=now()`
  2. "拒绝"按钮：调用 Supabase 删除 `profiles` 记录（或弹确认框）
  3. 操作后刷新列表
- **接受标准**：批准/拒绝操作后，用户从列表消失；被批准的用户可登录

#### Task 4.4：添加权限控制（仅 admin 可访问）（1h）
- **操作**：在 `checkApproval()` 或 `showDashboard()` 中获取用户 `role`
- **方式**：
  ```js
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  window.currentUserRole = profile?.role || 'viewer';
  ```
- **接受标准**：非 admin 用户点击"用户管理"无反应（或无权限提示）

#### Task 4.5：审批操作后刷新和提示（30min）
- **操作**：审批操作后显示 `alert()` 或更优雅的提示
- **接受标准**：用户知晓操作结果

---

## Issue #13：日期范围筛选器

### 用户故事

> **角色**：所有已登录用户
> **功能**：筛选指定日期范围内的报告数据
> **价值**：让用户聚焦查看特定时间段的数据

### 验收标准

```
Given 用户已登录并查看仪表盘
When 用户选择开始日期和结束日期，点击"筛选"
Then 仪表盘数据仅显示选定日期范围内的记录
And KPI 卡片、图表、失败明细表均同步更新
```

### 任务分解（执行顺序）

#### Task 13.1：添加日期选择器 UI（30min）
- **文件**：`index.html`
- **操作**：在 `#dashboardPage` 的 `.header` 下方、`.kpi-row` 上方添加筛选器区域
- **UI 元素**：
  ```html
  <div class="filter-bar">
    <label>开始日期 <input type="date" id="startDate"></label>
    <label>结束日期 <input type="date" id="endDate"></label>
    <button id="applyFilter" class="btn-primary" style="width:auto;padding:8px 20px;">筛选</button>
    <button id="resetFilter" class="btn-secondary" style="width:auto;padding:8px 20px;">重置</button>
  </div>
  ```
- **CSS**：添加到 `<style>` 标签，响应式适配
- **接受标准**：日期选择器在仪表盘顶部可见，移动端正常显示

#### Task 13.2：实现日期筛选逻辑（1h）
- **操作**：重写 `loadData()` 函数，支持可选日期参数
- **实现方式（前端筛选，优先）**：
  ```js
  async function loadData(startDate = null, endDate = null) {
    let query = supabase.from('ReportAutoPrint').select('*').order('执行时间', { ascending: true });
    if (startDate) query = query.gte('执行时间', startDate);
    if (endDate) query = query.lte('执行时间', endDate);
    // ... rest of existing logic
  }
  ```
- **接受标准**：选择日期范围后，数据仅包含该范围内记录

#### Task 13.3：筛选后重新计算 KPI 和图表（1h）
- **操作**：`applyFilter` 按钮点击后，调用 `loadData(startDate, endDate)`，然后重新 `render()`
- **注意**：`render()` 函数已接受 `records` 参数，无需大改
- **接受标准**：KPI 卡片显示筛选后数值，图表同步更新

#### Task 13.4：添加"重置筛选"按钮（15min）
- **操作**：`resetFilter` 按钮清空日期选择器，调用 `loadData()`（无参数）
- **接受标准**：重置后显示全部数据

---

## Definition of Done 检查清单

开发完成后，逐一确认：

- [ ] 功能符合各用户故事验收标准（见上）
- [ ] 代码已自测，无明显 Bug
- [ ] 浏览器兼容：Chrome、Edge 最新版本
- [ ] 响应式设计：375px / 768px / 1024px+ 正常显示
- [ ] 无控制台报错（Supabase 查询错误需 gracefully handle）
- [ ] 已提交到 GitHub（可直接在 Netlify 上手动触发部署验证）

---

## 风险与依赖

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| Supabase RLS 策略可能阻止非 admin 读取 profiles 表 | #4 审批页面无法显示待审批用户 | 在 `profiles` 表添加 RLS 策略：`USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))` |
| 日期筛选需要重新设计 `loadData()` | 影响范围较大 | 先实现前端筛选（在 JS 里过滤已加载数据），后续优化为后端筛选 |
| admin 用户角色判断逻辑 | 若 profiles 表读取失败会误判 | 在 `checkApproval()` 里一并获取 role，失败时有降级处理 |

---

## 开发提示词（直接复制给开发 Agent）

```
请帮我完成 AutoPrint 项目的 Sprint 1 开发任务。

## 背景
- 代码仓库：echeung1328/autoprint-dashboard (master 分支)
- 当前只有一个 index.html 文件（单页应用）
- 技术栈：Supabase + Vanilla JS + Chart.js
- Supabase 项目 ID：uvqjtvonxwsmhntnyest

## 任务 1：Issue #4 管理员审批用户注册
验收标准：管理员登录后，能看到待审批用户列表，并批准/拒绝

具体子任务：
1. 在仪表盘 header 添加"用户管理"入口按钮（仅 admin 可见）
2. 创建审批列表页面，读取 profiles 表（approved=false）
3. 实现批准/拒绝按钮，更新 profiles.approved 字段
4. 添加权限控制（仅 admin 可访问）
5. 添加操作后的提示

## 任务 2：Issue #13 日期范围筛选器
验收标准：用户选择日期范围后，仪表盘数据同步更新

具体子任务：
1. 在仪表盘顶部添加开始/结束日期选择器和筛选/重置按钮
2. 修改 loadData() 函数支持日期参数（调用 Supabase 时加 .gte() 和 .lte()）
3. 筛选后重新渲染 KPI 卡片、图表、失败明细表
4. 重置按钮清除筛选，恢复全部数据

## 技术要求
- 修改 index.html  single file（保持单文件架构）
- Supabase anon key 已内嵌，无需额外配置
- 注意 Supabase RLS 策略：profiles 表读取可能需要 admin 权限
- 若 RLS 阻止读取 profiles，需要先在 Supabase SQL Editor 执行：
  CREATE POLICY "Admins can read all profiles" ON profiles FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

## 完成后
- 在 GitHub Project 看板将 #4 和 #13 状态更新为 "In Review"
- 推送代码到 master 分支（触发 Netlify 自动部署）
- 在 https://autoprintreport.netlify.app 验证功能
```

---

## 完成后更新看板

开发完成后，让 Agent 执行：

```
请将 GitHub Project 看板中的 Issue #4 和 #13 状态更新为 "In Review"
（Sprint Status 字段，single select option ID: 32d1c4ec）
```

---

*Handoff 创建时间*：2026-07-01
*Sprint*：Sprint-2026-07-01
*下一步*：开发 Agent 接收此文档后，按任务分解逐步实施
