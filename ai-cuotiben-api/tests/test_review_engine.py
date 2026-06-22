from datetime import date, timedelta
from app.services import review_engine as re

def test_correct_advances_interval():
    r = re.calculate_next(is_correct=True, interval_index=0, consecutive_correct=0, today=date(2026, 6, 23))
    assert r.interval_index == 1
    assert r.mastery_level == "learning"
    assert r.next_review_date == date(2026, 6, 23) + timedelta(days=3)

def test_wrong_resets_to_one_day():
    r = re.calculate_next(is_correct=False, interval_index=3, consecutive_correct=4, today=date(2026, 6, 23))
    assert r.interval_index == 0
    assert r.consecutive_correct == 0
    assert r.next_review_date == date(2026, 6, 23) + timedelta(days=1)
    assert r.mastery_level == "learning"

def test_five_consecutive_correct_masters():
    r = re.calculate_next(is_correct=True, interval_index=2, consecutive_correct=4, today=date(2026, 6, 23))
    assert r.mastery_level == "mastered"
    assert r.next_review_date is None

def test_top_interval_correct_masters():
    r = re.calculate_next(is_correct=True, interval_index=4, consecutive_correct=1, today=date(2026, 6, 23))
    assert r.mastery_level == "mastered"
    assert r.next_review_date is None
