from pydantic import BaseModel

class ReviewSubmit(BaseModel):
    question_id: int
    is_correct: bool
