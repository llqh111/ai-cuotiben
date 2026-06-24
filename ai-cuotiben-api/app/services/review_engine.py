"""FSRS (Free Spaced Repetition Scheduler) review engine — v6 API."""
from fsrs import Scheduler, Card, Rating, State

_scheduler = Scheduler()

def _to_rating(r: int) -> Rating:
    return {1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy}[r]

def review(card_dict: dict | None, rating: int) -> dict:
    """FSRS review。card_dict=None 表示新卡。返回 to_dict() 序列化结果 + 便捷字段。"""
    if card_dict is None:
        card = Card()
    else:
        card = Card.from_dict(card_dict)
    card, review_log = _scheduler.review_card(card, _to_rating(rating))
    return {
        "card_dict": card.to_dict(),
        "due": card.due,              # datetime (UTC) or None
        "stability": card.stability,   # float or None (first review)
        "difficulty": card.difficulty, # float or None (first review)
        "state": card.state,           # int, State enum value
    }
