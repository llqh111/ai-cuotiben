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
    subject_prefs = Column(String, default="1,2,3,4,5,6")  # 逗号分隔的 enabled subject IDs


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
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=True)


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
    error_category = Column(String(20), nullable=True)      # concept/calculation/reading/careless/method
    error_category_detail = Column(Text, nullable=True)      # 具体描述
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


class PracticeQuestion(Base):
    """AI 针对某错题生成的相似练习题，不计入错题本。"""
    __tablename__ = "practice_questions"
    id = Column(Integer, primary_key=True, index=True)
    source_question_id = Column(Integer, ForeignKey("wrong_questions.id"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    content = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    solution = Column(Text, nullable=True)
    user_result = Column(String, default="unanswered")  # correct / wrong / unanswered
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class KnowledgeRelation(Base):
    """知识点之间的逻辑关系，驱动关联图谱连线。"""
    __tablename__ = "knowledge_relations"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), index=True, nullable=False)
    source_point_id = Column(Integer, ForeignKey("knowledge_points.id"), nullable=False)
    target_point_id = Column(Integer, ForeignKey("knowledge_points.id"), nullable=False)
    relation_type = Column(String, default="相关")  # 前置 / 相关 / 延伸


class Chapter(Base):
    """考纲章节树节点。三层：章 → 节 → 知识点。"""
    __tablename__ = "chapters"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), index=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("chapters.id"), nullable=True)
    name = Column(String(200), nullable=False)
    sort_order = Column(Integer, default=0)
    description = Column(Text, nullable=True)
    mastery_rating = Column(Integer, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
