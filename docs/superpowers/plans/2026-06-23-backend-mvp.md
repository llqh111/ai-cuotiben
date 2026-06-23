# 后端核心闭环 MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 FastAPI 后端实现账号、真分类、错题管理、复习四子系统，达成可 curl 跑通的核心闭环。

**Architecture:** SQLAlchemy async + SQLite。JWT 鉴权，所有用户数据按 `user_id` 隔离。上传走 mock OCR → DeepSeek 两轮分析 → 增量归类落库。间隔重复抽成纯函数引擎，独立测试。

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, aiosqlite, bcrypt, python-jose(JWT), pytest + pytest-asyncio + httpx, OpenAI SDK(指向 DeepSeek)。

上位 spec：`docs/superpowers/specs/2026-06-23-backend-mvp-design.md`

---

## 文件结构

```
ai-cuotiben-api/
  app/
    database.py          # 不变（SQLite async）
    models.py            # 重写：6 个模型
    core/
      __init__.py        # 新建
      config.py          # 新建：读环境变量（JWT_SECRET 等）
      security.py        # 新建：bcrypt + JWT + get_current_user
      seed.py            # 新建：预置 6 科目
    schemas/
      __init__.py        # 新建
      auth.py            # 新建
      question.py        # 新建
      review.py          # 新建
    services/
      ocr_service.py     # 不变（mock）
      ai_service.py      # 重写：parse_question + classify_question
      review_engine.py   # 新建：间隔重复纯函数
    api/
      auth.py            # 新建
      upload.py          # 重写
      questions.py       # 重写
      review.py          # 新建
      stats.py           # 重写
  main.py                # 修改：注册路由 + 启动 seed
  tests/
    conftest.py          # 新建：临时 DB + async client
    test_*.py
  requirements.txt       # 修改
```

所有命令默认在 `ai-cuotiben-api/` 下执行，Python 用 `venv/Scripts/python.exe`（Windows），下文记作 `$PY`。

---

### Task 0: 初始化 git + 测试依赖 + 测试基座

**Files:**
- Create: `ai-cuotiben-api/tests/__init__.py`, `ai-cuotiben-api/tests/conftest.py`, `ai-cuotiben-api/pytest.ini`
- Modify: `ai-cuotiben-api/requirements.txt`

- [ ] **Step 1: git init（仓库根目录 D:\Documents\Wrong-question-book）**

```bash
git init
printf "venv/\n__pycache__/\n*.pyc\n*.db\n.env\n.next/\nnode_modules/\n.pytest_cache/\nserver.log\n" > .gitignore
git add .gitignore && git commit -m "chore: init repo with gitignore"
```

- [ ] **Step 2: 追加测试与鉴权依赖到 requirements.txt 末尾**

```
bcrypt>=4.1.0
python-jose[cryptography]>=3.3.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.27.0
```

- [ ] **Step 3: 安装**

Run: `$PY -m pip install -r requirements.txt`
Expected: 全部安装成功。

- [ ] **Step 4: 写 tests/__init__.py（留空）与 tests/conftest.py**

```python
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.database import Base, get_db
from app.core import seed
import app.models  # noqa: 注册模型
from main import app

TEST_DB = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DB)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with Session() as session:
        await seed.seed_subjects(session)
        yield session
    await engine.dispose()

@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 5: 写 pytest.ini**

```ini
[pytest]
asyncio_mode = auto
pythonpath = .
```

- [ ] **Step 6: 提交**

```bash
git add ai-cuotiben-api/requirements.txt ai-cuotiben-api/tests ai-cuotiben-api/pytest.ini
git commit -m "test: add pytest async harness and auth deps"
```

> 注：conftest 引用尚未存在的 `app.core.seed` 和新版 models，Task 1 补齐后测试方可收集。本任务先放基座。

---

### Task 1: 数据模型（6 表）+ 科目 seed

**Files:**
- Modify: `ai-cuotiben-api/app/models.py`（重写）
- Create: `ai-cuotiben-api/app/core/__init__.py`, `ai-cuotiben-api/app/core/seed.py`, `ai-cuotiben-api/tests/test_models_smoke.py`

- [ ] **Step 1: 重写 models.py**

```python
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Date, Boolean, ForeignKey
)
from sqlalchemy.sql import func
from .database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    nickname = Column(String, index=True, nullable=False)
    passphrase_hash = Column(String, nullable=False)
    exam_date = Column(Date, nullable=True)
    theme_preference = Column(String, default="light")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)


class Subject(Base):
    __tablename__ = "subjects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    icon = Column(String, nullable=True)
    color = Column(String, nullable=True)


class KnowledgePoint(Base):
    __tablename__ = "knowledge_points"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), index=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("knowledge_points.id"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)


