# AI 错题本 — 高考备战智能复习系统

> 设计日期：2026-06-22
> 状态：待审核

## 概述

面向高三备战高考学生的 AI 智能错题本 Web 应用。学生通过拍照或上传 PDF 将错题录入系统，AI 自动识别题目、分析错因、归类题型，并通过间隔重复算法驱动科学复习。覆盖语文、数学、英语、物理、化学、生物六科。

## 目标用户

- 高三学生（核心用户）
- 备战高考，需要系统性整理和复习错题
- 使用场景：课后整理错题、自习时复习、考前冲刺

---

## 技术栈

| 层面 | 技术选型 | 理由 |
|------|---------|------|
| 前端 | React | 生态成熟，适合复杂交互界面 |
| 后端 | Python FastAPI | 异步高性能，PaddleOCR / DeepSeek SDK 天然支持 |
| 数据库 | PostgreSQL | 关系型，适合多维统计查询 |
| OCR | PaddleOCR（本地部署） | 免费开源，中文识别能力强 |
| AI | DeepSeek API | 文本推理能力强，用于题目解析、错因分析、分类、生成相似题 |
| 可视化 | ECharts / D3.js | 统计图表和知识点图谱 |

---

## 账号系统

### 机制：自定义口令同步

- 学生首次使用时设置 **昵称 + 口令** 组合
- 在其他设备输入相同的昵称 + 口令即可同步数据
- 无需邮箱、手机号，隐私友好，门槛低

### 防碰撞设计

- 使用 `昵称 + 口令` 的组合哈希作为用户唯一标识
- 口令存储使用 bcrypt 加密
- 昵称不要求全局唯一，但 `昵称 + 口令` 组合必须唯一
- 如果组合已存在，视为登录；不存在则创建新用户

### 用户设置

- 主题切换（浅色 / 深色）
- 高考日期设定（驱动倒计时和冲刺模式）
- 各科目开关（隐藏不需要的科目）

---

## 核心功能

### 1. 错题上传与 AI 分析

#### 上传方式

- **拍照上传**：调用设备摄像头，支持裁剪旋转
- **图片上传**：从相册选择已有图片
- **PDF 上传**：上传 PDF 文件，系统自动提取文字（有文字层时直接提取，无文字层时走 OCR）
- 上传时需选择所属 **科目**

#### 处理流程（双层架构）

```
上传文件 → PaddleOCR 识别 → 学生预览/修正 OCR 结果 → DeepSeek 分析（两轮）
```

**第一轮 AI 调用 — 题目解析：**

```
Prompt 模板:
"你是一位资深高中{科目}老师。请分析以下题目：
1. 提取完整题目内容（含选项，如有）
2. 判断题型：选择题 / 填空题 / 解答题
3. 给出正确答案
4. 给出详细解题步骤
5. 标注涉及的知识点

题目文字：{ocr_corrected_text}
学生答案：{student_answer}（如有）"
```

**第二轮 AI 调用 — 错因分析与分类：**

```
Prompt 模板:
"基于以下题目和学生的错误答案，请：
1. 分析学生错误的具体原因（计算错误/概念混淆/方法不当/粗心等）
2. 从以下已有知识点中匹配最合适的：{existing_knowledge_points}
   如果没有合适的，建议新的知识点名称
3. 从以下已有题型中匹配最合适的：{existing_patterns}
   如果没有合适的，建议新的题型名称和描述
4. 给出针对性的改进建议

题目：{question_content}
正确答案：{correct_answer}
学生答案：{student_answer}
解题步骤：{solution_steps}"
```

#### 异步处理

- 上传后立即返回，后台异步执行 OCR
- OCR 完成后通知前端，学生预览修正
- 修正确认后异步调用 DeepSeek
- 全程通过状态字段跟踪：`pending → ocr_done → analyzed`

#### 批量处理

- 一张图片可能包含多道题目
- AI 负责识别并拆分为独立题目
- 每道题独立存储和分析

---

### 2. 双层分类体系

#### 结构

```
科目
 └─ 知识点（大类）
      └─ 题型（细分）
           └─ 具体错题
```

**示例**：
```
数学
 ├─ 导数
 │   ├─ 导数求单调区间 (6题)
 │   ├─ 利用导数证明不等式 (5题)
 │   └─ 导数求极值与最值 (4题)
 ├─ 三角函数
 │   ├─ 辅助角公式化简 (3题)
 │   └─ 三角函数图像变换 (4题)
 └─ 概率统计
     ├─ 条件概率与全概率 (4题)
     └─ 正态分布应用 (2题)
```

