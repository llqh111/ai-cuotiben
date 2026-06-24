"""轻量迁移：检测并补建缺失列，兼容 SQLite 与 PostgreSQL。"""
from sqlalchemy import text
from app.database import engine


async def run_migrations():
    async with engine.begin() as conn:
        dialect = engine.url.get_dialect().name

        if dialect == "sqlite":
            result = await conn.execute(text("PRAGMA table_info(knowledge_points)"))
            cols = [row[1] for row in result.fetchall()]
            if "chapter_id" not in cols:
                await conn.execute(text(
                    "ALTER TABLE knowledge_points ADD COLUMN chapter_id INTEGER REFERENCES chapters(id)"
                ))
        elif dialect == "postgresql":
            result = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='knowledge_points' AND column_name='chapter_id'"
            ))
            if not result.fetchone():
                await conn.execute(text(
                    "ALTER TABLE knowledge_points ADD COLUMN chapter_id INTEGER REFERENCES chapters(id)"
                ))
