"""上传管道：OCR → AI拆分多题 → 逐题分析 → 归类落库。"""

import json
import logging
import os

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
            model="deepseek-chat",
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
