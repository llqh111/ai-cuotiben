# 章节进度追踪模块 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 AI 错题本中新增章节进度追踪模块，支持六科三层章节树浏览、掌握度自评、错题交叉验证、仪表盘进度概览。

**Architecture:** 后端新增 `chapters` 表 + 8 个 REST API + 轻量迁移 + seed 数据；前端新增 `/progress` 页面 + 仪表盘卡片 + 导航入口。

**Tech Stack:** Python FastAPI + SQLAlchemy async (后端), Next.js 16 App Router + TypeScript + Tailwind CSS v4 + Motion (前端)

**Spec:** `docs/superpowers/specs/2026-06-24-chapter-progress-design.md`

---

## 任务分解

### 阶段 1：后端基础（数据模型 + 迁移 + Seed）

---

### Task 1: 新增 Chapter 模型 + KnowledgePoint 加字段

**Files:**
- Modify: `ai-cuotiben-api/app/models.py` (末尾追加)

在 `models.py` 末尾新增 `Chapter` 模型，并为 `KnowledgePoint` 增加 `chapter_id` 字段：

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
    mastery_rating = Column(Integer, nullable=True)      # 1-5
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

KnowledgePoint 末尾追加：
```python
chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=True)
```

**验证:** 服务启动无 ImportError

---

### Task 2: 数据库迁移函数

**Files:**
- Create: `ai-cuotiben-api/app/core/migration.py`

```python
"""轻量迁移：检测并补建缺失列，兼容 SQLite 与 PostgreSQL。"""
from sqlalchemy import text
from app.database import engine, AsyncSessionLocal

async def run_migrations():
    async with engine.begin() as conn:
        # 检测引擎类型
        dialect = engine.url.get_dialect().name

        if dialect == "sqlite":
            # PRAGMA table_info 检查 knowledge_points 是否有 chapter_id
            result = await conn.execute(text("PRAGMA table_info(knowledge_points)"))
            cols = [row[1] for row in result.fetchall()]
            if "chapter_id" not in cols:
                await conn.execute(text(
                    "ALTER TABLE knowledge_points ADD COLUMN chapter_id INTEGER REFERENCES chapters(id)"
                ))
        elif dialect == "postgresql":
            result = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='knowledge_points' AND column_name='chapter_id'"
            ))
            if not result.fetchone():
                await conn.execute(text(
                    "ALTER TABLE knowledge_points ADD COLUMN chapter_id INTEGER REFERENCES chapters(id)"
                ))
        else:
            # 其他引擎乐观尝试
            pass
```

---

### Task 3: 在 main.py 启动流程中注册迁移 + chapters 路由

**Files:**
- Modify: `ai-cuotiben-api/main.py`

1. 在 import 区添加：
```python
from app.core.migration import run_migrations
from app.api import chapters
```

2. 在 lifespan 的 `create_all` 之后、`seed_subjects` 之前插入：
```python
await run_migrations()
```

3. 添加路由注册：
```python
app.include_router(chapters.router, prefix="/api/chapters", tags=["Chapters"])
```

---

### Task 4: Seed 数据：六科考纲章节树

**Files:**
- Modify: `ai-cuotiben-api/app/core/seed.py`

在后追加 `CHAPTERS_SEED` dict 和 `seed_chapters(user_id)` 函数。

考纲数据结构（六科完整三层，约 300+ 叶子节点）：

