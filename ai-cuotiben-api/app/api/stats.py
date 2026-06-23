from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from collections import defaultdict
from app.database import get_db
from app.models import WrongQuestion, KnowledgePoint, User
from app.core.security import get_current_user

router = APIRouter()

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