#### AI 增量分类

- 新题目优先匹配已有的知识点和题型
- 无匹配时 AI 建议新的分类名称，系统自动创建
- 学生可以手动调整分类（拖拽移动到其他知识点/题型）
- 知识点支持多级嵌套（通过 parent_id 自引用）

---

### 3. 复习抽题系统

#### 间隔重复算法

**间隔序列**：`1天 → 3天 → 7天 → 14天 → 30天`

- 答对：进入下一个更长间隔
- 答错：间隔重置回 1 天
- 连续通过 5 个间隔：自动标记为「已掌握」
- 学生也可随时手动标记「已掌握」跳过某题

#### 复习模式

| 模式 | 说明 | 抽题逻辑 |
|------|------|---------|
| 每日复习 | 进入科目时自动提醒 | `next_review_date ≤ 今天` 的所有到期题 |
| 随机练习 | 学生主动发起 | 该科目所有未掌握题随机抽取，数量可选（5/10/20） |
| 题型专练 | 点击某题型进入 | 该题型下所有未掌握题 |
| 考前冲刺 | 设定考试日期后自动规划 | 高频错题 + 高难度优先，系统分配每日量 |

#### 答题交互（分题型区别）

**选择题 / 填空题：**
- 学生输入答案
- 系统自动比对判分
- 显示对错结果 + 错因回顾

**解答题：**
- 显示题目，学生心中回忆解法
- 点击「查看答案」展开正确答案和解题步骤
- 学生自评：「✅ 记得」或「❌ 不记得」

#### 考前冲刺模式

- 学生设定高考日期
- 系统计算剩余天数，自动生成每日复习计划
- 冲刺策略：
  - 距考 >60 天：正常间隔重复节奏
  - 距考 30-60 天：缩短间隔，增加每日复习量
  - 距考 <30 天：高频错题每天轮一遍，已掌握的题偶尔抽查

---

### 4. AI 生成相似题

- 针对某道错题，点击「生成相似题」
- DeepSeek 生成 3 道同知识点、同解题方法、同难度的新题
- 生成的题目带答案和解析
- 单独保存在「练习记录」中，不计入错题本
- 每道错题最多生成 3 次（控制 API 用量）

```
Prompt 模板:
"基于以下高考错题，生成3道相似的练习题。
要求：
- 考察相同的知识点：{knowledge_point}
- 使用相同的解题方法：{question_pattern}
- 难度相近（高考水平）
- 题型相同：{question_type}
- 每道题给出完整答案和解析

原题：{question_content}"
```

---

### 5. 数据统计仪表盘

#### 统计维度

- **总体概览**：总错题数、已掌握数、掌握率、学习中数量
- **各科分布**：各科目错题数量柱状图
- **趋势曲线**：近 7/30/90 天 新增错题 vs 掌握错题 折线图
- **薄弱知识点 TOP5**：错题最多且掌握率最低的知识点排行
- **每日复习完成率**：今日任务完成百分比
- **连续复习天数**：打卡激励，连续复习的天数统计

#### 图表库

- 使用 ECharts 实现统计图表
- 支持响应式，手机端自动适配

---

### 6. 错题导出 PDF

#### 导出范围选择

- 按科目：全部数学错题
- 按知识点：导数相关全部题目
- 按时间段：本月新增
- 按状态：仅未掌握的

#### 导出格式

- **含答案版**：题目 + 正确答案 + 解题步骤 + 错因分析
- **不含答案版**：仅题目（方便打印后当练习卷）

#### 实现

- 后端使用 Python 库（如 ReportLab 或 WeasyPrint）生成 PDF
- 前端下载 PDF 文件

---

### 7. 知识点关联图谱

#### 数据来源

- 基于已有知识点，由 DeepSeek 分析知识点之间的逻辑关系
- 定期更新（每新增 10 个知识点触发一次重新分析）

#### 可视化

- 力导向图（ECharts 或 D3.js）
- 节点大小 = 该知识点下的错题数量
- 节点颜色 = 掌握程度（红色=薄弱 → 黄色=学习中 → 绿色=已掌握）
- 连线 = 知识点之间的关联关系
- 点击节点可查看该知识点的所有错题

---

## 数据模型

