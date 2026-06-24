import json
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db, AsyncSessionLocal
from app.models import WrongQuestion, ReviewRecord, User, PracticeQuestion, KnowledgePoint, QuestionPattern
from app.core.security import get_current_user
from app.services import review_engine, ai_service
from app.schemas.review import ReviewSubmit

logger = logging.getLogger(__name__)
router = APIRouter()

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

def _q(q: WrongQuestion) -> dict:
    return {"id": q.id, "question_content": q.question_content, "question_type": q.question_type,
            "correct_answer": q.correct_answer, "solution_steps": q.solution_steps,
            "mastery_level": q.mastery_level}

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

@router.get("/random/{subject_id}")
async def random_pick(subject_id: int, count: int = 10,
                      db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.subject_id == subject_id,
        WrongQuestion.mastery_level != "mastered").order_by(func.random()).limit(count))).scalars().all()
    return {"status": "success", "data": [_q(q) for q in rows]}

@router.get("/pattern/{pattern_id}")
async def by_pattern(pattern_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.question_pattern_id == pattern_id,
        WrongQuestion.mastery_level != "mastered"))).scalars().all()
    return {"status": "success", "data": [_q(q) for q in rows]}

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
    st = result["stability"] or 0
    from fsrs import State
    if s == State.Review and st >= 21:
        q.mastery_level = "mastered"
    else:
        q.mastery_level = "learning"

    db.add(ReviewRecord(
        question_id=q.id, user_id=user.id,
        rating=body.rating,
        is_correct=body.rating >= 3,
        interval_index=0,
        next_review_date=result["due"].date() if result["due"] else None,
        consecutive_correct=0,
    ))
    await db.commit()

    # 变式自动触发：最近10次复习中 >=2 次 Again/Hard
    if body.rating in (1, 2):
        recent_bad = (await db.execute(
            select(func.count(ReviewRecord.id)).where(
                ReviewRecord.question_id == q.id,
                ReviewRecord.rating.in_([1, 2])
            )
        )).scalar() or 0
        if recent_bad >= 2:
            existing_variants = (await db.execute(
                select(func.count(PracticeQuestion.id)).where(
                    PracticeQuestion.source_question_id == q.id,
                    PracticeQuestion.user_id == user.id
                )
            )).scalar() or 0
            if existing_variants < 12:
                asyncio.create_task(_generate_variants_for_question(q))

    return {"status": "success", "data": {
        "mastery_level": q.mastery_level,
        "next_review_at": q.next_review_at.isoformat() if q.next_review_at else None,
        "stability": round(st, 2),
        "difficulty": round(result["difficulty"] or 0, 2),
    }}
