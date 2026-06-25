"""图片识别（OCR）：通义千问 Qwen-VL —— 阿里云百炼 DashScope。

中国大陆可直连，多模态，识别中英文 / 数学公式 / 图表。
接口为 OpenAI 兼容，复用 openai SDK。

环境变量：
  DASHSCOPE_API_KEY   阿里云百炼 API Key（必填，启用 OCR）
  VISION_MODEL        默认 qwen-vl-max，可改 qwen-vl-plus（更便宜）
  DASHSCOPE_BASE_URL  默认百炼兼容端点，一般不用改
"""

import os
import base64
import logging
from io import BytesIO

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

DASHSCOPE_API_KEY = os.environ.get("DASHSCOPE_API_KEY", "")
DASHSCOPE_BASE_URL = os.environ.get(
    "DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"
)
VISION_MODEL = os.environ.get("VISION_MODEL", "qwen-vl-max")

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


def _to_jpeg_data_uri(file_bytes: bytes) -> str:
    """任意图片字节 → 统一转 JPEG 的 base64 data URI（避免 png/webp/gif mime 不一致）。"""
    from PIL import Image

    img = Image.open(BytesIO(file_bytes)).convert("RGB")
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/jpeg;base64,{b64}"


async def recognize_image(file_bytes: bytes, custom_prompt: str = None) -> str:
    """使用 Qwen-VL 识别图片中的文字。

    Args:
        file_bytes: 图片文件的字节数据
        custom_prompt: 自定义识别 prompt，为空则使用默认 prompt

    Returns:
        识别到的文字内容

    Raises:
        RuntimeError: DASHSCOPE_API_KEY 未配置或识别失败
    """
    if not DASHSCOPE_API_KEY:
        raise RuntimeError("DASHSCOPE_API_KEY 未配置，请在 Render 环境变量中设置（阿里云百炼）")

    prompt = custom_prompt or RECOGNIZE_PROMPT
    try:
        data_uri = _to_jpeg_data_uri(file_bytes)
    except Exception as e:
        raise RuntimeError(f"图片无法解析: {e}")

    client = AsyncOpenAI(api_key=DASHSCOPE_API_KEY, base_url=DASHSCOPE_BASE_URL)
    try:
        resp = await client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                }
            ],
            temperature=0.1,
            max_tokens=4096,
        )
        text = (resp.choices[0].message.content or "").strip()
        logger.info(f"Qwen-VL recognized {len(text)} chars from image")
        return text
    except Exception as e:
        raise RuntimeError(f"Qwen-VL OCR 识别失败: {e}")
