import io
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.core.security import get_current_user
from app.schemas.knowledge import InitVaultRequest
from app.services.knowledge_sync import (
    init_vault,
    sync_question,
    sync_knowledge_point,
    delete_vault_file,
    get_sync_status,
    _get_user_vault_path,
)

router = APIRouter()


@router.post("/init-vault")
async def init_vault_endpoint(
    body: InitVaultRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        stats = await init_vault(db, user, overwrite=body.overwrite)
        return {"status": "success", "data": stats}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sync-question/{question_id}")
async def sync_question_endpoint(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        ok = await sync_question(db, user, question_id)
        if not ok:
            raise HTTPException(status_code=404, detail="错题不存在")
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sync-knowledge-point/{kp_id}")
async def sync_kp_endpoint(
    kp_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        ok = await sync_knowledge_point(db, user, kp_id)
        if not ok:
            raise HTTPException(status_code=404, detail="知识点不存在")
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/delete-file/{entity_type}/{entity_id}")
async def delete_file_endpoint(
    entity_type: str,
    entity_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if entity_type not in ("question", "knowledge_point"):
        raise HTTPException(status_code=400, detail="type 必须是 question 或 knowledge_point")
    try:
        ok = await delete_vault_file(db, user, entity_type, entity_id)
        if not ok:
            raise HTTPException(status_code=404, detail="实体不存在或无关联文件")
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status")
async def status_endpoint(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"status": "success", "data": await get_sync_status(db, user)}


@router.get("/export-markdown")
async def export_markdown(
    subject_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """导出 Markdown ZIP 包（不写入 vault，直接下载）。"""
    from app.models import Subject, KnowledgePoint, QuestionPattern, WrongQuestion, KnowledgeRelation
    from app.services.markdown_renderer import (
        render_knowledge_point,
        render_question_card,
        render_subject_index,
        render_sync_config,
    )
    from app.services.knowledge_sync import SUBJECT_NAMES, _safe_filename
    from sqlalchemy import select

    subject_rows = (await db.execute(select(Subject))).scalars().all()
    if subject_id:
        subject_rows = [s for s in subject_rows if s.id == subject_id]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for subj in subject_rows:
            subj_name = SUBJECT_NAMES.get(subj.id, subj.name)

            kp_rows = (await db.execute(
                select(KnowledgePoint).where(
                    KnowledgePoint.user_id == user.id,
                    KnowledgePoint.subject_id == subj.id,
                )
            )).scalars().all()

            q_rows = (await db.execute(
                select(WrongQuestion).where(
                    WrongQuestion.user_id == user.id,
                    WrongQuestion.subject_id == subj.id,
                )
            )).scalars().all()

            # 科目索引
            total = len(q_rows)
            mastered = sum(1 for q in q_rows if q.mastery_level == "mastered")
            rate = (mastered / total * 100) if total > 0 else 0
            idx = render_subject_index(
                subject_name=subj_name,
                total_questions=total,
                mastered_count=mastered,
                mastery_rate=rate,
                learning_count=total - mastered,
                last_synced=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
                knowledge_points=[{"name": kp.name, "question_count": sum(
                    1 for q in q_rows if q.knowledge_point_id == kp.id
                )} for kp in kp_rows],
            )
            zf.writestr(f"{subj_name}/_index.md", idx)

            # 知识点
            for kp in kp_rows:
                pat_rows = (await db.execute(
                    select(QuestionPattern).where(QuestionPattern.knowledge_point_id == kp.id)
                )).scalars().all()
                rel_rows = (await db.execute(
                    select(KnowledgeRelation).where(
                        KnowledgeRelation.source_point_id == kp.id,
                        KnowledgeRelation.user_id == user.id,
                    )
                )).scalars().all()
                kp_content = render_knowledge_point(
                    name=kp.name,
                    subject_name=subj_name,
                    description=kp.description or "",
                    total_questions=sum(1 for q in q_rows if q.knowledge_point_id == kp.id),
                    mastered_count=sum(
                        1 for q in q_rows
                        if q.knowledge_point_id == kp.id and q.mastery_level == "mastered"
                    ),
                    mastery_rate=(
                        sum(1 for q in q_rows if q.knowledge_point_id == kp.id and q.mastery_level == "mastered")
                        / max(1, sum(1 for q in q_rows if q.knowledge_point_id == kp.id)) * 100
                    ),
                    patterns=[{"name": p.name, "count": sum(
                        1 for r in q_rows if r.question_pattern_id == p.id
                    )} for p in pat_rows],
                    questions=[{"id": q.id, "error_summary": (q.error_analysis or "")[:60]}
                               for q in q_rows if q.knowledge_point_id == kp.id][:20],
                    relations=[{"name": str(r.target_point_id), "type": r.relation_type}
                               for r in rel_rows],
                )
                zf.writestr(f"{subj_name}/知识点说明/{_safe_filename(kp.name)}.md", kp_content)

            # 错题
            for q in q_rows:
                kp_name = ""
                if q.knowledge_point_id:
                    kp_row = (await db.execute(
                        select(KnowledgePoint).where(KnowledgePoint.id == q.knowledge_point_id)
                    )).scalars().first()
                    if kp_row:
                        kp_name = kp_row.name
                q_content = render_question_card(
                    id=q.id, subject_name=subj_name, kp_name=kp_name,
                    question_content=q.question_content or "",
                    question_type=q.question_type or "essay",
                    mastery_level=q.mastery_level or "new",
                    next_review=q.next_review_at.isoformat() if q.next_review_at else "",
                    error_category=q.error_category or "",
                    student_answer=q.student_answer or "",
                    correct_answer=q.correct_answer or "",
                    solution_steps=q.solution_steps or "",
                    error_analysis=q.error_analysis or "",
                    improvement_tips=q.improvement_tips or "",
                )
                zf.writestr(f"{subj_name}/错题卡片/Q-{q.id}.md", q_content)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=cuotiben-export.zip"},
    )


def trigger_question_sync(question_id: int, user_id: int):
    """供 BackgroundTasks 调用的同步函数。"""
    import asyncio
    from app.database import AsyncSessionLocal
    from sqlalchemy import select

    async def _run():
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.id == user_id))).scalars().first()
            if user and user.vault_path:
                await sync_question(db, user, question_id)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(_run())
    else:
        loop.create_task(_run())


def trigger_delete_sync(entity_type: str, entity_id: int, user_id: int):
    """供 BackgroundTasks 调用的删除同步函数。"""
    import asyncio
    from app.database import AsyncSessionLocal
    from sqlalchemy import select

    async def _run():
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.id == user_id))).scalars().first()
            if user and user.vault_path:
                await delete_vault_file(db, user, entity_type, entity_id)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(_run())
    else:
        loop.create_task(_run())
