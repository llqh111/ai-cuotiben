import io


async def _auth(client, nick="u"):
    r = await client.post("/api/auth/register", json={"nickname": nick, "passphrase": "p"})
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}


async def _upload(client, h):
    fake_jpg = io.BytesIO(b"\xff\xd8\xff")
    return (await client.post("/api/upload/small", files={"ocr_image": ("t.jpg", fake_jpg, "image/jpeg")}, headers=h)).json()["data"]["questions"][0]["id"]


async def test_weekly_report_counts_new_and_reviews(client):
    h = await _auth(client)
    qid = await _upload(client, h)
    await client.post("/api/review/submit", json={"question_id": qid, "rating": 3}, headers=h)
    r = await client.get("/api/stats/report?period=week", headers=h)
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["period"] == "week"
    assert d["span_days"] == 7
    assert d["new_questions"] == 1
    assert d["reviews"] == 1
    assert d["accuracy"] == 100


async def test_monthly_report_span(client):
    h = await _auth(client)
    await _upload(client, h)
    r = await client.get("/api/stats/report?period=month", headers=h)
    assert r.json()["data"]["span_days"] == 30


async def test_report_requires_auth(client):
    r = await client.get("/api/stats/report")
    assert r.status_code == 401