class QuestionPattern(Base):
    __tablename__ = "question_patterns"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    knowledge_point_id = Column(Integer, ForeignKey("knowledge_points.id"), index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    difficulty = Column(Integer, default=3)


class WrongQuestion(Base):
    __tablename__ = "wrong_questions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), index=True, nullable=False)
    knowledge_point_id = Column(Integer, ForeignKey("knowledge_points.id"), nullable=True)
    question_pattern_id = Column(Integer, ForeignKey("question_patterns.id"), nullable=True)
    image_url = Column(String, nullable=True)
    ocr_text = Column(Text, nullable=True)
    question_content = Column(Text, nullable=True)
    question_type = Column(String, default="essay")
    correct_answer = Column(Text, nullable=True)
    student_answer = Column(Text, nullable=True)
    error_analysis = Column(Text, nullable=True)
    solution_steps = Column(Text, nullable=True)
    improvement_tips = Column(Text, nullable=True)
    status = Column(String, default="analyzed")
    mastery_level = Column(String, default="new")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ReviewRecord(Base):
    __tablename__ = "review_records"
    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("wrong_questions.id"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    interval_index = Column(Integer, default=0)
    next_review_date = Column(Date, nullable=True)
    consecutive_correct = Column(Integer, default=0)
    reviewed_at = Column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 2: 写 core/__init__.py（留空）与 core/seed.py**

```python
from sqlalchemy import select
from app.models import Subject

SUBJECTS = [
    {"name": "语文", "icon": "book", "color": "#ef4444"},
    {"name": "数学", "icon": "function", "color": "#3b82f6"},
    {"name": "英语", "icon": "translate", "color": "#10b981"},
    {"name": "物理", "icon": "atom", "color": "#8b5cf6"},
    {"name": "化学", "icon": "flask", "color": "#f59e0b"},
    {"name": "生物", "icon": "dna", "color": "#14b8a6"},
]

async def seed_subjects(session):
    result = await session.execute(select(Subject))
    if result.scalars().first():
        return
    for s in SUBJECTS:
        session.add(Subject(**s))
    await session.commit()
```

- [ ] **Step 3: 写 tests/test_models_smoke.py**

```python
from sqlalchemy import select
from app.models import Subject

async def test_seed_creates_six_subjects(db_session):
    result = await db_session.execute(select(Subject))
    names = [s.name for s in result.scalars().all()]
    assert len(names) == 6
    assert "数学" in names
```

- [ ] **Step 4: 跑测试**

Run: `$PY -m pytest tests/test_models_smoke.py -v`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add ai-cuotiben-api/app/models.py ai-cuotiben-api/app/core ai-cuotiben-api/tests/test_models_smoke.py
git commit -m "feat: add 6-table data model and subject seed"
```

---

### Task 2: 安全模块（bcrypt + JWT + get_current_user）

**Files:**
- Create: `ai-cuotiben-api/app/core/config.py`, `ai-cuotiben-api/app/core/security.py`, `ai-cuotiben-api/tests/test_security.py`

- [ ] **Step 1: 写失败测试 test_security.py**

```python
from datetime import timedelta
from app.core import security

def test_hash_and_verify_roundtrip():
    h = security.hash_passphrase("secret123")
    assert h != "secret123"
    assert security.verify_passphrase("secret123", h) is True
    assert security.verify_passphrase("wrong", h) is False

def test_jwt_roundtrip():
    token = security.create_access_token(user_id=42)
    assert security.decode_user_id(token) == 42

def test_jwt_tampered_returns_none():
    token = security.create_access_token(user_id=42)
    assert security.decode_user_id(token + "x") is None

def test_jwt_expired_returns_none():
    token = security.create_access_token(user_id=42, expires=timedelta(seconds=-1))
    assert security.decode_user_id(token) is None
```

- [ ] **Step 2: 跑，确认失败**

Run: `$PY -m pytest tests/test_security.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写 core/config.py**

```python
import os
from dotenv import load_dotenv
load_dotenv()

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-insecure-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 7
```

- [ ] **Step 4: 写 core/security.py**

```python
from datetime import datetime, timedelta, timezone
import bcrypt
from jose import jwt, JWTError
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core import config
from app.database import get_db
from app.models import User

def hash_passphrase(raw: str) -> str:
    return bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()

def verify_passphrase(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode(), hashed.encode())
    except ValueError:
        return False

def create_access_token(user_id: int, expires: timedelta | None = None) -> str:
    if expires is None:
        expires = timedelta(days=config.JWT_EXPIRE_DAYS)
    payload = {"user_id": user_id, "exp": datetime.now(timezone.utc) + expires}
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)

def decode_user_id(token: str) -> int | None:
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
        return payload.get("user_id")
    except JWTError:
        return None

_bearer = HTTPBearer(auto_error=False)

async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status_code=401, detail="未登录")
    user_id = decode_user_id(creds.credentials)
    if user_id is None:
        raise HTTPException(status_code=401, detail="登录态无效或过期")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user
```

- [ ] **Step 5: 跑，确认通过**

Run: `$PY -m pytest tests/test_security.py -v`
Expected: PASS（4 条）。

- [ ] **Step 6: 提交**

```bash
git add ai-cuotiben-api/app/core/config.py ai-cuotiben-api/app/core/security.py ai-cuotiben-api/tests/test_security.py
git commit -m "feat: add bcrypt + JWT security module"
```

---

### Task 3: 账号接口（注册/登录）

**Files:**
- Create: `ai-cuotiben-api/app/schemas/__init__.py`, `ai-cuotiben-api/app/schemas/auth.py`, `ai-cuotiben-api/app/api/auth.py`, `ai-cuotiben-api/tests/test_auth.py`
- Modify: `ai-cuotiben-api/main.py`

- [ ] **Step 1: 写失败测试 test_auth.py**

```python
async def test_register_creates_user_and_returns_token(client):
    r = await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p1"})
    assert r.status_code == 200
    assert r.json()["data"]["token"]

async def test_register_same_combo_logs_in(client):
    await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p1"})
    r = await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p1"})
    assert r.status_code == 200

async def test_same_nickname_different_passphrase_are_distinct(client):
    a = await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p1"})
    b = await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p2"})
    assert a.json()["data"]["user_id"] != b.json()["data"]["user_id"]

async def test_login_wrong_passphrase_401(client):
    await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p1"})
    r = await client.post("/api/auth/login", json={"nickname": "李雷", "passphrase": "bad"})
    assert r.status_code == 401

async def test_login_success(client):
    await client.post("/api/auth/register", json={"nickname": "韩梅", "passphrase": "p1"})
    r = await client.post("/api/auth/login", json={"nickname": "韩梅", "passphrase": "p1"})
    assert r.status_code == 200
    assert r.json()["data"]["token"]
```

- [ ] **Step 2: 跑，确认失败**

Run: `$PY -m pytest tests/test_auth.py -v`
Expected: FAIL（路由 404）。

- [ ] **Step 3: 写 schemas/__init__.py（留空）与 schemas/auth.py**

```python
from pydantic import BaseModel

class AuthRequest(BaseModel):
    nickname: str
    passphrase: str
```

- [ ] **Step 4: 写 api/auth.py**

```python
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
```

- [ ] **Step 5: 在 main.py 注册路由**

把 `from app.api import upload, questions, stats` 改为
`from app.api import upload, questions, stats, auth`，并加：
```python
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
```

- [ ] **Step 6: 跑，确认通过**

Run: `$PY -m pytest tests/test_auth.py -v`
Expected: PASS（5 条）。

- [ ] **Step 7: 提交**

```bash
git add ai-cuotiben-api/app/schemas ai-cuotiben-api/app/api/auth.py ai-cuotiben-api/main.py ai-cuotiben-api/tests/test_auth.py
git commit -m "feat: add register/login with combo-as-identity"
```

---

### Task 4: 间隔重复引擎（纯函数）

**Files:**
- Create: `ai-cuotiben-api/app/services/review_engine.py`, `ai-cuotiben-api/tests/test_review_engine.py`

- [ ] **Step 1: 写失败测试 test_review_engine.py**

```python
from datetime import date, timedelta
from app.services import review_engine as re

def test_correct_advances_interval():
    r = re.calculate_next(is_correct=True, interval_index=0, consecutive_correct=0, today=date(2026, 6, 23))
    assert r.interval_index == 1
    assert r.mastery_level == "learning"
    assert r.next_review_date == date(2026, 6, 23) + timedelta(days=3)

def test_wrong_resets_to_one_day():
    r = re.calculate_next(is_correct=False, interval_index=3, consecutive_correct=4, today=date(2026, 6, 23))
    assert r.interval_index == 0
    assert r.consecutive_correct == 0
    assert r.next_review_date == date(2026, 6, 23) + timedelta(days=1)
    assert r.mastery_level == "learning"

def test_five_consecutive_correct_masters():
    r = re.calculate_next(is_correct=True, interval_index=2, consecutive_correct=4, today=date(2026, 6, 23))
    assert r.mastery_level == "mastered"
    assert r.next_review_date is None

def test_top_interval_correct_masters():
    r = re.calculate_next(is_correct=True, interval_index=4, consecutive_correct=1, today=date(2026, 6, 23))
    assert r.mastery_level == "mastered"
    assert r.next_review_date is None
```

- [ ] **Step 2: 跑，确认失败**

Run: `$PY -m pytest tests/test_review_engine.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写 services/review_engine.py**

```python
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

INTERVALS = [1, 3, 7, 14, 30]
MASTER_STREAK = 5

@dataclass
class ReviewResult:
    interval_index: int
    consecutive_correct: int
    next_review_date: Optional[date]
    mastery_level: str

def calculate_next(is_correct: bool, interval_index: int, consecutive_correct: int, today: date) -> ReviewResult:
    if not is_correct:
        return ReviewResult(0, 0, today + timedelta(days=INTERVALS[0]), "learning")
    streak = consecutive_correct + 1
    if streak >= MASTER_STREAK or interval_index >= len(INTERVALS) - 1:
        return ReviewResult(interval_index, streak, None, "mastered")
    next_index = interval_index + 1
    return ReviewResult(next_index, streak, today + timedelta(days=INTERVALS[next_index]), "learning")
```

- [ ] **Step 4: 跑，确认通过**

Run: `$PY -m pytest tests/test_review_engine.py -v`
Expected: PASS（4 条）。

- [ ] **Step 5: 提交**

```bash
git add ai-cuotiben-api/app/services/review_engine.py ai-cuotiben-api/tests/test_review_engine.py
git commit -m "feat: add spaced-repetition engine (pure functions)"
```

---

### Task 5: AI 服务重写（parse + classify，带 mock 兜底）

**Files:**
- Modify: `ai-cuotiben-api/app/services/ai_service.py`（重写）
- Create: `ai-cuotiben-api/tests/test_ai_service.py`

- [ ] **Step 1: 写测试 test_ai_service.py**

```python
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
```

- [ ] **Step 2: 跑，确认失败**

Run: `$PY -m pytest tests/test_ai_service.py -v`
Expected: FAIL。

- [ ] **Step 3: 重写 services/ai_service.py**

```python
import os
import json
import asyncio
import logging
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")

def _client():
    return AsyncOpenAI(api_key=DEEPSEEK_API_KEY or "mock-key", base_url="https://api.deepseek.com/v1")

async def _chat_json(system: str, user: str) -> dict:
    resp = await _client().chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        temperature=0.3)
    return json.loads(resp.choices[0].message.content)

PARSE_SYSTEM = (
    "你是资深高中全科老师。分析题目并输出 JSON，字段："
    "question_content(题目原文), question_type(choice/fill_blank/essay 三选一), "
    "correct_answer(正确答案), solution_steps(解题步骤), subject(科目，六科之一), "
    "knowledge_point_name(知识点名称)。只输出 JSON。")

async def parse_question(ocr_text: str, student_answer: str = "") -> dict:
    if not DEEPSEEK_API_KEY:
        await asyncio.sleep(0)
        return {"question_content": ocr_text, "question_type": "essay",
                "correct_answer": "（mock）a 的取值范围是 [3, +∞)", "solution_steps": "（mock）求导后分离参数。",
                "subject": "数学", "knowledge_point_name": "导数与单调性"}
    try:
        user = f"题目文字：\n{ocr_text}\n学生答案：{student_answer or '无'}"
        return await _chat_json(PARSE_SYSTEM, user)
    except Exception as e:
        logger.error(f"parse_question 失败: {e}")
        return {}

CLASSIFY_SYSTEM = (
    "你是高中错题分析老师。基于题目、正确答案、学生答案，输出 JSON，字段："
    "error_analysis(错因分析), improvement_tips(改进建议), "
    "matched_knowledge_point(从已有知识点中选最合适的；都不合适则给新名称), "
    "matched_question_pattern(从已有题型中选最合适的；都不合适则给新名称), "
    "is_new_knowledge_point(bool), is_new_question_pattern(bool)。只输出 JSON。")

async def classify_question(question: str, correct_answer: str, student_answer: str,
                            existing_kps: list[str], existing_patterns: list[str]) -> dict:
    if not DEEPSEEK_API_KEY:
        await asyncio.sleep(0)
        kp = existing_kps[0] if existing_kps else "导数与单调性"
        pat = existing_patterns[0] if existing_patterns else "导数求单调区间"
        return {"error_analysis": "（mock）忽略了端点取等。", "improvement_tips": "（mock）注意 ≥ 与 > 的区别。",
                "matched_knowledge_point": kp, "matched_question_pattern": pat,
                "is_new_knowledge_point": not existing_kps, "is_new_question_pattern": not existing_patterns}
    try:
        user = (f"题目：{question}\n正确答案：{correct_answer}\n学生答案：{student_answer or '无'}\n"
                f"已有知识点：{existing_kps or '无'}\n已有题型：{existing_patterns or '无'}")
        return await _chat_json(CLASSIFY_SYSTEM, user)
    except Exception as e:
        logger.error(f"classify_question 失败: {e}")
        return {}
```

- [ ] **Step 4: 跑，确认通过**

Run: `$PY -m pytest tests/test_ai_service.py -v`
Expected: PASS（2 条）。

- [ ] **Step 5: 提交**

```bash
git add ai-cuotiben-api/app/services/ai_service.py ai-cuotiben-api/tests/test_ai_service.py
git commit -m "refactor: split ai_service into parse + classify with mock fallback"
```

---

### Task 6: 上传改造（两轮分析 + 增量归类落库）

**Files:**
- Modify: `ai-cuotiben-api/app/api/upload.py`（重写）
- Create: `ai-cuotiben-api/tests/test_classify.py`

- [ ] **Step 1: 写失败测试 test_classify.py**

```python
from sqlalchemy import select
from app.models import KnowledgePoint, User
from app.api.upload import persist_analyzed_question

async def _make_user(db):
    u = User(nickname="t", passphrase_hash="x")
    db.add(u); await db.commit(); await db.refresh(u)
    return u

PARSED = {"question_content": "Q1", "question_type": "essay", "correct_answer": "A",
          "solution_steps": "S", "subject": "数学", "knowledge_point_name": "导数"}
CLASSIFIED = {"error_analysis": "E", "improvement_tips": "T",
              "matched_knowledge_point": "导数", "matched_question_pattern": "导数求单调区间",
              "is_new_knowledge_point": True, "is_new_question_pattern": True}

async def test_persist_creates_new_kp_and_pattern(db_session):
    user = await _make_user(db_session)
    q = await persist_analyzed_question(db_session, user.id, "ocr原文", "img.png", PARSED, CLASSIFIED)
    assert q.knowledge_point_id is not None
    kps = (await db_session.execute(select(KnowledgePoint))).scalars().all()
    assert len(kps) == 1 and kps[0].name == "导数"

async def test_persist_reuses_existing_kp(db_session):
    user = await _make_user(db_session)
    await persist_analyzed_question(db_session, user.id, "o", "i", PARSED, CLASSIFIED)
    await persist_analyzed_question(db_session, user.id, "o", "i", PARSED, CLASSIFIED)
    kps = (await db_session.execute(select(KnowledgePoint))).scalars().all()
    assert len(kps) == 1  # 复用，不重复建
```

- [ ] **Step 2: 跑，确认失败**

Run: `$PY -m pytest tests/test_classify.py -v`
Expected: FAIL。

- [ ] **Step 3: 重写 api/upload.py**

```python
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import User, Subject, KnowledgePoint, QuestionPattern, WrongQuestion
from app.core.security import get_current_user
from app.services.ocr_service import extract_text_from_image
from app.services import ai_service

router = APIRouter()
ALLOWED = {"image/jpeg", "image/png", "application/pdf"}

async def _get_or_create_subject(db: AsyncSession, name: str) -> Subject:
    subj = (await db.execute(select(Subject).where(Subject.name == name))).scalars().first()
    if subj is None:
        subj = Subject(name=name); db.add(subj); await db.flush()
    return subj

async def _get_or_create_kp(db, user_id, subject_id, name) -> KnowledgePoint:
    kp = (await db.execute(select(KnowledgePoint).where(
        KnowledgePoint.user_id == user_id, KnowledgePoint.subject_id == subject_id,
        KnowledgePoint.name == name))).scalars().first()
    if kp is None:
        kp = KnowledgePoint(user_id=user_id, subject_id=subject_id, name=name); db.add(kp); await db.flush()
    return kp

async def _get_or_create_pattern(db, user_id, kp_id, name) -> QuestionPattern:
    pat = (await db.execute(select(QuestionPattern).where(
        QuestionPattern.user_id == user_id, QuestionPattern.knowledge_point_id == kp_id,
        QuestionPattern.name == name))).scalars().first()
    if pat is None:
        pat = QuestionPattern(user_id=user_id, knowledge_point_id=kp_id, name=name); db.add(pat); await db.flush()
    return pat

async def persist_analyzed_question(db, user_id, ocr_text, image_url, parsed, classified) -> WrongQuestion:
    subj = await _get_or_create_subject(db, parsed.get("subject", "数学"))
    kp_name = classified.get("matched_knowledge_point") or parsed.get("knowledge_point_name") or "未分类"
    kp = await _get_or_create_kp(db, user_id, subj.id, kp_name)
    pat_name = classified.get("matched_question_pattern") or "未分类题型"
    pat = await _get_or_create_pattern(db, user_id, kp.id, pat_name)
    q = WrongQuestion(
        user_id=user_id, subject_id=subj.id, knowledge_point_id=kp.id, question_pattern_id=pat.id,
        image_url=image_url, ocr_text=ocr_text,
        question_content=parsed.get("question_content"), question_type=parsed.get("question_type", "essay"),
        correct_answer=parsed.get("correct_answer"), solution_steps=parsed.get("solution_steps"),
        error_analysis=classified.get("error_analysis"), improvement_tips=classified.get("improvement_tips"),
        status="analyzed", mastery_level="new")
    db.add(q); await db.commit(); await db.refresh(q)
    return q

@router.post("/")
async def upload_question(file: UploadFile = File(...), student_answer: str = "",
                          db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="仅支持 jpg/png/pdf")
    file_bytes = await file.read()
    ocr_text = await extract_text_from_image(file_bytes)
    parsed = await ai_service.parse_question(ocr_text, student_answer)
    if not parsed:
        q = WrongQuestion(user_id=user.id, subject_id=1, ocr_text=ocr_text,
                          image_url=file.filename, status="pending", mastery_level="new")
        db.add(q); await db.commit(); await db.refresh(q)
        return {"status": "partial", "message": "AI 分析失败，已保留原文待重试", "data": {"id": q.id}}
    existing_kps = (await db.execute(select(KnowledgePoint.name).where(KnowledgePoint.user_id == user.id))).scalars().all()
    existing_pats = (await db.execute(select(QuestionPattern.name).where(QuestionPattern.user_id == user.id))).scalars().all()
    classified = await ai_service.classify_question(
        parsed.get("question_content", ocr_text), parsed.get("correct_answer", ""), student_answer,
        list(existing_kps), list(existing_pats))
    q = await persist_analyzed_question(db, user.id, ocr_text, file.filename, parsed, classified or {})
    return {"status": "success", "data": {
        "id": q.id, "subject": parsed.get("subject"), "knowledge_point_id": q.knowledge_point_id,
        "question_content": q.question_content, "analysis": q.error_analysis, "answer": q.correct_answer}}
```

- [ ] **Step 4: 跑，确认通过**

Run: `$PY -m pytest tests/test_classify.py -v`
Expected: PASS（2 条）。

- [ ] **Step 5: 提交**

```bash
git add ai-cuotiben-api/app/api/upload.py ai-cuotiben-api/tests/test_classify.py
git commit -m "feat: upload runs two-round AI analysis with incremental classification"
```

---

### Task 7: 错题管理（列表/详情/编辑/删除/分类树）

**Files:**
- Modify: `ai-cuotiben-api/app/api/questions.py`（重写）
- Create: `ai-cuotiben-api/app/schemas/question.py`, `ai-cuotiben-api/tests/test_questions.py`

- [ ] **Step 1: 写失败测试 test_questions.py**

```python
import io

async def _auth(client):
    r = await client.post("/api/auth/register", json={"nickname": "u", "passphrase": "p"})
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}

