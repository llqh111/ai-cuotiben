from pydantic import BaseModel

class ReviewSubmit(BaseModel):
    question_id: int
    rating: int  # 1=Again, 2=Hard, 3=Good, 4=Easy