```python
from app.models import Subject, Chapter

CHAPTERS_SEED = {
    "数学": {
        "集合与常用逻辑用语": ["集合的概念与运算", "命题与量词", "充分条件与必要条件"],
        "函数与导数": ["函数概念与性质", "基本初等函数", "导数及其应用", "函数综合问题"],
        "三角函数与解三角形": ["任意角与弧度制", "三角函数的图像与性质", "三角恒等变换", "解三角形"],
        "数列": ["数列的概念", "等差数列", "等比数列", "数列求和与综合"],
        "平面向量与复数": ["平面向量的概念与运算", "平面向量的应用", "复数"],
        "立体几何": ["空间几何体", "点线面位置关系", "空间向量与立体几何"],
        "解析几何": ["直线与圆", "椭圆", "双曲线", "抛物线", "综合应用"],
        "概率与统计": ["随机事件与概率", "离散型随机变量", "统计初步", "回归分析与独立性检验"],
        "计数原理": ["排列与组合", "二项式定理"],
    },
    "物理": {
        "运动的描述": ["质点与参考系", "位移与路程", "速度与加速度", "匀变速直线运动"],
        "相互作用": ["重力与弹力", "摩擦力", "力的合成与分解", "共点力平衡"],
        "牛顿运动定律": ["牛顿第一、三定律", "牛顿第二定律", "超重与失重", "连接体问题"],
        "曲线运动": ["运动的合成与分解", "平抛运动", "圆周运动", "向心力"],
        "万有引力与航天": ["开普勒定律", "万有引力定律", "宇宙速度与卫星"],
        "机械能": ["功与功率", "动能定理", "机械能守恒", "功能关系"],
        "动量": ["动量定理", "动量守恒", "碰撞", "反冲与火箭"],
        "静电场": ["电荷与电场", "电势与电势差", "电容器", "带电粒子在电场中的运动"],
        "恒定电流": ["欧姆定律", "电阻定律", "电功率", "闭合电路欧姆定律"],
        "磁场": ["磁感应强度", "安培力", "洛伦兹力", "带电粒子在磁场中的运动"],
        "电磁感应": ["法拉第电磁感应定律", "楞次定律", "自感与互感"],
        "交变电流": ["交变电流的产生", "变压器", "远距离输电"],
        "热学": ["分子动理论", "热力学定律", "理想气体状态方程"],
        "机械振动与机械波": ["简谐运动", "单摆", "机械波", "波的干涉与衍射"],
        "光学": ["光的折射与全反射", "光的干涉", "光的衍射与偏振"],
        "近代物理": ["光电效应", "原子结构", "原子核", "波粒二象性"],
    },
    "化学": {
        "化学计量": ["物质的量", "阿伏加德罗常数", "摩尔质量与气体摩尔体积", "物质的量浓度"],
        "物质分类与变化": ["纯净物与混合物", "电解质与非电解质", "离子反应", "氧化还原反应"],
        "金属及其化合物": ["钠及其化合物", "铝及其化合物", "铁及其化合物", "金属材料"],
        "非金属及其化合物": ["硅及其化合物", "氯及其化合物", "硫及其化合物", "氮及其化合物"],
        "物质结构与元素周期律": ["原子结构", "元素周期表", "元素周期律", "化学键与分子结构"],
        "化学反应与能量": ["化学反应热", "热化学方程式", "盖斯定律", "原电池", "电解池"],
        "化学反应速率与平衡": ["化学反应速率", "化学平衡", "勒夏特列原理", "平衡常数"],
        "水溶液中的离子平衡": ["弱电解质的电离", "水的电离与pH", "盐类水解", "沉淀溶解平衡"],
        "有机化学基础": ["烃", "烃的衍生物", "有机合成", "糖类油脂蛋白质"],
        "化学实验": ["常见仪器与基本操作", "物质的分离与提纯", "物质的检验", "实验设计与评价"],
    },
    "生物": {
        "细胞的分子组成": ["蛋白质", "核酸", "糖类与脂质", "水和无机盐"],
        "细胞的结构": ["细胞膜", "细胞器", "细胞核", "生物膜系统"],
        "细胞的代谢": ["酶与ATP", "细胞呼吸", "光合作用", "物质跨膜运输"],
        "细胞的生命历程": ["有丝分裂", "减数分裂", "细胞分化", "细胞衰老与凋亡"],
        "遗传的基本规律": ["分离定律", "自由组合定律", "伴性遗传", "遗传系谱图分析"],
        "遗传的分子基础": ["DNA的结构与复制", "基因的表达", "基因突变", "染色体变异"],
        "生物的进化": ["自然选择学说", "现代生物进化理论", "物种形成"],
        "稳态与调节": ["内环境与稳态", "神经调节", "体液调节", "免疫调节"],
        "植物生命活动调节": ["生长素", "其他植物激素", "植物的向性运动"],
        "生态系统": ["种群的特征与数量变化", "群落的结构与演替", "生态系统的结构与功能", "生态系统的稳定性"],
        "生物技术与工程": ["基因工程", "细胞工程", "胚胎工程", "生态工程"],
    },
    "语文": {
        "现代文阅读": ["论述类文本阅读", "实用类文本阅读", "文学类文本阅读", "现代诗歌鉴赏"],
        "古诗文阅读": ["文言文阅读", "古代诗歌鉴赏", "名篇名句默写"],
        "语言文字运用": ["词语与成语", "病句辨析与修改", "语言表达连贯", "修辞与句式变换"],
        "写作": ["审题立意", "素材积累与运用", "结构安排", "语言表达与文采"],
    },
    "英语": {
        "语法基础": ["时态与语态", "非谓语动词", "从句", "虚拟语气与情态动词"],
        "词汇与短语": ["核心词汇", "词义辨析", "固定搭配", "构词法"],
        "阅读理解": ["细节理解", "推理判断", "主旨大意", "词义猜测"],
        "完形填空": ["上下文逻辑", "词语搭配", "语法衔接"],
        "书面表达": ["应用文写作", "读后续写", "概要写作"],
        "听力理解": ["短对话", "长对话与独白"],
    },
}


async def seed_chapters(user_id: int, session):
    """幂等：用户已有章节数据则跳过。"""
    from sqlalchemy import select
    existing = (await session.execute(
        select(Chapter).where(Chapter.user_id == user_id)
    )).scalars().first()
    if existing:
        return

    # 按课目顺序插入三段式树
    subs = (await session.execute(select(Subject))).scalars().all()
    sub_map = {s.name: s.id for s in subs}

    for sub_name, chapters_dict in CHAPTERS_SEED.items():
        subject_id = sub_map.get(sub_name)
        if subject_id is None:
            continue
        for ch_name, sections in chapters_dict.items():
            chapter = Chapter(
                user_id=user_id,
                subject_id=subject_id,
                parent_id=None,
                name=ch_name,
                sort_order=0,
            )
            session.add(chapter)
            await session.flush()
            for sec_name in sections:
                # 节直接挂在章下，知识点挂在节下
                section = Chapter(
                    user_id=user_id,
                    subject_id=subject_id,
                    parent_id=chapter.id,
                    name=sec_name,
                    sort_order=0,
                )
                session.add(section)
    await session.commit()
```

