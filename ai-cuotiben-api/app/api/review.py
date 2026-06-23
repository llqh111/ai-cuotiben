from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import WrongQuestion, ReviewRecord, User
from app.core.security import get_current_user
from app.services import review_engine
from app.schemas.review import ReviewSubmit

router = APIRouter()

def _q(q: WrongQuestion) -> dict:
    return {"id": q.id, "question_content": q.question_content, "question_type": q.question_type,
            "correct_answer": q.correct_answer, "solution_steps": q.solution_steps,
            "mastery_level": q.mastery_level}

async def _latest_record(db, qid):
    return (await db.execute(select(ReviewRecord).where(ReviewRecord.question_id == qid)
            .order_by(ReviewRecord.id.desc()))).scalars().first()

@router.get("/daily/{subject_id}")
async def daily(subject_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.subject_id == subject_id,
        WrongQuestion.mastery_level != "mastered"))).scalars().all()
    due = []
    for q in rows:
        rec = await _latest_record(db, q.id)
        if rec is None or (rec.next_review_date and rec.next_review_date <= date.today()):
            due.append(_q(q))
    return {"status": "success", "data": due}

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
    prev = await _latest_record(db, q.id)
    idx = prev.interval_index if prev else 0
    streak = prev.consecutive_correct if prev else 0
    result = review_engine.calculate_next(body.is_correct, idx, streak, date.today())
    db.add(ReviewRecord(question_id=q.id, user_id=user.id, is_correct=body.is_correct,
                        interval_index=result.interval_index, next_review_date=result.next_review_date,
                        consecutive_correct=result.consecutive_correct))
    q.mastery_level = result.mastery_level
    await db.commit()
    return {"status": "success", "data": {
        "mastery_level": result.mastery_level,
        "next_review_date": result.next_review_date.isoformat() if result.next_review_date else None}}
