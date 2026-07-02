# AutoPrint 系统 - API 与集成指南 v1.0

**文档版本**: V1.0  
**创建日期**: 2026-06-30  
**作者**: 高级开发工程师  
**审核**: 待审核  

---

## 修订历史

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|----------|------|
| V1.0 | 2026-06-30 | 初始版本 | 高级开发工程师 |

---

## 目录

1. 概述
2. Supabase API 使用指南
3. 前端集成示例
4. 后端集成示例
5. 常见场景与代码示例
6. 错误处理与调试
7. 安全最佳实践
8. 性能优化建议

---

## 1. 概述

本文档提供 AutoPrint 系统与 Supabase 后端集成的详细指南，包括：
- Supabase JavaScript SDK 使用方法
- RESTful API 调用示例
- 实时订阅功能实现
- 存储桶（Storage）使用方法
- 常见业务场景的代码实现

**目标读者**: 前端开发者、后端开发者、系统集成工程师

---

## 2. Supabase API 使用指南

### 2.1 安装与初始化

#### 2.1.1 CDN 引入（推荐用于静态HTML页面）

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  const { createClient } = supabaseJs;
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
</script>
```

#### 2.1.2 NPM 安装（推荐用于现代前端项目）

```bash
npm install @supabase/supabase-js
```

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uvqjtvonxwsmhntnyest.supabase.co';
const supabaseKey = 'your-anon-key';
const supabase = createClient(supabaseUrl, supabaseKey);
```

### 2.2 认证操作

#### 2.2.1 邮箱密码注册

```javascript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
});
```

**返回示例**:
```json
{
  "data": {
    "user": {
      "id": "707eeeab-ed0b-44d9-9341-59ff558ccbb8",
      "email": "user@example.com",
      "created_at": "2026-06-30T10:00:00.000Z"
    },
    "session": null
  },
  "error": null
}
```

#### 2.2.2 邮箱密码登录

```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123',
});
```

#### 2.2.3 魔法链接登录

```javascript
const { data, error } = await supabase.auth.signInWithOtp({
  email: 'user@example.com',
});
```

#### 2.2.4 登出

```javascript
const { error } = await supabase.auth.signOut();
```

#### 2.2.5 获取当前用户

```javascript
const { data: { user } } = await supabase.auth.getUser();
```

#### 2.2.6 监听认证状态变化

```javascript
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth event:', event);
  if (event === 'SIGNED_IN') {
    // 用户登录
  } else if (event === 'SIGNED_OUT') {
    // 用户登出
  }
});
```

### 2.3 数据库操作（ReportAutoPrint 表）

#### 2.3.1 查询数据（SELECT）

**基础查询**:
```javascript
const { data, error } = await supabase
  .from('ReportAutoPrint')
  .select('*');
```

**带条件查询**:
```javascript
const { data, error } = await supabase
  .from('ReportAutoPrint')
  .select('Title, 执行时间, 总数, 成功, 失败')
  .eq('失败', 0)  // 只查成功的
  .order('执行时间', { ascending: false })
  .limit(10);
```

**模糊查询**:
```javascript
const { data, error } = await supabase
  .from('ReportAutoPrint')
  .select('*')
  .ilike('Title', '%AutoPrint%');  // 标题包含 AutoPrint
```

**日期范围查询**:
```javascript
const { data, error } = await supabase
  .from('ReportAutoPrint')
  .select('*')
  .gte('执行时间', '2026-06-01')
  .lte('执行时间', '2026-06-30');
```

**分页查询**:
```javascript
const pageSize = 20;
const page = 1;

const { data, error, count } = await supabase
  .from('ReportAutoPrint')
  .select('*', { count: 'exact' })
  .range((page - 1) * pageSize, page * pageSize - 1);
```

#### 2.3.2 插入数据（INSERT）

```javascript
const { data, error } = await supabase
  .from('ReportAutoPrint')
  .insert([
    {
      'Title': 'AutoPrint-2026-06-30 09:30',
      '执行时间': '2026-06-30T09:30:00+08:00',
      '总数': 100,
      '成功': 98,
      '跳过': 1,
      '失败': 1,
      '完成时间': '2026-06-30T10:05:00+08:00',
      '附件Excel表格': true,
      '任务完成通知邮件': true,
      'Created': '2026-06-30T10:10:00+08:00',
      '标签': '工作流运行失败'
    }
  ])
  .select();  // 返回插入的数据
```

#### 2.3.3 更新数据（UPDATE）

```javascript
const { data, error } = await supabase
  .from('ReportAutoPrint')
  .update({ '标签': '已修复' })
  .eq('id', 123)
  .select();
```

