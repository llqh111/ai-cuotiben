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

        # FSRS 列 — 线1 间隔重复算法
        if dialect == "sqlite":
            result = await conn.execute(text("PRAGMA table_info(wrong_questions)"))
            cols = [row[1] for row in result.fetchall()]
            if "fsrs_card" not in cols:
                await conn.execute(text("ALTER TABLE wrong_questions ADD COLUMN fsrs_card TEXT"))
            if "next_review_at" not in cols:
                await conn.execute(text("ALTER TABLE wrong_questions ADD COLUMN next_review_at DATETIME"))
            result = await conn.execute(text("PRAGMA table_info(review_records)"))
            cols = [row[1] for row in result.fetchall()]
            if "rating" not in cols:
                await conn.execute(text("ALTER TABLE review_records ADD COLUMN rating INTEGER"))
        elif dialect == "postgresql":
            for table, col_name, col_type in [
                ("wrong_questions", "fsrs_card", "TEXT"),
                ("wrong_questions", "next_review_at", "TIMESTAMPTZ"),
                ("review_records", "rating", "INTEGER"),
            ]:
                result = await conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name=:tbl AND column_name=:col"
                ), {"tbl": table, "col": col_name})
                if not result.fetchone():
                    await conn.execute(text(
                        f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"
                    ))

        # obsidian_path / vault_path — 知识库同步
        for table, col_name, col_type in [
            ("wrong_questions", "obsidian_path", "VARCHAR(500)"),
            ("knowledge_points", "obsidian_path", "VARCHAR(500)"),
            ("users", "vault_path", "VARCHAR(500)"),
        ]:
            if dialect == "sqlite":
                result = await conn.execute(text(f"PRAGMA table_info({table})"))
                cols = [row[1] for row in result.fetchall()]
                if col_name not in cols:
                    await conn.execute(text(
                        f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"
                    ))
            elif dialect == "postgresql":
                result = await conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name=:tbl AND column_name=:col"
                ), {"tbl": table, "col": col_name})
                if not result.fetchone():
                    await conn.execute(text(
                        f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"
                    ))
