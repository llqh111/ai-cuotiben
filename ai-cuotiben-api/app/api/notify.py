"""每日复习提醒：今日到期题数 + 各科目分布。"""
from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import WrongQuestion, ReviewRecord, User
from app.core.security import get_current_user

router = APIRouter()


@router.get("/today")
async def today_summary(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.mastery_level != "mastered"))).scalars().all()
    due_by_subject: dict[int, int] = {}
    total_due = 0
    for q in rows:
        rec = (await db.execute(select(ReviewRecord).where(ReviewRecord.question_id == q.id)
               .order_by(ReviewRecord.id.desc()))).scalars().first()
        if rec is None or (rec.next_review_date and rec.next_review_date <= date.today()):
            total_due += 1
            due_by_subject[q.subject_id] = due_by_subject.get(q.subject_id, 0) + 1
    return {"status": "success", "data": {
        "total_due": total_due, "by_subject": due_by_subject, "has_pending": total_due > 0}}
