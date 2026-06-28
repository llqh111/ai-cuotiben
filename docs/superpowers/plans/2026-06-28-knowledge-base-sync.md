# 知识库双向同步 Phase 1+2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 AI 错题本 → Obsidian vault 的 Markdown 自动同步，支持一键初始化和增量更新。

**Architecture:** 后端新增 `knowledge_sync` 服务负责 Markdown 渲染和文件系统写入，`knowledge` API 路由暴露同步端点。前端设置页新增同步控制面板。现有 questions/review 路由通过 BackgroundTasks 触发异步同步。

**Tech Stack:** FastAPI (BackgroundTasks) + Jinja2 (模板渲染) + SQLAlchemy + React/Next.js + TypeScript

---

## File Map

```
CREATE  ai-cuotiben-api/app/services/markdown_renderer.py   # Jinja2 模板渲染
CREATE  ai-cuotiben-api/app/services/knowledge_sync.py       # 核心同步逻辑
CREATE  ai-cuotiben-api/app/api/knowledge.py                 # API 路由
CREATE  ai-cuotiben-api/app/schemas/knowledge.py             # 请求/响应 schema
CREATE  ai-cuotiben-web/app/settings/knowledge-sync.tsx      # 同步控制面板组件
CREATE  ai-cuotiben-web/lib/knowledge-api.ts                 # 前端 API 客户端

MODIFY  ai-cuotiben-api/main.py                              # 注册 knowledge 路由
MODIFY  ai-cuotiben-api/app/models.py                        # obsidian_path, vault_path 字段
MODIFY  ai-cuotiben-api/app/core/migration.py                # 新增 migration
MODIFY  ai-cuotiben-api/app/api/questions.py                 # 增删改触发同步
MODIFY  ai-cuotiben-api/app/api/review.py                    # 复习提交触发同步
MODIFY  ai-cuotiben-api/app/schemas/auth.py                  # ProfileUpdate 加 vault_path
MODIFY  ai-cuotiben-api/app/api/auth.py                      # _profile 返回 vault_path
MODIFY  ai-cuotiben-web/app/settings/page.tsx                # 集成同步面板
MODIFY  ai-cuotiben-web/lib/api.ts                           # 新增 exportMarkdown
```

---

### Task 1: Database Migration — 新增字段

**Files:**
- Modify: `ai-cuotiben-api/app/models.py`
- Modify: `ai-cuotiben-api/app/core/migration.py`

- [ ] **Step 1: 在 models.py 新增三个字段**

在 `WrongQuestion` 类末尾（`updated_at` 之后）新增：
```python
obsidian_path = Column(String(500), nullable=True)
```

在 `KnowledgePoint` 类末尾（`chapter_id` 之后）新增：
```python
obsidian_path = Column(String(500), nullable=True)
```

在 `User` 类末尾（`subject_prefs` 之后）新增：
```python
vault_path = Column(String(500), nullable=True)
```

- [ ] **Step 2: 在 migration.py 新增迁移逻辑**

在 `run_migrations()` 函数末尾（最后一个 dialect 分支之后），新增：

```python
        # obsidian_path / vault_path — 知识库同步
        for table, col_name, col_type in [
            ("wrong_questions", "obsidian_path", "VARCHAR(500)"),
            ("knowledge_points", "obsidian_path", "VARCHAR(500)"),
            ("users", "vault_path", "VARCHAR(500)"),
        ]:
            if dialect == "sqlite":
                result = await conn.execute(text(f"PRAGMA table_info({table})"))
                cols = [row[1] for row in result.fetchall()]
                if col_name not in cols:
                    await conn.execute(text(
                        f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"
                    ))
            elif dialect == "postgresql":
                result = await conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name=:tbl AND column_name=:col"
                ), {"tbl": table, "col": col_name})
                if not result.fetchone():
                    await conn.execute(text(
                        f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"
                    ))
```

- [ ] **Step 3: 验证 migration**

```bash
cd ai-cuotiben-api && ..\..\..\Users\inbil\.workbuddy\binaries\python\envs\default\bin\python -c "import asyncio; from app.core.migration import run_migrations; asyncio.run(run_migrations()); print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add ai-cuotiben-api/app/models.py ai-cuotiben-api/app/core/migration.py
git commit -m "feat: add obsidian_path and vault_path columns for knowledge sync"
```

---

### Task 2: Markdown 渲染服务

**Files:**
- Create: `ai-cuotiben-api/app/services/markdown_renderer.py`

- [ ] **Step 1: 安装 Jinja2**

```bash
cd ai-cuotiben-api && ..\..\..\Users\inbil\.workbuddy\binaries\python\envs\default\bin\pip install jinja2
```

- [ ] **Step 2: 创建 markdown_renderer.py**

