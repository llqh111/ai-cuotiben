import io

async def _auth(client):
    r = await client.post("/api/auth/register", json={"nickname": "u", "passphrase": "p"})
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}

async def _upload(client, h):
    files = {"file": ("t.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0"*32), "image/png")}
    return (await client.post("/api/upload/", files=files, headers=h)).json()["data"]["id"]

async def test_submit_correct_advances(client):
    h = await _auth(client)
    qid = await _upload(client, h)
    r = await client.post("/api/review/submit", json={"question_id": qid, "is_correct": True}, headers=h)
    assert r.status_code == 200
    assert r.json()["data"]["mastery_level"] == "learning"
    assert r.json()["data"]["next_review_date"] is not None

async def test_submit_wrong_keeps_learning(client):
    h = await _auth(client)
    qid = await _upload(client, h)
    r = await client.post("/api/review/submit", json={"question_id": qid, "is_correct": False}, headers=h)
    assert r.json()["data"]["mastery_level"] == "learning"

async def test_random_returns_list(client):
    h = await _auth(client)
    await _upload(client, h)
    r = await client.get("/api/review/random/1?count=5", headers=h)
    assert r.status_code == 200
    assert isinstance(r.json()["data"], list)
