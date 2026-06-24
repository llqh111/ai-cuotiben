import io

from app.api.graph import _mastery_color
from app.services import ai_service


def test_mastery_color_thresholds():
    assert _mastery_color(0, 0) == "#f59e0b"      # 无题 → 学习中(黄)
    assert _mastery_color(10, 9) == "#10b981"     # 90% → 已掌握(绿)
    assert _mastery_color(10, 5) == "#f59e0b"     # 50% → 学习中(黄)
    assert _mastery_color(10, 1) == "#ef4444"     # 10% → 薄弱(红)


async def test_analyze_relations_mock_chains(monkeypatch):
    monkeypatch.setattr(ai_service, "DEEPSEEK_API_KEY", "")
    rels = await ai_service.analyze_relations("数学", ["导数", "单调性", "极值"])
    assert len(rels) == 2  # 3 个知识点串成 2 条链
    assert {"source", "target", "relation_type"} <= set(rels[0].keys())


async def test_analyze_relations_single_kp_empty(monkeypatch):
    monkeypatch.setattr(ai_service, "DEEPSEEK_API_KEY", "")
    assert await ai_service.analyze_relations("数学", ["导数"]) == []


async def _auth(client, nick="u"):
    r = await client.post("/api/auth/register", json={"nickname": nick, "passphrase": "p"})
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}


async def _upload(client, h):
    fake_jpg = io.BytesIO(b"���")
    fake_jpg = io.BytesIO(b"���")
    return (await client.post("/api/upload/small", files={"ocr_image": ("t.jpg", fake_jpg, "image/jpeg")}, headers=h)).json()["data"]["questions"][0]["id"]


async def test_graph_endpoint_returns_nodes(client):
    h = await _auth(client)
    await _upload(client, h)
    r = await client.get("/api/graph/2", headers=h)  # 科目 2 = 数学（mock 归到数学）
    assert r.status_code == 200
    d = r.json()["data"]
    assert len(d["nodes"]) >= 1
    assert isinstance(d["edges"], list)


async def test_graph_rebuild_runs(client):
    h = await _auth(client)
    await _upload(client, h)
    r = await client.post("/api/graph/2/rebuild", headers=h)
    assert r.status_code == 200
    assert "relations_built" in r.json()["data"]


async def test_graph_requires_auth(client):
    r = await client.get("/api/graph/2")
    assert r.status_code == 401
