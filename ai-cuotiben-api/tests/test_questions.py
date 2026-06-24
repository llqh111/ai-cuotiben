import io

async def _auth(client):
    r = await client.post("/api/auth/register", json={"nickname": "u", "passphrase": "p"})
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}

async def _upload(client, headers):
    fake_jpg = io.BytesIO(b"\xff\xd8\xff")
    return await client.post("/api/upload/small", files={"ocr_image": ("t.jpg", fake_jpg, "image/jpeg")}, headers=headers)

async def test_list_requires_auth(client):
    r = await client.get("/api/questions")
    assert r.status_code == 401

async def test_list_returns_own_questions(client):
    headers = await _auth(client)
    resp = await _upload(client, headers)
    data = resp.json()
    assert data["status"] == "success"
    qid = data["data"]["questions"][0]["id"]
    r = await client.get("/api/questions", headers=headers)
    items = r.json()["data"]
    assert len(items) >= 1
    assert any(q["id"] == qid for q in items)
