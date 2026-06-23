from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from collections import defaultdict
from app.database import get_db
from app.models import WrongQuestion, ReviewRecord, KnowledgePoint, User
from app.core.security import get_current_user

router = APIRouter()


def _as_date(value) -> date | None:
    """created_at/reviewed_at 可能是 datetime 或 SQLite 存的字符串，统一取日期部分。"""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value)).date()
    except ValueError:
        return None

@router.get("/")
async def dashboard(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(WrongQuestion.user_id == user.id))).scalars().all()
    total = len(rows)
    mastered = sum(1 for q in rows if q.mastery_level == "mastered")
    dist = defaultdict(int)
    for q in rows:
        dist[q.subject_id] += 1
    return {"status": "success", "data": {
        "total_questions": total, "mastery_rate": round(mastered / total * 100) if total else 0,
        "subject_distribution": dict(dist)}}

@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(WrongQuestion.user_id == user.id))).scalars().all()
    total = len(rows)
    by = defaultdict(int)
    for q in rows:
        by[q.mastery_level] += 1
    return {"status": "success", "data": {
        "total": total, "new": by["new"], "learning": by["learning"], "mastered": by["mastered"],
        "mastery_rate": round(by["mastered"] / total * 100) if total else 0}}

@router.get("/weak-points")
async def weak_points(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(WrongQuestion.user_id == user.id))).scalars().all()
    agg = defaultdict(lambda: {"total": 0, "mastered": 0})
    for q in rows:
        if q.knowledge_point_id is None:
            continue
        agg[q.knowledge_point_id]["total"] += 1
        if q.mastery_level == "mastered":
            agg[q.knowledge_point_id]["mastered"] += 1
    items = []
    for kp_id, c in agg.items():
        kp = (await db.execute(select(KnowledgePoint).where(KnowledgePoint.id == kp_id))).scalars().first()
        rate = c["mastered"] / c["total"] if c["total"] else 0
        items.append({"knowledge_point": kp.name if kp else str(kp_id),
                      "count": c["total"], "mastery_rate": round(rate * 100)})
    items.sort(key=lambda x: (-x["count"], x["mastery_rate"]))
    return {"status": "success", "data": items[:5]}

@router.get("/graph/{subject}")
async def graph(subject: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    kps = (await db.execute(select(KnowledgePoint).where(KnowledgePoint.user_id == user.id))).scalars().all()
    rows = (await db.execute(select(WrongQuestion).where(WrongQuestion.user_id == user.id))).scalars().all()
    count_by_kp = defaultdict(int)
    for q in rows:
        if q.knowledge_point_id:
            count_by_kp[q.knowledge_point_id] += 1
    nodes = [{"name": subject, "symbolSize": max(40, len(rows) * 5), "itemStyle": {"color": "#ef4444"}}]
    edges = []
    colors = ["#f87171", "#10b981", "#34d399", "#f59e0b", "#3b82f6", "#60a5fa"]
    for i, kp in enumerate(kps):
        nodes.append({"name": kp.name, "symbolSize": max(20, count_by_kp[kp.id] * 15),
                      "itemStyle": {"color": colors[i % len(colors)]}})
        edges.append({"source": subject, "target": kp.name})
    return {"status": "success", "data": {"nodes": nodes, "edges": edges}}


@router.get("/trends")
async def trends(days: int = 30, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """近 N 天：每天新增错题 vs 掌握错题。新增按 created_at，掌握按 updated_at（掌握时更新）。"""
    days = max(1, min(days, 90))
    today = date.today()
    window = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    new_by = defaultdict(int)
    mastered_by = defaultdict(int)
    rows = (await db.execute(select(WrongQuestion).where(WrongQuestion.user_id == user.id))).scalars().all()
    for q in rows:
        d = _as_date(q.created_at)
        if d is not None:
            new_by[d] += 1
        if q.mastery_level == "mastered":
            md = _as_date(q.updated_at)
            if md is not None:
                mastered_by[md] += 1
    data = [{"date": d.isoformat(), "new": new_by.get(d, 0), "mastered": mastered_by.get(d, 0)} for d in window]
    return {"status": "success", "data": data}


@router.get("/streak")
async def streak(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """连续复习打卡天数：从今天（或昨天）往前数不断档的天数。"""
    recs = (await db.execute(select(ReviewRecord.reviewed_at).where(ReviewRecord.user_id == user.id))).scalars().all()
    review_dates = {d for d in (_as_date(r) for r in recs) if d is not None}
    count = 0
    cursor = date.today()
    if cursor not in review_dates and (cursor - timedelta(days=1)) in review_dates:
        cursor = cursor - timedelta(days=1)  # 今天还没打卡，从昨天起算不算断
    while cursor in review_dates:
        count += 1
        cursor -= timedelta(days=1)
    return {"status": "success", "data": {"streak": count}}


@router.get("/daily-completion")
async def daily_completion(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """今日复习完成率：已复习 / (已复习 + 仍到期未复习)。"""
    today = date.today()
    rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.mastery_level != "mastered"))).scalars().all()
    remaining = 0
    for q in rows:
        rec = (await db.execute(select(ReviewRecord).where(ReviewRecord.question_id == q.id)
               .order_by(ReviewRecord.id.desc()))).scalars().first()
        if rec is None or (rec.next_review_date and rec.next_review_date <= today):
            remaining += 1
    recs = (await db.execute(select(ReviewRecord.question_id, ReviewRecord.reviewed_at)
            .where(ReviewRecord.user_id == user.id))).all()
    completed = len({qid for qid, ts in recs if _as_date(ts) == today})
    due_total = remaining + completed
    rate = round(completed / due_total * 100) if due_total else 0
    return {"status": "success", "data": {"due_total": due_total, "completed": completed, "rate": rate}}