async def _upload(client, headers):
    files = {"file": ("t.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 32), "image/png")}
    return await client.post("/api/upload/", files=files, headers=headers)

async def test_list_requires_auth(client):
    r = await client.get("/api/questions")
    assert r.status_code == 401

async def test_list_returns_own_questions(client):
    h = await _auth(client)
    await _upload(client, h)
    r = await client.get("/api/questions", headers=h)
    assert r.status_code == 200
    assert len(r.json()["data"]) == 1

async def test_delete_removes_question(client):
    h = await _auth(client)
    up = await _upload(client, h)
    qid = up.json()["data"]["id"]
    d = await client.delete(f"/api/questions/{qid}", headers=h)
    assert d.status_code == 200
    r = await client.get("/api/questions", headers=h)
    assert len(r.json()["data"]) == 0

async def test_cannot_see_others_question(client):
    h1 = await _auth(client)
    up = await _upload(client, h1)
    qid = up.json()["data"]["id"]
    r2 = await client.post("/api/auth/register", json={"nickname": "u2", "passphrase": "p"})
    h2 = {"Authorization": f"Bearer {r2.json()['data']['token']}"}
    g = await client.get(f"/api/questions/{qid}", headers=h2)
    assert g.status_code == 404
```

- [ ] **Step 2: 跑，确认失败**

Run: `$PY -m pytest tests/test_questions.py -v`
Expected: FAIL。

- [ ] **Step 3: 写 schemas/question.py**

```python
from pydantic import BaseModel
from typing import Optional

class QuestionUpdate(BaseModel):
    question_content: Optional[str] = None
    correct_answer: Optional[str] = None
    knowledge_point_id: Optional[int] = None
    question_pattern_id: Optional[int] = None
    mastery_level: Optional[str] = None
```

- [ ] **Step 4: 重写 api/questions.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import WrongQuestion, ReviewRecord, KnowledgePoint, QuestionPattern, User
from app.core.security import get_current_user
from app.schemas.question import QuestionUpdate

router = APIRouter()

def _dump(q: WrongQuestion) -> dict:
    return {"id": q.id, "subject_id": q.subject_id, "knowledge_point_id": q.knowledge_point_id,
            "question_pattern_id": q.question_pattern_id, "question_content": q.question_content,
            "question_type": q.question_type, "correct_answer": q.correct_answer,
            "original_text": q.ocr_text, "analysis": q.error_analysis, "answer": q.correct_answer,
            "solution_steps": q.solution_steps, "improvement_tips": q.improvement_tips,
            "status": q.status, "mastery_level": q.mastery_level, "created_at": q.created_at}

async def _owned(db, user_id, qid) -> WrongQuestion:
    q = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.id == qid, WrongQuestion.user_id == user_id))).scalars().first()
    if q is None:
        raise HTTPException(status_code=404, detail="错题不存在")
    return q

@router.get("/")
async def list_questions(subject_id: int = None, knowledge_point_id: int = None,
                         question_pattern_id: int = None, mastery_level: str = None,
                         db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(WrongQuestion).where(WrongQuestion.user_id == user.id)
    if subject_id: q = q.where(WrongQuestion.subject_id == subject_id)
    if knowledge_point_id: q = q.where(WrongQuestion.knowledge_point_id == knowledge_point_id)
    if question_pattern_id: q = q.where(WrongQuestion.question_pattern_id == question_pattern_id)
    if mastery_level: q = q.where(WrongQuestion.mastery_level == mastery_level)
    rows = (await db.execute(q)).scalars().all()
    return {"status": "success", "data": [_dump(x) for x in rows]}

@router.get("/tree/{subject_id}")
async def tree(subject_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    kps = (await db.execute(select(KnowledgePoint).where(
        KnowledgePoint.user_id == user.id, KnowledgePoint.subject_id == subject_id))).scalars().all()
    out = []
    for kp in kps:
        pats = (await db.execute(select(QuestionPattern).where(QuestionPattern.knowledge_point_id == kp.id))).scalars().all()
        pat_nodes = []
        for p in pats:
            cnt = len((await db.execute(select(WrongQuestion).where(
                WrongQuestion.question_pattern_id == p.id))).scalars().all())
            pat_nodes.append({"id": p.id, "name": p.name, "count": cnt})
        out.append({"id": kp.id, "name": kp.name, "patterns": pat_nodes})
    return {"status": "success", "data": out}

@router.get("/{question_id}")
async def get_question(question_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await _owned(db, user.id, question_id)
    return {"status": "success", "data": _dump(q)}

@router.put("/{question_id}")
async def update_question(question_id: int, body: QuestionUpdate,
                          db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await _owned(db, user.id, question_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(q, field, value)
    await db.commit(); await db.refresh(q)
    return {"status": "success", "data": _dump(q)}

@router.delete("/{question_id}")
async def delete_question(question_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await _owned(db, user.id, question_id)
    await db.execute(delete(ReviewRecord).where(ReviewRecord.question_id == q.id))
    await db.delete(q); await db.commit()
    return {"status": "success", "message": "已删除"}
```

> 路由顺序：`tree/{subject_id}` 必须定义在 `/{question_id}` 之前（上面已正确），否则 `tree` 会被当成 question_id。

- [ ] **Step 5: 跑，确认通过**

Run: `$PY -m pytest tests/test_questions.py -v`
Expected: PASS（4 条）。

- [ ] **Step 6: 提交**

```bash
git add ai-cuotiben-api/app/api/questions.py ai-cuotiben-api/app/schemas/question.py ai-cuotiben-api/tests/test_questions.py
git commit -m "feat: user-scoped question CRUD + classification tree"
```

---

### Task 8: 复习接口（抽题 + 提交）

**Files:**
- Create: `ai-cuotiben-api/app/api/review.py`, `ai-cuotiben-api/app/schemas/review.py`, `ai-cuotiben-api/tests/test_review_api.py`
- Modify: `ai-cuotiben-api/main.py`

- [ ] **Step 1: 写失败测试 test_review_api.py**

```python
import io

async def _auth(client):
    r = await client.post("/api/auth/register", json={"nickname": "u", "passphrase": "p"})
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}

async def _upload(client, h):
    files = {"file": ("t.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0"*32), "image/png")}
    return (await client.post("/api/upload/", files=files, headers=h)).json()["data"]["id"]

async def test_submit_correct_advances(client):
    h = await _auth(client)
    qid = await _upload(client, h)
    r = await client.post("/api/review/submit", json={"question_id": qid, "is_correct": True}, headers=h)
    assert r.status_code == 200
    assert r.json()["data"]["mastery_level"] == "learning"
    assert r.json()["data"]["next_review_date"] is not None

async def test_submit_wrong_keeps_learning(client):
    h = await _auth(client)
    qid = await _upload(client, h)
    r = await client.post("/api/review/submit", json={"question_id": qid, "is_correct": False}, headers=h)
    assert r.json()["data"]["mastery_level"] == "learning"

async def test_random_returns_list(client):
    h = await _auth(client)
    await _upload(client, h)
    r = await client.get("/api/review/random/1?count=5", headers=h)
    assert r.status_code == 200
    assert isinstance(r.json()["data"], list)
```

- [ ] **Step 2: 跑，确认失败**

Run: `$PY -m pytest tests/test_review_api.py -v`
Expected: FAIL（路由 404）。

- [ ] **Step 3: 写 schemas/review.py**

```python
from pydantic import BaseModel

class ReviewSubmit(BaseModel):
    question_id: int
    is_correct: bool
```

- [ ] **Step 4: 写 api/review.py**

```python
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import WrongQuestion, ReviewRecord, User
from app.core.security import get_current_user
from app.services import review_engine
from app.schemas.review import ReviewSubmit

router = APIRouter()

def _q(q: WrongQuestion) -> dict:
    return {"id": q.id, "question_content": q.question_content, "question_type": q.question_type,
            "correct_answer": q.correct_answer, "solution_steps": q.solution_steps,
            "mastery_level": q.mastery_level}

async def _latest_record(db, qid):
    return (await db.execute(select(ReviewRecord).where(ReviewRecord.question_id == qid)
            .order_by(ReviewRecord.id.desc()))).scalars().first()

@router.get("/daily/{subject_id}")
async def daily(subject_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.subject_id == subject_id,
        WrongQuestion.mastery_level != "mastered"))).scalars().all()
    due = []
    for q in rows:
        rec = await _latest_record(db, q.id)
        if rec is None or (rec.next_review_date and rec.next_review_date <= date.today()):
            due.append(_q(q))
    return {"status": "success", "data": due}

@router.get("/random/{subject_id}")
async def random_pick(subject_id: int, count: int = 10,
                      db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.subject_id == subject_id,
        WrongQuestion.mastery_level != "mastered").order_by(func.random()).limit(count))).scalars().all()
    return {"status": "success", "data": [_q(q) for q in rows]}

@router.get("/pattern/{pattern_id}")
async def by_pattern(pattern_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.question_pattern_id == pattern_id,
        WrongQuestion.mastery_level != "mastered"))).scalars().all()
    return {"status": "success", "data": [_q(q) for q in rows]}

@router.post("/submit")
async def submit(body: ReviewSubmit, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.id == body.question_id, WrongQuestion.user_id == user.id))).scalars().first()
    if q is None:
        raise HTTPException(status_code=404, detail="错题不存在")
    prev = await _latest_record(db, q.id)
    idx = prev.interval_index if prev else 0
    streak = prev.consecutive_correct if prev else 0
    result = review_engine.calculate_next(body.is_correct, idx, streak, date.today())
    db.add(ReviewRecord(question_id=q.id, user_id=user.id, is_correct=body.is_correct,
                        interval_index=result.interval_index, next_review_date=result.next_review_date,
                        consecutive_correct=result.consecutive_correct))
    q.mastery_level = result.mastery_level
    await db.commit()
    return {"status": "success", "data": {
        "mastery_level": result.mastery_level,
        "next_review_date": result.next_review_date.isoformat() if result.next_review_date else None}}
```

- [ ] **Step 5: 在 main.py 注册 review 路由**

import 行追加 `review`，并加：
```python
app.include_router(review.router, prefix="/api/review", tags=["Review"])
```

- [ ] **Step 6: 跑，确认通过**

Run: `$PY -m pytest tests/test_review_api.py -v`
Expected: PASS（3 条）。

- [ ] **Step 7: 提交**

```bash
git add ai-cuotiben-api/app/api/review.py ai-cuotiben-api/app/schemas/review.py ai-cuotiben-api/main.py ai-cuotiben-api/tests/test_review_api.py
git commit -m "feat: review endpoints with spaced-repetition state"
```

---

### Task 9: 统计扩展 + 全量回归 + 手动验收

**Files:**
- Modify: `ai-cuotiben-api/app/api/stats.py`（重写）

- [ ] **Step 1: 重写 api/stats.py**

```python
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from collections import defaultdict
from app.database import get_db
from app.models import WrongQuestion, KnowledgePoint, User
from app.core.security import get_current_user

router = APIRouter()

@router.get("/")
async def dashboard(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(WrongQuestion.user_id == user.id))).scalars().all()
    total = len(rows)
    mastered = sum(1 for q in rows if q.mastery_level == "mastered")
    dist = defaultdict(int)
    for q in rows:
        dist[q.subject_id] += 1
    return {"status": "success", "data": {
        "total_questions": total, "mastery_rate": round(mastered / total * 100) if total else 0,
        "subject_distribution": dict(dist)}}

@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(WrongQuestion.user_id == user.id))).scalars().all()
    total = len(rows)
    by = defaultdict(int)
    for q in rows:
        by[q.mastery_level] += 1
    return {"status": "success", "data": {
        "total": total, "new": by["new"], "learning": by["learning"], "mastered": by["mastered"],
        "mastery_rate": round(by["mastered"] / total * 100) if total else 0}}

@router.get("/weak-points")
async def weak_points(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WrongQuestion).where(WrongQuestion.user_id == user.id))).scalars().all()
    agg = defaultdict(lambda: {"total": 0, "mastered": 0})
    for q in rows:
        if q.knowledge_point_id is None:
            continue
        agg[q.knowledge_point_id]["total"] += 1
        if q.mastery_level == "mastered":
            agg[q.knowledge_point_id]["mastered"] += 1
    items = []
    for kp_id, c in agg.items():
        kp = (await db.execute(select(KnowledgePoint).where(KnowledgePoint.id == kp_id))).scalars().first()
        rate = c["mastered"] / c["total"] if c["total"] else 0
        items.append({"knowledge_point": kp.name if kp else str(kp_id),
                      "count": c["total"], "mastery_rate": round(rate * 100)})
    items.sort(key=lambda x: (-x["count"], x["mastery_rate"]))
    return {"status": "success", "data": items[:5]}

@router.get("/graph/{subject}")
async def graph(subject: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    kps = (await db.execute(select(KnowledgePoint).where(KnowledgePoint.user_id == user.id))).scalars().all()
    rows = (await db.execute(select(WrongQuestion).where(WrongQuestion.user_id == user.id))).scalars().all()
    count_by_kp = defaultdict(int)
    for q in rows:
        if q.knowledge_point_id:
            count_by_kp[q.knowledge_point_id] += 1
    nodes = [{"name": subject, "symbolSize": max(40, len(rows) * 5), "itemStyle": {"color": "#ef4444"}}]
    edges = []
    colors = ["#f87171", "#10b981", "#34d399", "#f59e0b", "#3b82f6", "#60a5fa"]
    for i, kp in enumerate(kps):
        nodes.append({"name": kp.name, "symbolSize": max(20, count_by_kp[kp.id] * 15),
                      "itemStyle": {"color": colors[i % len(colors)]}})
        edges.append({"source": subject, "target": kp.name})
    return {"status": "success", "data": {"nodes": nodes, "edges": edges}}
```

- [ ] **Step 2: 全量回归**

Run: `$PY -m pytest -v`
Expected: 所有测试 PASS。

- [ ] **Step 3: 手动端到端验收（curl）**

启动（新终端）：`$PY -m uvicorn main:app --port 8000`。然后：
```bash
TOKEN=$(curl -s -X POST localhost:8000/api/auth/register -H "Content-Type: application/json" -d '{"nickname":"测试","passphrase":"123"}' | python -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
curl -s -X POST localhost:8000/api/upload/ -H "Authorization: Bearer $TOKEN" -F "file=@test.png"
curl -s localhost:8000/api/questions -H "Authorization: Bearer $TOKEN"
curl -s -X POST localhost:8000/api/review/submit -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"question_id":1,"is_correct":true}'
```
Expected: 拿到 token；上传后题目带 knowledge_point_id；列表含该题；提交返回 mastery_level=learning、next_review_date 为 3 天后。

- [ ] **Step 4: 提交**

```bash
git add ai-cuotiben-api/app/api/stats.py
git commit -m "feat: user-scoped stats with real mastery + weak-points"
```

---

## 自查清单

- **spec 覆盖**：6 表(T1)、JWT(T2)、账号(T3)、复习引擎(T4)+接口(T8)、真分类(T5/T6)、错题管理(T7)、统计(T9) —— 全覆盖。缓做项（真OCR/相似题/图谱算法/PDF/冲刺/拆多题）按 spec 明确排除。
- **占位符**：无 TODO/TBD，每步含可执行代码与命令。
- **类型一致**：`calculate_next(...) -> ReviewResult(interval_index, consecutive_correct, next_review_date, mastery_level)`，T8 按这些字段使用；`persist_analyzed_question(db, user_id, ocr_text, image_url, parsed, classified)` 在 T6 测试与实现签名一致；`get_current_user` 全程统一。
- **路由顺序**：questions 中 `tree/{subject_id}` 在 `/{question_id}` 之前。

## 已知风险

- bcrypt 4.x 对超 72 字节口令截断；本场景口令短，忽略。
- mock AI 下所有题归到同一知识点（导数），属预期；接真 key 后分类才丰富。
- 上传接口含真实 DeepSeek 两轮调用，单测用 monkeypatch/无 key 走 mock，避免测试期联网与费用。
