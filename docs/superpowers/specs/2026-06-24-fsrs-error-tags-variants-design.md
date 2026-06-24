# 间隔重复算法升级 + 错因标签 + 变式训练闭环 — 设计 spec

> 2026-06-24 | 状态：已确认

## 1. 背景与目标

当前错题本有三个短板：

1. **复习算法是 SM-0**：固定间隔 `[1,3,7,14,30]`，二元对错，无遗忘曲线、无难度感知。产品护城河缺失。
2. **错因分析有 prose 无标签**：`classify_question` 已输出 `error_analysis`（自由文本），但无法结构化聚合，stats 只能看「哪个知识点弱」，看不出「为什么弱」。
3. **变式训练有骨架无闭环**：`generate_similar` 已通，但手动触发、练习结果不回流传复习引擎，停留在「记录」而非「掌握」。

**目标：** 三条线按「先省后难」顺序补齐：错因标签（最小改动，当天见价值）→ FSRS（最大杠杆，含前端 4 按钮改造）→ 变式闭环（依赖 FSRS，加费用门）。

---

## 2. 执行顺序与依赖

```
线2 错因标签  (半天, 加性改动)
   ↓
线1 FSRS      (2-3天, 含前端 4 按钮改造)
   ↓
线3 变式闭环  (依赖线1 lapses 字段 + 费用门, 最后做)
```

---

## 3. 线2 — 错因标签（最先）

### 3.1 现状

- `classify_question()` (ai_service.py:51) 已输出 `error_analysis` 和 `improvement_tips`（均为自由文本）
- WrongQuestion 已有 `error_analysis` (Text) 和 `improvement_tips` (Text) 两列
- **缺的是结构化枚举标签**，不是从零加字段

### 3.2 数据模型

**WrongQuestion 加列：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `error_category` | String(20) | 五选一枚举 |
| `error_category_detail` | Text | 具体描述 |

**五个主类：**

| 值 | 标签 | 典型场景 |
|---|---|---|
| `concept` | 概念不清 | 公式记错、定理混淆、知识点遗忘 |
| `calculation` | 计算失误 | 符号错误、步骤遗漏、运算错误 |
| `reading` | 审题偏差 | 漏关键信息、条件看错、问题理解错 |
| `careless` | 粗心 | 抄错、遗漏、格式错误 |
| `method` | 方法错误 | 选了不对的解法、思路走岔 |

### 3.3 AI prompt 改动

**改 `CLASSIFY_SYSTEM` (ai_service.py:44)：**

```python
CLASSIFY_SYSTEM = (
    "你是高中错题分析老师。基于题目、正确答案、学生答案，输出 JSON，字段："
    "error_analysis(错因分析), improvement_tips(改进建议), "
    "error_category: 五选一枚举 — 'concept'(概念不清)/'calculation'(计算失误)/"
    "'reading'(审题偏差)/'careless'(粗心)/'method'(方法错误), "
    "error_category_detail(具体描述，如 '混淆了正弦定理的适用条件，错用了余弦定理'), "
    "matched_knowledge_point(从已有知识点中选最合适的；都不合适则给新名称), "
    "matched_question_pattern(从已有题型中选最合适的；都不合适则给新名称), "
    "is_new_knowledge_point(bool), is_new_question_pattern(bool)。只输出 JSON。"
)
```

**mock 分支同步加 (ai_service.py:55-59)：**

```python
return {"error_analysis": "...", "improvement_tips": "...",
        "error_category": "concept", "error_category_detail": "（mock）对导数定义理解有偏差",
        "matched_knowledge_point": kp, "matched_question_pattern": pat,
        "is_new_knowledge_point": ..., "is_new_question_pattern": ...}
```

### 3.4 落库改动

在 `_persist()` (upload.py:88) 和 `import_questions()` (upload.py:480) 中写入 `error_category` 和 `error_category_detail`：

```python
q = WrongQuestion(
    ...  # 现有字段不变
    error_category=classified.get("error_category"),
    error_category_detail=classified.get("error_category_detail"),
)
```

### 3.5 stats 新增端点

```
GET /api/stats/error-categories
```

返回五类分布：

