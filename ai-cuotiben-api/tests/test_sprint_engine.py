from datetime import date

from app.services import sprint_engine as se


def test_no_exam_date_returns_no_exam_phase():
    p = se.make_plan(exam_date=None, unmastered=25, today=date(2026, 6, 23))
    assert p.phase == "no_exam"
    assert p.daily_quota == 10  # 无考试也给个常规量，封顶 10


def test_far_exam_is_steady():
    p = se.make_plan(exam_date=date(2026, 12, 1), unmastered=25, today=date(2026, 6, 23))
    assert p.phase == "steady"
    assert p.daily_quota == 10
    assert p.days_remaining > 60


def test_mid_range_is_intensive():
    p = se.make_plan(exam_date=date(2026, 7, 25), unmastered=25, today=date(2026, 6, 23))
    assert p.phase == "intensive"
    assert p.daily_quota == 20


def test_final_sprint_cycles_all():
    p = se.make_plan(exam_date=date(2026, 7, 10), unmastered=8, today=date(2026, 6, 23))
    assert p.phase == "final"
    assert p.daily_quota == 8  # <30 天全部轮一遍


def test_exam_passed_is_over():
    p = se.make_plan(exam_date=date(2026, 6, 1), unmastered=8, today=date(2026, 6, 23))
    assert p.phase == "exam_over"
    assert p.days_remaining < 0
    assert p.daily_quota == 0
