import pytest


@pytest.mark.asyncio
async def test_error_categories_returns_distribution(client):
    r = await client.post("/api/auth/register", json={"nickname": "ecat", "passphrase": "p"})
    token = r.json()["data"]["token"]
    h = {"Authorization": f"Bearer {token}"}
    r = await client.get("/api/stats/error-categories", headers=h)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "categories" in data
    assert "total" in data
    assert data["total"] == 0  # 新用户无错题


@pytest.mark.asyncio
async def test_error_categories_with_data(client):
    """有错题时返回正确分布。"""
    r = await client.post("/api/auth/register", json={"nickname": "ecat2", "passphrase": "p"})
    token = r.json()["data"]["token"]
    h = {"Authorization": f"Bearer {token}"}

    # 导一道题（给 error_category="concept"）
    r = await client.post("/api/upload/import", json={"questions": [{
        "subject_id": 1,
        "question_content": "已知函数f(x)=x^2，求f'(x)",
        "error_category": "concept",
        "error_category_detail": "导数定义混淆",
    }]}, headers=h)
    assert r.status_code == 200

    r = await client.get("/api/stats/error-categories", headers=h)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["total"] == 1
    cats = {c["category"]: c for c in data["categories"]}
    assert cats["concept"]["count"] == 1
    assert cats["concept"]["pct"] == 100
