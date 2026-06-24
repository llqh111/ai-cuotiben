import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.database import Base, get_db
from app.core import seed
from app.services import ai_service, gemini_service, image_service
from app.api import upload
import app.models  # noqa: 注册模型
from main import app

TEST_DB = "sqlite+aiosqlite:///:memory:"

FAKE_OCR_TEXT = "已知函数 f(x) = x³ - 3x² + ax + 1，若 f(x) 在 (1, +∞) 上单调递增，求 a 的取值范围。"

@pytest.fixture(autouse=True)
def _force_mock_external(monkeypatch):
    # 屏蔽外部 API 调用：DeepSeek → mock 返回值，Gemini → mock OCR 结果，Cloudinary → 本地存储

    monkeypatch.setattr(ai_service, "DEEPSEEK_API_KEY", "")

    async def _fake_ocr(_bytes, _prompt=None):
        return FAKE_OCR_TEXT

    # upload.py 顶层 import 了 recognize_image，patch 那个引用
    monkeypatch.setattr(upload, "recognize_image", _fake_ocr)

    # image_service：测试环境走本地存储，不连 Cloudinary
    monkeypatch.setattr(image_service, "_ensure_cloudinary", lambda: None)
    monkeypatch.setattr(image_service, "save_image", image_service._save_local)

@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DB)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with Session() as session:
        await seed.seed_subjects(session)
        yield session
    await engine.dispose()

@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
