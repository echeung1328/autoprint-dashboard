# comlan-ppt-brand Skill — Handoff 文档

**项目**: AutoPrint 部署运维手册 PPT 生成  
**当前版本**: v1.6 (线条溢出修复版)  
**状态**: ✅ 表格+线条均不溢出，待用户最终确认  
**交接日期**: 2026-07-03  
**交接人**: Senior Developer (吴八哥)

---

## 一、当前状态（Current State）

### 1.1 已完成 ✅

- [x] PPT 生成脚本（Node.js + pptxgenjs）
- [x] 11 张幻灯片（封面、目录、概述、部署架构、部署流程、环境变量、监控告警、备份恢复、问题排查、应急响应、附录）
- [x] 品牌规范应用（克莱因蓝 `#002FA7` + 浅蓝 `#00C3FF`）
- [x] 表格溢出问题修复（v1.0 → v1.5，6 次迭代）
- [x] 线条溢出问题修复（v1.6）
- [x] `drawTable()` 手绘表格函数（可复用）
- [x] SAFE 常量对象（统一安全边界）

### 1.2 待确认 ⏳

- [ ] 用户确认 v1.6 线条是否还溢出
- [ ] 用户确认整体布局是否满意
- [ ] 是否需要调整字体大小/颜色/间距

### 1.3 已知问题 ⚠️

| 问题 | 严重程度 | 状态 | 解决方案 |
|------|---------|------|---------|
| 表格内文字可能过小（9pt） | 中 | 待用户反馈 | 调整 fontSize 参数 |
| 封面页标题文字框宽度（9"）可能太窄 | 低 | 待用户反馈 | 调整 SAFE.maxW |
| 页码位置（x: 9.3）可能太靠右 | 低 | 待用户反馈 | 调整 addPg() 函数 |

---

## 二、关键文件位置（File Locations）

### 2.1 生成脚本

| 文件 | 路径 | 说明 |
|------|------|------|
| 当前版本 | `C:\Users\Eric Zhang\.workbuddy\skills\comlan-ppt-brand\generate_v16.js` | v1.6 最终版 |
| 输出文件 | `C:\Users\Eric Zhang\.workbuddy\skills\comlan-ppt-brand\AutoPrint_部署运维手册_v1.6_线条修复版.pptx` | 最新输出 |
| Skill 文档 | `C:\Users\Eric Zhang\.workbuddy\skills\comlan-ppt-brand\SKILL.md` | 品牌规范 + 踩坑经验 |

### 2.2 项目文档

| 文件 | 路径 | 说明 |
|------|------|------|
| 经验教训 | `D:\WBStorage\Projects\AutoPrint\docs\comlan-ppt-brand_经验教训_2026-07-03.md` | 本文档的姊妹篇 |
| 工作日志 | `D:\WBStorage\Projects\AutoPrint\.workbuddy\memory\2026-07-03.md` | 详细迭代记录 |
| 品牌规范 | `D:\WBStorage\Projects\AutoPrint\docs\PPT品牌规范提示词_v1.0.md` | 品牌规范提示词 |

### 2.3 输入文件

| 文件 | 路径 | 说明 |
|------|------|------|
| Word 文档 | `D:\WBStorage\Projects\AutoPrint\AutoPrint_部署运维手册_v1.0.docx` | PPT 内容来源 |

---

## 三、核心代码模式（Critical Code Patterns）

### 3.1 SAFE 常量对象（必须遵守）

```javascript
// 位置：generate_v16.js

const SAFE = {
    x: 0.4,           // 左边距
    maxW: 9.5,        // 最大内容宽度（含线条、标题、表格等）
    rightBound: 9.9   // 绝对右边界 (x + maxW)
};
```

**使用规则**：
- 所有横向元素（线条、标题、文字框、表格）的 `x + w` 必须 ≤ `SAFE.rightBound`
- 示例：`slide.addShape('line', { x: SAFE.x, y: 0.95, w: SAFE.maxW, ... })`

### 3.2 drawTable() 手绘表格函数

```javascript
// 位置：generate_v16.js
// 用途：替代 addTable()，100% 精确控制列宽

function drawTable(slide, x, y, totalW, colHeaders, dataRows, opts = {}) {
    const {
        fontSize = 9,
        headerFontSize = 10,
        rowH = 0.48,
        headerH = 0.45,
        colPercents = null,      // 百分比数组 [20, 30, 25, 25]
        paddingX = 0.06,
        paddingY = 0.01
    } = opts;

    // ... 实现细节参见 generate_v16.js
}
```

