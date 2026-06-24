from pydantic import BaseModel
from typing import Optional, List

class QuestionUpdate(BaseModel):
    question_content: Optional[str] = None
    correct_answer: Optional[str] = None
    knowledge_point_id: Optional[int] = None
    question_pattern_id: Optional[int] = None
    mastery_level: Optional[str] = None


class ImportQuestion(BaseModel):
    """外部 AI（Claude 等）输出的成品错题，字段齐全，绕开 DeepSeek 直接落库。"""
    subject_id: int
    knowledge_point_name: str = "未分类"
    question_pattern_name: str = "未分类题型"
    question_content: str
    question_type: str = "essay"
    correct_answer: Optional[str] = None
    student_answer: Optional[str] = None
    solution_steps: Optional[str] = None
    error_analysis: Optional[str] = None
    improvement_tips: Optional[str] = None
    error_category: Optional[str] = None
    error_category_detail: Optional[str] = None
    image_url: Optional[str] = None


class ImportBatch(BaseModel):
    questions: List[ImportQuestion]