```python
"""Jinja2-based Markdown renderer for Obsidian vault export."""
from typing import Optional

# 用 Python 字符串模板，避免引入额外依赖时的路径问题
# 知识点 Markdown 模板

KNOWLEDGE_POINT_TEMPLATE = """---
subject: {subject_name}
knowledge_point: {name}
total_questions: {total_questions}
mastered: {mastered_count}
mastery_rate: {mastery_rate}%
last_reviewed: {last_reviewed}
aliases: [{name}]
tags: [高考, {subject_name}, 知识点]
---

# {name}

## 描述
{description}

## 关联题型
{patterns_section}

## 错题列表
{questions_section}

## 关联知识点
{relations_section}
"""

QUESTION_CARD_TEMPLATE = """---
id: {id}
subject: {subject_name}
knowledge_point: "{kp_name}"
question_type: {question_type}
status: {status}
mastery: {mastery_level}
next_review: {next_review}
error_category: {error_category}
tags: [高考, {subject_name}, 错题, {kp_name}]
---

# 题目
{question_content}

## 我的答案（错误）
{student_answer}

## 正确答案
{correct_answer}

## 解题步骤
{solution_steps}

## 错因分析
{error_analysis}

## 改进建议
{improvement_tips}

---

> 关联知识点：[[{kp_name}]]
> 下次复习：{next_review}
"""

SUBJECT_INDEX_TEMPLATE = """---
subject: {subject_name}
total_questions: {total_questions}
mastered: {mastered_count}
mastery_rate: {mastery_rate}%
last_synced: {last_synced}
tags: [高考, {subject_name}]
---

# {subject_name} 错题本

## 概览
- 总错题数：{total_questions}
- 已掌握：{mastered_count}（{mastery_rate}%）
- 学习中：{learning_count}

## 知识点目录
{kp_list}

## 最近错题
{recent_questions}
"""

SYNC_CONFIG_TEMPLATE = """{{
  "version": 1,
  "api_base": "http://localhost:8000",
  "last_sync": "{last_sync}",
  "synced_questions": {synced_questions},
  "synced_knowledge_points": {synced_knowledge_points}
}}
"""


def render_knowledge_point(
    name: str,
    subject_name: str,
    description: str = "",
    total_questions: int = 0,
    mastered_count: int = 0,
    mastery_rate: float = 0.0,
    last_reviewed: str = "",
    patterns: list[dict] | None = None,
    questions: list[dict] | None = None,
    relations: list[dict] | None = None,
) -> str:
    patterns = patterns or []
    questions = questions or []
    relations = relations or []

    patterns_section = "\n".join(
        f"- [[题型-{p['name']}]] — {p.get('count', 0)}题" for p in patterns
    ) or "暂无"

    questions_section = "\n".join(
        f"- [[Q-{q['id']}]] — {q.get('error_summary', '')}" for q in questions
    ) or "暂无"

    relations_section = "\n".join(
        f"- [[{r['name']}]] — {r.get('type', '相关')}" for r in relations
    ) or "暂无"

    return KNOWLEDGE_POINT_TEMPLATE.format(
        name=name,
        subject_name=subject_name,
        description=description or "",
        total_questions=total_questions,
        mastered_count=mastered_count,
        mastery_rate=round(mastery_rate, 0),
        last_reviewed=last_reviewed or "从未",
        patterns_section=patterns_section,
        questions_section=questions_section,
        relations_section=relations_section,
    )


def render_question_card(
    id: int,
    subject_name: str = "",
    kp_name: str = "",
    question_content: str = "",
    question_type: str = "essay",
    status: str = "analyzed",
    mastery_level: str = "new",
    next_review: str = "",
    error_category: str = "",
    student_answer: str = "",
    correct_answer: str = "",
    solution_steps: str = "",
    error_analysis: str = "",
    improvement_tips: str = "",
) -> str:
    return QUESTION_CARD_TEMPLATE.format(
        id=id,
        subject_name=subject_name or "",
        kp_name=kp_name or "",
        question_content=question_content or "",
        question_type=question_type,
        status=status,
        mastery_level=mastery_level,
        next_review=next_review or "待定",
        error_category=error_category or "",
        student_answer=student_answer or "",
        correct_answer=correct_answer or "",
        solution_steps=solution_steps or "",
        error_analysis=error_analysis or "",
        improvement_tips=improvement_tips or "",
    )


def render_subject_index(
    subject_name: str,
    total_questions: int = 0,
    mastered_count: int = 0,
    mastery_rate: float = 0.0,
    learning_count: int = 0,
    last_synced: str = "",
    knowledge_points: list[dict] | None = None,
    recent_questions: list[dict] | None = None,
) -> str:
    knowledge_points = knowledge_points or []
    recent_questions = recent_questions or []

    kp_list = "\n".join(
        f"- [[{kp['name']}]] — {kp.get('question_count', 0)}题"
        for kp in knowledge_points
    ) or "暂无"

    recent_list = "\n".join(
        f"- [[Q-{q['id']}]] — {q.get('error_summary', '')}"
        for q in recent_questions
    ) or "暂无"

    return SUBJECT_INDEX_TEMPLATE.format(
        subject_name=subject_name,
        total_questions=total_questions,
        mastered_count=mastered_count,
        mastery_rate=round(mastery_rate, 0),
        learning_count=learning_count,
        last_synced=last_synced,
        kp_list=kp_list,
        recent_questions=recent_list,
    )


def render_sync_config(
    last_sync: str = "",
    synced_questions: int = 0,
    synced_knowledge_points: int = 0,
) -> str:
    return SYNC_CONFIG_TEMPLATE.format(
        last_sync=last_sync,
        synced_questions=synced_questions,
        synced_knowledge_points=synced_knowledge_points,
    )
```

- [ ] **Step 3: 验证渲染**

```bash
cd ai-cuotiben-api && ..\..\..\Users\inbil\.workbuddy\binaries\python\envs\default\bin\python -c "from app.services.markdown_renderer import render_question_card; print(render_question_card(id=1, subject_name='数学', kp_name='导数', question_content='求导')); print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add ai-cuotiben-api/app/services/markdown_renderer.py
git commit -m "feat: add markdown renderer for obsidian vault export"
```

---

### Task 3: Knowledge Sync 核心服务

**Files:**
- Create: `ai-cuotiben-api/app/services/knowledge_sync.py`

- [ ] **Step 1: 创建 knowledge_sync.py**

