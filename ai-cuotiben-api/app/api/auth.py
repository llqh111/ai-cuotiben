from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func
from app.database import get_db
from app.models import User
from app.core.security import get_current_user
from app.schemas.auth import AuthRequest, ProfileUpdate
from app.core import security
from app.core.seed import seed_chapters

router = APIRouter()


def _profile(user: User):
    return {"status": "success", "data": {
        "user_id": user.id, "nickname": user.nickname,
        "exam_date": user.exam_date.isoformat() if user.exam_date else None,
        "theme_preference": user.theme_preference,
        "subject_prefs": getattr(user, "subject_prefs", "1,2,3,4,5,6")}}

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
    await seed_chapters(user.id, db)
    return _ok(user)

@router.post("/login")
async def login(body: AuthRequest, db: AsyncSession = Depends(get_db)):
    user = await _find_by_combo(db, body.nickname, body.passphrase)
    if not user:
        raise HTTPException(status_code=401, detail="昵称或口令错误")
    user.last_login_at = func.now()
    await db.commit()
    await seed_chapters(user.id, db)
    return _ok(user)

@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return _profile(user)

@router.put("/profile")
async def update_profile(body: ProfileUpdate, db: AsyncSession = Depends(get_db),
                         user: User = Depends(get_current_user)):
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    await db.commit(); await db.refresh(user)
    return _profile(user)