---

### Task 5: 在 register/login 中触发 seed

**Files:**
- Modify: `ai-cuotiben-api/app/api/auth.py`

1. 顶部 import 添加：
```python
from app.database import AsyncSessionLocal
from app.core.seed import seed_chapters
```

2. 在 `register` 函数的 `return _ok(user)` 之前加入：
```python
    async with AsyncSessionLocal() as seed_session:
        await seed_chapters(user.id, seed_session)
```

3. 在 `login` 函数的 `return _ok(user)` 之前加入：
```python
    async with AsyncSessionLocal() as seed_session:
        await seed_chapters(user.id, seed_session)
```

---

### 阶段 2：后端 API

---

### Task 6: chapters API 路由

**Files:**
- Create: `ai-cuotiben-api/app/api/chapters.py`

完整实现 8 个端点，遵循现有 API 模式（JWT 认证 + `{"status":"success","data":...}` 封装）：

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Chapter, WrongQuestion, KnowledgePoint, User
from app.core.security import get_current_user

router = APIRouter()


def _node_to_dict(node: Chapter, error_map: dict[int, int], children: list = None) -> dict:
    return {
        "id": node.id,
        "name": node.name,
        "parent_id": node.parent_id,
        "subject_id": node.subject_id,
        "sort_order": node.sort_order,
        "description": node.description,
        "mastery_rating": node.mastery_rating,
        "error_count": error_map.get(node.id, 0),
        "reviewed_at": node.reviewed_at.isoformat() if node.reviewed_at else None,
        "notes": node.notes,
        "children": children if children is not None else [],
    }


def _build_tree(nodes: list[Chapter], error_map: dict[int, int]) -> list[dict]:
    """将扁平节点列表构建为三层树。"""
    node_map = {n.id: n for n in nodes}
    children_map: dict[int | None, list[Chapter]] = {}
    for n in nodes:
        children_map.setdefault(n.parent_id, []).append(n)

    def build(parent_id: int | None) -> list[dict]:
        kids = children_map.get(parent_id, [])
        kids.sort(key=lambda n: (n.sort_order, n.id))
        result = []
        for kid in kids:
            sub_kids = build(kid.id)
            result.append(_node_to_dict(kid, error_map, sub_kids))
        return result

    return build(None)


