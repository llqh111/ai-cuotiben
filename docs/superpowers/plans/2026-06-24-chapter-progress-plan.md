# 章节进度追踪 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AI 错题本中新增章节进度追踪模块（`/progress` 页面），支持六科三层章节树浏览、1-5 星自评掌握度、错题数交叉验证。

**Architecture:** 后端新增 `Chapter` 模型 + 手动迁移 `knowledge_points` 加 `chapter_id` 列 + 8 个 API 端点。前端新增 `/progress` 页面（可折叠树 + 评级交互），仪表盘加进度卡片，导航加入口。Seed 挂在 register/login 上，幂等补建章节数据。

**Tech Stack:** Python FastAPI + SQLAlchemy async + SQLite/PostgreSQL + Next.js 16 + TypeScript + Tailwind v4 + Motion + Phosphor Icons

---

### Task 1: Model & Migration — 新增 Chapter 模型 + knowledge_points 扩展 + 迁移函数

**Files:**
- Modify: `ai-cuotiben-api/app/models.py` (add Chapter, extend KnowledgePoint)
- Create: `ai-cuotiben-api/app/core/migration.py`
- Modify: `ai-cuotiben-api/main.py` (import + call run_migrations)

- [ ] **Step 1: 在 models.py 添加 Chapter 模型和 KnowledgePoint 扩展**

在 `app/models.py` 末尾添加（`KnowledgeRelation` 之后）：

```python
class Chapter(Base):
    __tablename__ = "chapters"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), index=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("chapters.id"), nullable=True)
    name = Column(String(200), nullable=False)
    sort_order = Column(Integer, default=0)
    description = Column(Text, nullable=True)
    mastery_rating = Column(Integer, nullable=True)  # 1-5
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

在 `KnowledgePoint` 类的 `description` 行后添加：

```python
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=True)
```

- [ ] **Step 2: 创建 migration.py**

新建 `ai-cuotiben-api/app/core/migration.py`：

```python
"""轻量手动迁移：检测并补建缺失列，不走 Alembic。"""
from sqlalchemy import text
from app.database import engine, DATABASE_URL

async def _has_column(table: str, column: str) -> bool:
    async with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            rows = await conn.execute(text(f"PRAGMA table_info({table})"))
            return any(row[1] == column for row in rows)
        else:
            # PostgreSQL
            rows = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :tbl AND column_name = :col"
            ), {"tbl": table, "col": column})
            return rows.scalar() is not None

async def run_migrations():
    if not await _has_column("knowledge_points", "chapter_id"):
        async with engine.begin() as conn:
            await conn.execute(text(
                "ALTER TABLE knowledge_points ADD COLUMN chapter_id INTEGER"
            ))
```

- [ ] **Step 3: 在 main.py 中接入迁移**

在 `main.py` 顶部 import 区添加：

```python
from app.core.migration import run_migrations
```

在 `lifespan` 的 startup 中，`create_all` 之后、`seed_subjects` 之前插入：

```python
        await run_migrations()
```

修改后 `lifespan` 的 startup 部分应变为：

```python
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await run_migrations()
    async with AsyncSessionLocal() as session:
        await seed_subjects(session)
```

- [ ] **Step 4: 重启后端验证**

```bash
cd D:\Documents\Wrong-question-book\ai-cuotiben-api
# 如果现有数据库不需要保留测试数据，可先删除 cuotiben.db 重建
uvicorn main:app --reload
```

检查日志无报错，确认 `chapters` 表创建成功且 `knowledge_points` 表有 `chapter_id` 列。

- [ ] **Step 5: Commit**

```bash
git add ai-cuotiben-api/app/models.py ai-cuotiben-api/app/core/migration.py ai-cuotiben-api/main.py
git commit -m "feat: add Chapter model and migration for knowledge_points.chapter_id"
```

---

### Task 2: Seed — 考纲预置数据 + register/login 触发

**Files:**
- Modify: `ai-cuotiben-api/app/core/seed.py`
- Modify: `ai-cuotiben-api/app/api/auth.py`

- [ ] **Step 1: 在 seed.py 添加 CHAPTERS_SEED 和 seed_chapters()**

在 `app/core/seed.py` 底部追加：

```python
from app.models import Chapter

