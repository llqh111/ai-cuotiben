"""上传管道：三个独立入口 — 小题(Gemini OCR) / 大题(外部AI文本) / 粘贴。

数据模型约定：
  image_url = "复习展示图"
    - 小题有配图 → 展示配图
    - 小题无配图 → 展示 OCR 图
    - 大题 → 展示原题图
"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import logging
from app.database import get_db
from app.models import User, Subject, KnowledgePoint, QuestionPattern, WrongQuestion, Chapter
from app.core.security import get_current_user
from app.services import ai_service
from app.services.gemini_service import recognize_image
from app.services.upload_pipeline import split_questions, analyze_pdf_questions
from app.services.ocr_service import extract_text_from_pdf
from app.services.image_service import save_image
from app.schemas.question import ImportBatch

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_IMAGE = {"image/jpeg", "image/png", "image/gif", "image/webp"}


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
        # 尝试匹配考纲章节树中的叶子节点，自动关联 chapter_id
        chapter: Chapter | None = (await db.execute(
            select(Chapter).where(
                Chapter.user_id == user_id,
                Chapter.subject_id == subject_id,
                Chapter.name == name,
                Chapter.parent_id.isnot(None),  # 叶子节点（非顶层章）
            )
        )).scalars().first()
        kp = KnowledgePoint(
            user_id=user_id, subject_id=subject_id, name=name,
            chapter_id=chapter.id if chapter else None,
        )
        db.add(kp); await db.flush()
    return kp


async def _get_or_create_pattern(db, user_id, kp_id, name) -> QuestionPattern:
    pat = (await db.execute(select(QuestionPattern).where(
        QuestionPattern.user_id == user_id, QuestionPattern.knowledge_point_id == kp_id,
        QuestionPattern.name == name))).scalars().first()
    if pat is None:
        pat = QuestionPattern(user_id=user_id, knowledge_point_id=kp_id, name=name)
        db.add(pat); await db.flush()
    return pat


async def _persist(db, user_id, ocr_text, image_url, parsed, classified, subject_id) -> WrongQuestion:
    """落库一条分析完成的错题。"""
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
        user_id=user_id, subject_id=subj.id,
        knowledge_point_id=kp.id, question_pattern_id=pat.id,
        image_url=image_url,
        ocr_text=ocr_text,
        question_content=parsed.get("question_content"),
        question_type=parsed.get("question_type", "essay"),
        correct_answer=parsed.get("correct_answer"),
        solution_steps=parsed.get("solution_steps"),
        error_analysis=classified.get("error_analysis"),
        improvement_tips=classified.get("improvement_tips"),
        error_category=classified.get("error_category"),
        error_category_detail=classified.get("error_category_detail"),
        status="analyzed", mastery_level="new",
    )
    db.add(q); await db.commit(); await db.refresh(q)
    return q


async def _analyze_pipeline(
    db, user_id, ocr_text, image_url, student_answer, subject_id
) -> list[dict]:
    """DeepSeek 管道：拆分 + 逐题分析 + 错因分类 + 落库。"""
    splits = await split_questions(ocr_text)
    created = []

    for item in splits:
        single = item.get("content", ocr_text)
        parsed = await ai_service.parse_question(single, student_answer)
        if not parsed:
            q = WrongQuestion(user_id=user_id, subject_id=subject_id or 1,
                              ocr_text=single, image_url=image_url,
                              status="pending", mastery_level="new")
            db.add(q); await db.flush()
            created.append({"id": q.id, "status": "pending"})
            continue

        existing_kps = (await db.execute(
            select(KnowledgePoint.name).where(KnowledgePoint.user_id == user_id)
        )).scalars().all()
        existing_pats = (await db.execute(
            select(QuestionPattern.name).where(QuestionPattern.user_id == user_id)
        )).scalars().all()

        classified = await ai_service.classify_question(
            parsed.get("question_content", single),
            parsed.get("correct_answer", ""),
            student_answer,
            list(existing_kps), list(existing_pats),
        )

        q = await _persist(db, user_id, single, image_url, parsed, classified or {}, subject_id)
        created.append({
            "id": q.id, "status": "success",
            "question_content": q.question_content,
            "image_url": image_url,
        })

    return created


# ────────────────────────────────────────────────
#  入口一：小题录入 — Gemini OCR + DeepSeek 分析
# ────────────────────────────────────────────────

@router.post("/small")
async def upload_small(
    ocr_image: UploadFile = File(...),           # 必传：OCR 识别图
    display_image: UploadFile = File(None),       # 可选：复习展示配图
    student_answer: str = Form(""),
    subject_id: int = Form(None),
    confirm_first: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """小题录入：OCR 图走 Gemini 识别，可选配图原样保留供复习展示。

    - ocr_image: 含题目文字的图片，Gemini 识别
    - display_image: 纯配图（函数图/几何图），不识别，直接存
    """
    if ocr_image.content_type not in ALLOWED_IMAGE:
        raise HTTPException(400, "ocr_image 仅支持 jpg/png/gif/webp")

    ocr_bytes = await ocr_image.read()

    # 保存 ORC 图
    ocr_url = save_image(ocr_bytes, user.id, ocr_image.filename, prefix="ocr_")
    logger.info(f"Small question OCR image: {ocr_url}")

    # 处理展示配图
    display_url = ""
    if display_image:
        if display_image.content_type not in ALLOWED_IMAGE:
            raise HTTPException(400, "display_image 仅支持 jpg/png/gif/webp")
        disp_bytes = await display_image.read()
        display_url = save_image(disp_bytes, user.id, display_image.filename, prefix="disp_")
        logger.info(f"Small question display image: {display_url}")

    # 复习展示图：有配图用配图，无配图用 OCR 图
    image_url = display_url or ocr_url

    # Gemini OCR 识别
    ocr_text = await recognize_image(ocr_bytes)

    # confirm_first 模式：只返回 OCR 文本，不分析
    if confirm_first:
        return {
            "status": "ocr_done",
            "data": {
                "ocr_text": ocr_text,
                "image_url": image_url,
                "student_answer": student_answer,
                "subject_id": subject_id,
            },
        }

    # DeepSeek 分析管道
    created = await _analyze_pipeline(db, user.id, ocr_text, image_url, student_answer, subject_id)

    return {
        "status": "success",
        "data": {
            "questions": created,
            "total": len(created),
            "image_url": image_url,
        },
    }


# ────────────────────────────────────────────────
#  入口二：大题录入 — 图片直接展示 + 外部AI文本
# ────────────────────────────────────────────────

@router.post("/big-question")
async def upload_big_question(
    image: UploadFile = File(...),               # 必传：题目图片（直接展示）
    text: str = Form(...),                        # 必传：外部 AI 识别后的纯文本
    student_answer: str = Form(""),
    subject_id: int = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """大题录入：图片直接作为题目展示，不经过 Gemini。

    用户在外部 AI 工具（Claude 等）将图片转为文字后粘贴进来，
    DeepSeek 基于粘贴的文字作答。图片原样保留供复习查看。
    """
    if image.content_type not in ALLOWED_IMAGE:
        raise HTTPException(400, "image 仅支持 jpg/png/gif/webp")
    if not text.strip():
        raise HTTPException(400, "请粘贴外部 AI 识别后的题目文字")

    image_bytes = await image.read()

    # 保存原题图
    image_url = save_image(image_bytes, user.id, image.filename)
    logger.info(f"Big question image: {image_url}")

    # 不走 Gemini，直接用用户提供的文本
    created = await _analyze_pipeline(db, user.id, text.strip(), image_url, student_answer, subject_id)

    return {
        "status": "success",
        "data": {
            "questions": created,
            "total": len(created),
            "image_url": image_url,
        },
    }


# ────────────────────────────────────────────────
#  入口三：粘贴题目（保持不变）
# ────────────────────────────────────────────────

@router.post("/text")
async def upload_text(
    text: str = Form(...),
    student_answer: str = Form(""),
    subject_id: int = Form(...),
    image: UploadFile = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """纯文本粘贴录入。可选附带图片存档供复习展示。"""
    image_url = ""
    ocr_text = text

    if image and image.content_type in ALLOWED_IMAGE:
        file_bytes = await image.read()
        image_url = save_image(file_bytes, user.id, image.filename)
        # 有图时用 Gemini 识别并与文本合并
        gemini_text = await recognize_image(file_bytes)
        if gemini_text:
            ocr_text = f"{gemini_text}\n\n---\n{text}"
            logger.info(f"Text upload: merged Gemini OCR ({len(gemini_text)} chars) with user text")

    created = await _analyze_pipeline(
        db, user.id, ocr_text, image_url or "text-upload", student_answer, subject_id
    )

    return {
        "status": "success",
        "data": {
            "questions": created,
            "total": len(created),
            "image_url": image_url,
        },
    }

# ────────────────────────────────────────────────
#  入口四：OCR 修正确认
# ────────────────────────────────────────────────

from pydantic import BaseModel

class ConfirmRequest(BaseModel):
    ocr_text: str
    image_url: str = ""
    student_answer: str = ""
    subject_id: int

@router.post("/confirm")
async def upload_confirm(
    body: ConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """接收学生修正后的 OCR 文本，执行 DeepSeek 分析并落库。"""
    if not body.ocr_text.strip():
        raise HTTPException(400, "OCR 文本不能为空")

    created = await _analyze_pipeline(
        db, user.id, body.ocr_text, body.image_url, body.student_answer, body.subject_id
    )

    return {
        "status": "success",
        "data": {
            "questions": created,
            "total": len(created),
        },
    }

# ────────────────────────────────────────────────
#  入口五：PDF 上传
# ────────────────────────────────────────────────

@router.post("/pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    subject_id: int = Form(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """上传 PDF：提取文字 → AI 拆分分析 → 返回题目列表（未入库）。用户后续通过 /pdf/confirm 选题入库。"""
    if file.content_type != "application/pdf":
        raise HTTPException(400, "仅支持 PDF 文件")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "文件不能超过 10MB")

    # 确保科目存在
    subj = (await db.execute(select(Subject).where(Subject.id == subject_id))).scalars().first()
    if subj is None:
        raise HTTPException(400, f"科目 {subject_id} 不存在")

    # 提取文字
    full_text = await extract_text_from_pdf(contents)
    if not full_text or full_text.startswith("["):
        raise HTTPException(422, f"PDF 文字提取失败: {full_text}")

    # AI 拆分+分析
    questions = await analyze_pdf_questions(full_text)

    return {
        "status": "success",
        "data": {
            "filename": file.filename,
            "subject_id": subject_id,
            "subject_name": subj.name,
            "total_count": len(questions),
            "questions": [{
                "index": q["index"],
                "question_content": q["question_content"],
                "question_type": q["question_type"],
                "correct_answer": q.get("correct_answer", ""),
                "solution_steps": q.get("solution_steps", ""),
                "knowledge_point_name": q.get("knowledge_point_name", "待分类"),
                "question_pattern_name": q.get("question_pattern_name", "待分类"),
            } for q in questions]
        }
    }


class PdfConfirmBody(BaseModel):
    subject_id: int
    questions: list[dict]


@router.post("/pdf/confirm")
async def confirm_pdf_questions(
    body: PdfConfirmBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """将 PDF 分析结果中的题目逐条入库（按 selected=true 过滤）。"""
    selected = [q for q in body.questions if q.get("selected", False)]
    if not selected:
        raise HTTPException(400, "至少选择一道题")

    subj = (await db.execute(select(Subject).where(Subject.id == body.subject_id))).scalars().first()
    if subj is None:
        raise HTTPException(400, f"科目 {body.subject_id} 不存在")

    # 获取该用户该科目下已有知识点和题型列表
    kps = (await db.execute(select(KnowledgePoint).where(
        KnowledgePoint.user_id == user.id, KnowledgePoint.subject_id == body.subject_id
    ))).scalars().all()
    existing_kp_names = {kp.name: kp for kp in kps}

    saved_ids = []
    for q in selected:
        # 知识点：匹配已有或新建
        kp_name = q.get("knowledge_point_name", "待分类")
        if kp_name in existing_kp_names:
            kp = existing_kp_names[kp_name]
        else:
            kp = KnowledgePoint(user_id=user.id, subject_id=body.subject_id, name=kp_name)
            db.add(kp)
            await db.flush()
            existing_kp_names[kp_name] = kp

        # 题型：匹配已有或新建
        pat_name = q.get("question_pattern_name", "待分类")
        pat = (await db.execute(select(QuestionPattern).where(
            QuestionPattern.user_id == user.id,
            QuestionPattern.knowledge_point_id == kp.id,
            QuestionPattern.name == pat_name
        ))).scalars().first()
        if pat is None:
            pat = QuestionPattern(user_id=user.id, knowledge_point_id=kp.id, name=pat_name)
            db.add(pat)
            await db.flush()

        # 写入错题
        wq = WrongQuestion(
            user_id=user.id,
            subject_id=body.subject_id,
            knowledge_point_id=kp.id,
            question_pattern_id=pat.id,
            ocr_text="",
            question_content=q["question_content"],
            question_type=q.get("question_type", "essay"),
            correct_answer=q.get("correct_answer", ""),
            solution_steps=q.get("solution_steps", ""),
            status="analyzed",
            mastery_level="new",
        )
        db.add(wq)
        await db.flush()
        saved_ids.append(wq.id)

    await db.commit()

    return {
        "status": "success",
        "data": {
            "saved_count": len(saved_ids),
            "saved_ids": saved_ids,
            "first_question_id": saved_ids[0] if saved_ids else None,
        }
    }


# ────────────────────────────────────────────────
#  入口六：导入成品错题（外部 AI 已分析，绕开 DeepSeek）
# ────────────────────────────────────────────────

@router.post("/import")
async def import_questions(
    body: ImportBatch,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """导入已分析好的成品错题，直接落库，不调用 DeepSeek。

    供外部 AI（Claude 等）输出完整字段后批量导入。每题需指定 subject_id(1-6)；
    知识点 / 题型按名称自动匹配已有或新建。状态与正常上传一致（analyzed / new），
    自动进入间隔复习队列。
    """
    if not body.questions:
        raise HTTPException(400, "至少导入一道题")

    saved_ids = []
    for item in body.questions:
        subj = (await db.execute(
            select(Subject).where(Subject.id == item.subject_id))).scalars().first()
        if subj is None:
            raise HTTPException(400, f"科目 {item.subject_id} 不存在")

        kp = await _get_or_create_kp(db, user.id, subj.id, item.knowledge_point_name or "未分类")
        pat = await _get_or_create_pattern(db, user.id, kp.id, item.question_pattern_name or "未分类题型")

        wq = WrongQuestion(
            user_id=user.id, subject_id=subj.id,
            knowledge_point_id=kp.id, question_pattern_id=pat.id,
            image_url=item.image_url or "",
            ocr_text="",
            question_content=item.question_content,
            question_type=item.question_type or "essay",
            correct_answer=item.correct_answer,
            student_answer=item.student_answer,
            solution_steps=item.solution_steps,
            error_analysis=item.error_analysis,
            improvement_tips=item.improvement_tips,
            error_category=item.error_category,
            error_category_detail=item.error_category_detail,
            status="analyzed", mastery_level="new",
        )
        db.add(wq); await db.flush()
        saved_ids.append(wq.id)

    await db.commit()
    return {
        "status": "success",
        "data": {"saved_count": len(saved_ids), "saved_ids": saved_ids},
    }
