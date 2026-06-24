from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db, AsyncSessionLocal
from app.models import Chapter, WrongQuestion, KnowledgePoint, User, Subject
from app.core.security import get_current_user
from app.core.seed import seed_chapters

router = APIRouter()


def _node_to_dict(node: Chapter, error_map: dict, children=None):
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


def _build_tree(nodes: list[Chapter], error_map: dict):
    children_map: dict = {}
    for n in nodes:
        children_map.setdefault(n.parent_id, []).append(n)

    def build(parent_id):
        kids = children_map.get(parent_id, [])
        kids.sort(key=lambda n: (n.sort_order, n.id))
        result = []
        for kid in kids:
            sub_kids = build(kid.id)
            result.append(_node_to_dict(kid, error_map, sub_kids))
        return result

    return build(None)


async def _compute_error_counts(db: AsyncSession, user_id: int, subject_id: int) -> dict:
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
async def get_chapters(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    nodes = (await db.execute(
        select(Chapter).where(Chapter.user_id == user.id, Chapter.subject_id == subject_id)
    )).scalars().all()

    # 懒加载 seed：老用户首次访问时自动补章节数据
    if not nodes:
        async with AsyncSessionLocal() as seed_session:
            await seed_chapters(user.id, seed_session)
        nodes = (await db.execute(
            select(Chapter).where(Chapter.user_id == user.id, Chapter.subject_id == subject_id)
        )).scalars().all()

    error_counts = await _compute_error_counts(db, user.id, subject_id)
    tree = _build_tree(list(nodes), error_counts)

    return {"status": "success", "data": {"subject_id": subject_id, "nodes": tree}}


@router.post("")
async def create_chapter(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = body.get("name")
    subject_id = body.get("subject_id")
    if not name or not subject_id:
        raise HTTPException(status_code=422, detail="name 和 subject_id 为必填字段")
    node = Chapter(
        user_id=user.id,
        subject_id=subject_id,
        parent_id=body.get("parent_id"),
        name=name,
        sort_order=body.get("sort_order", 0),
        description=body.get("description"),
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return {"status": "success", "data": _node_to_dict(node, {})}


@router.put("/{node_id}")
async def update_chapter(
    node_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
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
async def delete_chapter(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    node = (await db.execute(
        select(Chapter).where(Chapter.id == node_id, Chapter.user_id == user.id)
    )).scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="章节不存在")

    children = (await db.execute(
        select(Chapter).where(Chapter.parent_id == node_id, Chapter.user_id == user.id)
    )).scalars().all()
    for child in children:
        await db.delete(child)
    await db.delete(node)
    await db.commit()
    return {"status": "success", "data": {"deleted": True}}


@router.patch("/{node_id}/rating")
async def update_rating(
    node_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rating = body.get("rating")
    if rating is None:
        raise HTTPException(status_code=422, detail="缺少 rating 字段")
    try:
        rating = int(rating)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="掌握度必须为 1-5 的整数")
    if not (1 <= rating <= 5):
        raise HTTPException(status_code=422, detail="掌握度必须为 1-5 的整数")

    node = (await db.execute(
        select(Chapter).where(Chapter.id == node_id, Chapter.user_id == user.id)
    )).scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="章节不存在")

    node.mastery_rating = rating
    node.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(node)
    return {"status": "success", "data": _node_to_dict(node, {})}


@router.patch("/{node_id}/notes")
async def update_notes(
    node_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
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
async def get_progress(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 懒加载 seed：老用户首次访问时自动补章节数据
    has_chapters = (await db.execute(
        select(Chapter.id).where(Chapter.user_id == user.id).limit(1)
    )).scalars().first()
    if not has_chapters:
        async with AsyncSessionLocal() as seed_session:
            await seed_chapters(user.id, seed_session)

    subs = (await db.execute(select(Subject))).scalars().all()

    leaf_query = (
        select(Chapter.subject_id, func.count(Chapter.id))
        .where(Chapter.user_id == user.id, Chapter.parent_id.isnot(None))
        .group_by(Chapter.subject_id)
    )
    leaf_rows = (await db.execute(leaf_query)).all()
    total_map = {sid: cnt for sid, cnt in leaf_rows}

    rated_query = (
        select(Chapter.subject_id, func.count(Chapter.id), func.avg(Chapter.mastery_rating))
        .where(
            Chapter.user_id == user.id,
            Chapter.parent_id.isnot(None),
            Chapter.mastery_rating.isnot(None),
        )
        .group_by(Chapter.subject_id)
    )
    rated_rows = (await db.execute(rated_query)).all()
    rated_map = {
        sid: {"rated": cnt, "avg": round(float(avg), 1) if avg else 0}
        for sid, cnt, avg in rated_rows
    }

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
async def get_chapter_errors(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    node = (await db.execute(
        select(Chapter).where(Chapter.id == node_id, Chapter.user_id == user.id)
    )).scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="章节不存在")

    kp_ids_subq = (
        select(KnowledgePoint.id)
        .where(
            KnowledgePoint.user_id == user.id,
            KnowledgePoint.chapter_id == node_id,
        )
        .subquery()
    )

    questions = (await db.execute(
        select(WrongQuestion).where(
            WrongQuestion.knowledge_point_id.in_(kp_ids_subq),
            WrongQuestion.user_id == user.id,
        )
    )).scalars().all()

    return {
        "status": "success",
        "data": {
            "chapter_id": node_id,
            "chapter_name": node.name,
            "total": len(questions),
            "questions": [
                {
                    "id": q.id,
                    "question_content": q.question_content,
                    "subject_id": q.subject_id,
                    "mastery_level": q.mastery_level,
                    "created_at": q.created_at.isoformat() if q.created_at else None,
                }
                for q in questions
            ],
        },
    }
