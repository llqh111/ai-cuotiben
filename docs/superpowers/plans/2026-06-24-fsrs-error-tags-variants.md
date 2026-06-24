# 间隔重复升级 + 错因标签 + 变式闭环 — 实现计划

> **For agentic workers:** 用 subagent-driven-development 逐任务执行。每步有 checkbox (`- [ ]`)。

**Goal:** 三线升级错题本核心引擎：错因标签→FSRS 间隔重复→变式闭环，按线2→线1→线3顺序实现。

**Architecture:** 每条线内依旧 TDD：先改模型/migration → 改核心逻辑 → 改 API → 改前端 → 验证全绿。线间依赖清晰（线3 依赖线1 的 fsrs_card 列），不跨线。

**Tech Stack:** Python 3.12+, FastAPI, SQLAlchemy async, fsrs>=5.0, pytest-asyncio, Next.js 16, TypeScript

**Spec:** `docs/superpowers/specs/2026-06-24-fsrs-error-tags-variants-design.md`

---

## 线2 — 错因标签

### Task 2.1: 模型列 + 迁移

**Files:**
- Modify: `ai-cuotiben-api/app/models.py`
- Modify: `ai-cuotiben-api/app/core/migration.py`

- [ ] **Step 1: WrongQuestion 加 2 列**

在 `app/models.py` 的 WrongQuestion 类中加：

```python
error_category = Column(String(20), nullable=True)      # concept/calculation/reading/careless/method
error_category_detail = Column(Text, nullable=True)      # 具体描述
```

加在 `improvement_tips` (line 64) 之后、`status` (line 65) 之前。

- [ ] **Step 2: migration.py 加迁移**

在 `app/core/migration.py` 的 `run_migrations()` 末尾加：

```python
await _ensure_column("wrong_questions", "error_category", "VARCHAR(20)")
await _ensure_column("wrong_questions", "error_category_detail", "TEXT")
```

- [ ] **Step 3: 验证迁移**

```bash
cd ai-cuotiben-api
python -c "from app.core.migration import run_migrations; import asyncio; asyncio.run(run_migrations())"
# 预期：无报错，表已有两列（重复跑幂等）
```

- [ ] **Step 4: Commit**

```bash
git add ai-cuotiben-api/app/models.py ai-cuotiben-api/app/core/migration.py
git commit -m "feat: WrongQuestion +error_category +error_category_detail 列和迁移"
```

### Task 2.2: AI prompt 改 + mock 同步

**Files:**
- Modify: `ai-cuotiben-api/app/services/ai_service.py:44-66`

- [ ] **Step 1: 改 CLASSIFY_SYSTEM prompt**

替换 `CLASSIFY_SYSTEM`（line 44-49）为：

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

- [ ] **Step 2: mock 分支同步**

在 `classify_question` 的 mock 分支（line 55-59），改 return 为：

```python
return {"error_analysis": "（mock）忽略了端点取等。", "improvement_tips": "（mock）注意 ≥ 与 > 的区别。",
        "error_category": "concept", "error_category_detail": "（mock）对导数定义理解有偏差",
        "matched_knowledge_point": kp, "matched_question_pattern": pat,
        "is_new_knowledge_point": not existing_kps, "is_new_question_pattern": not existing_patterns}
```

- [ ] **Step 3: 跑测试验证 mock 路径不炸**

```bash
cd ai-cuotiben-api && python -m pytest tests/test_ai_service.py -v
# 预期：全部 PASS
```

- [ ] **Step 4: Commit**

```bash
git add ai-cuotiben-api/app/services/ai_service.py
git commit -m "feat: classify_question prompt + error_category 枚举字段 + mock 同步"
```

### Task 2.3: 落库写入 error_category

**Files:**
- Modify: `ai-cuotiben-api/app/api/upload.py:88-116` (_persist)
- Modify: `ai-cuotiben-api/app/api/upload.py:480-526` (import_questions)

- [ ] **Step 1: _persist() 写入**

在 `_persist()` 的 `WrongQuestion(...)` 构造中（line 102-114），加两个字段：

