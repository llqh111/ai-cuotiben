import io


async def _auth(client, nick="u"):
    r = await client.post("/api/auth/register", json={"nickname": nick, "passphrase": "p"})
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}


async def _upload(client, h):
    fake_jpg = io.BytesIO(b"\xff\xd8\xff")
    return (await client.post("/api/upload/small", files={"ocr_image": ("t.jpg", fake_jpg, "image/jpeg")}, headers=h)).json()["data"]["questions"][0]["id"]


async def test_generate_creates_three_similar(client):
    h = await _auth(client)
    qid = await _upload(client, h)
    r = await client.post(f"/api/generate/similar/{qid}", headers=h)
    assert r.status_code == 200
    assert len(r.json()["data"]) == 3


async def test_list_similar_returns_generated(client):
    h = await _auth(client)
    qid = await _upload(client, h)
    await client.post(f"/api/generate/similar/{qid}", headers=h)
    r = await client.get(f"/api/generate/similar/{qid}", headers=h)
    assert len(r.json()["data"]) == 3


async def test_generation_cap_at_three_calls(client):
    h = await _auth(client)
    qid = await _upload(client, h)
    for _ in range(4):  # 4 次 × 3 题 = 12，已达上限
        await client.post(f"/api/generate/similar/{qid}", headers=h)
    r = await client.post(f"/api/generate/similar/{qid}", headers=h)
    assert r.status_code == 429


async def test_cannot_generate_for_others_question(client):
    h1 = await _auth(client)
    qid = await _upload(client, h1)
    h2 = await _auth(client, "other")
    r = await client.post(f"/api/generate/similar/{qid}", headers=h2)
    assert r.status_code == 404
