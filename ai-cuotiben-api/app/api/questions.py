from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import WrongQuestion, ReviewRecord, KnowledgePoint, QuestionPattern, User
from app.core.security import get_current_user
from app.schemas.question import QuestionUpdate

router = APIRouter()

def _dump(q: WrongQuestion) -> dict:
    return {"id": q.id, "subject_id": q.subject_id, "knowledge_point_id": q.knowledge_point_id,
            "question_pattern_id": q.question_pattern_id, "question_content": q.question_content,
            "question_type": q.question_type, "correct_answer": q.correct_answer,
            "original_text": q.ocr_text, "analysis": q.error_analysis, "answer": q.correct_answer,
            "solution_steps": q.solution_steps, "improvement_tips": q.improvement_tips,
            "image_url": q.image_url,
            "status": q.status, "mastery_level": q.mastery_level, "created_at": q.created_at}

async def _owned(db, user_id, qid) -> WrongQuestion:
    q = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.id == qid, WrongQuestion.user_id == user_id))).scalars().first()
    if q is None:
        raise HTTPException(status_code=404, detail="错题不存在")
    return q

@router.get("")
async def list_questions(subject_id: int = None, knowledge_point_id: int = None,
                         question_pattern_id: int = None, mastery_level: str = None,
                         db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(WrongQuestion).where(WrongQuestion.user_id == user.id)
    if subject_id: q = q.where(WrongQuestion.subject_id == subject_id)
    if knowledge_point_id: q = q.where(WrongQuestion.knowledge_point_id == knowledge_point_id)
    if question_pattern_id: q = q.where(WrongQuestion.question_pattern_id == question_pattern_id)
    if mastery_level: q = q.where(WrongQuestion.mastery_level == mastery_level)
    rows = (await db.execute(q)).scalars().all()
    return {"status": "success", "data": [_dump(x) for x in rows]}

@router.get("/tree/{subject_id}")
async def tree(subject_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    kps = (await db.execute(select(KnowledgePoint).where(
        KnowledgePoint.user_id == user.id, KnowledgePoint.subject_id == subject_id))).scalars().all()
    out = []
    for kp in kps:
        pats = (await db.execute(select(QuestionPattern).where(QuestionPattern.knowledge_point_id == kp.id))).scalars().all()
        pat_nodes = []
        for p in pats:
            cnt = len((await db.execute(select(WrongQuestion).where(
                WrongQuestion.question_pattern_id == p.id))).scalars().all())
            pat_nodes.append({"id": p.id, "name": p.name, "count": cnt})
        out.append({"id": kp.id, "name": kp.name, "patterns": pat_nodes})
    return {"status": "success", "data": out}

@router.get("/{question_id}")
async def get_question(question_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await _owned(db, user.id, question_id)
    return {"status": "success", "data": _dump(q)}

@router.put("/{question_id}")
async def update_question(question_id: int, body: QuestionUpdate,
                          db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await _owned(db, user.id, question_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(q, field, value)
    await db.commit(); await db.refresh(q)
    return {"status": "success", "data": _dump(q)}

@router.delete("/{question_id}")
async def delete_question(question_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await _owned(db, user.id, question_id)
    await db.execute(delete(ReviewRecord).where(ReviewRecord.question_id == q.id))
    await db.delete(q); await db.commit()
    return {"status": "success", "message": "已删除"}