CHAPTERS_SEED = {
    2: {  # 数学 (subject_id=2)
        "函数与导数": ["函数概念与性质", "基本初等函数", "导数及其应用", "函数综合问题"],
        "解析几何": ["直线与圆", "椭圆", "双曲线", "抛物线", "综合应用"],
        "立体几何": ["空间向量", "线面关系", "空间角与距离", "几何体表面积与体积"],
        "概率统计": ["排列组合", "概率模型", "随机变量与分布", "统计初步"],
        "数列": ["等差数列", "等比数列", "数列求和", "递推关系"],
        "三角函数": ["三角变换", "图像与性质", "解三角形"],
        "平面向量与复数": ["向量运算", "向量应用", "复数"],
        "不等式": ["一元二次不等式", "线性规划", "基本不等式"],
        "集合与逻辑": ["集合运算", "命题与条件"],
    },
    4: {  # 物理 (subject_id=4)
        "力学": ["运动学", "牛顿定律", "曲线运动", "万有引力", "动量与能量"],
        "电磁学": ["静电场", "恒定电流", "磁场", "电磁感应", "交变电流"],
        "热学": ["分子动理论", "热力学定律", "理想气体"],
        "光学": ["几何光学", "波动光学"],
        "原子物理": ["原子结构", "原子核", "光电效应"],
        "实验": ["力学实验", "电学实验", "光学实验"],
    },
    5: {  # 化学 (subject_id=5)
        "化学基本概念": ["物质的量", "离子反应", "氧化还原反应"],
        "元素与化合物": ["金属元素", "非金属元素", "无机推断"],
        "化学反应原理": ["反应热", "速率与平衡", "水溶液中的离子平衡"],
        "有机化学": ["烃及衍生物", "有机合成", "有机推断"],
        "物质结构": ["原子结构", "分子结构", "晶体结构"],
        "化学实验": ["基本操作", "物质的制备与分离", "定量实验"],
    },
    6: {  # 生物 (subject_id=6)
        "分子与细胞": ["细胞的分子组成", "细胞结构", "细胞代谢", "细胞增殖"],
        "遗传与进化": ["遗传规律", "基因与染色体", "变异与育种", "生物进化"],
        "稳态与调节": ["内环境稳态", "神经调节", "体液调节", "免疫调节"],
        "生物与环境": ["种群与群落", "生态系统", "环境保护"],
        "生物技术": ["基因工程", "细胞工程", "发酵工程"],
        "实验与探究": ["显微观察", "生理实验", "探究性实验设计"],
    },
    1: {  # 语文 (subject_id=1)
        "语言文字运用": ["字音字形", "词语成语", "病句辨析", "语言表达"],
        "文言文阅读": ["实词虚词", "文言句式", "翻译与文化常识"],
        "古代诗歌": ["意境与手法", "情感与主旨", "比较鉴赏"],
        "现代文阅读": ["论述类文本", "文学类文本", "实用类文本"],
        "作文": ["审题立意", "结构章法", "素材运用", "语言文采"],
    },
    3: {  # 英语 (subject_id=3)
        "阅读理解": ["细节理解", "推理判断", "主旨大意", "词义猜测"],
        "完形填空": ["上下文逻辑", "词汇辨析", "固定搭配"],
        "语法填空": ["词性转换", "时态语态", "从句连词"],
        "短文改错": ["语法错误", "逻辑错误", "格式错误"],
        "书面表达": ["书信邮件", "议论文", "图表作文", "续写"],
        "听力理解": ["短对话", "长对话与独白"],
    },
}

async def seed_chapters(session, user_id: int):
    from sqlalchemy import select
    existing = await session.execute(
        select(Chapter).where(Chapter.user_id == user_id).limit(1)
    )
    if existing.scalar():
        return  # 已有章节数据，幂等跳过

    for subject_id, chapters in CHAPTERS_SEED.items():
        for chapter_name, sections in chapters.items():
            chapter = Chapter(user_id=user_id, subject_id=subject_id, name=chapter_name, sort_order=0)
            session.add(chapter)
            await session.flush()  # 获取 chapter.id
            for section_name in sections:
                section = Chapter(
                    user_id=user_id, subject_id=subject_id,
                    parent_id=chapter.id, name=section_name, sort_order=0
                )
                session.add(section)
    await session.commit()
```

- [ ] **Step 2: 在 auth.py 的 register 和 login 中调用 seed_chapters**

在 `auth.py` 顶部 import 补充：

```python
from app.core.seed import seed_chapters
```

**修改 register 端点**（在 `return _ok(user)` 之前插入 seed 调用）：

```python
@router.post("/register")
async def register(body: AuthRequest, db: AsyncSession = Depends(get_db)):
    existing = await _find_by_combo(db, body.nickname, body.passphrase)
    if existing:
        await seed_chapters(db, existing.id)  # 老用户可能无章节
        return _ok(existing)
    user = User(nickname=body.nickname, passphrase_hash=security.hash_passphrase(body.passphrase))
    db.add(user); await db.commit(); await db.refresh(user)
    await seed_chapters(db, user.id)  # 新用户建章节
    return _ok(user)
