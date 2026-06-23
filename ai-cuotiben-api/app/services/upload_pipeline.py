"""上传管道：OCR → AI拆分多题 → 逐题分析 → 归类落库。"""

import json
import logging
import os

from app.services.ai_service import DEEPSEEK_MODEL

logger = logging.getLogger(__name__)

SPLIT_SYSTEM = (
    "你是高考题目拆分助手。给定一段 OCR 识别文本，判断其中包含几道独立题目。"
    "输出 JSON，字段 questions 为数组，每项含 index(序号从1开始)、content(该题完整文字)。"
    "如果整段文字只是一道题，questions 数组只含一项。只输出 JSON。"
)


async def split_questions(ocr_text: str) -> list[dict]:
    """将 OCR 文本拆分为独立题目列表。AI 不可用时原样返回单题。"""
    if not os.environ.get("DEEPSEEK_API_KEY"):
        return [{"index": 1, "content": ocr_text}]
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=os.environ["DEEPSEEK_API_KEY"],
            base_url="https://api.deepseek.com/v1"
        )
        resp = await client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": SPLIT_SYSTEM},
                {"role": "user", "content": f"OCR 文本：\n{ocr_text}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        result = json.loads(resp.choices[0].message.content)
        items = result.get("questions", [])
        if not items:
            return [{"index": 1, "content": ocr_text}]
        return items[:10]  # 最多 10 题
    except Exception as e:
        logger.error(f"AI 拆分失败: {e}")
        return [{"index": 1, "content": ocr_text}]


PDF_ANALYZE_SYSTEM = (
    "你是高考题目分析助手。给定一份 PDF 试卷的完整文字内容，请识别其中包含的所有独立题目，并逐题分析。\n"
    "输出 JSON，字段 questions 为数组，每项含：\n"
    "index(题号), question_content(题目原文), question_type(choice/fill_blank/essay 三选一),\n"
    "correct_answer(正确答案), solution_steps(解题步骤),\n"
    "knowledge_point_name(知识点名称), question_pattern_name(题型名称，如「导数求单调区间」)。\n"
    "如果整段只有一道题，questions 也只含一项。只输出 JSON。"
)


async def analyze_pdf_questions(full_text: str) -> list[dict]:
    """将 PDF 全文拆分为题目并对每道题做解析。一次 API 调用完成拆分+分析。"""
    if not os.environ.get("DEEPSEEK_API_KEY"):
        logger.warning("DEEPSEEK_API_KEY not set, returning single mock question")
        return [{
            "index": 1,
            "question_content": full_text[:500],
            "question_type": "essay",
            "correct_answer": "（mock）见解析",
            "solution_steps": "（mock）待 AI 分析",
            "knowledge_point_name": "待分类",
            "question_pattern_name": "待分类"
        }]

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=os.environ["DEEPSEEK_API_KEY"],
            base_url="https://api.deepseek.com/v1"
        )
        resp = await client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": PDF_ANALYZE_SYSTEM},
                {"role": "user", "content": f"PDF 内容：\n{full_text}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        result = json.loads(resp.choices[0].message.content)
        items = result.get("questions", [])
        if not items:
            return [{"index": 1, "question_content": full_text[:500], "question_type": "essay",
                     "correct_answer": "", "solution_steps": "", "knowledge_point_name": "待分类",
                     "question_pattern_name": "待分类"}]
        return items[:30]  # 最多 30 题
    except Exception as e:
        logger.error(f"PDF analyze failed: {e}")
        return [{"index": 1, "question_content": full_text[:500], "question_type": "essay",
                 "correct_answer": "", "solution_steps": "", "knowledge_point_name": "待分类",
                 "question_pattern_name": "待分类"}]
