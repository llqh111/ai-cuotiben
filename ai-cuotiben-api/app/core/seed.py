from sqlalchemy import select
from app.models import Subject

SUBJECTS = [
    {"name": "语文", "icon": "book", "color": "#ef4444"},
    {"name": "数学", "icon": "function", "color": "#3b82f6"},
    {"name": "英语", "icon": "translate", "color": "#10b981"},
    {"name": "物理", "icon": "atom", "color": "#8b5cf6"},
    {"name": "化学", "icon": "flask", "color": "#f59e0b"},
    {"name": "生物", "icon": "dna", "color": "#14b8a6"},
]

async def seed_subjects(session):
    result = await session.execute(select(Subject))
    if result.scalars().first():
        return
    for s in SUBJECTS:
        session.add(Subject(**s))
    await session.commit()
