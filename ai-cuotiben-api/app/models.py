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
