from app.services import ai_service

async def test_parse_returns_required_fields(monkeypatch):
    monkeypatch.setattr(ai_service, "DEEPSEEK_API_KEY", "")
    out = await ai_service.parse_question("某道数学题", student_answer="a=2")
    for k in ["question_content", "question_type", "correct_answer", "solution_steps", "subject", "knowledge_point_name"]:
        assert k in out

async def test_classify_prefers_existing(monkeypatch):
    monkeypatch.setattr(ai_service, "DEEPSEEK_API_KEY", "")
    out = await ai_service.classify_question(
        question="某道导数题", correct_answer="x", student_answer="y",
        existing_kps=["导数"], existing_patterns=["导数求单调区间"])
    for k in ["error_analysis", "improvement_tips", "matched_knowledge_point", "matched_question_pattern"]:
        assert k in out
