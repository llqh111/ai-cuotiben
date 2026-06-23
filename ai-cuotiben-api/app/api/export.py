from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.models import User, WrongQuestion
from app.schemas.export import ExportRequest
from app.services.pdf_service import build_questions_pdf

router = APIRouter()


@router.post("/pdf")
async def export_pdf(body: ExportRequest, db: AsyncSession = Depends(get_db),
                     user: User = Depends(get_current_user)):
    q = select(WrongQuestion).where(WrongQuestion.user_id == user.id)
    if body.subject_id:
        q = q.where(WrongQuestion.subject_id == body.subject_id)
    if body.knowledge_point_id:
        q = q.where(WrongQuestion.knowledge_point_id == body.knowledge_point_id)
    if body.question_pattern_id:
        q = q.where(WrongQuestion.question_pattern_id == body.question_pattern_id)
    if body.mastery_level:
        q = q.where(WrongQuestion.mastery_level == body.mastery_level)
    rows = (await db.execute(q.order_by(WrongQuestion.id))).scalars().all()
    items = [{
        "question_content": r.question_content, "original_text": r.ocr_text,
        "correct_answer": r.correct_answer, "solution_steps": r.solution_steps,
        "error_analysis": r.error_analysis, "improvement_tips": r.improvement_tips,
    } for r in rows]
    pdf = build_questions_pdf(items, with_answer=body.with_answer, title=body.title)
    filename = quote(f"{body.title}.pdf")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"})
