import pytest


@pytest.mark.asyncio
async def test_confirm_first_returns_ocr_text(client, db_session):
    """confirm_first=true 应返回 ocr_done 状态和 OCR 文本。"""
    resp = await client.post("/api/auth/register", json={"nickname": "ocr-test", "passphrase": "pass123"})
    token = resp.json()["data"]["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 生成一张简单测试图片
    from PIL import Image
    import io
    img = Image.new("RGB", (100, 100), color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    resp = await client.post(
        "/api/upload/small",
        files={"ocr_image": ("test.png", buf, "image/png")},
        data={"confirm_first": "true", "subject_id": "1"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ocr_done"
    assert "ocr_text" in data["data"]
    assert data["data"]["subject_id"] == 1


@pytest.mark.asyncio
async def test_confirm_endpoint_analyzes(client, db_session):
    """POST /api/upload/confirm 应执行分析并返回结果。"""
    resp = await client.post("/api/auth/register", json={"nickname": "confirm-test", "passphrase": "pass123"})
    token = resp.json()["data"]["token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/upload/confirm",
        json={
            "ocr_text": "已知函数 f(x)=x²-3x+2，求 f(x) 的单调递增区间。",
            "image_url": "/api/images/test.jpg",
            "student_answer": "(-∞, 1.5)",
            "subject_id": 1,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert len(data["data"]["questions"]) >= 1


@pytest.mark.asyncio
async def test_confirm_rejects_empty_text(client, db_session):
    """空 OCR 文本应返回 400。"""
    resp = await client.post("/api/auth/register", json={"nickname": "empty-test", "passphrase": "pass123"})
    token = resp.json()["data"]["token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/upload/confirm",
        json={"ocr_text": "   ", "image_url": "", "student_answer": "", "subject_id": 1},
        headers=headers,
    )
    assert resp.status_code == 400