### users 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 用户唯一 ID |
| nickname | VARCHAR | 昵称 |
| passphrase_hash | VARCHAR | 口令哈希（bcrypt） |
| theme_preference | ENUM | light / dark |
| exam_date | DATE | 高考日期 |
| created_at | TIMESTAMP | 创建时间 |
| last_login_at | TIMESTAMP | 最后登录时间 |

### subjects 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT (PK) | 科目 ID |
| name | VARCHAR | 科目名称（语文/数学/英语/物理/化学/生物） |
| icon | VARCHAR | 图标标识 |
| color | VARCHAR | 主题色 |

### knowledge_points 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 知识点 ID |
| subject_id | INT (FK) | 所属科目 |
| parent_id | UUID (FK, nullable) | 父级知识点（支持多级） |
| name | VARCHAR | 知识点名称 |
| description | TEXT | 描述 |

### question_patterns 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 题型 ID |
| knowledge_point_id | UUID (FK) | 所属知识点 |
| name | VARCHAR | 题型名称 |
| description | TEXT | 题型描述 |
| difficulty | INT | 难度（1-5） |

### wrong_questions 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 错题 ID |
| user_id | UUID (FK) | 所属用户 |
| subject_id | INT (FK) | 所属科目 |
| knowledge_point_id | UUID (FK, nullable) | 知识点 |
| question_pattern_id | UUID (FK, nullable) | 题型 |
| original_image_url | VARCHAR | 原始上传图片路径 |
| ocr_text | TEXT | OCR 识别原始文本 |
| ocr_corrected_text | TEXT | 学生修正后文本 |
| question_content | TEXT | AI 提取的题目内容 |
| question_type | ENUM | choice / fill_blank / essay |
| correct_answer | TEXT | 正确答案 |
| student_answer | TEXT | 学生的错误答案 |
| error_analysis | TEXT | AI 错因分析 |
| solution_steps | TEXT | AI 解题步骤 |
| improvement_tips | TEXT | AI 改进建议 |
| status | ENUM | pending / ocr_done / analyzed |
| mastery_level | ENUM | new / learning / mastered |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### review_records 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 记录 ID |
| question_id | UUID (FK) | 关联错题 |
| user_id | UUID (FK) | 用户 |
| is_correct | BOOLEAN | 本次是否答对 |
| next_review_date | DATE | 下次复习日期 |
| interval_days | INT | 当前间隔天数 |
| consecutive_correct | INT | 连续正确次数 |
| reviewed_at | TIMESTAMP | 复习时间 |

### practice_questions 表（AI 生成的相似题）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 练习题 ID |
| source_question_id | UUID (FK) | 来源错题 |
| user_id | UUID (FK) | 用户 |
| content | TEXT | 题目内容 |
| answer | TEXT | 答案 |
| solution | TEXT | 解析 |
| user_result | ENUM | correct / wrong / unanswered |
| created_at | TIMESTAMP | 生成时间 |

### knowledge_relations 表（知识点关联图谱）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 关系 ID |
| source_point_id | UUID (FK) | 起始知识点 |
| target_point_id | UUID (FK) | 关联知识点 |
| relation_type | VARCHAR | 关系类型（前置/相关/延伸） |
| subject_id | INT (FK) | 所属科目 |

---

## 页面结构

### 页面清单

| 页面 | 路由 | 说明 |
|------|------|------|
| 登录/注册 | `/login` | 输入昵称+口令 |
| 首页仪表盘 | `/` | 学习概览、今日任务、高考倒计时 |
| 科目详情 | `/subject/:id` | 该科目的错题列表，按知识点/题型分类 |
| 错题详情 | `/question/:id` | 题目、答案、错因分析、解题步骤 |
| 上传错题 | `/upload` | 拍照/上传图片/PDF |
| OCR 确认 | `/upload/confirm` | 预览 OCR 结果，修正后提交 |
| 复习模式 | `/review/:subjectId` | 抽题复习界面 |
| 考前冲刺 | `/sprint` | 冲刺模式计划与执行 |
| 统计分析 | `/stats` | 全维度数据统计图表 |
| 知识图谱 | `/graph/:subjectId` | 知识点关联可视化 |
| 设置 | `/settings` | 主题切换、高考日期、科目管理 |

### 响应式策略

| 断点 | 布局 |
|------|------|
| < 768px（手机） | 单列布局，底部 Tab 导航，触摸优化 |
| ≥ 768px（平板/PC） | 侧边栏导航，双栏布局 |

