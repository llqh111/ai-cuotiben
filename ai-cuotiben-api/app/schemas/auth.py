from datetime import date
from typing import Optional

from pydantic import BaseModel


class AuthRequest(BaseModel):
    nickname: str
    passphrase: str


class ProfileUpdate(BaseModel):
    exam_date: Optional[date] = None
    theme_preference: Optional[str] = None
    subject_prefs: Optional[str] = None
