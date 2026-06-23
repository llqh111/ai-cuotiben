import os
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

# DB 文件锚定到 ai-cuotiben-api/ 目录的绝对路径，不随启动目录(cwd)漂移。
# 线上可设环境变量 DATABASE_URL 覆盖（如切 Postgres）。
_DB_PATH = Path(__file__).resolve().parent.parent / "cuotiben.db"
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite+aiosqlite:///{_DB_PATH.as_posix()}")

engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
