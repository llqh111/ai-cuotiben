import io

async def _auth(client):
    r = await client.post("/api/auth/register", json={"nickname": "u", "passphrase": "p"})
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}

async def _upload(client, headers):
    files = {"file": ("t.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 32), "image/png")}
    return await client.post("/api/upload/", files=files, headers=headers)

async def test_list_requires_auth(client):
    r = await client.get("/api/questions")
    assert r.status_code == 401

async def test_list_returns_own_questions(client):
    h = await _auth(client)
    await _upload(client, h)
    r = await client.get("/api/questions", headers=h)
    assert r.status_code == 200
    assert len(r.json()["data"]) == 1

async def test_delete_removes_question(client):
    h = await _auth(client)
    up = await _upload(client, h)
    qid = up.json()["data"]["id"]
    d = await client.delete(f"/api/questions/{qid}", headers=h)
    assert d.status_code == 200
    r = await client.get("/api/questions", headers=h)
    assert len(r.json()["data"]) == 0

async def test_cannot_see_others_question(client):
    h1 = await _auth(client)
    up = await _upload(client, h1)
    qid = up.json()["data"]["id"]
    r2 = await client.post("/api/auth/register", json={"nickname": "u2", "passphrase": "p"})
    h2 = {"Authorization": f"Bearer {r2.json()['data']['token']}"}
    g = await client.get(f"/api/questions/{qid}", headers=h2)
    assert g.status_code == 404
