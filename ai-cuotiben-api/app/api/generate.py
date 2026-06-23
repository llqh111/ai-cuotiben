from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.models import KnowledgePoint, PracticeQuestion, QuestionPattern, User, WrongQuestion
from app.services import ai_service

router = APIRouter()

MAX_GENERATIONS = 3
PER_GENERATION = 3
MAX_PRACTICE = MAX_GENERATIONS * PER_GENERATION  # 每道错题最多生成 3 次 × 每次 3 题


def _dump(p: PracticeQuestion) -> dict:
    return {"id": p.id, "source_question_id": p.source_question_id, "content": p.content,
            "answer": p.answer, "solution": p.solution, "user_result": p.user_result}


async def _owned_question(db: AsyncSession, user_id: int, qid: int) -> WrongQuestion:
    q = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.id == qid, WrongQuestion.user_id == user_id))).scalars().first()
    if q is None:
        raise HTTPException(status_code=404, detail="错题不存在")
    return q


@router.get("/similar/{question_id}")
async def list_similar(question_id: int, db: AsyncSession = Depends(get_db),
                       user: User = Depends(get_current_user)):
    await _owned_question(db, user.id, question_id)
    rows = (await db.execute(select(PracticeQuestion).where(
        PracticeQuestion.source_question_id == question_id,
        PracticeQuestion.user_id == user.id))).scalars().all()
    return {"status": "success", "data": [_dump(p) for p in rows]}


@router.post("/similar/{question_id}")
async def generate_similar(question_id: int, db: AsyncSession = Depends(get_db),
                           user: User = Depends(get_current_user)):
    q = await _owned_question(db, user.id, question_id)
    existing = (await db.execute(select(PracticeQuestion).where(
        PracticeQuestion.source_question_id == question_id,
        PracticeQuestion.user_id == user.id))).scalars().all()
    if len(existing) >= MAX_PRACTICE:
        raise HTTPException(status_code=429, detail="该题已达生成上限（最多 3 次）")
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
        q.question_content or q.ocr_text or "", kp_name, pat_name, q.question_type or "essay")
    created = []
    for it in items:
        p = PracticeQuestion(source_question_id=question_id, user_id=user.id,
                             content=it.get("content", ""), answer=it.get("answer"),
                             solution=it.get("solution"))
        db.add(p)
        created.append(p)
    await db.commit()
    for p in created:
        await db.refresh(p)
    return {"status": "success", "data": [_dump(p) for p in created]}