**调用示例**：
```javascript
drawTable(slide, SAFE.x, 1.2, SAFE.maxW,
    ['环境', '用途', 'URL', '分支'],
    [
        ['生产环境', '正式使用', 'autoprintreport.netlify.app', 'master'],
        ['预发布环境', '测试验证', '可选配置', 'develop'],
        ['开发环境', '本地开发', 'localhost', 'feature/*']
    ],
    {
        fontSize: 9,
        colPercents: [18, 17, 38, 27],   // URL 最宽，其次分支
        rowH: 0.48
    }
);
```

### 3.3 addTitle() 标题函数

```javascript
// 位置：generate_v16.js
// 用途：添加章节标题 + 装饰线

function addTitle(slide, text) {
    // 标题文字 — 使用安全宽度
    slide.addText(text, {
        x: SAFE.x, y: 0.35,
        w: SAFE.maxW, h: 0.55,
        fontSize: 22, bold: true,
        color: C.primary, fontFace: 'Microsoft YaHei'
    });
    // 装饰线 — 使用安全宽度
    slide.addShape('line', {
        x: SAFE.x, y: 0.95,
        w: SAFE.maxW, h: 0,
        line: { color: C.primary, width: 2 }
    });
}
```

### 3.4 addPg() 页码函数

```javascript
// 位置：generate_v16.js
// 用途：添加页码到右下角

function addPg(slide, num) {
    slide.addText(num + '', {
        x: 9.3, y: 7.0,   // ⚠️ 必须在 SAFE.rightBound 内
        w: 0.5, h: 0.3,
        fontSize: 9, color: C.textSecondary, fontFace: 'Microsoft YaHei'
    });
}
```

---

## 四、技术栈（Tech Stack）

### 4.1 核心依赖

| 依赖 | 版本 | 用途 | 替代方案 |
|------|------|------|---------|
| pptxgenjs | latest | 生成 PPTX 文件 | python-pptx（但安装失败） |
| Node.js | 22.22.2 | 运行环境 | - |

### 4.2 为什么不用 python-pptx？

**原因**：
1. 沙箱限制，无法安装 Python 包
2. pptxgenjs 对中文支持更好（实测）

**如果未来要用 python-pptx**：
- 参考 `SKILL.md` 中的 python-pptx 代码示例
- 注意：python-pptx 的表格 API 也可能有类似问题

---

## 五、下次迭代指南（Next Iteration Guide）

### 5.1 如果需要修改内容

**场景**：用户要求修改某张幻灯片的内容

**步骤**：
1. 打开 `generate_v16.js`
2. 找到对应的幻灯片代码块（有注释 `// ========== X. 标题 ==========`）
3. 修改文字内容
4. 运行 `node generate_v16.js`
5. 检查输出文件

**示例**：修改封面页标题
```javascript
// 找到这部分：
// ========== 1. 封面页 ==========
s.addText('AutoPrint', { ... });
s.addText('部署运维手册', { ... });

// 修改为你需要的标题
s.addText('新标题', { ... });
```

### 5.2 如果需要调整样式

**场景**：用户要求调整字体大小/颜色/间距

**全局样式**：修改 `C` 常量对象（颜色）
```javascript
const C = {
    primary: '002FA7',   // 修改品牌色
    accent: '00C3FF',    // 修改辅助色
    // ...
};
```

**表格样式**：修改 `drawTable()` 的默认参数
```javascript
function drawTable(slide, x, y, totalW, colHeaders, dataRows, opts = {}) {
    const {
        fontSize = 9,         // 修改表格字体大小
        headerFontSize = 10,  // 修改表头字体大小
        rowH = 0.48,          // 修改行高
        // ...
    } = opts;
}
```

**标题样式**：修改 `addTitle()` 函数
```javascript
function addTitle(slide, text) {
    slide.addText(text, {
        fontSize: 22,  // 修改标题字体大小
        // ...
    });
}
```

### 5.3 如果需要新增幻灯片

**步骤**：
1. 在 `generate_v16.js` 中找到最后一个幻灯片代码块
2. 在后面添加新的幻灯片代码块
3. 使用现有幻灯片作为模板（复制粘贴，然后修改内容）

