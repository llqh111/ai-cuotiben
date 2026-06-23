from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.database import engine, Base
import app.models  # to ensure models are registered
from app.api import upload, questions, stats, auth, review, export, sprint, generate, graph, notify

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
    allow_origins=["http://localhost:3000"],
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

@app.get("/")
async def root():
    return {"message": "Welcome to AI Cuotiben API"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}
