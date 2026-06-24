import io


async def _auth(client, nick="u"):
    r = await client.post("/api/auth/register", json={"nickname": nick, "passphrase": "p"})
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}


async def _upload(client, h):
    fake_jpg = io.BytesIO(b"\xff\xd8\xff")
    return (await client.post("/api/upload/small", files={"ocr_image": ("t.jpg", fake_jpg, "image/jpeg")}, headers=h)).json()["data"]["questions"][0]["id"]


async def test_profile_roundtrip_sets_exam_date(client):
    h = await _auth(client)
    r = await client.put("/api/auth/profile", json={"exam_date": "2026-12-01", "theme_preference": "dark"}, headers=h)
    assert r.status_code == 200
    assert r.json()["data"]["exam_date"] == "2026-12-01"
    me = await client.get("/api/auth/me", headers=h)
    assert me.json()["data"]["theme_preference"] == "dark"


async def test_plan_no_exam_phase(client):
    h = await _auth(client)
    await _upload(client, h)
    r = await client.get("/api/sprint/plan", headers=h)
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["phase"] == "no_exam"
    assert d["unmastered_total"] == 1
    assert isinstance(d["questions"], list)


async def test_plan_far_exam_is_steady(client):
    h = await _auth(client)
    await _upload(client, h)
    await client.put("/api/auth/profile", json={"exam_date": "2030-06-07"}, headers=h)
    r = await client.get("/api/sprint/plan", headers=h)
    d = r.json()["data"]
    assert d["phase"] == "steady"
    assert d["days_remaining"] > 60


async def test_plan_requires_auth(client):
    r = await client.get("/api/sprint/plan")
    assert r.status_code == 401
