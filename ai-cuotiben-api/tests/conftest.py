import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.database import Base, get_db
from app.core import seed
from app.services import ai_service
import app.models  # noqa: 注册模型
from main import app

TEST_DB = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(autouse=True)
def _force_mock_ai(monkeypatch):
    # 测试期屏蔽真 DeepSeek key，强制 parse/classify 走 mock：离线、确定、不计费。
    monkeypatch.setattr(ai_service, "DEEPSEEK_API_KEY", "")

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