#### 2.3.4 删除数据（DELETE）

```javascript
const { error } = await supabase
  .from('ReportAutoPrint')
  .delete()
  .eq('id', 123);
```

### 2.4 用户审批管理（profiles 表）

#### 2.4.1 查询用户审批状态

```javascript
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId)
  .single();
```

#### 2.4.2 管理员批准用户（需要 service_role key）

```javascript
// 注意：此操作需要 service_role key，只能在后端执行
const supabaseAdmin = createClient(supabaseUrl, SERVICE_ROLE_KEY);

const { data, error } = await supabaseAdmin
  .from('profiles')
  .update({
    approved: true,
    approved_at: new Date().toISOString(),
    approved_by: adminUserId
  })
  .eq('id', userId);
```

### 2.5 实时订阅（Realtime）

#### 2.5.1 监听表数据变化

```javascript
// 监听 ReportAutoPrint 表的所有插入操作
const subscription = supabase
  .channel('public:ReportAutoPrint')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'ReportAutoPrint'
  }, (payload) => {
    console.log('New record inserted:', payload.new);
    // 更新前端显示
  })
  .subscribe();
```

#### 2.5.2 监听特定条件的变化

```javascript
const subscription = supabase
  .channel('public:ReportAutoPrint:失败=gt.0')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'ReportAutoPrint',
    filter: '失败=gt.0'  // 只监听失败数大于0的记录
  }, (payload) => {
    console.log('New failure record:', payload.new);
    // 发送通知
  })
  .subscribe();
```

#### 2.5.3 取消订阅

```javascript
supabase.removeChannel(subscription);
```

---

## 3. 前端集成示例

### 3.1 完整的登录页面实现

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>AutoPrint - 登录</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>
  <div id="loginForm">
    <input type="email" id="email" placeholder="邮箱">
    <input type="password" id="password" placeholder="密码">
    <button onclick="login()">登录</button>
    <button onclick="sendMagicLink()">发送魔法链接</button>
  </div>

  <div id="dashboard" style="display:none;">
    <!-- 看板内容 -->
  </div>

  <script>
    const supabase = supabaseJs.createClient(
      'https://uvqjtvonxwsmhntnyest.supabase.co',
      'your-anon-key'
    );

    // 检查登录状态
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // 检查审批状态
        const { data: profile } = await supabase
          .from('profiles')
          .select('approved')
          .eq('id', user.id)
          .single();
        
        if (profile.approved) {
          showDashboard();
        } else {
          showPendingPage();
        }
      }
    }

    // 密码登录
    async function login() {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        alert('登录失败: ' + error.message);
      } else {
        checkAuth();
      }
    }

    // 魔法链接登录
    async function sendMagicLink() {
      const email = document.getElementById('email').value;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: 'https://autoprintreport.netlify.app'
        }
      });

      if (error) {
        alert('发送失败: ' + error.message);
      } else {
        alert('魔法链接已发送到您的邮箱，请查收！');
      }
    }

    // 页面加载时检查登录状态
    checkAuth();
  </script>
</body>
</html>
```

### 3.2 数据加载与展示

```javascript
// 从 Supabase 加载数据并渲染图表
async function loadDashboardData() {
  // 1. 获取所有记录
  const { data: records, error } = await supabase
    .from('ReportAutoPrint')
    .select('*')
    .order('执行时间', { ascending: true });

  if (error) {
    console.error('数据加载失败:', error);
    return;
  }

  // 2. 处理数据
  const dailyStats = processData(records);

  // 3. 渲染图表
  renderCharts(dailyStats);

  // 4. 渲染表格
  renderTable(records);
}

// 数据处理示例
function processData(records) {
  const dailyMap = {};

  records.forEach(record => {
    const date = new Date(record['执行时间']).toISOString().split('T')[0];
    
    if (!dailyMap[date]) {
      dailyMap[date] = {
        total: 0,
        success: 0,
        fail: 0,
        durationSum: 0,
        durationCount: 0
      };
    }

    dailyMap[date].total += record['总数'] || 0;
    dailyMap[date].success += record['成功'] || 0;
    dailyMap[date].fail += record['失败'] || 0;
    
    if (record['耗时分钟']) {
      dailyMap[date].durationSum += record['耗时分钟'];
      dailyMap[date].durationCount++;
    }
  });

  return dailyMap;
}
```

---

## 4. 后端集成示例

### 4.1 Node.js 后端（Express）

```javascript
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // 使用 service_role key
);

app.use(express.json());

