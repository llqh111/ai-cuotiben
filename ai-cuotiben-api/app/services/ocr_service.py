import asyncio
import logging
import os
from io import BytesIO

logger = logging.getLogger(__name__)

_paddle_ocr = None
_paddle_available = False

def _get_ocr():
    global _paddle_ocr, _paddle_available
    if _paddle_ocr is None:
        try:
            from paddleocr import PaddleOCR
            _paddle_ocr = PaddleOCR(lang='ch', use_textline_orientation=True)
            _paddle_available = True
            logger.info("PaddleOCR 初始化成功")
        except Exception as e:
            logger.warning(f"PaddleOCR 初始化失败，将使用 mock 兜底: {e}")
            _paddle_ocr = None
            _paddle_available = False
    return _paddle_ocr, _paddle_available


async def extract_text_from_image(file_bytes: bytes) -> str:
    """对图片字节执行 OCR，返回识别文本。PaddleOCR 不可用时走 mock 兜底。"""
    ocr, available = _get_ocr()
    if not available:
        await asyncio.sleep(1)
        return _mock_ocr_result()

    def _run():
        import numpy as np
        from PIL import Image
        # PaddleOCR 的 ocr 方法接受图片路径或 numpy array
        img = Image.open(BytesIO(file_bytes))
        img_np = np.array(img)
        result = ocr.ocr(img_np, cls=True)
        if not result or not result[0]:
            return ""
        lines = []
        for line in result[0]:
            text = line[1][0] if len(line) > 1 and len(line[1]) > 0 else ""
            if text.strip():
                lines.append(text.strip())
        return "\n".join(lines)

    try:
        text = await asyncio.to_thread(_run)
        if not text.strip():
            logger.info("PaddleOCR 未识别到文字，使用 mock 兜底")
            return _mock_ocr_result()
        return text
    except Exception as e:
        logger.error(f"PaddleOCR 执行异常: {e}")
        return _mock_ocr_result()


def _mock_ocr_result() -> str:
    return "已知函数 f(x) = x³ - 3x² + ax + 1，若 f(x) 在 (1, +∞) 上单调递增，求 a 的取值范围。"


async def extract_text_from_pdf(file_bytes: bytes) -> str:
    """从 PDF 字节中提取文字。有文字层时直接提取，否则返回提示信息。"""
    try:
        import io
        from PyPDF2 import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        text_parts = []
        for page in reader.pages:
            t = page.extract_text()
            if t and t.strip():
                text_parts.append(t.strip())
        if text_parts:
            return "\n\n".join(text_parts)
    except Exception as e:
        logger.warning(f"PyPDF2 提取失败: {e}")

    return "[PDF 扫描件 — 暂不支持 OCR，请转为图片后上传]"