```python
"""Obsidian vault 同步核心逻辑。"""
import os
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    User, Subject, KnowledgePoint, QuestionPattern,
    WrongQuestion, KnowledgeRelation,
)
from app.services.markdown_renderer import (
    render_knowledge_point,
    render_question_card,
    render_subject_index,
    render_sync_config,
)

logger = logging.getLogger(__name__)

SUBJECT_NAMES = {1: "语文", 2: "数学", 3: "英语", 4: "物理", 5: "化学", 6: "生物"}


def _detect_vault_path() -> Optional[str]:
    """自动检测 D:\\Documents 下的 Obsidian vault。"""
    base = Path("D:/Documents")
    if not base.exists():
        return None
    for entry in base.iterdir():
        if entry.is_dir() and (entry / ".obsidian").is_dir():
            return str(entry)
    return None


def resolve_vault_path(user_vault_dir: str, relative_path: str) -> str:
    """安全解析路径，防止路径穿越。"""
    vault = os.path.abspath(user_vault_dir)
    target = os.path.abspath(os.path.join(vault, relative_path))
    if not target.startswith(vault + os.sep) and target != vault:
        raise ValueError(f"路径穿越检测: {relative_path}")
    return target


def _ensure_dir(path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)


def _safe_filename(name: str) -> str:
    """将知识点/文件名转为安全的文件名。"""
    forbidden = '<>:"/\\|?*'
    for ch in forbidden:
        name = name.replace(ch, "-")
    return name.strip()[:100]


async def _get_user_vault_path(db: AsyncSession, user: User) -> str:
    """获取用户的 vault 路径，优先用数据库配置，否则自动检测。"""
    if user.vault_path:
        return user.vault_path
    detected = _detect_vault_path()
    if detected:
        user.vault_path = detected
        await db.commit()
        return detected
    raise ValueError("未找到 Obsidian vault，请在设置中配置路径")


async def init_vault(db: AsyncSession, user: User, overwrite: bool = False) -> dict:
    """全量初始化 vault：按科目创建目录结构并写入所有文件。"""
    vault = await _get_user_vault_path(db, user)
    stats = {"questions": 0, "knowledge_points": 0, "errors": []}

    # 获取所有科目
    subject_rows = (await db.execute(select(Subject))).scalars().all()

    for subj in subject_rows:
        subj_name = SUBJECT_NAMES.get(subj.id, subj.name)
        subj_dir = os.path.join(vault, subj_name)
        kp_dir = os.path.join(subj_dir, "知识点说明")
        q_dir = os.path.join(subj_dir, "错题卡片")

        os.makedirs(kp_dir, exist_ok=True)
        os.makedirs(q_dir, exist_ok=True)

        # 获取用户在此科目的知识点
        kp_rows = (await db.execute(
            select(KnowledgePoint).where(
                KnowledgePoint.user_id == user.id,
                KnowledgePoint.subject_id == subj.id
            )
        )).scalars().all()

        for kp in kp_rows:
            filename = _safe_filename(kp.name) + ".md"
            filepath = os.path.join(kp_dir, filename)

            if not overwrite and os.path.exists(filepath):
                continue

            # 获取关联题型
            pat_rows = (await db.execute(
                select(QuestionPattern).where(
                    QuestionPattern.knowledge_point_id == kp.id
                )
            )).scalars().all()

            # 获取关联错题
            q_rows = (await db.execute(
                select(WrongQuestion).where(
                    WrongQuestion.knowledge_point_id == kp.id,
                    WrongQuestion.user_id == user.id,
                )
            )).scalars().all()

            # 获取关联知识点
            rel_rows = (await db.execute(
                select(KnowledgeRelation).where(
                    KnowledgeRelation.source_point_id == kp.id,
                    KnowledgeRelation.user_id == user.id,
                )
            )).scalars().all()

            # 计算统计
            total = len(q_rows)
            mastered = sum(1 for q in q_rows if q.mastery_level == "mastered")
            rate = (mastered / total * 100) if total > 0 else 0

            patterns = [
                {"name": p.name, "count": sum(1 for q in q_rows if q.question_pattern_id == p.id)}
                for p in pat_rows
            ]
            questions = [
                {"id": q.id, "error_summary": (q.error_analysis or "")[:60]}
                for q in q_rows[:20]
            ]
            relations = [
                {"name": SUBJECT_NAMES.get(r.target_point_id, str(r.target_point_id)),
                 "type": r.relation_type}
                for r in rel_rows
            ]

            content = render_knowledge_point(
                name=kp.name,
                subject_name=subj_name,
                description=kp.description or "",
                total_questions=total,
                mastered_count=mastered,
                mastery_rate=rate,
                patterns=patterns,
                questions=questions,
                relations=relations,
            )

            try:
                _ensure_dir(filepath)
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                kp.obsidian_path = os.path.relpath(filepath, vault).replace("\\", "/")
                stats["knowledge_points"] += 1
            except OSError as e:
                logger.error("Failed to write %s: %s", filepath, e)
                stats["errors"].append(str(e))

        # 写入错题卡片
        all_q_rows = (await db.execute(
            select(WrongQuestion).where(
                WrongQuestion.user_id == user.id,
                WrongQuestion.subject_id == subj.id,
            )
        )).scalars().all()

        for q in all_q_rows:
            kp_name = ""
            if q.knowledge_point_id:
                kp = (await db.execute(
                    select(KnowledgePoint).where(KnowledgePoint.id == q.knowledge_point_id)
                )).scalars().first()
                if kp:
                    kp_name = kp.name

            filename = f"Q-{q.id}.md"
            filepath = os.path.join(q_dir, filename)

            if not overwrite and os.path.exists(filepath):
                continue

            content = render_question_card(
                id=q.id,
                subject_name=subj_name,
                kp_name=kp_name,
                question_content=q.question_content or "",
                question_type=q.question_type or "essay",
                status=q.status or "analyzed",
                mastery_level=q.mastery_level or "new",
                next_review=q.next_review_at.isoformat() if q.next_review_at else "",
                error_category=q.error_category or "",
                student_answer=q.student_answer or "",
                correct_answer=q.correct_answer or "",
                solution_steps=q.solution_steps or "",
                error_analysis=q.error_analysis or "",
                improvement_tips=q.improvement_tips or "",
            )

            try:
                _ensure_dir(filepath)
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                q.obsidian_path = os.path.relpath(filepath, vault).replace("\\", "/")
                stats["questions"] += 1
            except OSError as e:
                logger.error("Failed to write %s: %s", filepath, e)
                stats["errors"].append(str(e))

        # 写入 _index.md
        subj_qs = sum(1 for q in all_q_rows)
        subj_mastered = sum(1 for q in all_q_rows if q.mastery_level == "mastered")
        subj_rate = (subj_mastered / subj_qs * 100) if subj_qs > 0 else 0

        index_content = render_subject_index(
            subject_name=subj_name,
            total_questions=subj_qs,
            mastered_count=subj_mastered,
            mastery_rate=subj_rate,
            learning_count=subj_qs - subj_mastered,
            last_synced=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
            knowledge_points=[{"name": kp.name, "question_count": sum(
                1 for q in all_q_rows if q.knowledge_point_id == kp.id
            )} for kp in kp_rows],
        )

        index_path = os.path.join(subj_dir, "_index.md")
        try:
            with open(index_path, "w", encoding="utf-8") as f:
                f.write(index_content)
        except OSError as e:
            logger.error("Failed to write %s: %s", index_path, e)

    # 写入 .cuotiben-sync.json
    config = render_sync_config(
        last_sync=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        synced_questions=stats["questions"],
        synced_knowledge_points=stats["knowledge_points"],
    )
    config_path = os.path.join(vault, ".cuotiben-sync.json")
    try:
        with open(config_path, "w", encoding="utf-8") as f:
            f.write(config)
    except OSError as e:
        logger.error("Failed to write %s: %s", config_path, e)

    await db.commit()
    return stats


async def sync_question(db: AsyncSession, user: User, question_id: int) -> bool:
    """增量同步单道错题到 vault。"""
    vault = await _get_user_vault_path(db, user)

    q = (await db.execute(
        select(WrongQuestion).where(
            WrongQuestion.id == question_id,
            WrongQuestion.user_id == user.id,
        )
    )).scalars().first()

    if not q:
        return False

    subj_name = SUBJECT_NAMES.get(q.subject_id, "未分类")

    kp_name = ""
    if q.knowledge_point_id:
        kp = (await db.execute(
            select(KnowledgePoint).where(KnowledgePoint.id == q.knowledge_point_id)
        )).scalars().first()
        if kp:
            kp_name = kp.name

    filename = f"Q-{q.id}.md"
    q_dir = os.path.join(vault, subj_name, "错题卡片")
    os.makedirs(q_dir, exist_ok=True)
    filepath = os.path.join(q_dir, filename)

    content = render_question_card(
        id=q.id,
        subject_name=subj_name,
        kp_name=kp_name,
        question_content=q.question_content or "",
        question_type=q.question_type or "essay",
        status=q.status or "analyzed",
        mastery_level=q.mastery_level or "new",
        next_review=q.next_review_at.isoformat() if q.next_review_at else "",
        error_category=q.error_category or "",
        student_answer=q.student_answer or "",
        correct_answer=q.correct_answer or "",
        solution_steps=q.solution_steps or "",
        error_analysis=q.error_analysis or "",
        improvement_tips=q.improvement_tips or "",
    )

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    q.obsidian_path = os.path.relpath(filepath, vault).replace("\\", "/")
    await db.commit()
    return True


async def sync_knowledge_point(db: AsyncSession, user: User, kp_id: int) -> bool:
    """增量同步单个知识点到 vault。"""
    vault = await _get_user_vault_path(db, user)

    kp = (await db.execute(
        select(KnowledgePoint).where(
            KnowledgePoint.id == kp_id,
            KnowledgePoint.user_id == user.id,
        )
    )).scalars().first()

    if not kp:
        return False

    subj_name = SUBJECT_NAMES.get(kp.subject_id, "未分类")

    pat_rows = (await db.execute(
        select(QuestionPattern).where(QuestionPattern.knowledge_point_id == kp.id)
    )).scalars().all()

    q_rows = (await db.execute(
        select(WrongQuestion).where(
            WrongQuestion.knowledge_point_id == kp.id,
            WrongQuestion.user_id == user.id,
        )
    )).scalars().all()

    rel_rows = (await db.execute(
        select(KnowledgeRelation).where(
            KnowledgeRelation.source_point_id == kp.id,
        )
    )).scalars().all()

    total = len(q_rows)
    mastered = sum(1 for q in q_rows if q.mastery_level == "mastered")
    rate = (mastered / total * 100) if total > 0 else 0

    content = render_knowledge_point(
        name=kp.name,
        subject_name=subj_name,
        description=kp.description or "",
        total_questions=total,
        mastered_count=mastered,
        mastery_rate=rate,
        patterns=[{"name": p.name, "count": sum(
            1 for r in q_rows if r.question_pattern_id == p.id
        )} for p in pat_rows],
        questions=[{"id": q.id, "error_summary": (q.error_analysis or "")[:60]}
                   for q in q_rows[:20]],
        relations=[{"name": str(r.target_point_id), "type": r.relation_type}
                   for r in rel_rows],
    )

    filename = _safe_filename(kp.name) + ".md"
    kp_dir = os.path.join(vault, subj_name, "知识点说明")
    os.makedirs(kp_dir, exist_ok=True)
    filepath = os.path.join(kp_dir, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    kp.obsidian_path = os.path.relpath(filepath, vault).replace("\\", "/")
    await db.commit()
    return True


async def delete_vault_file(db: AsyncSession, user: User, entity_type: str, entity_id: int) -> bool:
    """删除 vault 中对应的文件。"""
    vault = await _get_user_vault_path(db, user)

    if entity_type == "question":
        q = (await db.execute(
            select(WrongQuestion).where(
                WrongQuestion.id == entity_id,
                WrongQuestion.user_id == user.id,
            )
        )).scalars().first()
        if q and q.obsidian_path:
            filepath = resolve_vault_path(vault, q.obsidian_path)
            if os.path.exists(filepath):
                os.remove(filepath)
            q.obsidian_path = None
            await db.commit()
            return True
    elif entity_type == "knowledge_point":
        kp = (await db.execute(
            select(KnowledgePoint).where(
                KnowledgePoint.id == entity_id,
                KnowledgePoint.user_id == user.id,
            )
        )).scalars().first()
        if kp and kp.obsidian_path:
            filepath = resolve_vault_path(vault, kp.obsidian_path)
            if os.path.exists(filepath):
                os.remove(filepath)
            kp.obsidian_path = None
            await db.commit()
            return True
    return False


async def get_sync_status(db: AsyncSession, user: User) -> dict:
    """获取同步状态。"""
    vault = user.vault_path or _detect_vault_path()
    if not vault:
        return {"vault_configured": False, "vault_path": None}

    # 统计带 obsidian_path 的数量
    q_total = (await db.execute(
        select(func.count(WrongQuestion.id)).where(
            WrongQuestion.user_id == user.id,
        )
    )).scalar() or 0

    q_synced = (await db.execute(
        select(func.count(WrongQuestion.id)).where(
            WrongQuestion.user_id == user.id,
            WrongQuestion.obsidian_path.isnot(None),
        )
    )).scalar() or 0

    kp_total = (await db.execute(
        select(func.count(KnowledgePoint.id)).where(
            KnowledgePoint.user_id == user.id,
        )
    )).scalar() or 0

    kp_synced = (await db.execute(
        select(func.count(KnowledgePoint.id)).where(
            KnowledgePoint.user_id == user.id,
            KnowledgePoint.obsidian_path.isnot(None),
        )
    )).scalar() or 0

    # 读取配置文件
    config_path = os.path.join(vault, ".cuotiben-sync.json")
    last_sync = None
    if os.path.exists(config_path):
        try:
            with open(config_path, encoding="utf-8") as f:
                cfg = json.load(f)
                last_sync = cfg.get("last_sync")
        except (json.JSONDecodeError, OSError):
            pass

    return {
        "vault_configured": True,
        "vault_path": vault,
        "questions_total": q_total,
        "questions_synced": q_synced,
        "knowledge_points_total": kp_total,
        "knowledge_points_synced": kp_synced,
        "last_sync": last_sync,
        "pending": (q_total - q_synced) + (kp_total - kp_synced),
    }
```