```

**修改 login 端点**（在 `return _ok(user)` 之前）：

```python
@router.post("/login")
async def login(body: AuthRequest, db: AsyncSession = Depends(get_db)):
    user = await _find_by_combo(db, body.nickname, body.passphrase)
    if not user:
        raise HTTPException(status_code=401, detail="昵称或口令错误")
    user.last_login_at = func.now()
    await db.commit()
    await seed_chapters(db, user.id)  # 登录时补建章节
    return _ok(user)
```

- [ ] **Step 3: 重启后端验证 seed**

重启后端，调用注册/登录接口，检查数据库 `chapters` 表是否有数据插入：

```bash
# 重启后手动测试
curl -X POST http://localhost:8000/api/auth/register -H 'Content-Type: application/json' -d '{"nickname":"test_seed","passphrase":"123"}'
# 查看 cuotiben.db 中 chapters 表
```

- [ ] **Step 4: Commit**

```bash
git add ai-cuotiben-api/app/core/seed.py ai-cuotiben-api/app/api/auth.py
git commit -m "feat: add chapter seed data, trigger on register/login"
```

---

### Task 3: API — 章节 CRUD + 进度端点

**Files:**
- Create: `ai-cuotiben-api/app/schemas/chapters.py`
- Create: `ai-cuotiben-api/app/api/chapters.py`
- Modify: `ai-cuotiben-api/main.py` (register router)

- [ ] **Step 1: 创建 schemas/chapters.py**

```python
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

class ChapterCreate(BaseModel):
    subject_id: int
    parent_id: Optional[int] = None
    name: str

class ChapterUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
    description: Optional[str] = None

class RatingPatch(BaseModel):
    mastery_rating: int  # 1-5

class NotesPatch(BaseModel):
    notes: str

class ChapterNode(BaseModel):
    id: int
    name: str
    level: int
    mastery_rating: Optional[int] = None
    error_count: int = 0
    reviewed_at: Optional[datetime] = None
    notes: Optional[str] = None
    children: List["ChapterNode"] = []

class ChapterTree(BaseModel):
    subject_id: int
    nodes: List[ChapterNode]

class ProgressSummary(BaseModel):
    subject_id: int
    subject_name: str
    total: int
    reviewed: int
    avg_rating: Optional[float] = None
    coverage: float  # percentage

class ChapterProgress(BaseModel):
    subjects: List[ProgressSummary]