### 主题系统

| 元素 | 浅色模式 | 深色模式 |
|------|---------|---------|
| 页面背景 | #F8FAFC | #0F172A |
| 卡片背景 | #FFFFFF | #1E293B |
| 主色调 | #3B82F6 | #60A5FA |
| 成功/正确 | #10B981 | #34D399 |
| 错误 | #EF4444 | #F87171 |
| 主文字 | #1E293B | #E2E8F0 |
| 次要文字 | #64748B | #94A3B8 |

---

## 实现分期

### Phase 1 — 核心 AI 闭环

- 账号系统（昵称+口令）
- 六科目管理
- 错题上传（拍照/图片/PDF）
- PaddleOCR 识别 + 学生修正
- DeepSeek 两轮分析（解题 + 错因）
- 双层分类（知识点 + 题型）
- 基础复习抽题（间隔重复 + 手动标记掌握）
- 浅色/深色主题切换
- 响应式布局

### Phase 2 — 增强功能

- 数据统计仪表盘（ECharts 图表）
- 错题导出 PDF（含答案/不含答案两版）
- 考前冲刺模式（倒计时 + 每日计划）
- 每日复习提醒

### Phase 3 — 高级功能

- AI 生成相似题
- 知识点关联图谱（力导向图可视化）
- 学习报告（周报/月报总结）

---

## 技术细节

### 后端 API 结构

```
/api/auth/
  POST /register          — 注册（昵称+口令）
  POST /login             — 登录

/api/questions/
  POST /upload            — 上传错题
  POST /:id/confirm-ocr   — 确认 OCR 结果
  GET  /                  — 获取错题列表（支持按科目/知识点/题型筛选）
  GET  /:id               — 获取错题详情
  PUT  /:id               — 编辑错题
  DELETE /:id             — 删除错题

/api/review/
  GET  /daily/:subjectId   — 获取今日到期复习题
  GET  /random/:subjectId  — 随机抽题
  GET  /pattern/:patternId — 题型专练
  POST /submit             — 提交复习结果

/api/stats/
  GET  /overview           — 总体概览
  GET  /subject/:id        — 科目统计
  GET  /trends             — 趋势数据
  GET  /weak-points        — 薄弱知识点

/api/generate/
  POST /similar/:questionId — AI 生成相似题

/api/export/
  POST /pdf                — 导出 PDF

/api/graph/
  GET  /:subjectId         — 知识点图谱数据
```

### PaddleOCR 集成

```python
from paddleocr import PaddleOCR

ocr = PaddleOCR(use_angle_cls=True, lang='ch')

async def process_image(image_path: str) -> str:
    result = ocr.ocr(image_path, cls=True)
    text_lines = []
    for line in result[0]:
        text_lines.append(line[1][0])
    return '\n'.join(text_lines)
```

### DeepSeek API 集成

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-deepseek-api-key",
    base_url="https://api.deepseek.com"
)

async def analyze_question(prompt: str) -> str:
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3  # 低温度保证分析准确性
    )
    return response.choices[0].message.content
```

### 间隔重复引擎

```python
INTERVALS = [1, 3, 7, 14, 30]  # 天

def calculate_next_review(is_correct: bool, current_interval_index: int):
    if is_correct:
        next_index = min(current_interval_index + 1, len(INTERVALS) - 1)
        if current_interval_index >= len(INTERVALS) - 1:
            return None, "mastered"  # 已掌握
        return INTERVALS[next_index], "learning"
    else:
        return INTERVALS[0], "learning"  # 重置到1天
```

---

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| OCR 识别失败 | 提示学生手动输入题目文字 |
| DeepSeek API 超时/失败 | 保留 OCR 文本，标记为待分析，后台重试 3 次 |
| DeepSeek 分析结果格式异常 | 使用默认分类，标记需人工审核 |
| 上传文件过大 | 前端限制单文件 10MB，超出提示压缩 |
| 网络断开 | 前端缓存未提交的操作，恢复网络后自动同步 |

---

## 安全考虑

- 口令使用 bcrypt 加密存储，不可逆
- API 使用 JWT Token 认证，Token 有效期 7 天
- 上传文件类型白名单：jpg, jpeg, png, pdf
- DeepSeek API Key 存储在服务端环境变量，不暴露给前端
- 用户数据隔离，只能访问自己的错题
