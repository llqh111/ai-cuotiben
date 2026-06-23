"""知识点关联图谱：POST 触发 DeepSeek 分析关系落库，GET 渲染力导向图数据。"""
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.models import KnowledgePoint, KnowledgeRelation, User, WrongQuestion
from app.services import ai_service

router = APIRouter()

# 掌握程度 → 节点颜色：红=薄弱 黄=学习中 绿=已掌握
_MASTERY_COLOR = {"weak": "#ef4444", "learning": "#f59e0b", "mastered": "#10b981"}


def _mastery_color(total: int, mastered: int) -> str:
    if total == 0:
        return _MASTERY_COLOR["learning"]
    rate = mastered / total
    if rate >= 0.8:
        return _MASTERY_COLOR["mastered"]
    if rate >= 0.4:
        return _MASTERY_COLOR["learning"]
    return _MASTERY_COLOR["weak"]


async def _kp_stats(db: AsyncSession, user_id: int, subject_id: int):
    kps = (await db.execute(select(KnowledgePoint).where(
        KnowledgePoint.user_id == user_id, KnowledgePoint.subject_id == subject_id))).scalars().all()
    rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user_id, WrongQuestion.subject_id == subject_id))).scalars().all()
    total_by = defaultdict(int)
    mastered_by = defaultdict(int)
    for q in rows:
        if q.knowledge_point_id:
            total_by[q.knowledge_point_id] += 1
            if q.mastery_level == "mastered":
                mastered_by[q.knowledge_point_id] += 1
    return kps, total_by, mastered_by


@router.post("/{subject_id}/rebuild")
async def rebuild(subject_id: int, db: AsyncSession = Depends(get_db),
                  user: User = Depends(get_current_user)):
    kps, _, _ = await _kp_stats(db, user.id, subject_id)
    names = [kp.name for kp in kps]
    by_name = {kp.name: kp.id for kp in kps}
    relations = await ai_service.analyze_relations(str(subject_id), names)
    await db.execute(delete(KnowledgeRelation).where(
        KnowledgeRelation.user_id == user.id, KnowledgeRelation.subject_id == subject_id))
    saved = 0
    for r in relations:
        src = by_name.get(r.get("source"))
        tgt = by_name.get(r.get("target"))
        if src and tgt and src != tgt:
            db.add(KnowledgeRelation(user_id=user.id, subject_id=subject_id,
                                     source_point_id=src, target_point_id=tgt,
                                     relation_type=r.get("relation_type", "相关")))
            saved += 1
    await db.commit()
    return {"status": "success", "data": {"relations_built": saved}}


@router.get("/{subject_id}")
async def graph(subject_id: int, db: AsyncSession = Depends(get_db),
                user: User = Depends(get_current_user)):
    kps, total_by, mastered_by = await _kp_stats(db, user.id, subject_id)
    nodes = []
    for kp in kps:
        total = total_by[kp.id]
        nodes.append({"id": kp.id, "name": kp.name,
                      "symbolSize": max(20, total * 12), "count": total,
                      "itemStyle": {"color": _mastery_color(total, mastered_by[kp.id])}})
    rels = (await db.execute(select(KnowledgeRelation).where(
        KnowledgeRelation.user_id == user.id, KnowledgeRelation.subject_id == subject_id))).scalars().all()
    id_to_name = {kp.id: kp.name for kp in kps}
    edges = [{"source": id_to_name.get(r.source_point_id), "target": id_to_name.get(r.target_point_id),
              "relation_type": r.relation_type}
             for r in rels if r.source_point_id in id_to_name and r.target_point_id in id_to_name]
    return {"status": "success", "data": {"nodes": nodes, "edges": edges}}