- [ ] **Step 2: 验证核心逻辑**

```bash
cd ai-cuotiben-api && ..\..\..\Users\inbil\.workbuddy\binaries\python\envs\default\bin\python -c "from app.services.knowledge_sync import _detect_vault_path, _safe_filename; print('detect:', _detect_vault_path()); print('filename:', _safe_filename('导数/极限')); print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add ai-cuotiben-api/app/services/knowledge_sync.py
git commit -m "feat: add knowledge sync core service for obsidian vault"
```

---

### Task 4: Knowledge API 路由

**Files:**
- Create: `ai-cuotiben-api/app/schemas/knowledge.py`
- Create: `ai-cuotiben-api/app/api/knowledge.py`
- Modify: `ai-cuotiben-api/main.py`

- [ ] **Step 1: 创建 schemas/knowledge.py**

```python
from typing import Optional
from pydantic import BaseModel


class InitVaultRequest(BaseModel):
    overwrite: bool = False


class SyncStatus(BaseModel):
    vault_configured: bool = False
    vault_path: Optional[str] = None
    questions_total: int = 0
    questions_synced: int = 0
    knowledge_points_total: int = 0
    knowledge_points_synced: int = 0
    last_sync: Optional[str] = None
    pending: int = 0
```

- [ ] **Step 2: 创建 api/knowledge.py**