async def _compute_error_counts(db: AsyncSession, user_id: int, subject_id: int) -> dict[int, int]:
    """统计该科目下每个章节关联的错题数（通过 knowledge_points.chapter_id）。"""
    rows = (await db.execute(
        select(KnowledgePoint.id, func.count(WrongQuestion.id))
        .join(WrongQuestion, WrongQuestion.knowledge_point_id == KnowledgePoint.id)
        .where(
            KnowledgePoint.user_id == user_id,
            KnowledgePoint.subject_id == subject_id,
            KnowledgePoint.chapter_id.isnot(None),
            WrongQuestion.user_id == user_id,
        )
        .group_by(KnowledgePoint.id)
    )).all()

    kp_to_count = {kp_id: cnt for kp_id, cnt in rows}

    kp_rows = (await db.execute(
        select(KnowledgePoint.id, KnowledgePoint.chapter_id).where(
            KnowledgePoint.user_id == user_id,
            KnowledgePoint.subject_id == subject_id,
            KnowledgePoint.chapter_id.isnot(None),
        )
    )).all()

    chapter_counts: dict[int, int] = {}
    for kp_id, ch_id in kp_rows:
        cnt = kp_to_count.get(kp_id, 0)
        chapter_counts[ch_id] = chapter_counts.get(ch_id, 0) + cnt

    return chapter_counts


