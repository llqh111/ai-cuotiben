from sqlalchemy import select
from app.models import Subject

async def test_seed_creates_six_subjects(db_session):
    result = await db_session.execute(select(Subject))
    names = [s.name for s in result.scalars().all()]
    assert len(names) == 6
    assert "数学" in names
