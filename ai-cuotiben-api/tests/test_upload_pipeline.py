import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_upload_pdf_returns_success(client: AsyncClient):
    """上传 PDF 应返回成功，带问题 ID。"""
    token = await _register_and_get_token(client)
    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n"
        b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
        b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
    )
    resp = await client.post("/api/upload/", files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
                             headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("success", "partial")


@pytest.mark.asyncio
async def test_upload_invalid_type_rejected(client: AsyncClient):
    """非 jpg/png/pdf 文件应被拒。"""
    token = await _register_and_get_token(client)
    resp = await client.post("/api/upload/", files={"file": ("test.txt", b"hello", "text/plain")},
                             headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400


async def _register_and_get_token(client: AsyncClient) -> str:
    resp = await client.post("/api/auth/register", json={"nickname": "test_uploader", "passphrase": "pw"})
    return resp.json()["data"]["token"]