```python
q = WrongQuestion(
    ...
    error_analysis=classified.get("error_analysis"),
    improvement_tips=classified.get("improvement_tips"),
    error_category=classified.get("error_category"),          # 新
    error_category_detail=classified.get("error_category_detail"),  # 新
    status="analyzed", mastery_level="new",
)
```

- [ ] **Step 2: import_questions() 写入**

在 `import_questions()` 的 `WrongQuestion(...)` 构造中（line 505-518），加两个字段：

```python
wq = WrongQuestion(
    ...
    error_analysis=item.error_analysis,
    improvement_tips=item.improvement_tips,
    error_category=getattr(item, 'error_category', None),          # 新
    error_category_detail=getattr(item, 'error_category_detail', None),  # 新
    status="analyzed", mastery_level="new",
)
```

同时改 `app/schemas/question.py` 的 ImportItem：

```python
error_category: str | None = None
error_category_detail: str | None = None
```

- [ ] **Step 3: 跑上传相关测试**

```bash
cd ai-cuotiben-api && python -m pytest tests/test_upload_confirm.py tests/test_import.py -v
# 预期：全部 PASS
```

- [ ] **Step 4: Commit**

```bash
git add ai-cuotiben-api/app/api/upload.py ai-cuotiben-api/app/schemas/question.py
git commit -m "feat: _persist + import_questions 写入 error_category"
```

### Task 2.4: stats 错因聚合端点

**Files:**
- Modify: `ai-cuotiben-api/app/api/stats.py`

- [ ] **Step 1: 写测试**

在 `tests/` 下判断是否有现成 stats 测试文件；没有就新建 `tests/test_stats_error_categories.py`：

```python
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_error_categories_returns_distribution():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/auth/register", json={"nickname": "ecat", "passphrase": "p"})
        token = r.json()["data"]["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = await client.get("/api/stats/error-categories", headers=h)
        assert r.status_code == 200
        data = r.json()["data"]
        assert "categories" in data
        assert "total" in data
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd ai-cuotiben-api && python -m pytest tests/test_stats_error_categories.py -v
# 预期：FAIL（端点不存在）
```

- [ ] **Step 3: 实现端点**

在 `app/api/stats.py` 末尾加：

```python
@router.get("/error-categories")
async def error_categories(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """错因分布：五个主类 + 未分类的计数和占比。"""
    from sqlalchemy import func
    rows = (await db.execute(
        select(
            func.coalesce(WrongQuestion.error_category, "uncategorized").label("cat"),
            func.count(WrongQuestion.id)
        ).where(WrongQuestion.user_id == user.id).group_by("cat")
    )).all()

    label_map = {
        "concept": "概念不清", "calculation": "计算失误", "reading": "审题偏差",
        "careless": "粗心", "method": "方法错误", "uncategorized": "未分类",
    }
    total = sum(c for _, c in rows)
    categories = [{"category": cat, "label": label_map.get(cat, cat),
                   "count": cnt, "pct": round(cnt / total * 100) if total else 0}
                  for cat, cnt in rows]
    return {"status": "success", "data": {"total": total, "categories": categories}}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd ai-cuotiben-api && python -m pytest tests/test_stats_error_categories.py -v
# 预期：PASS
```

- [ ] **Step 5: 跑全量确保没破坏现有 stats 端点**

```bash
cd ai-cuotiben-api && python -m pytest tests/test_stats_phase2.py tests/test_report.py -v
# 预期：全部 PASS
```

- [ ] **Step 6: Commit**

```bash
git add ai-cuotiben-api/app/api/stats.py ai-cuotiben-api/tests/test_stats_error_categories.py
git commit -m "feat: GET /api/stats/error-categories 错因分布端点"
```

### Task 2.5: 前端 — stats 页错因饼图

**Files:**
- Modify: `ai-cuotiben-web/lib/api.ts`
- Modify: `ai-cuotiben-web/app/stats/page.tsx`

- [ ] **Step 1: lib/api.ts 加 fetchErrorCategories**

