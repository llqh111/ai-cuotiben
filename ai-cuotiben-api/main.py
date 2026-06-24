from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
from app.database import engine, Base, AsyncSessionLocal
import app.models  # to ensure models are registered
from app.core.seed import seed_subjects
from app.core.migration import run_migrations
from app.api import upload, questions, stats, auth, review, export, sprint, generate, graph, notify, chapters

IMAGE_DIR = os.environ.get("IMAGE_DIR", "images")
os.makedirs(IMAGE_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: 建表 + 预置 6 个科目（id 1-6，与前端 SUBJECTS 对齐，避免上传时按名乱建导致科目错位）
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await run_migrations()
    async with AsyncSessionLocal() as session:
        await seed_subjects(session)
    yield
    # Shutdown

app = FastAPI(
    title="AI 错题本 Backend",
    description="Backend API for AI Cuotiben",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://ai-cuotiben-web.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api/upload", tags=["Upload"])
app.include_router(questions.router, prefix="/api/questions", tags=["Questions"])
app.include_router(stats.router, prefix="/api/stats", tags=["Statistics"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(review.router, prefix="/api/review", tags=["Review"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])
app.include_router(sprint.router, prefix="/api/sprint", tags=["Sprint"])
app.include_router(generate.router, prefix="/api/generate", tags=["Generate"])
app.include_router(graph.router, prefix="/api/graph", tags=["Graph"])
app.include_router(notify.router, prefix="/api/notify", tags=["Notify"])
app.include_router(chapters.router, prefix="/api/chapters", tags=["Chapters"])

# Mount static files for uploaded images (cross-device access)
app.mount("/api/images", StaticFiles(directory=IMAGE_DIR), name="images")

@app.get("/")
async def root():
    return {"message": "Welcome to AI Cuotiben API"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}