```

- [ ] **Step 2: 创建 api/chapters.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Chapter, KnowledgePoint, WrongQuestion, User
from app.core.security import get_current_user
from app.schemas.chapters import (
    ChapterCreate, ChapterUpdate, RatingPatch, NotesPatch,
    ChapterNode, ChapterTree, ProgressSummary, ChapterProgress
)

router = APIRouter()


def _build_tree_nodes(chapters: list, parent_id: int | None = None, level: int = 0) -> list[ChapterNode]:
    """扁平 Chapter 列表转为嵌套树结构。"""
    children = [c for c in chapters if c.parent_id == parent_id]
    result = []
    for c in sorted(children, key=lambda x: (x.sort_order or 0, x.id)):
        node = ChapterNode(
            id=c.id,
            name=c.name,
            level=level,
            mastery_rating=c.mastery_rating,
            error_count=getattr(c, "error_count", 0),
            reviewed_at=c.reviewed_at,
            notes=c.notes,
            children=_build_tree_nodes(chapters, c.id, level + 1),
        )
        result.append(node)
    return result


@router.get("/chapters", response_model=ChapterTree)
async def get_chapters(subject_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # 取该用户该科目下所有章节 + 每条叶子节点关联的错题数
    chapters = (await db.execute(
        select(Chapter).where(Chapter.user_id == user.id, Chapter.subject_id == subject_id)
    )).scalars().all()

    # 批量取错题数：子查询每个 chapter 的 wrong_question count
    chapter_ids = [c.id for c in chapters]
    if chapter_ids:
        # 通过 knowledge_points.chapter_id 关联
        kp_subq = select(KnowledgePoint.id).where(KnowledgePoint.chapter_id.in_(chapter_ids)).subquery()
        err_rows = (await db.execute(
            select(WrongQuestion.knowledge_point_id, func.count().label("cnt"))
            .where(WrongQuestion.knowledge_point_id.in_(select(kp_subq)))
            .group_by(WrongQuestion.knowledge_point_id)
        )).all()
        kp_err_map = {row[0]: row[1] for row in err_rows}

        # 对每个 chapter，取它下面所有 knowledge_point 的错题总和
        # 简化：只算直接子节点的错题数（level 2 叶子），递归不划算
        # 用 chapter_id 到 kp 到 wq 的两次 join
        err_by_chapter = (await db.execute(
            select(KnowledgePoint.chapter_id, func.count(WrongQuestion.id))
            .join(WrongQuestion, WrongQuestion.knowledge_point_id == KnowledgePoint.id)
            .where(KnowledgePoint.chapter_id.in_(chapter_ids))
            .group_by(KnowledgePoint.chapter_id)
        )).all()
        err_map = {row[0]: row[1] for row in err_by_chapter}
    else:
        err_map = {}

    for c in chapters:
        c.error_count = err_map.get(c.id, 0)

    nodes = _build_tree_nodes(chapters)
    return ChapterTree(subject_id=subject_id, nodes=nodes)


@router.post("/chapters")
async def create_chapter(body: ChapterCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    chapter = Chapter(user_id=user.id, subject_id=body.subject_id, parent_id=body.parent_id, name=body.name)
    db.add(chapter)
    await db.commit()
    await db.refresh(chapter)
    return {"status": "success", "data": {"id": chapter.id, "name": chapter.name}}


@router.put("/chapters/{chapter_id}")
async def update_chapter(chapter_id: int, body: ChapterUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    ch = (await db.execute(select(Chapter).where(Chapter.id == chapter_id, Chapter.user_id == user.id))).scalar()
    if not ch:
        raise HTTPException(status_code=404, detail="章节不存在")
    if body.name is not None:
        ch.name = body.name
    if body.sort_order is not None:
        ch.sort_order = body.sort_order
    if body.description is not None:
        ch.description = body.description
    await db.commit()
    return {"status": "success"}


@router.delete("/chapters/{chapter_id}")
async def delete_chapter(chapter_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    ch = (await db.execute(select(Chapter).where(Chapter.id == chapter_id, Chapter.user_id == user.id))).scalar()
    if not ch:
        raise HTTPException(status_code=404, detail="章节不存在")
    # 级联删除子节点
    children = (await db.execute(select(Chapter).where(Chapter.parent_id == chapter_id))).scalars().all()
    for child in children:
        await db.delete(child)
    await db.delete(ch)
    await db.commit()
    return {"status": "success"}


@router.patch("/chapters/{chapter_id}/rating")
async def patch_rating(chapter_id: int, body: RatingPatch, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if body.mastery_rating < 1 or body.mastery_rating > 5:
        raise HTTPException(status_code=422, detail="掌握度必须在 1-5 之间")
    ch = (await db.execute(select(Chapter).where(Chapter.id == chapter_id, Chapter.user_id == user.id))).scalar()
    if not ch:
        raise HTTPException(status_code=404, detail="章节不存在")
    ch.mastery_rating = body.mastery_rating
    ch.reviewed_at = func.now()
    await db.commit()
    return {"status": "success"}


@router.patch("/chapters/{chapter_id}/notes")
async def patch_notes(chapter_id: int, body: NotesPatch, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    ch = (await db.execute(select(Chapter).where(Chapter.id == chapter_id, Chapter.user_id == user.id))).scalar()
    if not ch:
        raise HTTPException(status_code=404, detail="章节不存在")
    ch.notes = body.notes
    await db.commit()
    return {"status": "success"}


@router.get("/chapters/progress")
async def get_progress(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    chapters = (await db.execute(
        select(Chapter).where(Chapter.user_id == user.id)
    )).scalars().all()

    # 按科目聚合
    from collections import defaultdict
    by_subject = defaultdict(list)
    for c in chapters:
        by_subject[c.subject_id].append(c)

    subjects_data = []
    SUBJECT_NAMES = {1: "语文", 2: "数学", 3: "英语", 4: "物理", 5: "化学", 6: "生物"}
    for sid in sorted(by_subject.keys()):
        chs = by_subject[sid]
        leaf_only = [c for c in chs if c.parent_id is not None]
        total = len(leaf_only)
        rated = [c for c in leaf_only if c.mastery_rating is not None]
        reviewed = len(rated)
        avg = sum(r.mastery_rating for r in rated) / len(rated) if rated else None
        coverage = (reviewed / total * 100) if total > 0 else 0
        subjects_data.append(ProgressSummary(
            subject_id=sid,
            subject_name=SUBJECT_NAMES.get(sid, str(sid)),
            total=total,
            reviewed=reviewed,
            avg_rating=round(avg, 1) if avg else None,
            coverage=round(coverage, 1),
        ))

    return {"status": "success", "data": ChapterProgress(subjects=subjects_data)}


@router.get("/chapters/{chapter_id}/errors")
async def get_errors(chapter_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    ch = (await db.execute(select(Chapter).where(Chapter.id == chapter_id, Chapter.user_id == user.id))).scalar()
    if not ch:
        raise HTTPException(status_code=404, detail="章节不存在")
    kps = (await db.execute(
        select(KnowledgePoint.id).where(KnowledgePoint.chapter_id == chapter_id)
    )).scalars().all()
    if not kps:
        return {"status": "success", "data": []}
    questions = (await db.execute(
        select(WrongQuestion).where(
            WrongQuestion.user_id == user.id,
            WrongQuestion.knowledge_point_id.in_(list(kps))
        ).order_by(WrongQuestion.created_at.desc()).limit(50)
    )).scalars().all()
    # 仅返回摘要，不返回完整内容以减小 payload
    result = [{
        "id": q.id,
        "question_content": q.question_content[:200] if q.question_content else "",
        "question_type": q.question_type,
        "mastery_level": q.mastery_level,
        "created_at": q.created_at.isoformat() if q.created_at else None,
    } for q in questions]
    return {"status": "success", "data": result}
```

