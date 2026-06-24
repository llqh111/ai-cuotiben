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

        # error_category 列 — 线2 错因标签
        if dialect == "sqlite":
            result = await conn.execute(text("PRAGMA table_info(wrong_questions)"))
            cols = [row[1] for row in result.fetchall()]
            if "error_category" not in cols:
                await conn.execute(text("ALTER TABLE wrong_questions ADD COLUMN error_category VARCHAR(20)"))
            if "error_category_detail" not in cols:
                await conn.execute(text("ALTER TABLE wrong_questions ADD COLUMN error_category_detail TEXT"))
        elif dialect == "postgresql":
            for col_name, col_type in [("error_category", "VARCHAR(20)"), ("error_category_detail", "TEXT")]:
                result = await conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='wrong_questions' AND column_name=:col"
                ), {"col": col_name})
                if not result.fetchone():
                    await conn.execute(text(
                        f"ALTER TABLE wrong_questions ADD COLUMN {col_name} {col_type}"
                    ))
