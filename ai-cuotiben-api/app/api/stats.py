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

    # 批量加载所有涉及的知识点（一次查询替代 N 次）
    kp_ids = list(agg.keys())
    kp_map = {}
    if kp_ids:
        kps = (await db.execute(select(KnowledgePoint).where(KnowledgePoint.id.in_(kp_ids)))).scalars().all()
        kp_map = {kp.id: kp.name for kp in kps}

    items = []
    for kp_id, c in agg.items():
        rate = c["mastered"] / c["total"] if c["total"] else 0
        items.append({"knowledge_point": kp_map.get(kp_id, str(kp_id)),
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
    from sqlalchemy import func
    today = date.today()

    # 一次查询拿所有未 mastered 题的 ID
    row_ids = (await db.execute(
        select(WrongQuestion.id).where(
            WrongQuestion.user_id == user.id, WrongQuestion.mastery_level != "mastered"
        )
    )).scalars().all()

    remaining = 0
    if row_ids:
        # 子查询：每道题的最新 review_record
        latest_sub = (
            select(ReviewRecord.question_id, func.max(ReviewRecord.id).label("max_id"))
            .where(ReviewRecord.question_id.in_(row_ids))
            .group_by(ReviewRecord.question_id)
        ).subquery()
        recs = (await db.execute(
            select(ReviewRecord.question_id, ReviewRecord.next_review_date)
            .join(latest_sub, ReviewRecord.id == latest_sub.c.max_id)
        )).all()
        rec_map = {qid: nrd for qid, nrd in recs}
        for qid in row_ids:
            nrd = rec_map.get(qid)
            if nrd is None or nrd <= today:
                remaining += 1

    # 今日已完成 + streak（一次查询复用）
    today_recs_raw = (await db.execute(
        select(ReviewRecord.question_id, ReviewRecord.reviewed_at).where(
            ReviewRecord.user_id == user.id
        )
    )).all()
    completed = len({qid for qid, ts in today_recs_raw if _as_date(ts) == today})

    due_total = remaining + completed
    rate = round(completed / due_total * 100) if due_total else 0

    # streak
    review_dates = {d for d in (_as_date(ts) for _, ts in today_recs_raw) if d is not None}
    streak_count = 0
    cursor = today
    if cursor not in review_dates and (cursor - timedelta(days=1)) in review_dates:
        cursor = cursor - timedelta(days=1)
    while cursor in review_dates:
        streak_count += 1
        cursor -= timedelta(days=1)

    return {"status": "success", "data": {
        "due_total": due_total, "completed": completed, "rate": rate,
        "streak": streak_count}}


@router.get("/report")
async def report(period: str = "week", db: AsyncSession = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """学习报告：周报(7天)/月报(30天)。统计新增、掌握、复习次数、正确率、薄弱知识点。"""
    span = 30 if period == "month" else 7
    today = date.today()
    start = today - timedelta(days=span - 1)
    rows = (await db.execute(select(WrongQuestion).where(WrongQuestion.user_id == user.id))).scalars().all()
    new_count = sum(1 for q in rows if (_as_date(q.created_at) or today) >= start)
    mastered_count = sum(1 for q in rows
                         if q.mastery_level == "mastered" and (_as_date(q.updated_at) or today) >= start)
    recs = (await db.execute(select(ReviewRecord).where(ReviewRecord.user_id == user.id))).scalars().all()
    window_recs = [r for r in recs if (_as_date(r.reviewed_at) or today) >= start]
    reviews = len(window_recs)
    correct = sum(1 for r in window_recs if r.is_correct)
    accuracy = round(correct / reviews * 100) if reviews else 0
    # 薄弱知识点（窗口内仍未掌握、错题最多 TOP3）
    agg = defaultdict(int)
    for q in rows:
        if q.knowledge_point_id and q.mastery_level != "mastered":
            agg[q.knowledge_point_id] += 1
    # 批量加载知识点名称
    kp_ids = list(agg.keys())
    kp_map = {}
    if kp_ids:
        kps = (await db.execute(select(KnowledgePoint).where(KnowledgePoint.id.in_(kp_ids)))).scalars().all()
        kp_map = {kp.id: kp.name for kp in kps}

    weak = []
    for kp_id, cnt in sorted(agg.items(), key=lambda x: -x[1])[:3]:
        weak.append({"knowledge_point": kp_map.get(kp_id, str(kp_id)), "count": cnt})
    return {"status": "success", "data": {
        "period": period, "span_days": span,
        "start": start.isoformat(), "end": today.isoformat(),
        "new_questions": new_count, "mastered": mastered_count,
        "reviews": reviews, "accuracy": accuracy, "weak_points": weak}}


@router.get("/subjects")
async def subject_distribution(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """六科错题分布：每科 total / mastered / learning / new。"""
    from app.models import Subject
    subs = (await db.execute(select(Subject))).scalars().all()
    questions = (await db.execute(select(WrongQuestion).where(WrongQuestion.user_id == user.id))).scalars().all()

    # 按科目聚合
    by_subject = {}
    for q in questions:
        if q.subject_id not in by_subject:
            by_subject[q.subject_id] = {"total": 0, "mastered": 0, "learning": 0, "new": 0}
        by_subject[q.subject_id]["total"] += 1
        by_subject[q.subject_id][q.mastery_level] += 1

    result = []
    for sub in subs:
        stats = by_subject.get(sub.id, {"total": 0, "mastered": 0, "learning": 0, "new": 0})
        result.append({
            "id": sub.id, "name": sub.name, "icon": sub.icon, "color": sub.color,
            "total": stats["total"], "mastered": stats["mastered"],
            "learning": stats["learning"], "new": stats["new"]
        })
    return {"status": "success", "data": result}