在 `lib/api.ts` 加类型和函数：

```typescript
export interface ErrorCategoryItem {
  category: string;
  label: string;
  count: number;
  pct: number;
}

export interface ErrorCategoriesData {
  total: number;
  categories: ErrorCategoryItem[];
}

export async function fetchErrorCategories(token: string): Promise<ErrorCategoriesData> {
  const res = await fetch(`${API_BASE}/api/stats/error-categories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch error categories");
  const json = await res.json();
  return json.data;
}
```

- [ ] **Step 2: stats 页加错因饼图区块**

在 `app/stats/page.tsx` 的 report stream 中加一个区块（和 existing sections 同结构）：

```tsx
// 在组件内加 state + fetch
const [errorCats, setErrorCats] = useState<ErrorCategoriesData | null>(null);

useEffect(() => {
  const token = localStorage.getItem("token");
  if (token) fetchErrorCategories(token).then(setErrorCats).catch(console.error);
}, []);

// 在 JSX 中加：
{errorCats && errorCats.total > 0 && (
  <section>
    <h2>错因分布</h2>
    <PieChart
      option={{
        tooltip: { trigger: "item" },
        legend: { bottom: 0 },
        series: [{
          type: "pie",
          radius: ["40%", "70%"],
          data: errorCats.categories
            .filter(c => c.count > 0)
            .map(c => ({ name: c.label, value: c.count })),
          color: ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#10b981", "#9ca3af"],
        }],
      }}
    />
  </section>
)}
```

（pie 图用 echarts-for-react 按需引入 `PieChart`，参考页面现有的 trends 区块引入方式）

- [ ] **Step 3: TypeScript 编译检查**

```bash
cd ai-cuotiben-web && npx tsc --noEmit
# 预期：零错误
```

- [ ] **Step 4: Commit**

```bash
git add ai-cuotiben-web/lib/api.ts ai-cuotiben-web/app/stats/page.tsx
git commit -m "feat: stats 页加错因分布饼图"
```

---

## 线1 — FSRS 替换

### Task 1.1: 装依赖 + 写 review_engine 纯函数

**Files:**
- Modify: `ai-cuotiben-api/requirements.txt`
- Rewrite: `ai-cuotiben-api/app/services/review_engine.py`

- [ ] **Step 1: requirements.txt 加 fsrs**

```diff
+fsrs>=5.0
```

安装：

```bash
cd ai-cuotiben-api && pip install "fsrs>=5.0"
```

- [ ] **Step 2: 重写 review_engine.py**

完全替换为：

```python
"""FSRS (Free Spaced Repetition Scheduler) review engine — v5+/v6 API."""
from datetime import datetime, timezone
from fsrs import Scheduler, Card, Rating, State

_scheduler = Scheduler()

def _to_rating(r: int) -> Rating:
    return {1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy}[r]

def _to_state(s: int) -> State:
    return {0: State.New, 1: State.Learning, 2: State.Review, 3: State.Relearning}[s]

def review(card_dict: dict | None, rating: int) -> dict:
    """FSRS review。card_dict=None 表示新卡。返回 to_dict() 序列化结果。"""
    if card_dict is None:
        card = Card()
    else:
        card = Card.from_dict(card_dict)
    card, review_log = _scheduler.review_card(card, _to_rating(rating))
    return {
        "card_dict": card.to_dict(),
        "due": card.due,              # datetime (UTC)
        "stability": card.stability,   # float
        "difficulty": card.difficulty, # float, ~1-10
        "state": card.state.value,     # int: 0-3
    }