- [ ] **Step 3: 在 main.py 注册 chapters router**

在 `main.py` 的 import 区添加：

```python
from app.api import chapters
```

在 router 注册区（`graph.router` 之后）添加：

```python
app.include_router(chapters.router, prefix="/api", tags=["Chapters"])
```

注意：Chapter router 内部路径已经以 `/chapters` 开头，所以 prefix 用 `/api` 即可。

- [ ] **Step 4: 验证 API 可访问**

重启后端，测试：

```bash
curl -H 'Authorization: Bearer <token>' http://localhost:8000/api/chapters?subject_id=2
curl -H 'Authorization: Bearer <token>' http://localhost:8000/api/chapters/progress
```

- [ ] **Step 5: Commit**

```bash
git add ai-cuotiben-api/app/schemas/chapters.py ai-cuotiben-api/app/api/chapters.py ai-cuotiben-api/main.py
git commit -m "feat: add chapters API — CRUD, progress, error linkage"
```

---

### Task 4: Frontend API Client — 章节类型定义 + fetch 函数

**Files:**
- Modify: `ai-cuotiben-web/lib/api.ts`

- [ ] **Step 1: 在 api.ts 末尾添加章节类型和函数**

在 `api.ts` 末尾（`logout` 函数之后）添加：

```typescript
// ── 章节进度 ──

export interface ChapterNode {
  id: number;
  name: string;
  level: number;
  mastery_rating: number | null;
  error_count: number;
  reviewed_at: string | null;
  notes: string | null;
  children: ChapterNode[];
}

export interface ChapterTree {
  subject_id: number;
  nodes: ChapterNode[];
}

export interface ProgressSummary {
  subject_id: number;
  subject_name: string;
  total: number;
  reviewed: number;
  avg_rating: number | null;
  coverage: number;
}

export interface ChapterProgress {
  subjects: ProgressSummary[];
}

export interface ErrorBrief {
  id: number;
  question_content: string;
  question_type: string;
  mastery_level: string;
  created_at: string | null;
}

export function getChapterTree(subjectId: number): Promise<ChapterTree> {
  return apiFetch<ChapterTree>(`/api/chapters?subject_id=${subjectId}`);
}

export function createChapter(body: { subject_id: number; parent_id?: number; name: string }): Promise<{ id: number; name: string }> {
  return apiFetch("/api/chapters", { method: "POST", body: JSON.stringify(body) });
}

export function updateChapter(id: number, body: { name?: string; sort_order?: number; description?: string }): Promise<void> {
  return apiFetch(`/api/chapters/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteChapter(id: number): Promise<void> {
  return apiFetch(`/api/chapters/${id}`, { method: "DELETE" });
}

export function patchRating(id: number, mastery_rating: number): Promise<void> {
  return apiFetch(`/api/chapters/${id}/rating`, { method: "PATCH", body: JSON.stringify({ mastery_rating }) });
}

export function patchNotes(id: number, notes: string): Promise<void> {
  return apiFetch(`/api/chapters/${id}/notes`, { method: "PATCH", body: JSON.stringify({ notes }) });
}

export function getChapterProgress(): Promise<ChapterProgress> {
  return apiFetch<ChapterProgress>("/api/chapters/progress");
}