**模板**：
```javascript
// ========== X. 新幻灯片标题 ==========
{
    const s = prs.addSlide();
    s.background = { color: C.white };
    addTitle(s, '幻灯片标题');
    
    // 添加内容
    s.addText('内容', { x: 0.6, y: 1.3, w: 8.8, h: 5.5, ... });
    
    addPg(s, X);  // X 是页码
}
```

---

## 六、常见问题排查（Troubleshooting）

### 6.1 生成失败

**症状**：`node generate_v16.js` 报错

**排查步骤**：
1. 检查 pptxgenjs 是否安装：`npm list pptxgenjs`
2. 如果未安装：`npm install pptxgenjs`
3. 检查脚本路径是否正确
4. 检查输出文件路径是否有写入权限

### 6.2 表格仍然溢出

**症状**：生成的 PPT 表格超出右边界

**排查步骤**：
1. 检查是否使用了 `drawTable()`（不要用 `addTable()`）
2. 检查 `totalW` 是否 ≤ 9.5
3. 检查 `colPercents` 总和是否为 100
4. 检查字体是否 ≤ 9pt
5. 检查 `SAFE` 常量是否被遵守

### 6.3 线条溢出

**症状**：标题下方的蓝色横线超出右边界

**排查步骤**：
1. 检查 `addTitle()` 函数中的 `w` 是否为 `SAFE.maxW`
2. 检查所有 `addShape('line', ...)` 的 `w` 是否 ≤ `SAFE.maxW`

---

## 七、交付清单（Delivery Checklist）

### 7.1 代码交付

- [x] `generate_v16.js` — 主生成脚本
- [x] `AutoPrint_部署运维手册_v1.6_线条修复版.pptx` — 输出文件
- [x] `SKILL.md` — Skill 文档（含踩坑经验）
- [x] `comlan-ppt-brand_经验教训_2026-07-03.md` — 经验教训文档
- [x] `comlan-ppt-brand_Handoff_2026-07-03.md` — 本文档

### 7.2 文档交付

- [x] 版本历史（`SKILL.md` 中）
- [x] 踩坑经验（`SKILL.md` 中）
- [x] 代码注释（`generate_v16.js` 中）
- [x] 工作日志（`.workbuddy/memory/2026-07-03.md`）

---

## 八、联系信息（Contact）

**当前负责人**: Senior Developer (吴八哥)  
**Skill 位置**: `C:\Users\Eric Zhang\.workbuddy\skills\comlan-ppt-brand\`  
**项目位置**: `D:\WBStorage\Projects\AutoPrint\`

**如果遇到问题**：
1. 先查看本文档的"常见问题排查"章节
2. 再查看 `comlan-ppt-brand_经验教训_2026-07-03.md`
3. 最后查看 `SKILL.md` 的"踩坑经验"章节

---

## 九、附录：完整文件清单

### 9.1 Skill 目录

```
C:\Users\Eric Zhang\.workbuddy\skills\comlan-ppt-brand\
├── SKILL.md                          # Skill 文档（主文档）
├── generate_v16.js                   # v1.6 生成脚本（当前版本）
├── AutoPrint_部署运维手册_v1.6_线条修复版.pptx  # 输出文件（当前版本）
├── generate_v15.js                   # v1.5 生成脚本（参考）
├── generate_v14.js                   # v1.4 生成脚本（参考）
├── generate_v13.js                   # v1.3 生成脚本（参考）
├── generate_ppt_simple.js           # v1.0 生成脚本（参考）
└── (其他历史版本脚本)
```

### 9.2 项目目录

```
D:\WBStorage\Projects\AutoPrint\
├── docs\
│   ├── comlan-ppt-brand_经验教训_2026-07-03.md    # 本文档的姊妹篇
│   ├── comlan-ppt-brand_Handoff_2026-07-03.md     # 本文档
│   ├── PPT品牌规范提示词_v1.0.md                   # 品牌规范提示词
│   └── (其他文档)
├── AutoPrint_部署运维手册_v1.0.docx               # 输入文件（Word）
└── (其他项目文件)
```

---

**文档版本**: v1.0  
**创建时间**: 2026-07-03 17:35  
**下次更新**: 下次迭代时  
**更新人**: Senior Developer (吴八哥)
