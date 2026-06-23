from typing import Optional

from pydantic import BaseModel


class ExportRequest(BaseModel):
    subject_id: Optional[int] = None
    knowledge_point_id: Optional[int] = None
    question_pattern_id: Optional[int] = None
    mastery_level: Optional[str] = None
    with_answer: bool = True
    title: str = "错题导出"
