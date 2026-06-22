from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func
from app.database import get_db
from app.models import User
from app.schemas.auth import AuthRequest
from app.core import security

router = APIRouter()

def _ok(user: User):
    return {"status": "success", "data": {
        "token": security.create_access_token(user.id), "user_id": user.id, "nickname": user.nickname}}

async def _find_by_combo(db: AsyncSession, nickname: str, passphrase: str):
    result = await db.execute(select(User).where(User.nickname == nickname))
    for u in result.scalars().all():
        if security.verify_passphrase(passphrase, u.passphrase_hash):
            return u
    return None

@router.post("/register")
async def register(body: AuthRequest, db: AsyncSession = Depends(get_db)):
    existing = await _find_by_combo(db, body.nickname, body.passphrase)
    if existing:
        return _ok(existing)
    user = User(nickname=body.nickname, passphrase_hash=security.hash_passphrase(body.passphrase))
    db.add(user); await db.commit(); await db.refresh(user)
    return _ok(user)

@router.post("/login")
async def login(body: AuthRequest, db: AsyncSession = Depends(get_db)):
    user = await _find_by_combo(db, body.nickname, body.passphrase)
    if not user:
        raise HTTPException(status_code=401, detail="昵称或口令错误")
    user.last_login_at = func.now()
    await db.commit()
    return _ok(user)
