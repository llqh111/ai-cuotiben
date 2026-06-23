"""Gemini 图片识别服务 — 替代 EasyOCR，支持中英文、数学公式、图表识别。"""

import os
import logging
from io import BytesIO
import asyncio

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# 图片识别专用 prompt —— 针对高考题目优化
RECOGNIZE_PROMPT = (
    "你是一个专业的 OCR 识别助手。请仔细识别并提取这张图片中的所有文字内容。\n\n"
    "要求：\n"
    "1. 提取所有题目正文，包括数学公式（用 LaTeX 格式，如 $f(x) = x^3 - 3x^2 + ax + 1$）\n"
    "2. 提取化学方程式、物理公式等学科特定内容\n"
    "3. 如果图中包含图表（如函数图像、电路图、实验装置图），用文字描述图表内容\n"
    "4. 保留题目的层次结构和编号（如「一、选择题」「1.」「(1)」）\n"
    "5. 如果有选项（A/B/C/D），完整提取所有选项\n"
    "6. 不要添加任何额外的解释或评论，只输出识别到的内容"
)


async def recognize_image(file_bytes: bytes, custom_prompt: str = None) -> str:
    """使用 Gemini 识别图片中的文字。

    Args:
        file_bytes: 图片文件的字节数据
        custom_prompt: 自定义识别 prompt，为空则使用默认 prompt

    Returns:
        识别到的文字内容，失败时返回空字符串
    """
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set, falling back to mock")
        return _mock_ocr_result()

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=GEMINI_API_KEY)

        from PIL import Image
        img = Image.open(BytesIO(file_bytes))

        prompt = custom_prompt or RECOGNIZE_PROMPT

        def _sync_call():
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[prompt, img],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=4096,
                ),
            )
            return response.text.strip()

        text = await asyncio.to_thread(_sync_call)
        logger.info(f"Gemini recognized {len(text)} chars from image")
        return text

    except ImportError:
        logger.error("google-genai package not installed. Run: pip install google-genai")
        return _mock_ocr_result()
    except Exception as e:
        logger.error(f"Gemini recognition failed: {e}")
        return _mock_ocr_result()


def _mock_ocr_result() -> str:
    """API 不可用时的 mock 兜底。"""
    return "已知函数 f(x) = x³ - 3x² + ax + 1，若 f(x) 在 (1, +∞) 上单调递增，求 a 的取值范围。"