@router.get("")
async def get_chapters(subject_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    nodes = (await db.execute(
        select(Chapter).where(Chapter.user_id == user.id, Chapter.subject_id == subject_id)
    )).scalars().all()

    error_counts = await _compute_error_counts(db, user.id, subject_id)
    tree = _build_tree(list(nodes), error_counts)

    return {"status": "success", "data": {"subject_id": subject_id, "nodes": tree}}


@router.post("")
async def create_chapter(body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    node = Chapter(
        user_id=user.id,
        subject_id=body["subject_id"],
        parent_id=body.get("parent_id"),
        name=body["name"],
        sort_order=body.get("sort_order", 0),
        description=body.get("description"),
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return {"status": "success", "data": _node_to_dict(node, {})}


@router.put("/{node_id}")
async def update_chapter(node_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    node = (await db.execute(
        select(Chapter).where(Chapter.id == node_id, Chapter.user_id == user.id)
    )).scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="章节不存在")

    for field in ("name", "sort_order", "description"):
        if field in body:
            setattr(node, field, body[field])
    await db.commit()
    await db.refresh(node)
    return {"status": "success", "data": _node_to_dict(node, {})}


@router.delete("/{node_id}")
async def delete_chapter(node_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    node = (await db.execute(
        select(Chapter).where(Chapter.id == node_id, Chapter.user_id == user.id)
    )).scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="章节不存在")

    # 级联删除子节点
    children = (await db.execute(
        select(Chapter).where(Chapter.parent_id == node_id, Chapter.user_id == user.id)
    )).scalars().all()
    for child in children:
        await db.delete(child)
    await db.delete(node)
    await db.commit()
    return {"status": "success", "data": {"deleted": True}}


@router.patch("/{node_id}/rating")
async def update_rating(node_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rating = body.get("rating")
    if rating is None or not (1 <= rating <= 5):
        raise HTTPException(status_code=422, detail="掌握度必须为 1-5 的整数")

    node = (await db.execute(
        select(Chapter).where(Chapter.id == node_id, Chapter.user_id == user.id)
    )).scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="章节不存在")

    from datetime import datetime, timezone
    node.mastery_rating = rating
    node.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(node)
    return {"status": "success", "data": _node_to_dict(node, {})}


@router.patch("/{node_id}/notes")
async def update_notes(node_id: int, body: dict, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    node = (await db.execute(
        select(Chapter).where(Chapter.id == node_id, Chapter.user_id == user.id)
    )).scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="章节不存在")

    node.notes = body.get("notes", "")
    await db.commit()
    await db.refresh(node)
    return {"status": "success", "data": _node_to_dict(node, {})}


@router.get("/progress")
async def get_progress(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """六科总体进度概览。"""
    from app.models import Subject

    subs = (await db.execute(select(Subject))).scalars().all()

    # 每科叶子节点数（parent_id IS NOT NULL 的是叶子）
    leaf_query = (
        select(Chapter.subject_id, func.count(Chapter.id))
        .where(Chapter.user_id == user.id, Chapter.parent_id.isnot(None))
        .group_by(Chapter.subject_id)
    )
    leaf_rows = (await db.execute(leaf_query)).all()
    total_map = {sid: cnt for sid, cnt in leaf_rows}

    # 每科已评价的叶子节点数
    rated_query = (
        select(Chapter.subject_id, func.count(Chapter.id), func.avg(Chapter.mastery_rating))
        .where(Chapter.user_id == user.id, Chapter.parent_id.isnot(None), Chapter.mastery_rating.isnot(None))
        .group_by(Chapter.subject_id)
    )
    rated_rows = (await db.execute(rated_query)).all()
    rated_map = {sid: {"rated": cnt, "avg": round(avg, 1) if avg else 0} for sid, cnt, avg in rated_rows}

    subjects_data = []
    for sub in subs:
        total = total_map.get(sub.id, 0)
        info = rated_map.get(sub.id, {"rated": 0, "avg": 0})
        subjects_data.append({
            "id": sub.id,
            "name": sub.name,
            "icon": sub.icon,
            "color": sub.color,
            "total_kps": total,
            "rated_kps": info["rated"],
            "avg_mastery": info["avg"],
            "coverage": round(info["rated"] / total * 100) if total else 0,
        })

    return {"status": "success", "data": {"subjects": subjects_data}}


@router.get("/{node_id}/errors")
async def get_chapter_errors(node_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    node = (await db.execute(
        select(Chapter).where(Chapter.id == node_id, Chapter.user_id == user.id)
    )).scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="章节不存在")

    # 找该章节下所有知识点关联的错题
    kp_ids_subq = select(KnowledgePoint.id).where(
        KnowledgePoint.user_id == user.id,
        KnowledgePoint.chapter_id == node_id,
    ).subquery()

    questions = (await db.execute(
        select(WrongQuestion).where(WrongQuestion.knowledge_point_id.in_(kp_ids_subq))
    )).scalars().all()

    return {"status": "success", "data": {
        "chapter_id": node_id,
        "chapter_name": node.name,
        "total": len(questions),
        "questions": [{
            "id": q.id,
            "question_content": q.question_content,
            "subject_id": q.subject_id,
            "mastery_level": q.mastery_level,
            "created_at": q.created_at.isoformat() if q.created_at else None,
        } for q in questions],
    }}
```

---

### 阶段 3：前端

---

### Task 7: 前端 API 函数

**Files:**
- Modify: `ai-cuotiben-web/lib/api.ts` (末尾追加)

```typescript
// ── 章节进度追踪 ──

export interface ChapterNode {
  id: number;
  name: string;
  parent_id: number | null;
  subject_id: number;
  sort_order: number;
  description: string | null;
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

export interface SubjectProgress {
  id: number;
  name: string;
  icon: string;
  color: string;
  total_kps: number;
  rated_kps: number;
  avg_mastery: number;
  coverage: number;
}

export interface ProgressOverview {
  subjects: SubjectProgress[];
}

export async function getChapters(subjectId: number): Promise<ChapterTree> {
  return apiFetch<ChapterTree>(`/api/chapters?subject_id=${subjectId}`);
}

export async function createChapter(body: {
  subject_id: number;
  parent_id?: number;
  name: string;
  sort_order?: number;
  description?: string;
}): Promise<ChapterNode> {
  return apiFetch<ChapterNode>("/api/chapters", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateChapter(nodeId: number, body: {
  name?: string;
  sort_order?: number;
  description?: string;
}): Promise<ChapterNode> {
  return apiFetch<ChapterNode>(`/api/chapters/${nodeId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteChapter(nodeId: number): Promise<{ deleted: boolean }> {
  return apiFetch(`/api/chapters/${nodeId}`, { method: "DELETE" });
}

export async function updateChapterRating(nodeId: number, rating: number): Promise<ChapterNode> {
  return apiFetch<ChapterNode>(`/api/chapters/${nodeId}/rating`, {
    method: "PATCH",
    body: JSON.stringify({ rating }),
  });
}

export async function updateChapterNotes(nodeId: number, notes: string): Promise<ChapterNode> {
  return apiFetch<ChapterNode>(`/api/chapters/${nodeId}/notes`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  });
}

export async function getProgressOverview(): Promise<ProgressOverview> {
  return apiFetch<ProgressOverview>("/api/chapters/progress");
}
```

---

### Task 8: 导航入口（Navbar + MobileTabBar）

**Files:**
- Modify: `ai-cuotiben-web/components/ui/Navbar.tsx`

在 navbar 的 `<nav>` 中，`<Link href="/sprint">` 之后添加：
```tsx
<Link href="/progress" className="hover:text-zinc-900 transition-colors dark:hover:text-white">进度</Link>
```

- Modify: `ai-cuotiben-web/components/ui/MobileTabBar.tsx`

1. import 中添加 `ClipboardText`:
```typescript
import { ChartPieSlice, Upload, ChartLineUp, Notebook, GearSix, ClipboardText } from "@phosphor-icons/react";
```

2. TABS 数组中，在 `/stats` 之后插入：
```typescript
{ href: "/progress", label: "进度", icon: ClipboardText },
```

3. 在 `isActive` 函数中添加：
```typescript
if (href === "/progress" && pathname.startsWith("/progress")) return true;
```

---

### Task 9: 仪表盘进度卡片

**Files:**
- Modify: `ai-cuotiben-web/app/dashboard/page.tsx`

1. 顶部 import 添加：
```typescript
import { getProgressOverview, type SubjectProgress } from "@/lib/api";
```

2. 添加 state：
```typescript
const [progressData, setProgressData] = useState<SubjectProgress[]>([]);
```

3. 在 useEffect 的 Promise.all 中添加：
```typescript
getProgressOverview().then(p => setProgressData(p.subjects)).catch(() => {})
```

4. 在 Bento Grid 的 Card 3（倒计时卡片）之后，添加新卡片：

```tsx
{/* Card 4: 一轮复习进度 */}
{progressData.length > 0 && (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8, delay: 0.35, ease: [0.32, 0.72, 0, 1] }}
    className="premium-shell md:col-span-4"
  >
    <Link href="/progress" className="premium-core block h-full p-8 hover:bg-zinc-50/50 dark:hover:bg-white/[0.02] transition-colors">
      <div className="mb-4 text-orange-500">
        <ChartLineUp size={24} weight="fill" />
      </div>
      <h3 className="text-lg font-semibold">一轮复习进度</h3>
      <div className="mt-3 space-y-2">
        {progressData.map((sub) => (
          <div key={sub.id} className="flex items-center gap-2">
            <span className="w-10 text-xs font-medium text-zinc-500">{sub.name}</span>
            <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${sub.coverage}%`,
                  backgroundColor: sub.color || "#3b82f6",
                }}
              />
            </div>
            <span className="w-8 text-right text-xs tabular-nums text-zinc-400">
              {sub.coverage}%
            </span>
          </div>
        ))}
      </div>
    </Link>
  </motion.div>
)}
```

---

### Task 10: 进度页面 `/progress`

**Files:**
- Create: `ai-cuotiben-web/app/progress/page.tsx`

完整页面实现（章节树 + 展开折叠 + 星级交互 + Tab 切换），遵循现有页面模式。核心组件包含：
- 顶部科目切换 Tab
- 可折叠三层章节树（▶/▼）
- 每节点：名称、星星(1-5)、错题数红色徽标
- 点击星星快速评级
- 右上角添加章节按钮
- 全局进度概览条

完整代码见实现阶段。

---

## 阶段验证点

- [ ] **Tasks 1-5 完成后**：后端启动无报错，Chapter 表自动创建，knowledge_points 有 chapter_id 列
- [ ] **Task 6 完成后**：所有 8 个 API 端点可用，返回正确数据
- [ ] **Tasks 7-8 完成后**：前端有导航入口，API 函数可用
- [ ] **Tasks 9-10 完成后**：仪表盘显示进度卡片，`/progress` 页面可交互

---
