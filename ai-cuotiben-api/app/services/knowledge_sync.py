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
