import io


async def _auth(client, nick="u"):
    r = await client.post("/api/auth/register", json={"nickname": nick, "passphrase": "p"})
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}


async def _upload(client, h):
    files = {"file": ("t.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 32), "image/png")}
    return (await client.post("/api/upload/", files=files, headers=h)).json()["data"]["id"]


async def test_trends_returns_buckets_with_today_new(client):
    h = await _auth(client)
    await _upload(client, h)
    await _upload(client, h)
    r = await client.get("/api/stats/trends?days=7", headers=h)
    assert r.status_code == 200
    data = r.json()["data"]
    assert len(data) == 7
    assert {"date", "new", "mastered"} <= set(data[-1].keys())
    assert data[-1]["new"] == 2  # 今天新增 2


async def test_streak_counts_today_review(client):
    h = await _auth(client)
    qid = await _upload(client, h)
    r0 = await client.get("/api/stats/streak", headers=h)
    assert r0.json()["data"]["streak"] == 0  # 还没复习
    await client.post("/api/review/submit", json={"question_id": qid, "is_correct": True}, headers=h)
    r1 = await client.get("/api/stats/streak", headers=h)
    assert r1.json()["data"]["streak"] == 1


async def test_daily_completion_rate(client):
    h = await _auth(client)
    qid = await _upload(client, h)
    r0 = await client.get("/api/stats/daily-completion", headers=h)
    d0 = r0.json()["data"]
    assert d0["due_total"] >= 1
    assert d0["completed"] == 0
    assert d0["rate"] == 0
    await client.post("/api/review/submit", json={"question_id": qid, "is_correct": True}, headers=h)
    r1 = await client.get("/api/stats/daily-completion", headers=h)
    assert r1.json()["data"]["completed"] == 1
    assert r1.json()["data"]["rate"] == 100
