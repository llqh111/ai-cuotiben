from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.models import User, WrongQuestion
from app.services import sprint_engine

router = APIRouter()


def _q(q: WrongQuestion) -> dict:
    return {"id": q.id, "subject_id": q.subject_id, "question_content": q.question_content,
            "question_type": q.question_type, "correct_answer": q.correct_answer,
            "solution_steps": q.solution_steps, "mastery_level": q.mastery_level}


@router.get("/plan")
async def plan(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    unmastered_rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.mastery_level != "mastered"))).scalars().all()
    sprint_plan = sprint_engine.make_plan(user.exam_date, len(unmastered_rows), date.today())
    # 选题：未掌握优先，随机取每日配额；final 阶段配额=全部
    picked = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.mastery_level != "mastered")
        .order_by(func.random()).limit(sprint_plan.daily_quota))).scalars().all()
    return {"status": "success", "data": {
        "days_remaining": sprint_plan.days_remaining, "phase": sprint_plan.phase,
        "daily_quota": sprint_plan.daily_quota, "unmastered_total": len(unmastered_rows),
        "exam_date": user.exam_date.isoformat() if user.exam_date else None,
        "questions": [_q(q) for q in picked]}}
