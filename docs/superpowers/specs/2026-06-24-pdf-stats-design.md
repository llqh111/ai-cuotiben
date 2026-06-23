# PDF 上传 + 统计仪表盘 — 设计文档

> 日期：2026-06-24
> 状态：待用户复核
> 范围：PDF 上传全链路（提取→拆分→选题入库）+ 统计仪表盘完整页面
> 上位文档：`docs/specs/2026-06-22-ai-cuotiben-design.md`

## 决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 统计布局 | 报告流纵向滚动 | 像学习报告，阅读感好 |
| PDF 入口 | /upload 页第四张卡片 | 与现有三卡片风格统一，入口集中 |
| PDF 拆题 | AI 拆分后逐题分析 | 一份试卷包含多题，拆开才能独立复习 |
| 选题界面 | 卡片列表 + 全选 | 题目预览完整，视觉友好 |
| 扫描版 PDF | 复用 Gemini OCR | 快，不增依赖；架构预留 PaddleOCR 接口 |

---

## 第一部分：PDF 上传

### 完整流程

```
用户选 PDF + 科目
    │
    ▼
┌─ PDF 文字提取 ──────────────────────────┐
│  PyPDF2 尝试提取文字层                    │
│  ├─ 有文字层 → 拼接全文                   │
│  └─ 无文字层 → pdf2image 转图片 → Gemini OCR │
└─────────────────────────────────────────┘
    │
    ▼
┌─ AI 拆分分析 ───────────────────────────┐
│  DeepSeek 一轮调用，识别:                  │
│  - 共有几道题，每道题从哪里开始到哪里结束      │
│  - 每题: 题目内容、题型、正确答案、解题步骤     │
│  - 每题: 知识点名称、题型分类                │
│  返回 JSON 数组                           │
└─────────────────────────────────────────┘
    │
    ▼
┌─ 选题入库页 /upload/pdf-review ──────────┐
│  卡片列表，每题可展开看详情                 │
│  用户勾选要入库的题 → 确认                  │
│  后端逐条写入 wrong_questions              │
└─────────────────────────────────────────┘
```

### 后端

#### 新增 `app/services/pdf_service.py`

```python
# extract_text(file_path: str) -> str
# 1. PyPDF2 提取文字
# 2. 若提取结果过短（<50字）判定为扫描版
# 3. 扫描版走 pdf2image + Gemini OCR（复用 ocr_service）
# 返回全文
```

#### 新增 `POST /api/upload/pdf`

| 参数 | 类型 | 说明 |
|------|------|------|
| `file` | UploadFile | PDF 文件（≤10MB） |
| `subject_id` | int | 科目 ID |

**返回：**
```json
{
  "questions": [
    {
      "index": 1,
      "question_content": "已知函数 f(x) = ...",
      "question_type": "essay",
      "correct_answer": "a ≥ 3",
      "solution_steps": "1. 求导 f'(x)=...",
      "knowledge_point_name": "导数",
      "question_pattern_name": "导数求单调区间"
    },
    ...
  ],
  "total_count": 8,
  "filename": "2024数学一模.pdf"
}
```

#### 新增 `POST /api/upload/pdf/confirm`

| 参数 | 类型 | 说明 |
|------|------|------|
| `question_indices` | int[] | 用户选中的题号数组 |
| `subject_id` | int | 科目 ID |
| `questions` | JSON | 上一步返回的完整题列表（含分析结果） |

逐题落库 wrong_questions（status=analyzed, mastery_level=new），知识点/题型复用或新建。

#### 修改 `app/services/upload_pipeline.py`

新增 `split_and_analyze_pdf(full_text, subject_id, user_id)` 函数：
- 构造 DeepSeek prompt，要求返回题目 JSON 数组
- 每道题包含分类信息（知识点名 + 题型名）
- 落库逻辑与现有 `/upload/text` 复用

#### 新增依赖

- `PyPDF2` — PDF 文字提取
- `pdf2image` — PDF 转图片（扫描版兜底，需系统安装 poppler）

写入 `requirements.txt`。

### 前端

#### 修改 `app/upload/page.tsx`

在「粘贴题目」卡片下方追加第四张卡片：

```
┌──────────────────────────────────────┐
│  📄  PDF 上传                        │
│  提取 PDF 文字 → AI 拆分分析 → 选题入库  │
│                                      │
│  [选择 PDF 文件]  [移除]              │
│  [科目选择器]                         │
│  [开始分析]                           │
└──────────────────────────────────────┘
```

- accept=".pdf"，max 10MB
- 上传中遮罩显示「正在提取并分析…」
- 成功后跳转 `/upload/pdf-review`

#### 新建 `app/upload/pdf-review/page.tsx`

选题入库页面：

```
┌──────────────────────────────────────┐
│  ← 返回    2024 数学一模卷 · 共 8 题   │
│                                      │
│  [全选 (8)]           [确认入库 ▸]   │
│                                      │
│  ┌ ☑ 解答题 · 导数 · 导数求单调区间 ┐  │
│  │ 已知函数 f(x) = x³ - 3x² + ...  │  │
│  │ [展开查看答案/解析]              │  │
│  └────────────────────────────────┘  │
│  ┌ ☑ 选择题 · 三角函数 · 辅助角公式 ┐  │
│  │ 函数 y = 2sin(x+π/3) + ...     │  │
│  └────────────────────────────────┘  │
│  ┌ ☐ 填空题 · 概率统计             ┐  │
│  │ ...                             │  │
│  └────────────────────────────────┘  │
│                                      │
│  已选 2 / 8 题                        │
└──────────────────────────────────────┘
```