```python
import io
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.core.security import get_current_user
from app.schemas.knowledge import InitVaultRequest
from app.services.knowledge_sync import (
    init_vault,
    sync_question,
    sync_knowledge_point,
    delete_vault_file,
    get_sync_status,
    _get_user_vault_path,
)

router = APIRouter()


@router.post("/init-vault")
async def init_vault_endpoint(
    body: InitVaultRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        stats = await init_vault(db, user, overwrite=body.overwrite)
        return {"status": "success", "data": stats}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sync-question/{question_id}")
async def sync_question_endpoint(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        ok = await sync_question(db, user, question_id)
        if not ok:
            raise HTTPException(status_code=404, detail="错题不存在")
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sync-knowledge-point/{kp_id}")
async def sync_kp_endpoint(
    kp_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        ok = await sync_knowledge_point(db, user, kp_id)
        if not ok:
            raise HTTPException(status_code=404, detail="知识点不存在")
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/delete-file/{entity_type}/{entity_id}")
async def delete_file_endpoint(
    entity_type: str,
    entity_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if entity_type not in ("question", "knowledge_point"):
        raise HTTPException(status_code=400, detail="type 必须是 question 或 knowledge_point")
    try:
        ok = await delete_vault_file(db, user, entity_type, entity_id)
        if not ok:
            raise HTTPException(status_code=404, detail="实体不存在或无关联文件")
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status")
async def status_endpoint(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"status": "success", "data": await get_sync_status(db, user)}


@router.get("/export-markdown")
async def export_markdown(
    subject_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """导出 Markdown ZIP 包（不写入 vault，直接下载）。"""
    # 临时把用户 vault 设到内存，利用 init_vault 的逻辑但输出 ZIP
    from app.models import Subject, KnowledgePoint, QuestionPattern, WrongQuestion, KnowledgeRelation
    from app.services.markdown_renderer import (
        render_knowledge_point,
        render_question_card,
        render_subject_index,
        render_sync_config,
    )
    from app.services.knowledge_sync import SUBJECT_NAMES, _safe_filename
    from sqlalchemy import select

    subject_rows = (await db.execute(select(Subject))).scalars().all()
    if subject_id:
        subject_rows = [s for s in subject_rows if s.id == subject_id]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for subj in subject_rows:
            subj_name = SUBJECT_NAMES.get(subj.id, subj.name)

            kp_rows = (await db.execute(
                select(KnowledgePoint).where(
                    KnowledgePoint.user_id == user.id,
                    KnowledgePoint.subject_id == subj.id,
                )
            )).scalars().all()

            q_rows = (await db.execute(
                select(WrongQuestion).where(
                    WrongQuestion.user_id == user.id,
                    WrongQuestion.subject_id == subj.id,
                )
            )).scalars().all()

            # 科目索引
            total = len(q_rows)
            mastered = sum(1 for q in q_rows if q.mastery_level == "mastered")
            rate = (mastered / total * 100) if total > 0 else 0
            idx = render_subject_index(
                subject_name=subj_name,
                total_questions=total,
                mastered_count=mastered,
                mastery_rate=rate,
                learning_count=total - mastered,
                last_synced=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
                knowledge_points=[{"name": kp.name, "question_count": sum(
                    1 for q in q_rows if q.knowledge_point_id == kp.id
                )} for kp in kp_rows],
            )
            zf.writestr(f"{subj_name}/_index.md", idx)

            # 知识点
            for kp in kp_rows:
                pat_rows = (await db.execute(
                    select(QuestionPattern).where(QuestionPattern.knowledge_point_id == kp.id)
                )).scalars().all()
                rel_rows = (await db.execute(
                    select(KnowledgeRelation).where(
                        KnowledgeRelation.source_point_id == kp.id,
                        KnowledgeRelation.user_id == user.id,
                    )
                )).scalars().all()
                kp_content = render_knowledge_point(
                    name=kp.name,
                    subject_name=subj_name,
                    description=kp.description or "",
                    total_questions=sum(1 for q in q_rows if q.knowledge_point_id == kp.id),
                    mastered_count=sum(
                        1 for q in q_rows
                        if q.knowledge_point_id == kp.id and q.mastery_level == "mastered"
                    ),
                    mastery_rate=(
                        sum(1 for q in q_rows if q.knowledge_point_id == kp.id and q.mastery_level == "mastered")
                        / max(1, sum(1 for q in q_rows if q.knowledge_point_id == kp.id)) * 100
                    ),
                    patterns=[{"name": p.name, "count": sum(
                        1 for r in q_rows if r.question_pattern_id == p.id
                    )} for p in pat_rows],
                    questions=[{"id": q.id, "error_summary": (q.error_analysis or "")[:60]}
                               for q in q_rows if q.knowledge_point_id == kp.id][:20],
                    relations=[{"name": str(r.target_point_id), "type": r.relation_type}
                               for r in rel_rows],
                )
                zf.writestr(f"{subj_name}/知识点说明/{_safe_filename(kp.name)}.md", kp_content)

            # 错题
            for q in q_rows:
                kp_name = ""
                if q.knowledge_point_id:
                    kp_row = (await db.execute(
                        select(KnowledgePoint).where(KnowledgePoint.id == q.knowledge_point_id)
                    )).scalars().first()
                    if kp_row:
                        kp_name = kp_row.name
                q_content = render_question_card(
                    id=q.id, subject_name=subj_name, kp_name=kp_name,
                    question_content=q.question_content or "",
                    question_type=q.question_type or "essay",
                    mastery_level=q.mastery_level or "new",
                    next_review=q.next_review_at.isoformat() if q.next_review_at else "",
                    error_category=q.error_category or "",
                    student_answer=q.student_answer or "",
                    correct_answer=q.correct_answer or "",
                    solution_steps=q.solution_steps or "",
                    error_analysis=q.error_analysis or "",
                    improvement_tips=q.improvement_tips or "",
                )
                zf.writestr(f"{subj_name}/错题卡片/Q-{q.id}.md", q_content)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=cuotiben-export.zip"},
    )


def trigger_question_sync(question_id: int, user_id: int):
    """供 BackgroundTasks 调用的同步函数。"""
    import asyncio
    from app.database import AsyncSessionLocal
    from sqlalchemy import select

    async def _run():
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.id == user_id))).scalars().first()
            if user and user.vault_path:
                await sync_question(db, user, question_id)

    try:
        asyncio.create_task(_run())
    except RuntimeError:
        # 如果不在事件循环中，直接运行
        asyncio.run(_run())


def trigger_delete_sync(entity_type: str, entity_id: int, user_id: int):
    """供 BackgroundTasks 调用的删除同步函数。"""
    import asyncio
    from app.database import AsyncSessionLocal
    from sqlalchemy import select

    async def _run():
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.id == user_id))).scalars().first()
            if user and user.vault_path:
                await delete_vault_file(db, user, entity_type, entity_id)

    try:
        asyncio.create_task(_run())
    except RuntimeError:
        asyncio.run(_run())
```

