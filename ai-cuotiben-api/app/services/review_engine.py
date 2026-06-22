from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

INTERVALS = [1, 3, 7, 14, 30]
MASTER_STREAK = 5

@dataclass
class ReviewResult:
    interval_index: int
    consecutive_correct: int
    next_review_date: Optional[date]
    mastery_level: str

def calculate_next(is_correct: bool, interval_index: int, consecutive_correct: int, today: date) -> ReviewResult:
    if not is_correct:
        return ReviewResult(0, 0, today + timedelta(days=INTERVALS[0]), "learning")
    streak = consecutive_correct + 1
    if streak >= MASTER_STREAK or interval_index >= len(INTERVALS) - 1:
        return ReviewResult(interval_index, streak, None, "mastered")
    next_index = interval_index + 1
    return ReviewResult(next_index, streak, today + timedelta(days=INTERVALS[next_index]), "learning")