// 中间件：验证用户已登录且已批准
async function requireApprovedUser(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('approved')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.approved) {
    return res.status(403).json({ error: 'User not approved' });
  }

  req.user = user;
  next();
}

// API：获取所有记录
app.get('/api/reports', requireApprovedUser, async (req, res) => {
  const { data, error } = await supabase
    .from('ReportAutoPrint')
    .select('*')
    .order('执行时间', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// API：创建新记录（AutoPrint 自动调用）
app.post('/api/reports', async (req, res) => {
  const record = req.body;

  const { data, error } = await supabase
    .from('ReportAutoPrint')
    .insert([record])
    .select();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### 4.2 Python 后端（Flask）

```python
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
import os

app = Flask(__name__)
CORS(app)

supabase: Client = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)

@app.route('/api/reports', methods=['GET'])
def get_reports():
    # 获取当前用户（从 Authorization header）
    token = request.headers.get('Authorization', '').split(' ')[1]
    
    if not token:
        return jsonify({'error': 'Unauthorized'}), 401
    
    # 验证用户
    user = supabase.auth.get_user(token)
    if not user:
        return jsonify({'error': 'Invalid token'}), 401
    
    # 查询数据
    response = supabase.table('ReportAutoPrint').select('*').execute()
    
    return jsonify(response.data)

@app.route('/api/reports', methods=['POST'])
def create_report():
    record = request.json
    
    response = supabase.table('ReportAutoPrint').insert(record).execute()
    
    return jsonify(response.data)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

---

## 5. 常见场景与代码示例

### 5.1 场景1：AutoPrint 执行完成后自动写入 Supabase

```javascript
// AutoPrint 执行脚本（Node.js）
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // 后端使用 service_role key
);

async function savePrintResult(result) {
  const { data, error } = await supabase
    .from('ReportAutoPrint')
    .insert([{
      'Title': result.title,
      '执行时间': result.startTime,
      '总数': result.total,
      '成功': result.success,
      '跳过': result.skipped,
      '失败': result.failed,
      '完成时间': result.endTime,
      '附件Excel表格': result.hasAttachment,
      '任务完成通知邮件': result.notificationSent,
      '标签': result.tags
    }])
    .select();

  if (error) {
    console.error('保存失败:', error);
  } else {
    console.log('保存成功:', data[0].id);
    
    // 如果有失败，发送通知
    if (result.failed > 0) {
      await sendFailureNotification(result);
    }
  }
}
```

### 5.2 场景2：定时任务同步数据到 Supabase

```javascript
// 使用 node-cron 定时同步
const cron = require('node-cron');

// 每天凌晨2点同步昨天的数据
cron.schedule('0 2 * * *', async () => {
  console.log('开始同步数据...');
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  
  // 从本地数据库或API获取数据
  const records = await fetchLocalData(dateStr);
  
  // 批量插入 Supabase
  const { data, error } = await supabase
    .from('ReportAutoPrint')
    .insert(records);
  
  if (error) {
    console.error('同步失败:', error);
  } else {
    console.log(`同步成功: ${records.length} 条记录`);
  }
});
```

### 5.3 场景3：导出数据为 Excel

```javascript
import * as XLSX from 'xlsx';

async function exportToExcel() {
  // 1. 从 Supabase 获取数据
  const { data, error } = await supabase
    .from('ReportAutoPrint')
    .select('*')
    .order('执行时间', { ascending: false });

  if (error) {
    console.error('数据获取失败:', error);
    return;
  }

  // 2. 转换数据格式
  const exportData = data.map(record => ({
    '标题': record.Title,
    '执行时间': new Date(record['执行时间']).toLocaleString('zh-CN'),
    '总数': record['总数'],
    '成功': record['成功'],
    '跳过': record['跳过'],
    '失败': record['失败'],
    '完成时间': new Date(record['完成时间']).toLocaleString('zh-CN'),
    '耗时(分钟)': record['耗时分钟'],
    '标签': record['标签']
  }));

  // 3. 生成 Excel
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '执行报告');

  // 4. 下载
  XLSX.writeFile(wb, `AutoPrint_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
}
```

---

## 6. 错误处理与调试

### 6.1 常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 401 | Unauthorized | 检查用户是否登录，token 是否过期 |
| 403 | Forbidden | 检查 RLS 策略，用户是否已批准 |
| 404 | Not Found | 检查表名、字段名是否正确 |
| 409 | Conflict | 唯一约束冲突，检查重复数据 |
| 500 | Internal Server Error | 检查 Supabase 服务状态，查看日志 |

### 6.2 调试技巧

```javascript
// 1. 启用详细日志
const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: {
    debug: true  // 启用认证调试日志
  },
  db: {
    schema: 'public'
  }
});

// 2. 捕获并记录所有错误
async function safeQuery(query) {
  try {
    const { data, error } = await query;
    
    if (error) {
      console.error('Supabase Error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      throw error;
    }
    
    return data;
  } catch (err) {
    console.error('Unexpected error:', err);
    throw err;
  }
}

// 3. 使用 Supabase 仪表盘查看日志
// 访问: https://supabase.com/dashboard/project/[REF]/logs
```

---

## 7. 安全最佳实践

### 7.1 API Key 管理

**✅ 推荐做法**:
```javascript
// 前端：只使用 anon key
const supabase = createClient(SUPABASE_URL, ANON_KEY);

// 后端：使用 service_role key，并从环境变量读取
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

**❌ 错误做法**:
```javascript
// 不要在前端代码中硬编码 service_role key！
const supabase = createClient(URL, SERVICE_ROLE_KEY);  // 危险！
```

### 7.2 行级安全（RLS）策略

**始终启用 RLS**:
```sql
ALTER TABLE "ReportAutoPrint" ENABLE ROW LEVEL SECURITY;
```

**使用认证检查**:
```sql
-- 正确的策略
CREATE POLICY "Users can read own data"
  ON "ReportAutoPrint" FOR SELECT
  USING (auth.uid() = user_id);

-- 错误的策略（过于宽松）
CREATE POLICY "Allow all"
  ON "ReportAutoPrint" FOR ALL
  USING (true);  -- 危险！
```

### 7.3 输入验证

```javascript
// 前端验证
function validateRecord(record) {
  if (!record.Title || record.Title.length > 255) {
    throw new Error('标题无效');
  }
  
  if (record['总数'] < 0 || record['成功'] < 0) {
    throw new Error('数量不能为负数');
  }
  
  if (record['成功'] > record['总数']) {
    throw new Error('成功数不能大于总数');
  }
  
  return true;
}

// 后端验证（使用 Supabase 数据库约束）
-- 添加 CHECK 约束
ALTER TABLE "ReportAutoPrint"
  ADD CONSTRAINT check_success_leq_total
  CHECK ("成功" <= "总数");
```

---

## 8. 性能优化建议

### 8.1 数据库查询优化

```javascript
// ✅ 只查询需要的字段
const { data } = await supabase
  .from('ReportAutoPrint')
  .select('Title, 执行时间, 总数, 成功');  // 好

// ❌ 避免查询所有字段
const { data } = await supabase
  .from('ReportAutoPrint')
  .select('*');  // 慢，尤其是大表
```

### 8.2 分页加载

```javascript
// 实现无限滚动
let page = 0;
const PAGE_SIZE = 20;

async function loadMore() {
  const { data, error } = await supabase
    .from('ReportAutoPrint')
    .select('*')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  
  // 渲染数据...
  
  page++;
}
```

### 8.3 使用索引

```sql
-- 为常用查询字段创建索引
CREATE INDEX idx_execution_time ON "ReportAutoPrint" ("执行时间" DESC);
CREATE INDEX idx_tags ON "ReportAutoPrint" USING GIN (to_tsvector('chinese', "标签"));
```

### 8.4 缓存策略

```javascript
// 前端缓存
const cache = new Map();

async function getCachedData(key, fetchFn, ttl = 60000) {
  const cached = cache.get(key);
  
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }
  
  const data = await fetchFn();
  cache.set(key, { data, timestamp: Date.now() });
  
  return data;
}

// 使用
const reports = await getCachedData(
  'reports',
  () => supabase.from('ReportAutoPrint').select('*'),
  5 * 60 * 1000  // 缓存5分钟
);
```

---

## 9. 附录

### 9.1 完整的环境变量列表

```bash
# .env 文件示例
SUPABASE_URL=https://uvqjtvonxwsmhntnyest.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 前端只能使用 ANON_KEY
# 后端可以使用 SERVICE_ROLE_KEY（小心保管！）
```

### 9.2 相关链接

- **Supabase 官方文档**: https://supabase.com/docs
- **JavaScript SDK 文档**: https://supabase.com/docs/reference/javascript/introduction
- **Supabase 管理后台**: https://supabase.com/dashboard/project/uvqjtvonxwsmhntnyest
- **AutoPrint 看板**: https://autoprintreport.netlify.app
- **GitHub 仓库**: https://github.com/echeung1328/autoprint-dashboard

---

**文档结束**

*本文档为 AutoPrint 系统 API 与集成指南，如有疑问请联系开发团队。*