export function getChapterErrors(id: number): Promise<ErrorBrief[]> {
  return apiFetch<ErrorBrief[]>(`/api/chapters/${id}/errors`);
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-cuotiben-web/lib/api.ts
git commit -m "feat: add chapter API client types and fetch functions"
```

---

### Task 5: `/progress` 页面 — 章节树 + 评级交互

**Files:**
- Create: `ai-cuotiben-web/app/progress/page.tsx`

- [ ] **Step 1: 创建 page.tsx**

```tsx
"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  getChapterTree, patchRating, patchNotes,
  createChapter, deleteChapter, getChapterProgress,
  useAuthGuard, SUBJECTS,
  type ChapterNode, type ChapterTree, type ChapterProgress, type ProgressSummary
} from "@/lib/api";
import { CaretRight, CaretDown, Plus, Trash, NotePencil, ArrowRight } from "@phosphor-icons/react";

const STAR_LABELS = ["", "⭐", "⭐⭐", "⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐"];

function TreeNode({
  node, expanded, onToggle, onRating, onNotes, onAddChild, onDelete, selectedRatingNode, onCloseRating
}: {
  node: ChapterNode;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onRating: (id: number, rating: number) => void;
  onNotes: (id: number, notes: string) => void;
  onAddChild: (parentId: number, name: string) => void;
  onDelete: (id: number) => void;
  selectedRatingNode: number | null;
  onCloseRating: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(node.notes ?? "");
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState("");

  return (
    <div className="pl-1">
      <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/50 ${
        node.level === 0 ? "font-semibold text-base" : node.level === 1 ? "font-medium text-sm" : "text-sm text-zinc-600 dark:text-zinc-400"
      }`}>
        {/* expand/collapse */}
        <button
          onClick={() => onToggle(node.id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          {hasChildren ? (isExpanded ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />) : (
            <span className="block h-2 w-2 rounded-sm border border-zinc-300 dark:border-zinc-600" />
          )}
        </button>

        {/* name */}
        <span className="flex-1 truncate">{node.name}</span>

        {/* star rating */}
        <button
          onClick={() => onRating(node.id, 0)}
          className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10 ${
            selectedRatingNode === node.id ? "bg-amber-50 dark:bg-amber-500/10" : ""
          }`}
        >
          {node.mastery_rating ? STAR_LABELS[node.mastery_rating] : <span className="text-zinc-400">未评定</span>}
        </button>

        {/* error count badge */}
        {node.error_count > 0 && (
          <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-500 dark:bg-red-500/10">
            {node.error_count}
          </span>
        )}

        {/* rating quick panel */}
        {selectedRatingNode === node.id && (
          <div className="absolute right-0 top-full z-10 mt-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
               style={{ left: "auto" }}>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  onClick={() => { onRating(node.id, r); onCloseRating(); }}
                  className={`rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20 ${
                    node.mastery_rating === r ? "bg-amber-100 dark:bg-amber-500/20" : ""
                  }`}
                >
                  {STAR_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* add child button (only for level 0,1) */}
        {node.level < 2 && (
          <button
            onClick={() => setAddingChild(!addingChild)}
            className="ml-1 flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            title="添加子节点"
          >
            <Plus size={12} weight="bold" />
          </button>
        )}

        {/* notes toggle */}
        <button
          onClick={() => setEditingNotes(!editingNotes)}
          className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          title="笔记"
        >
          <NotePencil size={12} weight="bold" />
        </button>

        {/* delete */}
        <button
          onClick={() => onDelete(node.id)}
          className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-500/20"
          title="删除"
        >
          <Trash size={12} weight="bold" />
        </button>
      </div>

      {/* notes inline editor */}
      {editingNotes && (
        <div className="ml-8 mt-1 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800/50">
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => { onNotes(node.id, notesDraft); setEditingNotes(false); }}
            className="w-full resize-none rounded border-0 bg-transparent text-xs text-zinc-700 outline-none dark:text-zinc-300"
            rows={2}
            placeholder="写点复习笔记..."
            autoFocus
          />
        </div>
      )}

      {/* add child inline */}
      {addingChild && (
        <div className="ml-8 mt-1 flex gap-2">
          <input
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
            placeholder="新节点名称"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && childName.trim()) {
                onAddChild(node.id, childName.trim());
                setChildName("");
                setAddingChild(false);
              }
              if (e.key === "Escape") setAddingChild(false);
            }}
          />
          <button
            onClick={() => {
              if (childName.trim()) {
                onAddChild(node.id, childName.trim());
                setChildName("");
                setAddingChild(false);
              }
            }}
            className="rounded-lg bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            确定
          </button>
        </div>
      )}

      {/* children */}
      {hasChildren && isExpanded && (
        <div className="ml-5 border-l border-zinc-200 pl-2 dark:border-zinc-700">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              onRating={onRating}
              onNotes={onNotes}
              onAddChild={onAddChild}
              onDelete={onDelete}
              selectedRatingNode={selectedRatingNode}
              onCloseRating={onCloseRating}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProgressPage() {
  useAuthGuard();
  const router = useRouter();
  const [subjectId, setSubjectId] = useState(2); // default: 数学
  const [tree, setTree] = useState<ChapterTree | null>(null);
  const [progress, setProgress] = useState<ChapterProgress | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedRatingNode, setSelectedRatingNode] = useState<number | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);
  const [rootName, setRootName] = useState("");
  const [loading, setLoading] = useState(true);

  const loadTree = useCallback(async (sid: number) => {
    setLoading(true);
    try {
      const t = await getChapterTree(sid);
      setTree(t);
    } catch { /* handled */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTree(subjectId);
    getChapterProgress().then(setProgress).catch(() => {});
  }, [subjectId, loadTree]);

  const handleToggle = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const handleRating = async (id: number, rating: number) => {
    if (rating === 0) { setSelectedRatingNode(id); return; }
    await patchRating(id, rating);
    loadTree(subjectId);
    getChapterProgress().then(setProgress).catch(() => {});
  };

  const handleNotes = async (id: number, notes: string) => {
    await patchNotes(id, notes);
  };

  const handleAddChild = async (parentId: number, name: string) => {
    await createChapter({ subject_id: subjectId, parent_id: parentId, name });
    loadTree(subjectId);
  };

  const handleAddRoot = async () => {
    if (!rootName.trim()) return;
    await createChapter({ subject_id: subjectId, name: rootName.trim() });
    setRootName("");
    setAddingRoot(false);
    loadTree(subjectId);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("删除此章节？子节点也会被删除。")) return;
    await deleteChapter(id);
    loadTree(subjectId);
    getChapterProgress().then(setProgress).catch(() => {});
  };

  const currentProgress = progress?.subjects.find(s => s.subject_id === subjectId);

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 pt-20 pb-24 md:py-40">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}>
          <h1 className="text-3xl font-semibold tracking-tighter md:text-4xl">章节进度</h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">追踪一轮复习的章节覆盖和掌握情况</p>
        </motion.div>

        {/* subject tabs */}
        <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
          {SUBJECTS.map((s) => {
            const sp = progress?.subjects.find(p => p.subject_id === s.id);
            return (
              <button
                key={s.id}
                onClick={() => setSubjectId(s.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  subjectId === s.id
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                }`}
              >
                {s.name}
                {sp && sp.reviewed > 0 && (
                  <span className="ml-1.5 text-[10px] opacity-70">{sp.coverage}%</span>
                )}
              </button>
            );
          })}
        </div>

        {/* progress summary bar */}
        {currentProgress && (
          <div className="mt-4 flex items-center gap-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <div className="relative h-12 w-12">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#e4e4e7" strokeWidth="4" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#3b82f6" strokeWidth="4"
                    strokeDasharray={`${currentProgress.coverage * 0.94} 94`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                  {Math.round(currentProgress.coverage)}%
                </span>
              </div>
              <div>
                <div className="font-semibold">{currentProgress.subject_name}</div>
                <div className="text-xs text-zinc-500">
                  已复习 {currentProgress.reviewed}/{currentProgress.total}
                  {currentProgress.avg_rating ? ` · 平均 ⭐${currentProgress.avg_rating}` : ""}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* chapter tree */}
        <div className="mt-6">
          {loading ? (
            <p className="py-12 text-center text-zinc-400">加载中…</p>
          ) : tree && tree.nodes.length > 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              {tree.nodes.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  expanded={expanded}
                  onToggle={handleToggle}
                  onRating={handleRating}
                  onNotes={handleNotes}
                  onAddChild={handleAddChild}
                  onDelete={handleDelete}
                  selectedRatingNode={selectedRatingNode}
                  onCloseRating={() => setSelectedRatingNode(null)}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-zinc-400">
              暂无章节数据，请在 seed 数据基础上自行添加
            </div>
          )}

          {/* add root node */}
          <div className="mt-4">
            {addingRoot ? (
              <div className="flex gap-2">
                <input
                  value={rootName}
                  onChange={(e) => setRootName(e.target.value)}
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  placeholder="新章节名称"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddRoot();
                    if (e.key === "Escape") setAddingRoot(false);
                  }}
                />
                <button onClick={handleAddRoot} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-zinc-900">确定</button>
              </div>
            ) : (
              <button onClick={() => setAddingRoot(true)}
                className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:text-zinc-300">
                <Plus size={16} weight="bold" />
                添加章节
              </button>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-cuotiben-web/app/progress/page.tsx
git commit -m "feat: add /progress page with collapsible chapter tree"
```

---

### Task 6: Dashboard — 添加章节进度卡片

**Files:**
- Modify: `ai-cuotiben-web/app/dashboard/page.tsx`

- [ ] **Step 1: 在 dashboard 添加进度卡片**

在 `app/dashboard/page.tsx` 中添加：

顶部 import 新增：
```typescript
import { getChapterProgress, type ChapterProgress } from "@/lib/api";
```

在 state 区添加：
```typescript
const [chapterProgress, setChapterProgress] = useState<ChapterProgress | null>(null);
```

在已有的 `useEffect` 数据加载中添加：
```typescript
getChapterProgress().then(setChapterProgress).catch(() => {});
```

在 Bento Grid 中添加新卡片（放在合适位置，例如 sprint 卡片附近）：

```tsx
{chapterProgress && chapterProgress.subjects.length > 0 && (
  <PremiumCard delay={0.2} className="md:col-span-4">
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 dark:bg-blue-500/10">
          <ChartPieSlice size={20} weight="fill" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">一轮复习进度</h3>
          <p className="text-sm text-zinc-500">章节覆盖追踪</p>
        </div>
        <Link href="/progress" className="ml-auto text-sm text-blue-500 hover:text-blue-600 transition-colors">
          查看全部 →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {chapterProgress.subjects.map((s) => (
          <div key={s.subject_id} className="text-center">
            <div className="text-xl font-bold">{s.coverage}%</div>
            <div className="text-xs text-zinc-500">{s.subject_name}</div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${s.coverage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  </PremiumCard>
)}
```

注意：需要导入 `Link` 和 `ChartPieSlice`。

- [ ] **Step 2: Commit**

```bash
git add ai-cuotiben-web/app/dashboard/page.tsx
git commit -m "feat: add chapter progress card to dashboard"
```

---

### Task 7: Navigation — 导航栏添加「进度」入口

**Files:**
- Modify: `ai-cuotiben-web/components/ui/Navbar.tsx`
- Modify: `ai-cuotiben-web/components/ui/MobileTabBar.tsx`

- [ ] **Step 1: Navbar 添加进度链接**

在 `Navbar.tsx` 的 `<nav>` 中，"统计"和"冲刺"之间插入：

```tsx
<Link href="/progress" className="hover:text-zinc-900 transition-colors dark:hover:text-white">进度</Link>
```

- [ ] **Step 2: MobileTabBar 添加进度 Tab**

在 `MobileTabBar.tsx` 的 import 中添加：

```typescript
import { TreeStructure } from "@phosphor-icons/react";
```

在 `TABS` 数组中，"统计"和"错题本"之间插入：

```typescript
{ href: "/progress", label: "进度", icon: TreeStructure },
```

注意：如果移动端 Tab 数量过多（从 5 个变为 6 个），现有的 5 个 Tab 布局可能偏挤。保持现有 5 个，移除使用频率最低的（如 `/stats` 改桌面独占），或者保留 6 个用更小的字体。决定：保留 6 个，Phosphor 的 `TreeStructure` 图标在 22px 下还行，`text-[10px]` 标签已够小。

- [ ] **Step 3: Commit**

```bash
git add ai-cuotiben-web/components/ui/Navbar.tsx ai-cuotiben-web/components/ui/MobileTabBar.tsx
git commit -m "feat: add 进度 to navbar and mobile tab bar"
```

---

### Task 8: Integration Test — 端到端验证

**Files:** (none new)

- [ ] **Step 1: 启动后端**

```bash
cd D:\Documents\Wrong-question-book\ai-cuotiben-api
uvicorn main:app --reload
```

- [ ] **Step 2: 启动前端**

```bash
cd D:\Documents\Wrong-question-book\ai-cuotiben-web
npm run dev
```

- [ ] **Step 3: 验证清单**

- [ ] 注册新用户 → 登录后自动 seed 章节数据
- [ ] 访问 `/progress` → 看到六科 Tab，默认在数学
- [ ] 数学章节树正确渲染（三层折叠）
- [ ] 展开/折叠节点正常
- [ ] 点击星星评级 → 快速面板弹出 → 选 3 星 → 树刷新，进度环更新
- [ ] 添加新章节（顶级 + 子节点）
- [ ] 删除章节（确认弹窗后删除）
- [ ] 点击笔记按钮 → 输入文本 → blur 保存
- [ ] Dashboard 进度卡片显示正确
- [ ] 导航栏和移动端 Tab 都有「进度」入口
- [ ] 老用户（已有账号）登录 → 自动补建章节数据（不重复）

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final verification, end-to-end test pass"
```
