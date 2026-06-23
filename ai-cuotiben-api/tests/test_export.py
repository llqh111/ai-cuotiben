import io

from app.services.pdf_service import build_questions_pdf


def test_build_pdf_returns_pdf_bytes():
    items = [{"question_content": "求 f(x)=x^2 的导数", "correct_answer": "2x",
              "solution_steps": "幂函数求导", "error_analysis": "忘了系数", "improvement_tips": "多练"}]
    pdf = build_questions_pdf(items, with_answer=True)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 500


def test_build_pdf_without_answer_is_smaller():
    items = [{"question_content": "Q" * 40, "correct_answer": "A" * 200,
              "solution_steps": "S" * 200, "error_analysis": "E" * 200, "improvement_tips": "T" * 200}]
    full = build_questions_pdf(items, with_answer=True)
    practice = build_questions_pdf(items, with_answer=False)
    assert practice[:4] == b"%PDF"
    assert len(practice) < len(full)  # 练习版不含答案，更小


async def _auth(client, nick="u"):
    r = await client.post("/api/auth/register", json={"nickname": nick, "passphrase": "p"})
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}


async def _upload(client, h):
    files = {"file": ("t.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 32), "image/png")}
    return (await client.post("/api/upload/", files=files, headers=h)).json()["data"]["id"]


async def test_export_pdf_endpoint_returns_pdf(client):
    h = await _auth(client)
    await _upload(client, h)
    r = await client.post("/api/export/pdf", json={"with_answer": True}, headers=h)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"


async def test_export_requires_auth(client):
    r = await client.post("/api/export/pdf", json={})
    assert r.status_code == 401
