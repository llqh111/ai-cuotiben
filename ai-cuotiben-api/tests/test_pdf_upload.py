import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def token(client):
    """注册并获取 token"""
    r = await client.post("/api/auth/register", json={"nickname": "pdf_test", "passphrase": "test123"})
    return r.json()["data"]["token"]


@pytest.mark.asyncio
async def test_pdf_upload_rejects_non_pdf(client, token):
    """上传非 PDF 返回 400"""
    resp = await client.post(
        "/api/upload/pdf",
        files={"file": ("test.txt", b"hello", "text/plain")},
        data={"subject_id": "1"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_pdf_upload_no_text(client, token):
    """上传空 PDF"""
    resp = await client.post(
        "/api/upload/pdf",
        files={"file": ("empty.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
        data={"subject_id": "1"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code in (200, 422)


@pytest.mark.asyncio
async def test_pdf_confirm_empty_selection(client, token):
    """不选题直接确认返回 400"""
    resp = await client.post(
        "/api/upload/pdf/confirm",
        json={"subject_id": 1, "questions": [{"selected": False}]},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_pdf_confirm_saves_question(client, token):
    """选一道题确认入库"""
    resp = await client.post(
        "/api/upload/pdf/confirm",
        json={
            "subject_id": 1,
            "questions": [{
                "selected": True,
                "question_content": "\u6d4b\u8bd5\u9898\uff1a1+1=?",
                "question_type": "fill_blank",
                "correct_answer": "2",
                "solution_steps": "\u76f4\u63a5\u8ba1\u7b97",
                "knowledge_point_name": "\u52a0\u6cd5",
                "question_pattern_name": "\u57fa\u7840\u8ba1\u7b97"
            }]
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["saved_count"] == 1
    assert data["first_question_id"] is not None
