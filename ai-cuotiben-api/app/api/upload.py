from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import User, Subject, KnowledgePoint, QuestionPattern, WrongQuestion
from app.core.security import get_current_user
from app.services.ocr_service import extract_text_from_image, extract_text_from_pdf
from app.services import ai_service
from app.services.upload_pipeline import split_questions

router = APIRouter()
ALLOWED = {"image/jpeg", "image/png", "application/pdf"}

async def _get_or_create_subject(db: AsyncSession, name: str) -> Subject:
    subj = (await db.execute(select(Subject).where(Subject.name == name))).scalars().first()
    if subj is None:
        subj = Subject(name=name); db.add(subj); await db.flush()
    return subj

async def _get_or_create_kp(db, user_id, subject_id, name) -> KnowledgePoint:
    kp = (await db.execute(select(KnowledgePoint).where(
        KnowledgePoint.user_id == user_id, KnowledgePoint.subject_id == subject_id,
        KnowledgePoint.name == name))).scalars().first()
    if kp is None:
        kp = KnowledgePoint(user_id=user_id, subject_id=subject_id, name=name); db.add(kp); await db.flush()
    return kp

async def _get_or_create_pattern(db, user_id, kp_id, name) -> QuestionPattern:
    pat = (await db.execute(select(QuestionPattern).where(
        QuestionPattern.user_id == user_id, QuestionPattern.knowledge_point_id == kp_id,
        QuestionPattern.name == name))).scalars().first()
    if pat is None:
        pat = QuestionPattern(user_id=user_id, knowledge_point_id=kp_id, name=name); db.add(pat); await db.flush()
    return pat

async def persist_analyzed_question(db, user_id, ocr_text, image_url, parsed, classified, subject_id=None) -> WrongQuestion:
    if subject_id:
        subj = (await db.execute(select(Subject).where(Subject.id == subject_id))).scalars().first()
        if subj is None:
            subj = await _get_or_create_subject(db, parsed.get("subject", "数学"))
    else:
        subj = await _get_or_create_subject(db, parsed.get("subject", "数学"))
    kp_name = classified.get("matched_knowledge_point") or parsed.get("knowledge_point_name") or "未分类"
    kp = await _get_or_create_kp(db, user_id, subj.id, kp_name)
    pat_name = classified.get("matched_question_pattern") or "未分类题型"
    pat = await _get_or_create_pattern(db, user_id, kp.id, pat_name)
    q = WrongQuestion(
        user_id=user_id, subject_id=subj.id, knowledge_point_id=kp.id, question_pattern_id=pat.id,
        image_url=image_url, ocr_text=ocr_text,
        question_content=parsed.get("question_content"), question_type=parsed.get("question_type", "essay"),
        correct_answer=parsed.get("correct_answer"), solution_steps=parsed.get("solution_steps"),
        error_analysis=classified.get("error_analysis"), improvement_tips=classified.get("improvement_tips"),
        status="analyzed", mastery_level="new")
    db.add(q); await db.commit(); await db.refresh(q)
    return q

@router.post("/")
async def upload_question(file: UploadFile = File(...), student_answer: str = "",
                          subject_id: int = None,
                          db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="仅支持 jpg/png/pdf")
    file_bytes = await file.read()
    if file.content_type == "application/pdf":
        ocr_text = await extract_text_from_pdf(file_bytes)
    else:
        ocr_text = await extract_text_from_image(file_bytes)

    # AI 拆分多题
    splits = await split_questions(ocr_text)

    # 逐题分析并落库
    created = []
    for item in splits:
        single_ocr = item.get("content", ocr_text)
        parsed = await ai_service.parse_question(single_ocr, student_answer)
        if not parsed:
            q = WrongQuestion(user_id=user.id, subject_id=subject_id or 1, ocr_text=single_ocr,
                              image_url=file.filename, status="pending", mastery_level="new")
            db.add(q); await db.flush()
            created.append({"id": q.id, "status": "pending"})
            continue
        existing_kps = (await db.execute(select(KnowledgePoint.name).where(
            KnowledgePoint.user_id == user.id))).scalars().all()
        existing_pats = (await db.execute(select(QuestionPattern.name).where(
            QuestionPattern.user_id == user.id))).scalars().all()
        classified = await ai_service.classify_question(
            parsed.get("question_content", single_ocr), parsed.get("correct_answer", ""),
            student_answer, list(existing_kps), list(existing_pats))
        q = await persist_analyzed_question(db, user.id, single_ocr, file.filename, parsed, classified or {}, subject_id=subject_id)
        created.append({"id": q.id, "status": "success", "question_content": q.question_content})

    await db.commit()
    return {"status": "success", "data": {"questions": created, "total": len(created)}}