- [ ] **Step 3: 在 main.py 注册路由**

在 `main.py` 的 import 区域添加：
```python
from app.api import knowledge
```

在路由注册区域（`export.router` 之后）添加：
```python
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["Knowledge"])
```

- [ ] **Step 4: 启动测试**

```bash
cd ai-cuotiben-api && ..\..\..\Users\inbil\.workbuddy\binaries\python\envs\default\bin\python -c "from app.api.knowledge import router; print('Routes:', [r.path for r in router.routes]); print('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add ai-cuotiben-api/app/schemas/knowledge.py ai-cuotiben-api/app/api/knowledge.py ai-cuotiben-api/main.py
git commit -m "feat: add knowledge API routes for vault sync"
```

---

### Task 5: Auto-Sync Hooks — 在现有路由中埋点

**Files:**
- Modify: `ai-cuotiben-api/app/api/questions.py`
- Modify: `ai-cuotiben-api/app/api/review.py`
- Modify: `ai-cuotiben-api/app/schemas/auth.py`
- Modify: `ai-cuotiben-api/app/api/auth.py`

- [ ] **Step 1: questions.py — 新增/编辑/删除 触发同步**

在 `questions.py` 顶部 import 添加：
```python
from fastapi import BackgroundTasks
from app.api.knowledge import trigger_question_sync, trigger_delete_sync
```