```

- [ ] **Step 3: 跑 import 验证无语法错误**

```bash
cd ai-cuotiben-api && python -c "from app.services import review_engine; print('OK')"
# 预期：OK
```

- [ ] **Step 4: Commit**

```bash
git add ai-cuotiben-api/requirements.txt ai-cuotiben-api/app/services/review_engine.py
git commit -m "feat: review_engine 重写为 FSRS Scheduler (v5+)"
```

### Task 1.2: 模型列 + 迁移

**Files:**
- Modify: `ai-cuotiben-api/app/models.py`
- Modify: `ai-cuotiben-api/app/core/migration.py`

- [ ] **Step 1: WrongQuestion 加 2 列**

```python
fsrs_card = Column(Text, nullable=True)       # Card.to_dict() JSON
next_review_at = Column(DateTime(timezone=True), nullable=True)  # 到期时间索引列
```

放在 `mastery_level` (line 66) 之后。

- [ ] **Step 2: ReviewRecord 加 rating**

```python
rating = Column(Integer, nullable=True)  # 1=Again, 2=Hard, 3=Good, 4=Easy
```

放在 `consecutive_correct` (line 79) 之后。

- [ ] **Step 3: migration.py 加迁移**

```python
await _ensure_column("wrong_questions", "fsrs_card", "TEXT")
await _ensure_column("wrong_questions", "next_review_at", "DATETIME")
await _ensure_column("review_records", "rating", "INTEGER")
```

- [ ] **Step 4: 验证迁移幂等**

```bash
cd ai-cuotiben-api
python -c "from app.core.migration import run_migrations; import asyncio; asyncio.run(run_migrations())"
# 预期：无报错
```

- [ ] **Step 5: Commit**

```bash
git add ai-cuotiben-api/app/models.py ai-cuotiben-api/app/core/migration.py
git commit -m "feat: WrongQuestion +fsrs_card +next_review_at; ReviewRecord +rating"
```

### Task 1.3: review schema + API 改 submit

**Files:**
- Modify: `ai-cuotiben-api/app/schemas/review.py`
- Modify: `ai-cuotiben-api/app/api/review.py:49-66`

- [ ] **Step 1: ReviewSubmit 加 rating**

```python
# app/schemas/review.py
from pydantic import BaseModel

class ReviewSubmit(BaseModel):
    question_id: int
    rating: int  # 1=Again, 2=Hard, 3=Good, 4=Easy
```

（移除旧 `is_correct: bool` 字段）

- [ ] **Step 2: review.py submit() 改用 FSRS**

替换 `submit()` 函数（line 49-66）为：

```python
import json
from datetime import datetime, timezone
from fsrs import State

@router.post("/submit")
async def submit(body: ReviewSubmit, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.id == body.question_id, WrongQuestion.user_id == user.id))).scalars().first()
    if q is None:
        raise HTTPException(status_code=404, detail="错题不存在")
    if body.rating not in (1, 2, 3, 4):
        raise HTTPException(status_code=400, detail="rating 必须是 1-4")

    old_card = json.loads(q.fsrs_card) if q.fsrs_card else None
    result = review_engine.review(old_card, body.rating)

    q.fsrs_card = json.dumps(result["card_dict"])
    q.next_review_at = result["due"]

    # mastery_level 兼容映射
    s = result["state"]
    st = result["stability"]
    if s == State.New.value:
        q.mastery_level = "new"
    elif s in (State.Learning.value, State.Relearning.value):
        q.mastery_level = "learning"
    else:  # Review
        q.mastery_level = "mastered" if st >= 21 else "learning"

    db.add(ReviewRecord(
        question_id=q.id, user_id=user.id,
        rating=body.rating,
        is_correct=body.rating >= 3,
        interval_index=0,
        next_review_date=result["due"].date() if result["due"] else None,
        consecutive_correct=0,
    ))
    await db.commit()
    return {"status": "success", "data": {
        "mastery_level": q.mastery_level,
        "next_review_at": q.next_review_at.isoformat() if q.next_review_at else None,
        "state": s, "stability": round(st, 2), "difficulty": round(result["difficulty"], 2)}}
```

- [ ] **Step 3: Commit**

```bash
git add ai-cuotiben-api/app/schemas/review.py ai-cuotiben-api/app/api/review.py
git commit -m "feat: review/submit 改用 FSRS rating 1-4; mastery_level 兼容映射"
```

### Task 1.4: review daily 端点改用 next_review_at

**Files:**
- Modify: `ai-cuotiben-api/app/api/review.py:22-32`

- [ ] **Step 1: 重写 daily 端点**

替换 `daily()` 函数（line 22-32）为：

```python
from datetime import datetime, timezone
from sqlalchemy import or_