- 数据通过 URL search params 或内存 state 传递
- 每张卡片可展开查看正确答案和解题步骤
- 默认全选，用户取消勾选不需要的题
- 确认后逐题入库，跳转最后一题的详情页或科目页

#### 修改 `lib/api.ts`

```ts
uploadPdf(file: File, subjectId: number) → Promise<PdfAnalysisResult>
confirmPdfQuestions(indices: number[], subjectId: number, questions: QuestionData[]) → Promise<void>
```

---

## 第二部分：统计仪表盘

### 页面结构 `/stats`

报告流纵向滚动，从上到下六个区块：

```
┌─ KPI 横条 ───────────────────────────────────┐
│  总错题 127  │  已掌握 43  │  掌握率 34%  │  连续 12 天  │
├─ 学科分布 ───────────────────────────────────┤
│  ECharts 柱状图                               │
│  六科双色堆叠: 🟢已掌握 / 🟡学习中 / 🔴新录入    │
├─ 掌握趋势 ───────────────────────────────────┤
│  ECharts 折线图（近 30 天）                     │
│  双线: 蓝色=新增错题 / 绿色=掌握                │
├─ 薄弱知识点 TOP5 ─────────────────────────────┤
│  横向条形图                                   │
│  知识点名 + 错题数 + 掌握率百分比               │
├─ 今日复习 ───────────────────────────────────┤
│  左侧: 环形进度图（已完成 / 今日到期总数）        │
│  右侧: 连续打卡天数纪念（数字 + 火花图标）        │
└──────────────────────────────────────────────┘
```

### 后端

以下接口全部纳入 `get_current_user` 用户隔离。

#### 确认/扩展 `GET /api/stats/overview`

```json
{
  "total": 127,
  "mastered": 43,
  "learning": 52,
  "new": 32,
  "mastery_rate": 0.339,
  "consecutive_days": 12
}
```

计算逻辑：
- `total/mastered/learning/new`：直接 COUNT wrong_questions 按 mastery_level 分组
- `consecutive_days`：从今天往前数 review_records 中连续有记录的日期数

#### 确认 `GET /api/stats/subjects`

```json
{
  "subjects": [
    {"id": 1, "name": "数学", "total": 35, "mastered": 12, "learning": 15, "new": 8},
    ...
  ]
}
```

#### 确认/扩展 `GET /api/stats/trends?days=30`

```json
{
  "trends": [
    {"date": "2026-06-01", "new_count": 3, "mastered_count": 1},
    ...
  ]
}
```

按 created_at 统计每日新增，按 review_records 统计每日掌握（答对且 mastery_level 变为 mastered 的日期）。

#### 确认 `GET /api/stats/weak-points`

```json
{
  "weak_points": [
    {"knowledge_point_id": 5, "name": "导数", "subject_name": "数学", "total": 12, "mastered": 2, "rate": 0.167},
    ...
  ]
}
```

按知识点聚合，掌握率最低的前 5 个。

#### 确认 `GET /api/stats/daily-review`

```json
{
  "due_total": 15,
  "completed_today": 8,
  "completion_rate": 0.533,
  "streak_days": 12
}
```

### 前端

#### 新建 `app/stats/page.tsx`

- 顶部 KPI 横条：4 个数字卡片（复用现有 premium 卡片样式）
- 学科分布：ECharts 柱状图，六科堆叠显示掌握/学习/新录入
- 掌握趋势：ECharts 折线图，双线 + 面积填充
- 薄弱 TOP5：ECharts 横向条形图，按掌握率升序
- 今日复习：CSS 环形进度条 + 打卡信息

全部区块使用 `motion/react` 入场动画。移动端自动适配（图表宽度 100%，单列）。

#### 安装 `echarts` + `echarts-for-react`

写入 `package.json` 依赖。

#### 修改 `lib/api.ts`

```ts
getStatsOverview() → Promise<StatsOverview>
getStatsSubjects() → Promise<StatsSubjects>
getStatsTrends(days?: number) → Promise<StatsTrends>
getStatsWeakPoints() → Promise<WeakPoints>
getStatsDailyReview() → Promise<DailyReview>
```

---

## 项目结构（变更）

```
ai-cuotiben-api/
  requirements.txt          # + PyPDF2, pdf2image
  app/
    services/
      pdf_service.py        # 新建：PDF 文字提取 + 扫描版 OCR 兜底
      upload_pipeline.py    # 修改：新增 split_and_analyze_pdf()
    api/
      upload.py             # 修改：POST /upload/pdf, POST /upload/pdf/confirm
      stats.py              # 修改：确认/扩展 overview/subjects/trends/weak-points/daily-review

ai-cuotiben-web/
  package.json              # + echarts, echarts-for-react
  app/
    upload/
      page.tsx              # 修改：第四张 PDF 卡片
      pdf-review/
        page.tsx            # 新建：选题入库页
    stats/
      page.tsx              # 新建：完整统计仪表盘
  lib/
    api.ts                  # 修改：新增 PDF + stats API 函数
```

## 不在本轮范围

- PaddleOCR 安装（继续 Gemini）
- 导出 PDF
- 知识点关联图谱
- AI 生成相似题
- 考前冲刺模式

## 验收标准

**PDF 上传：**
- 上传有文字层的 PDF → 提取成功 → AI 拆分 → 选题页展示 N 道题
- 上传扫描版 PDF → Gemini OCR → 同上
- 用户勾选部分题 → 确认入库 → 只保存选中的题
- 知识点/题型复用或新建正确

**统计仪表盘：**
- `/stats` 页面六个区块数据真实、图表可交互
- KPI 数字与数据库一致
- 图表响应式适配手机端
- 空数据状态（新用户无错题）友好展示