```json
{
  "status": "success",
  "data": {
    "total": 120,
    "categories": [
      {"category": "concept", "label": "概念不清", "count": 45, "pct": 38},
      {"category": "calculation", "label": "计算失误", "count": 30, "pct": 25},
      ...
    ]
  }
}
```

查询逻辑：`SELECT COALESCE(error_category, 'uncategorized') as cat, COUNT(*) FROM wrong_questions WHERE user_id=? GROUP BY cat`。NULL → 「未分类」显式处理，不做隐式桶。

### 3.6 迁移

`migration.py` 加两列（SQLite PRAGMA / PG information_schema），存量数据 `error_category` 留 NULL（旧题不回溯分析）。

### 3.7 前端

stats 页加一个「错因分布」区块（饼图，五色），复用现有 ECharts。dashboard 页可后续加。

---

## 4. 线1 — FSRS 替换（第二个做）

### 4.1 现状

`review_engine.py` (22 行)：固定间隔 `[1,3,7,14,30]`，二元对错，连续对 5 次或到顶 → mastered。隔离干净，替换容易。

### 4.2 数据模型

**WrongQuestion 加 2 个字段（不是 5 个）：**

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `fsrs_card` | Text/JSON | NULL | Card.to_dict() 序列化，含 stability/difficulty/due/state/step/last_review |
| `next_review_at` | DateTime | NULL | 从 card.due 提取的快照列，供 SQL 查询到期题用 |

**为什么不散存 stability/difficulty/reps/lapses/state：** v5+ Card 字段结构持续演进（已没有 reps/lapses），散列会版本耦合。`fsrs_card` JSON 一列兜底 + `next_review_at` 做索引列。

**ReviewRecord 加 1 个字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `rating` | Int | 1=Again, 2=Hard, 3=Good, 4=Easy |

**保留现有字段**（`is_correct`、`interval_index` 等）避免破坏存量逻辑。旧记录 `is_correct=True` 映射 `rating=3`（Good），`is_correct=False` 映射 `rating=1`（Again）。

**保留 `mastery_level`**（"new"/"learning"/"mastered"）做向后兼容映射：

| card.state | card.stability | mastery_level |
|---|---|---|
| New(0) | — | "new" |
| Learning(1), Relearning(3) | — | "learning" |
| Review(2) | < 21 | "learning" |
| Review(2) | >= 21 | "mastered" |

### 4.3 算法实现

**用 PyPI 官方库 `py-fsrs`（MIT License），v5+ 版本：**

```python
# requirements.txt 新增
fsrs>=5.0
```

**review_engine.py 改法（基于 v5+/v6 实际 API）：**

```python
from datetime import datetime, timezone
from fsrs import Scheduler, Card, Rating, State

_scheduler = Scheduler()

def _to_rating(r: int) -> Rating:
    return {1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy}[r]

def _to_state(s: int) -> State:
    return {0: State.New, 1: State.Learning, 2: State.Review, 3: State.Relearning}[s]

def review(card_dict: dict | None, rating: int) -> dict:
    """FSRS review。card_dict 为上次 to_dict() 结果，None 表示新卡。"""
    if card_dict is None:
        card = Card()  # 新卡，scheduler 给默认
    else:
        card = Card.from_dict(card_dict)
    card, review_log = _scheduler.review_card(card, _to_rating(rating))
    return {
        "card_dict": card.to_dict(),
        "due": card.due,              # datetime (UTC)
        "stability": card.stability,   # float
        "difficulty": card.difficulty, # float, 范围 ~1-10
        "state": card.state.value,     # int: 0-3
    }
```

**关键点：**
- Card 对象通过 `to_dict()`/`from_dict()` 序列化，存在 `fsrs_card` JSON 列
- `card.due` 是 Scheduler 自动算的到期时间（基于 `card.last_review` 与当前时间差），**不需要手动传 elapsed_days**
- `difficulty` 范围 ~1-10，不是 0-1
- 所有时间用 `datetime.now(timezone.utc)`，不用已弃用的 `utcnow()`

### 4.4 API 改动

**`POST /api/review/submit` (review.py:49)：**

