"""考前冲刺策略：纯函数，按距考天数决定阶段与每日复习量。"""
from dataclasses import dataclass
from datetime import date
from typing import Optional

STEADY_QUOTA = 10
INTENSIVE_QUOTA = 20


@dataclass(frozen=True)
class SprintPlan:
    days_remaining: int  # 距考天数；无考试日期为 -1
    phase: str           # no_exam / steady / intensive / final / exam_over
    daily_quota: int     # 今日建议复习题量


def make_plan(exam_date: Optional[date], unmastered: int, today: date) -> SprintPlan:
    if exam_date is None:
        return SprintPlan(days_remaining=-1, phase="no_exam", daily_quota=min(unmastered, STEADY_QUOTA))
    days = (exam_date - today).days
    if days < 0:
        return SprintPlan(days, "exam_over", 0)
    if days > 60:
        return SprintPlan(days, "steady", min(unmastered, STEADY_QUOTA))
    if days >= 30:
        return SprintPlan(days, "intensive", min(unmastered, INTENSIVE_QUOTA))
    return SprintPlan(days, "final", unmastered)  # <30 天：未掌握全部轮一遍
