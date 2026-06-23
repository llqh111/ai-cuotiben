from pydantic import BaseModel
from typing import Optional

class QuestionUpdate(BaseModel):
    question_content: Optional[str] = None
    correct_answer: Optional[str] = None
    knowledge_point_id: Optional[int] = None
    question_pattern_id: Optional[int] = None
    mastery_level: Optional[str] = None
