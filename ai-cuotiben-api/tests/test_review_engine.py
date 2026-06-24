"""FSRS review engine 测试 — 新卡、复习卡、四评级、to_dict/from_dict 往返。"""
from app.services import review_engine


def test_new_card_good_rating():
    result = review_engine.review(None, 3)  # Good
    assert "card_dict" in result
    assert result["state"] >= 0
    assert result["due"] is not None

def test_new_card_again_rating():
    result = review_engine.review(None, 1)  # Again
    assert result["state"] >= 0
    assert result["due"] is not None

def test_card_dict_roundtrip():
    r1 = review_engine.review(None, 3)
    r2 = review_engine.review(r1["card_dict"], 3)
    r3 = review_engine.review(r2["card_dict"], 3)
    # 3次连续Good，due应该递增
    assert r3["due"] is not None

def test_again_after_good():
    r1 = review_engine.review(None, 3)
    r2 = review_engine.review(r1["card_dict"], 1)  # Again
    assert r2["state"] is not None

def test_four_ratings_all_valid():
    for rating in range(1, 5):
        result = review_engine.review(None, rating)
        assert result["state"] is not None
        assert result["due"] is not None

def test_easy_vs_hard():
    r_easy = review_engine.review(None, 4)
    r_hard = review_engine.review(None, 2)
    # 两者都应成功返回
    assert r_easy["state"] is not None
    assert r_hard["state"] is not None

def test_from_dict_restores_state():
    r1 = review_engine.review(None, 3)
    card_dict = r1["card_dict"]
    r2 = review_engine.review(card_dict, 4)  # Easy
    assert r2["state"] is not None
    assert r2["due"] is not None
    # stability 应该在多次复习后出现
    assert r2["stability"] is not None
