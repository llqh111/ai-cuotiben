"""Jinja2-based Markdown renderer for Obsidian vault export."""
from typing import Optional

# 用 Python 字符串模板，避免引入额外依赖时的路径问题
# 知识点 Markdown 模板

KNOWLEDGE_POINT_TEMPLATE = """---
subject: {subject_name}
knowledge_point: {name}
total_questions: {total_questions}
mastered: {mastered_count}
mastery_rate: {mastery_rate}%
last_reviewed: {last_reviewed}
aliases: [{name}]
tags: [高考, {subject_name}, 知识点]
---

# {name}

## 描述
{description}

## 关联题型
{patterns_section}

## 错题列表
{questions_section}

## 关联知识点
{relations_section}
"""

QUESTION_CARD_TEMPLATE = """---
id: {id}
subject: {subject_name}
knowledge_point: "{kp_name}"
question_type: {question_type}
status: {status}
mastery: {mastery_level}
next_review: {next_review}
error_category: {error_category}
tags: [高考, {subject_name}, 错题, {kp_name}]
---

# 题目
{question_content}

## 我的答案（错误）
{student_answer}

## 正确答案
{correct_answer}

## 解题步骤
{solution_steps}

## 错因分析
{error_analysis}

## 改进建议
{improvement_tips}

---

> 关联知识点：[[{kp_name}]]
> 下次复习：{next_review}
"""

SUBJECT_INDEX_TEMPLATE = """---
subject: {subject_name}
total_questions: {total_questions}
mastered: {mastered_count}
mastery_rate: {mastery_rate}%
last_synced: {last_synced}
tags: [高考, {subject_name}]
---

# {subject_name} 错题本

## 概览
- 总错题数：{total_questions}
- 已掌握：{mastered_count}（{mastery_rate}%）
- 学习中：{learning_count}

## 知识点目录
{kp_list}

## 最近错题
{recent_questions}
"""

SYNC_CONFIG_TEMPLATE = """{{
  "version": 1,
  "api_base": "http://localhost:8000",
  "last_sync": "{last_sync}",
  "synced_questions": {synced_questions},
  "synced_knowledge_points": {synced_knowledge_points}
}}
"""


def render_knowledge_point(
    name: str,
    subject_name: str,
    description: str = "",
    total_questions: int = 0,
    mastered_count: int = 0,
    mastery_rate: float = 0.0,
    last_reviewed: str = "",
    patterns: list[dict] | None = None,
    questions: list[dict] | None = None,
    relations: list[dict] | None = None,
) -> str:
    patterns = patterns or []
    questions = questions or []
    relations = relations or []

    patterns_section = "\n".join(
        f"- [[题型-{p['name']}]] — {p.get('count', 0)}题" for p in patterns
    ) or "暂无"

    questions_section = "\n".join(
        f"- [[Q-{q['id']}]] — {q.get('error_summary', '')}" for q in questions
    ) or "暂无"

    relations_section = "\n".join(
        f"- [[{r['name']}]] — {r.get('type', '相关')}" for r in relations
    ) or "暂无"

    return KNOWLEDGE_POINT_TEMPLATE.format(
        name=name,
        subject_name=subject_name,
        description=description or "",
        total_questions=total_questions,
        mastered_count=mastered_count,
        mastery_rate=round(mastery_rate, 0),
        last_reviewed=last_reviewed or "从未",
        patterns_section=patterns_section,
        questions_section=questions_section,
        relations_section=relations_section,
    )


def render_question_card(
    id: int,
    subject_name: str = "",
    kp_name: str = "",
    question_content: str = "",
    question_type: str = "essay",
    status: str = "analyzed",
    mastery_level: str = "new",
    next_review: str = "",
    error_category: str = "",
    student_answer: str = "",
    correct_answer: str = "",
    solution_steps: str = "",
    error_analysis: str = "",
    improvement_tips: str = "",
) -> str:
    return QUESTION_CARD_TEMPLATE.format(
        id=id,
        subject_name=subject_name or "",
        kp_name=kp_name or "",
        question_content=question_content or "",
        question_type=question_type,
        status=status,
        mastery_level=mastery_level,
        next_review=next_review or "待定",
        error_category=error_category or "",
        student_answer=student_answer or "",
        correct_answer=correct_answer or "",
        solution_steps=solution_steps or "",
        error_analysis=error_analysis or "",
        improvement_tips=improvement_tips or "",
    )


def render_subject_index(
    subject_name: str,
    total_questions: int = 0,
    mastered_count: int = 0,
    mastery_rate: float = 0.0,
    learning_count: int = 0,
    last_synced: str = "",
    knowledge_points: list[dict] | None = None,
    recent_questions: list[dict] | None = None,
) -> str:
    knowledge_points = knowledge_points or []
    recent_questions = recent_questions or []

    kp_list = "\n".join(
        f"- [[{kp['name']}]] — {kp.get('question_count', 0)}题"
        for kp in knowledge_points
    ) or "暂无"

    recent_list = "\n".join(
        f"- [[Q-{q['id']}]] — {q.get('error_summary', '')}"
        for q in recent_questions
    ) or "暂无"

    return SUBJECT_INDEX_TEMPLATE.format(
        subject_name=subject_name,
        total_questions=total_questions,
        mastered_count=mastered_count,
        mastery_rate=round(mastery_rate, 0),
        learning_count=learning_count,
        last_synced=last_synced,
        kp_list=kp_list,
        recent_questions=recent_list,
    )


def render_sync_config(
    last_sync: str = "",
    synced_questions: int = 0,
    synced_knowledge_points: int = 0,
) -> str:
    return SYNC_CONFIG_TEMPLATE.format(
        last_sync=last_sync,
        synced_questions=synced_questions,
        synced_knowledge_points=synced_knowledge_points,
    )