修改 `update_question` 函数签名，加入 `background_tasks: BackgroundTasks`：
```python
@router.put("/{question_id}")
async def update_question(question_id: int, body: QuestionUpdate,
                          background_tasks: BackgroundTasks,
                          db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await _owned(db, user.id, question_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(q, field, value)
    await db.commit(); await db.refresh(q)
    background_tasks.add_task(trigger_question_sync, question_id, user.id)
    return {"status": "success", "data": _dump(q)}
```

修改 `delete_question` 函数签名：
```python
@router.delete("/{question_id}")
async def delete_question(question_id: int, background_tasks: BackgroundTasks,
                          db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await _owned(db, user.id, question_id)
    await db.execute(delete(ReviewRecord).where(ReviewRecord.question_id == q.id))
    background_tasks.add_task(trigger_delete_sync, "question", question_id, user.id)
    await db.delete(q); await db.commit()
    return {"status": "success", "message": "已删除"}
```

- [ ] **Step 2: review.py — 复习提交触发同步**

检查 `review.py` 的 submit 路由，在复习成功后触发同步：

在顶部 import 添加：
```python
from app.api.knowledge import trigger_question_sync
```

找到 `POST /submit` 路由，在 `await db.commit()` 之后添加：
```python
background_tasks.add_task(trigger_question_sync, question_id, user.id)
```

（需要先把函数签名加上 `background_tasks: BackgroundTasks`）

- [ ] **Step 3: auth.py — _profile 返回 vault_path**

修改 `_profile` 函数：
```python
def _profile(user: User):
    from app.services.knowledge_sync import _detect_vault_path
    vault = user.vault_path or _detect_vault_path()
    return {"status": "success", "data": {
        "user_id": user.id, "nickname": user.nickname,
        "exam_date": user.exam_date.isoformat() if user.exam_date else None,
        "theme_preference": user.theme_preference,
        "subject_prefs": getattr(user, "subject_prefs", "1,2,3,4,5,6"),
        "vault_path": vault}}
```

- [ ] **Step 4: schemas/auth.py — ProfileUpdate 加 vault_path**

```python
class ProfileUpdate(BaseModel):
    exam_date: Optional[date] = None
    theme_preference: Optional[str] = None
    subject_prefs: Optional[str] = None
    vault_path: Optional[str] = None
```

- [ ] **Step 5: 验证**

```bash
cd ai-cuotiben-api && ..\..\..\Users\inbil\.workbuddy\binaries\python\envs\default\bin\python -c "import app.api.questions; import app.api.review; import app.api.auth; print('All imports OK')"
```

- [ ] **Step 6: Commit**

```bash
git add ai-cuotiben-api/app/api/questions.py ai-cuotiben-api/app/api/review.py ai-cuotiben-api/app/schemas/auth.py ai-cuotiben-api/app/api/auth.py
git commit -m "feat: add auto-sync hooks in questions/review/auth routes"
```

---

### Task 6: Frontend API Client

**Files:**
- Create: `ai-cuotiben-web/lib/knowledge-api.ts`
- Modify: `ai-cuotiben-web/lib/api.ts`

- [ ] **Step 1: 创建 knowledge-api.ts**