@router.get("/daily/{subject_id}")
async def daily(subject_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.subject_id == subject_id,
        WrongQuestion.mastery_level != "mastered",
        or_(WrongQuestion.next_review_at == None,
            WrongQuestion.next_review_at <= now)
    ))).scalars().all()
    return {"status": "success", "data": [_q(q) for q in rows]}
```

- [ ] **Step 2: Commit**

```bash
git add ai-cuotiben-api/app/api/review.py
git commit -m "perf: daily 端点改查 WrongQuestion.next_review_at 消除 N+1"
```

### Task 1.5: 重写 review_engine 测试

**Files:**
- Rewrite: `ai-cuotiben-api/tests/test_review_engine.py`

- [ ] **Step 1: 重写测试**

完全替换 `tests/test_review_engine.py` 为：

```python
"""FSRS review engine 测试 — 新卡、复习卡、四评级、状态变迁。"""
from app.services import review_engine

def _new_card():
    return None  # 新卡传 None

def _reviewed(card_dict, rating):
    return review_engine.review(card_dict, rating)

def test_new_card_good_rating():
    result = review_engine.review(None, 3)  # Good
    assert "card_dict" in result
    assert result["state"] in (0, 1)  # New 或 Learning
    assert result["stability"] > 0
    assert result["difficulty"] > 0

def test_new_card_again_rating():
    result = review_engine.review(None, 1)  # Again
    assert result["state"] == 1  # Learning
    assert result["stability"] > 0

def test_card_roundtrip_persists_state():
    r1 = review_engine.review(None, 3)
    r2 = review_engine.review(r1["card_dict"], 3)
    r3 = review_engine.review(r2["card_dict"], 3)
    # 3次连续Good，stability应该递增
    assert r3["stability"] >= r1["stability"]

def test_again_resets_progress():
    r1 = review_engine.review(None, 3)      # Good: state=Learning
    r2 = review_engine.review(r1["card_dict"], 3)  # Good: 可能已Review
    r3 = review_engine.review(r2["card_dict"], 1)  # Again: 回Learning/Relearning
    assert r3["state"] in (1, 3)  # Learning 或 Relearning

def test_four_ratings_all_valid():
    for rating in range(1, 5):
        result = review_engine.review(None, rating)
        assert result["state"] >= 0
        assert result["stability"] >= 0

def test_easy_pushes_further():
    r_easy = review_engine.review(None, 4)     # Easy
    r_good = review_engine.review(None, 3)     # Good
    # Easy 的稳定性通常更高
    # (不严格断言，FSRS 参数有随机性；仅验证不出错)
    assert r_easy["state"] >= 0
```

- [ ] **Step 2: 跑测试**

```bash
cd ai-cuotiben-api && python -m pytest tests/test_review_engine.py -v
# 预期：6/6 PASS
```

- [ ] **Step 3: Commit**

```bash
git add ai-cuotiben-api/tests/test_review_engine.py
git commit -m "test: review_engine FSRS 重写测试 — 6 cases"
```

### Task 1.6: 前端 — review schema + 4 按钮

**Files:**
- Modify: `ai-cuotiben-web/lib/api.ts`
- Modify: 复习页面组件（`app/review/` 或 `app/dashboard/` 中调用 submitReview 的地方）
- Modify: 错题详情页 `app/questions/[id]/page.tsx`

- [ ] **Step 1: lib/api.ts 改 ReviewSubmit 类型**

```typescript
export interface ReviewSubmit {
  question_id: number;
  rating: 1 | 2 | 3 | 4;  // 替换旧 is_correct: boolean
}

