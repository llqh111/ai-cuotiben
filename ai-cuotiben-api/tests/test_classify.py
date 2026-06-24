from sqlalchemy import select
from app.models import KnowledgePoint, User
from app.api.upload import _persist as persist_analyzed_question

async def _make_user(db):
    u = User(nickname="t", passphrase_hash="x")
    db.add(u); await db.commit(); await db.refresh(u)
    return u

PARSED = {"question_content": "Q1", "question_type": "essay", "correct_answer": "A",
          "solution_steps": "S", "subject": "数学", "knowledge_point_name": "导数"}
CLASSIFIED = {"error_analysis": "E", "improvement_tips": "T",
              "matched_knowledge_point": "导数", "matched_question_pattern": "导数求单调区间",
              "is_new_knowledge_point": True, "is_new_question_pattern": True}

async def test_persist_creates_new_kp_and_pattern(db_session):
    user = await _make_user(db_session)
    q = await persist_analyzed_question(db_session, user.id, "ocr原文", "img.png", PARSED, CLASSIFIED, None)
    assert q.knowledge_point_id is not None
    kps = (await db_session.execute(select(KnowledgePoint))).scalars().all()
    assert len(kps) == 1 and kps[0].name == "导数"

async def test_persist_reuses_existing_kp(db_session):
    user = await _make_user(db_session)
    await persist_analyzed_question(db_session, user.id, "o", "i", PARSED, CLASSIFIED, None)
    await persist_analyzed_question(db_session, user.id, "o", "i", PARSED, CLASSIFIED, None)
    kps = (await db_session.execute(select(KnowledgePoint))).scalars().all()
    assert len(kps) == 1  # 复用，不重复建