```typescript
import { apiFetch, API_BASE, Profile } from "./api";

export interface SyncStatus {
  vault_configured: boolean;
  vault_path: string | null;
  questions_total: number;
  questions_synced: number;
  knowledge_points_total: number;
  knowledge_points_synced: number;
  last_sync: string | null;
  pending: number;
}

export interface InitVaultResult {
  questions: number;
  knowledge_points: number;
  errors: string[];
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const res = await apiFetch<{ status: string; data: SyncStatus }>(
    `${API_BASE}/api/knowledge/status`
  );
  return res.data;
}

export async function initVault(overwrite = false): Promise<InitVaultResult> {
  const res = await apiFetch<{ status: string; data: InitVaultResult }>(
    `${API_BASE}/api/knowledge/init-vault`,
    {
      method: "POST",
      body: JSON.stringify({ overwrite }),
    }
  );
  return res.data;
}

export async function exportMarkdown(subjectId?: number): Promise<Blob> {
  const params = subjectId ? `?subject_id=${subjectId}` : "";
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/api/knowledge/export-markdown${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("导出失败");
  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: api.ts — 新增 exportMarkdown 便捷函数**

```typescript
export async function exportMarkdown(subjectId?: number): Promise<void> {
  const params = subjectId ? `?subject_id=${subjectId}` : "";
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/knowledge/export-markdown${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, "导出失败");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cuotiben-export.zip";
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: TypeScript 编译验证**

```bash
cd ai-cuotiben-web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add ai-cuotiben-web/lib/knowledge-api.ts ai-cuotiben-web/lib/api.ts
git commit -m "feat: add knowledge sync frontend API client"
```

---

### Task 7: 前端同步控制面板

**Files:**
- Create: `ai-cuotiben-web/app/settings/knowledge-sync.tsx`
- Modify: `ai-cuotiben-web/app/settings/page.tsx`

- [ ] **Step 1: 创建 knowledge-sync.tsx**

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { PremiumCard } from "@/components/ui/PremiumCard";
import {
  ArrowsClockwise,
  FolderOpen,
  Download,
  CheckCircle,
  Warning,
  Spinner,
} from "@phosphor-icons/react";
import {
  getSyncStatus,
  initVault,
  exportMarkdown,
  downloadBlob,
  SyncStatus,
} from "@/lib/knowledge-api";

export default function KnowledgeSyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getSyncStatus();
      setStatus(s);
    } catch {
      // vault 未配置时静默
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleInitVault() {
    setSyncing(true);
    setMessage("");
    try {
      const result = await initVault();
      setMessage(
        `初始化完成：${result.questions} 错题 + ${result.knowledge_points} 知识点已同步`
      );
      await fetchStatus();
    } catch (e: any) {
      setMessage(`初始化失败：${e.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleExport() {
    try {
      const blob = await exportMarkdown();
      downloadBlob(blob, "cuotiben-export.zip");
      setMessage("ZIP 导出成功");
    } catch (e: any) {
      setMessage(`导出失败：${e.message}`);
    }
  }

  if (loading) {
    return (
      <PremiumCard delay={0.3} className="w-full">
        <div className="flex items-center gap-3">
          <Spinner size={20} className="animate-spin text-zinc-400" />
          <span className="text-sm text-zinc-500">检查同步状态...</span>
        </div>
      </PremiumCard>
    );
  }

  return (
    <PremiumCard delay={0.3} className="w-full">
      <div className="flex items-start gap-6">
        <div className="mt-1 h-10 w-10 shrink-0 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
          <ArrowsClockwise size={20} weight="fill" />
        </div>
        <div className="w-full">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">
                知识库同步
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                将错题知识点和错题卡片同步到 Obsidian 知识库。
              </p>
            </div>
            {status?.vault_configured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <CheckCircle size={14} weight="fill" />
                已连接
              </span>
            )}
          </div>

          {/* Vault 状态 */}
          {status?.vault_configured ? (
            <div className="mt-4 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <FolderOpen size={16} />
                <span className="truncate">{status.vault_path}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-zinc-500">错题</span>
                  <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {status.questions_synced}
                    <span className="text-zinc-400"> / {status.questions_total}</span>
                  </div>
                </div>
                <div>
                  <span className="text-zinc-500">知识点</span>
                  <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {status.knowledge_points_synced}
                    <span className="text-zinc-400"> / {status.knowledge_points_total}</span>
                  </div>
                </div>
              </div>
              {status.last_sync && (
                <p className="mt-2 text-xs text-zinc-400">
                  上次同步：{new Date(status.last_sync).toLocaleString("zh-CN")}
                </p>
              )}
              {status.pending > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                  <Warning size={14} weight="fill" />
                  {status.pending} 项待同步
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                未检测到 Obsidian vault。请在 D:\Documents 下创建 vault 或在设置中手动配置路径。
              </p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={handleInitVault}
              disabled={syncing || !status?.vault_configured}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {syncing ? (
                <Spinner size={16} className="animate-spin" />
              ) : (
                <ArrowsClockwise size={16} weight="bold" />
              )}
              {syncing ? "同步中..." : "初始化 Vault"}
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Download size={16} weight="bold" />
              导出 ZIP
            </button>
          </div>

          {message && (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              {message}
            </p>
          )}
        </div>
      </div>
    </PremiumCard>
  );
}
```

- [ ] **Step 2: 集成到 settings/page.tsx**

在 `page.tsx` 的 import 区域添加：
```tsx
import KnowledgeSyncPanel from "./knowledge-sync";
```

在现有的 PremiumCard 列表最末尾（`</div>` 闭合之前）添加：
```tsx
<KnowledgeSyncPanel />
```

- [ ] **Step 3: TypeScript 编译验证**

```bash
cd ai-cuotiben-web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add ai-cuotiben-web/app/settings/knowledge-sync.tsx ai-cuotiben-web/app/settings/page.tsx
git commit -m "feat: add knowledge sync control panel to settings page"
```

---

### Task 8: 端到端验证

- [ ] **Step 1: 启动后端**

```bash
cd ai-cuotiben-api && ..\..\..\Users\inbil\.workbuddy\binaries\python\envs\default\bin\python -m uvicorn main:app --reload --port 8000
```

- [ ] **Step 2: 启动前端**

```bash
cd ai-cuotiben-web && npm run dev
```

- [ ] **Step 3: 手动测试流程**

1. 打开 `http://localhost:3000/settings`，确认看到「知识库同步」卡片
2. 确认 vault 自动检测（需确保 `D:\Documents\` 下有 Obsidian vault）
3. 点击「初始化 Vault」，确认 vault 目录生成 `.md` 文件
4. 上传一道新错题，确认 vault 里生成 `Q-{id}.md`
5. 编辑错题内容，确认 vault 文件更新
6. 点击「导出 ZIP」，确认下载 ZIP 包

- [ ] **Step 4: Commit final**

```bash
git add -A && git commit -m "feat: complete knowledge base sync Phase 1 + 2"
```
