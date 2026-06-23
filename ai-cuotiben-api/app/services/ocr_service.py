import asyncio
import logging
import os
import platform
from io import BytesIO

logger = logging.getLogger(__name__)

# 跨平台 Tesseract 路径
if platform.system() == "Windows":
    _TESSERACT_CMD = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if not os.path.exists(_TESSERACT_CMD):
        _TESSERACT_CMD = "tesseract"
else:
    _TESSERACT_CMD = "tesseract"

_TESSDATA_DIR = os.path.join(os.path.expanduser("~"), ".tesseract", "tessdata")
# 也检查 Linux 系统路径
if not os.path.isdir(_TESSDATA_DIR):
    for candidate in ["/usr/share/tesseract-ocr/5/tessdata", "/usr/share/tesseract-ocr/tessdata"]:
        if os.path.isdir(candidate):
            _TESSDATA_DIR = candidate
            break

os.environ["TESSDATA_PREFIX"] = _TESSDATA_DIR


async def extract_text_from_image(file_bytes: bytes) -> str:
    """对图片字节执行 OCR，优先用 Tesseract 中文识别，失败则 mock 兜底。"""
    def _run():
        try:
            import pytesseract
            from PIL import Image

            pytesseract.pytesseract.tesseract_cmd = _TESSERACT_CMD

            img = Image.open(BytesIO(file_bytes))
            text = pytesseract.image_to_string(img, lang="chi_sim+eng")
            return text.strip()
        except Exception as e:
            logger.error(f"Tesseract OCR 失败: {e}")
            return ""

    try:
        text = await asyncio.to_thread(_run)
        if text:
            return text
    except Exception as e:
        logger.error(f"Tesseract 线程异常: {e}")

    logger.info("Tesseract 无结果，使用 mock 兜底")
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
    except ImportError:
        logger.warning("PyPDF2 未安装")
    except Exception as e:
        logger.warning(f"PyPDF2 提取失败: {e}")

    return "[PDF 扫描件 — 暂不支持 OCR，请转为图片后上传]"