```python
from datetime import datetime, timezone
from fsrs import State, Rating

# 输入 schema ReviewSubmit 加 rating: int (1-4)
old_card = json.loads(q.fsrs_card) if q.fsrs_card else None
result = review_engine.review(old_card, body.rating)

# 更新 WrongQuestion
q.fsrs_card = json.dumps(result["card_dict"])
q.next_review_at = result["due"]  # ← 必须写！daily 端点靠它判到期

# mastery_level 兼容映射
s = result["state"]
st = result["stability"]
if s == State.New.value:
    q.mastery_level = "new"
elif s in (State.Learning.value, State.Relearning.value):
    q.mastery_level = "learning"
else:  # Review
    q.mastery_level = "mastered" if st >= 21 else "learning"

# 写入 ReviewRecord（含 rating）
db.add(ReviewRecord(
    question_id=q.id, user_id=user.id,
    rating=body.rating,
    is_correct=body.rating >= 3,          # Good/Easy 算对
    interval_index=0,                      # 遗留字段
    next_review_date=result["due"].date() if result["due"] else None,
    consecutive_correct=0,                 # 遗留字段，不再使用
))
await db.commit()
```

**`GET /api/review/daily/{subject_id}` (review.py:22)：**

```python
from datetime import datetime, timezone
from sqlalchemy import or_

now = datetime.now(timezone.utc)
rows = await db.execute(select(WrongQuestion).where(
    WrongQuestion.user_id == user.id,
    WrongQuestion.subject_id == subject_id,
    WrongQuestion.mastery_level != "mastered",
    or_(WrongQuestion.next_review_at == None,
        WrongQuestion.next_review_at <= now)
)).scalars().all()
```

**消除了 N+1：** 到期状态直接存在错题行的 `next_review_at` 列上，不再逐题查 ReviewRecord。

### 4.5 前端（最大工作量 🔴）

**复习卡片 — 4 按钮替换对/错二元：**

```
┌──────────────────────────────────────┐
│  题目内容...                          │
│                                      │
│  [显示答案]  [🗙 完全忘了]           │
│  [❌ 困难]   [✅ 正确]   [⭐ 简单]   │
│                                      │
│  Again(1)    Hard(2)   Good(3) Easy(4)│
└──────────────────────────────────────┘
```

**改动文件：**

| 文件 | 改动 |
|------|------|
| `app/schemas/review.py` | ReviewSubmit 加 `rating: int` |
| `lib/api.ts` | `ReviewSubmit` 类型加 `rating: 1\|2\|3\|4`；`submitReview()` 改参数 |
| 复习页面组件 | 对/错 2 按钮 → 4 按钮（Again/Hard/Good/Easy），调 `submitReview({question_id, rating})` |
| 错题详情页 | 同 4 按钮改造 |

### 4.6 迁移

- `migration.py` 对 WrongQuestion 加 2 列（`fsrs_card` TEXT, `next_review_at` DATETIME）、ReviewRecord 加 1 列（`rating` INT）
- 存量数据：`fsrs_card` 留 NULL，daily 端点用 `next_review_at IS NULL → 立即到期` 兜底
- 存量 ReviewRecord 的 `is_correct` 可推算 `rating`（True→3, False→1），用于 FSRS 冷启动

### 4.7 测试

- `test_review_engine.py` 重写：测试新卡/复习卡 to_dict/from_dict 往返 + 四评级状态变迁
- mock 路径覆盖（DEEPSEEK_API_KEY="" 走 mock 分支）

---

## 5. 线3 — 变式训练闭环（最后做）

### 5.1 现状

- `generate_similar()` (ai_service.py:72) 存在，每次生成 3 题
- `POST /api/generate/similar/{question_id}` 手动调用，上限 `3 × 3 = 9` 题
- `PracticeQuestion.user_result` 有 correct/wrong/unanswered
- 练习结果**不回流传复习引擎**

### 5.2 触发策略

**自动触发（费用门）：**

```python
# review.py submit() 里：
# 从 fsrs_card JSON 里读 lapses（v5+ Card 无此字段，自己计数）
recent_lapses = sum(1 for r in await db.execute(
    select(ReviewRecord).where(
        ReviewRecord.question_id == q.id, ReviewRecord.rating <= 2  # Again/Hard
    ).order_by(ReviewRecord.id.desc()).limit(10)
).scalars().all())

if rating in (Rating.Again, Rating.Hard) and recent_lapses >= 2:
    background_tasks.add_task(_generate_variants, q.id)
```

