"""导入成品错题端点 /api/upload/import 测试：绕开 DeepSeek，字段直接落库。"""
import pytest
from sqlalchemy import select
from app.models import WrongQuestion, KnowledgePoint

# client / db_session fixtures 来自 conftest.py：
# conftest 的 client 已装 get_db override 并与 db_session 共享同一会话，
# 端点写库后测试能立刻读回。本文件不再自定义 client，避免漏装 override。


async def _auth(client, nick="import-test"):
    resp = await client.post("/api/auth/register", json={"nickname": nick, "passphrase": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['data']['token']}"}


@pytest.mark.asyncio
async def test_import_persists_full_fields(client, db_session):
    """导入一条成品错题，分析字段应原样落库，状态为 new。"""
    headers = await _auth(client)
    payload = {"questions": [{
        "subject_id": 2,
        "knowledge_point_name": "导数与单调性",
        "question_pattern_name": "含参求单调区间",
        "question_content": "已知 f(x)=x²-ax，求 a 的取值范围。",
        "question_type": "essay",
        "correct_answer": "a ∈ [3, +∞)",
        "student_answer": "a > 3",
        "solution_steps": "求导分离参数，端点取等。",
        "error_analysis": "漏端点取等。",
        "improvement_tips": "含参题单独验端点。",
    }]}
    resp = await client.post("/api/upload/import", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["data"]["saved_count"] == 1
    qid = data["data"]["saved_ids"][0]

    row = (await db_session.execute(
        select(WrongQuestion).where(WrongQuestion.id == qid))).scalars().first()
    assert row.error_analysis == "漏端点取等。"
    assert row.correct_answer == "a ∈ [3, +∞)"
    assert row.solution_steps == "求导分离参数，端点取等。"
    assert row.mastery_level == "new"
    assert row.status == "analyzed"
    assert row.knowledge_point_id is not None
    assert row.question_pattern_id is not None


@pytest.mark.asyncio
async def test_import_creates_knowledge_point(client, db_session):
    """未见过的知识点应自动新建并挂到正确科目。"""
    headers = await _auth(client, "import-kp")
    payload = {"questions": [{
        "subject_id": 4,
        "knowledge_point_name": "牛顿第二定律",
        "question_pattern_name": "连接体受力分析",
        "question_content": "两物块叠放，求加速度。",
    }]}
    resp = await client.post("/api/upload/import", json=payload, headers=headers)
    assert resp.status_code == 200
    kp = (await db_session.execute(
        select(KnowledgePoint).where(KnowledgePoint.name == "牛顿第二定律"))).scalars().first()
    assert kp is not None
    assert kp.subject_id == 4


@pytest.mark.asyncio
async def test_import_rejects_bad_subject(client, db_session):
    """不存在的 subject_id 应返回 400。"""
    headers = await _auth(client, "import-bad")
    payload = {"questions": [{"subject_id": 99, "question_content": "x"}]}
    resp = await client.post("/api/upload/import", json=payload, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_import_rejects_empty(client, db_session):
    """空题目列表应返回 400。"""
    headers = await _auth(client, "import-empty")
    resp = await client.post("/api/upload/import", json={"questions": []}, headers=headers)
    assert resp.status_code == 400
