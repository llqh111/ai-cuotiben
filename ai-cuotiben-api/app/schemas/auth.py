from pydantic import BaseModel

class AuthRequest(BaseModel):
    nickname: str
    passphrase: str
