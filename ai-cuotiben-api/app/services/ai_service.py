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