规则：**最近 10 次复习中至少 2 次 Again/Hard 才自动生成变式**。单次失误不触发，避免费用炸弹。

**手动触发：** 错题详情页「练变式」按钮 → 调 `POST /api/generate/similar/{question_id}`。去掉 `MAX_GENERATIONS=3` 硬限制，单题总数上限改为 12 题（4 次 × 3 题/次）。深免层 AI 调用可控。

### 5.3 FSRS 联动

变式题做完**走正常 review_card**，不手抠内部字段：

```python
# 变式题答对 → 对原题也喂一次 Good 评分
if variant_rating in (Rating.Good, Rating.Easy):
    old_card = json.loads(q.fsrs_card) if q.fsrs_card else None
    card = Card.from_dict(old_card) if old_card else Card()
    card, _ = _scheduler.review_card(card, Rating.Good)
    q.fsrs_card = json.dumps(card.to_dict())
    q.next_review_at = card.due
```

**为什么不手改 stability/difficulty：** FSRS 算法自洽性依赖 scheduler 内部状态机，手动乘系数会污染模型，下次 review_card 喂进去的值已经不准确。

### 5.4 生成质量提升

`generate_similar` 加入错因标签定向：

```python
SIMILAR_SYSTEM = (
    "你是高考命题老师。基于给定错题及其错因，生成 3 道同类变式练习题。"
    "若错因是计算失误 → 偏计算量变式、改数字结构；"
    "若错因是审题偏差 → 偏条件变化、题干陷阱变式；"
    "若错因是概念不清 → 偏核心概念直接考察、去冗余信息。"
    "输出 JSON，字段 questions 为数组，每项含 content, answer, solution。只输出 JSON。"
)
```

### 5.5 stats 新增端点

```
GET /api/stats/variant   →  变式覆盖率、变式正确率
```

对每道错题统计：有变式题数、变式答对数、变式正确率。

---

## 6. 通用规则

### 6.1 迁移

- 三线加列统一走 `migration.py`（已有 SQLite PRAGMA + PG information_schema 双引擎）
- 不做 drop table 重建
- 每次 migration 在 `run_migrations()` 里新增一个 `_ensure_column(table, col, type)` 调用

### 6.2 Mock 同步

- 每改 `ai_service` 输出结构，mock 分支（`if not DEEPSEEK_API_KEY`）同步加新字段
- 新字段给合理 mock 值（如 `error_category: "concept"`），保证测试不炸

### 6.3 向后兼容

- `mastery_level` 保留，FSRS 写完后同步更新
- `ReviewRecord.is_correct`、`interval_index` 保留，加 `rating` 列
- stats 页现有端点不解耦，读 `mastery_level` 的行继续工作

### 6.4 依赖清单

```
requirements.txt 新增：
fsrs>=5.0          (线1)
# 线2/线3 无新 pip 依赖
```

---

## 7. 影响面矩阵

| 文件 | 线2 | 线1 | 线3 |
|------|:---:|:---:|:---:|
| `app/models.py` | +2 列 | +2 列 (fsrs_card + next_review_at) | — |
| | | ReviewRecord +1 列 (rating) | |
| `app/services/ai_service.py` | prompt 改 | — | prompt 改 |
| `app/services/review_engine.py` | — | 重写 | — |
| `app/api/upload.py` `_persist()` | 写 error_category | — | — |
| `app/api/upload.py` `import_questions()` (行481) | 写 error_category | — | — |
| `app/api/review.py` | — | 改 submit/daily | 加 bg task |
| `app/api/generate.py` | — | — | 去上限 + 联动 |
| `app/api/stats.py` | +1 端点 | — | +1 端点 |
| `app/schemas/review.py` | — | ReviewSubmit +rating | — |
| `app/core/migration.py` | +2 列 | +3 列 | — |
| 前端 `lib/api.ts` | — | 改 ReviewSubmit 类型 | — |
| 前端复习卡片 | — | 4 按钮 🔴 | — |
| 前端 stats 页 | +错因饼图 | — | — |
| 前端错题详情页 | 显示错因标签 | 4 按钮 | 变式按钮 |
| `tests/test_review_engine.py` | — | 重写 | — |
| `tests/test_ai_service.py` | mock 同步 | — | — |
| `requirements.txt` | — | +fsrs | — |
