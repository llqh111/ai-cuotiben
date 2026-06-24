import os
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

# DB 文件锚定到 ai-cuotiben-api/ 目录的绝对路径，不随启动目录(cwd)漂移。
# 线上设环境变量 DATABASE_URL 切 Postgres（Render/Heroku 给 postgres://，需转成 asyncpg 异步驱动）。
_DB_PATH = Path(__file__).resolve().parent.parent / "cuotiben.db"
_env_url = os.environ.get("DATABASE_URL")
if _env_url:
    if _env_url.startswith("postgres://"):
        _env_url = _env_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif _env_url.startswith("postgresql://"):
        _env_url = _env_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    DATABASE_URL = _env_url
else:
    DATABASE_URL = f"sqlite+aiosqlite:///{_DB_PATH.as_posix()}"

_echo_sql = os.environ.get("SQL_ECHO", "").lower() in ("1", "true", "on")
engine = create_async_engine(DATABASE_URL, echo=_echo_sql)
AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