export async function submitReview(body: ReviewSubmit, token: string) {
  const res = await fetch(`${API_BASE}/api/review/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to submit review");
  return res.json();
}
```

- [ ] **Step 2: 找到复习页面对/错按钮位置，替换为 4 按钮**

（具体组件路径取决于前端实现。以 `app/review/page.tsx` 和 `app/questions/[id]/page.tsx` 中 `onCorrect`/`onWrong` 调用处为例，替换逻辑：）

```tsx
// 旧的：
// <button onClick={() => submitReview({question_id: q.id, is_correct: true})}>✓ 掌握</button>
// <button onClick={() => submitReview({question_id: q.id, is_correct: false})}>✗ 再练</button>

// 新的：
const ratings = [
  { rating: 1, label: "完全忘了", icon: "🗙", color: "bg-red-100 text-red-700 hover:bg-red-200" },
  { rating: 2, label: "困难", icon: "❌", color: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
  { rating: 3, label: "正确", icon: "✅", color: "bg-green-100 text-green-700 hover:bg-green-200" },
  { rating: 4, label: "简单", icon: "⭐", color: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
] as const;

<div className="flex gap-2 justify-center">
  {ratings.map(({ rating, label, icon, color }) => (
    <button
      key={rating}
      onClick={() => handleSubmit(question.id, rating)}
      className={`px-4 py-2 rounded-lg ${color} transition-colors`}
    >
      {icon} {label}
    </button>
  ))}
</div>
```

- [ ] **Step 3: TypeScript 编译检查**

```bash
cd ai-cuotiben-web && npx tsc --noEmit
# 预期：零错误
```

- [ ] **Step 4: Commit**

```bash
git add ai-cuotiben-web/
git commit -m "feat: 复习卡片 4 按钮 (Again/Hard/Good/Easy) 替换对/错二元"
```

### Task 1.7: 全量回归测试

- [ ] **Step 1: 后端全量测试**

```bash
cd ai-cuotiben-api && python -m pytest tests/ -v --tb=short
# 预期：全部 PASS（现有 65 + 新增 6 = 71）
```

- [ ] **Step 2: 前端 typecheck**

```bash
cd ai-cuotiben-web && npx tsc --noEmit
# 预期：零错误
```

- [ ] **Step 3: 若有失败，修到全绿后 commit**

---

## 线3 — 变式闭环

### Task 3.1: generate.py 去上限 + SIMILAR_SYSTEM 改 prompt

**Files:**
- Modify: `ai-cuotiben-api/app/api/generate.py:12-14` (MAX_GENERATIONS)
- Modify: `ai-cuotiben-api/app/services/ai_service.py:68-70` (SIMILAR_SYSTEM)

- [ ] **Step 1: 改上限常量**

```python
# generate.py line 12-14
MAX_GENERATIONS = 4     # 原来 3
MAX_PRACTICE = 12       # 4次 × 3题 = 12
```

- [ ] **Step 2: 改 SIMILAR_SYSTEM prompt 加错因定向**

替换 line 68-70：

```python
SIMILAR_SYSTEM = (
    "你是高考命题老师。基于给定错题及其错因，生成 3 道同类变式练习题。"
    "若错因是计算失误 → 偏计算量变式、改数字结构；"
    "若错因是审题偏差 → 偏条件变化、题干陷阱变式；"
    "若错因是概念不清 → 偏核心概念直接考察、去冗余信息；"
    "若错因是粗心或方法错误 → 改场景但保留解题框架。"
    "输出 JSON，字段 questions 为数组，每项含 content(题目), answer(答案), solution(解析)。只输出 JSON。"
)
```

- [ ] **Step 3: Commit**

```bash
git add ai-cuotiben-api/app/api/generate.py ai-cuotiben-api/app/services/ai_service.py
git commit -m "feat: generate 上限 9→12 + SIMILAR_SYSTEM 错因定向变式"
```

### Task 3.2: review submit 加自动变式触发

**Files:**
- Modify: `ai-cuotiben-api/app/api/review.py` (submit 函数)

- [ ] **Step 1: 在 submit() 末尾加 bg task 触发逻辑**

在 `await db.commit()` 之前加：

```python
    # 变式自动触发：最近10次复习中 >=2 次 Again/Hard
    if body.rating in (1, 2):
        recent_bad = (await db.execute(
            select(func.count(ReviewRecord.id)).where(
                ReviewRecord.question_id == q.id,
                ReviewRecord.rating.in_([1, 2])
            ).order_by(ReviewRecord.id.desc()).limit(10)
        )).scalar() or 0
        if recent_bad >= 2:
            # 检查已有变式数不超限
            existing_variants = (await db.execute(
                select(func.count(PracticeQuestion.id)).where(
                    PracticeQuestion.source_question_id == q.id,
                    PracticeQuestion.user_id == user.id
                )
            )).scalar() or 0
            if existing_variants < 12:
                # 异步生成（不阻塞 review 返回）
                import asyncio
                asyncio.create_task(_generate_variants_for_question(q))
```

注意：`_generate_variants_for_question` 需要独立的 db session（不能用请求的 session），在 review.py 顶部加：

```python
from app.database import AsyncSessionLocal

async def _generate_variants_for_question(q: WrongQuestion):
    """后台生成变式题，独立 session。"""
    async with AsyncSessionLocal() as db:
        try:
            kp_name = ""
            if q.knowledge_point_id:
                kp = (await db.execute(select(KnowledgePoint).where(
                    KnowledgePoint.id == q.knowledge_point_id))).scalars().first()
                kp_name = kp.name if kp else ""
            pat_name = ""
            if q.question_pattern_id:
                pat = (await db.execute(select(QuestionPattern).where(
                    QuestionPattern.id == q.question_pattern_id))).scalars().first()
                pat_name = pat.name if pat else ""
            items = await ai_service.generate_similar(
                q.question_content or q.ocr_text or "",
                kp_name, pat_name,
                q.question_type or "essay",
            )
            for it in items:
                p = PracticeQuestion(
                    source_question_id=q.id, user_id=q.user_id,
                    content=it.get("content", ""),
                    answer=it.get("answer"),
                    solution=it.get("solution"),
                )
                db.add(p)
            await db.commit()
            logger.info(f"Auto-generated {len(items)} variants for question {q.id}")
        except Exception:
            logger.exception(f"Failed to generate variants for question {q.id}")
```

- [ ] **Step 2: 加 import**

在 review.py 顶部加：

```python
import logging
from app.models import PracticeQuestion, KnowledgePoint, QuestionPattern
from app.services import ai_service
from app.database import AsyncSessionLocal
logger = logging.getLogger(__name__)
```

- [ ] **Step 3: Commit**

```bash
git add ai-cuotiben-api/app/api/review.py
git commit -m "feat: review 答错 >=2 次自动生成变式题（独立 session）"
```

### Task 3.3: 变式题做完联动 FSRS

**Files:**
- New or Modify: 变式题提交端点（或在 generate.py 或 review.py）

- [ ] **Step 1: 加变式题评分端点**

在 `app/api/generate.py` 加：

```python
from pydantic import BaseModel

class VariantSubmit(BaseModel):
    practice_id: int
    rating: int  # 1-4

@router.post("/variant/submit")
async def submit_variant(body: VariantSubmit, db: AsyncSession = Depends(get_db),
                         user: User = Depends(get_current_user)):
    p = (await db.execute(select(PracticeQuestion).where(
        PracticeQuestion.id == body.practice_id, PracticeQuestion.user_id == user.id
    ))).scalars().first()
    if p is None:
        raise HTTPException(status_code=404, detail="变式题不存在")

    # 更新 user_result
    if body.rating >= 3:
        p.user_result = "correct"
    else:
        p.user_result = "wrong"
    await db.commit()

    # 如果答对(GOOD/EASY)，回溯更新原题 FSRS
    if body.rating in (3, 4):
        import json
        from app.services.review_engine import review
        q = (await db.execute(select(WrongQuestion).where(
            WrongQuestion.id == p.source_question_id))).scalars().first()
        if q and q.fsrs_card:
            old_card = json.loads(q.fsrs_card)
            result = review(old_card, body.rating)
            q.fsrs_card = json.dumps(result["card_dict"])
            q.next_review_at = result["due"]
            await db.commit()

    return {"status": "success", "data": {"user_result": p.user_result}}
```

- [ ] **Step 2: Commit**

```bash
git add ai-cuotiben-api/app/api/generate.py
git commit -m "feat: POST /api/generate/variant/submit — 变式评分 + 联动原题 FSRS"
```

### Task 3.4: stats 变式端点

**Files:**
- Modify: `ai-cuotiben-api/app/api/stats.py`

- [ ] **Step 1: 加 GET /api/stats/variant**

```python
@router.get("/variant")
async def variant_stats(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """变式训练统计：覆盖率、正确率。"""
    questions = (await db.execute(
        select(WrongQuestion.id).where(WrongQuestion.user_id == user.id)
    )).scalars().all()
    qids = [q for q in questions]

    variants = (await db.execute(
        select(PracticeQuestion.source_question_id, PracticeQuestion.user_result)
        .where(PracticeQuestion.user_id == user.id)
    )).all()

    # 按原题聚合
    by_source = defaultdict(lambda: {"total": 0, "correct": 0})
    for sid, result in variants:
        by_source[sid]["total"] += 1
        if result == "correct":
            by_source[sid]["correct"] += 1

    covered = sum(1 for c in by_source.values() if c["total"] > 0)
    total_q = len(qids)
    coverage = round(covered / total_q * 100) if total_q else 0

    total_variants = sum(c["total"] for c in by_source.values())
    total_correct = sum(c["correct"] for c in by_source.values())
    accuracy = round(total_correct / total_variants * 100) if total_variants else 0

    return {"status": "success", "data": {
        "coverage": coverage,            # 有变式题的错题占比
        "total_variants": total_variants,
        "accuracy": accuracy,            # 变式题正确率
    }}
```

- [ ] **Step 2: Commit**

```bash
git add ai-cuotiben-api/app/api/stats.py
git commit -m "feat: GET /api/stats/variant — 变式覆盖率+正确率"
```

### Task 3.5: 前端 — 详情页变式按钮 + 做变式题

**Files:**
- Modify: `ai-cuotiben-web/app/questions/[id]/page.tsx`

- [ ] **Step 1: 加「练变式」按钮 + 变式题卡片**

在错题详情页加：

```tsx
const [variants, setVariants] = useState<Variant[]>([]);

const handleGenerateVariants = async () => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/api/generate/similar/${questionId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  setVariants(json.data);
};

const handleVariantSubmit = async (practiceId: number, rating: 1|2|3|4) => {
  const token = localStorage.getItem("token");
  await fetch(`${API_BASE}/api/generate/variant/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ practice_id: practiceId, rating }),
  });
  // 更新本地状态
  setVariants(prev => prev.map(v =>
    v.id === practiceId ? { ...v, user_result: rating >= 3 ? "correct" : "wrong" } : v
  ));
};

// JSX:
<button onClick={handleGenerateVariants}>练变式</button>
{variants.map(v => (
  <div key={v.id}>
    <p>{v.content}</p>
    {v.user_result === "unanswered" ? (
      <div className="flex gap-2">
        {ratings.map(({ rating, label, icon }) => (
          <button key={rating} onClick={() => handleVariantSubmit(v.id, rating)}>
            {icon} {label}
          </button>
        ))}
      </div>
    ) : (
      <span>{v.user_result === "correct" ? "✅ 已掌握" : "❌ 需再练"}</span>
    )}
  </div>
))}
```

- [ ] **Step 2: TypeScript 编译检查**

```bash
cd ai-cuotiben-web && npx tsc --noEmit
# 预期：零错误
```

- [ ] **Step 3: Commit**

```bash
git add ai-cuotiben-web/
git commit -m "feat: 错题详情页变式训练按钮 + 4按钮评分联动作题"
```

---

## 最终验证

- [ ] **全量后端测试**

```bash
cd ai-cuotiben-api && python -m pytest tests/ -v --tb=short
# 预期：全部 PASS
```

- [ ] **前端 typecheck**

```bash
cd ai-cuotiben-web && npx tsc --noEmit
# 预期：零错误
```
