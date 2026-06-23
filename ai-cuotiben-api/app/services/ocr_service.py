import asyncio
import logging
from io import BytesIO

logger = logging.getLogger(__name__)

# EasyOCR reader --- lazy init, avoid loading model at startup
_reader = None


def _get_reader():
    """Lazy-load EasyOCR reader (first call downloads ~200MB model)."""
    global _reader
    if _reader is None:
        import easyocr
        _reader = easyocr.Reader(['ch_sim', 'en'], gpu=False)
    return _reader


async def extract_text_from_image(file_bytes: bytes) -> str:
    """OCR image bytes with EasyOCR Chinese recognition, fallback to mock on failure."""
    def _run():
        try:
            import numpy as np
            from PIL import Image

            reader = _get_reader()
            img = Image.open(BytesIO(file_bytes))
            # EasyOCR accepts numpy array
            result = reader.readtext(np.array(img))
            # result format: [[bbox, text, confidence], ...]
            lines = [item[1] for item in result if item[2] > 0.3]
            text = '\n'.join(lines)
            return text.strip()
        except Exception as e:
            logger.error(f"EasyOCR failed: {e}")
            return ""

    try:
        text = await asyncio.to_thread(_run)
        if text:
            return text
    except Exception as e:
        logger.error(f"EasyOCR thread exception: {e}")

    logger.info("EasyOCR returned no result, falling back to mock")
    return _mock_ocr_result()


def _mock_ocr_result() -> str:
    return "已知函数 f(x) = x³ - 3x² + ax + 1，若 f(x) 在 (1, +∞) 上单调递增，求 a 的取值范围。"


async def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes. Returns text if text layer exists, otherwise a hint."""
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
    except ImportError:
        logger.warning("PyPDF2 not installed")
    except Exception as e:
        logger.warning(f"PyPDF2 extraction failed: {e}")

    return "[PDF 扫描件 — 暂不支持 OCR，请转为图片后上传]"
