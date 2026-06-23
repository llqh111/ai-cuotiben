import logging
from io import BytesIO

logger = logging.getLogger(__name__)


async def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes.
    - Text-layer PDF → PyPDF2 extraction
    - Scanned PDF → pdf2image convert pages → Gemini OCR each page
    """
    # 1. Try PyPDF2 text extraction
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(BytesIO(file_bytes))
        text_parts = []
        for page in reader.pages:
            t = page.extract_text()
            if t and t.strip():
                text_parts.append(t.strip())
        if text_parts:
            joined = "\n\n".join(text_parts)
            if len(joined.strip()) >= 50:
                logger.info(f"PyPDF2 extracted {len(joined)} chars from PDF")
                return joined
    except ImportError:
        logger.warning("PyPDF2 not installed")
    except Exception as e:
        logger.warning(f"PyPDF2 extraction failed: {e}")

    # 2. Fallback: pdf2image → Gemini OCR (scanned PDF)
    logger.info("No text layer detected, falling back to Gemini OCR")
    try:
        from pdf2image import convert_from_bytes
        from app.services.gemini_service import recognize_image

        images = convert_from_bytes(file_bytes, dpi=200)
        logger.info(f"Converted PDF to {len(images)} page images")

        parts = []
        for i, img in enumerate(images):
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=85)
            page_bytes = buf.getvalue()
            text = await recognize_image(page_bytes)
            if text:
                parts.append(f"--- 第{i+1}页 ---\n{text}")
            else:
                parts.append(f"--- 第{i+1}页 ---\n[识别失败]")

        return "\n\n".join(parts)
    except ImportError:
        logger.error("pdf2image not installed")
        return "[PDF 扫描件 — pdf2image 未安装，请安装 pdf2image 和 poppler]"
    except Exception as e:
        logger.error(f"PDF scan OCR failed: {e}")
        return "[PDF 扫描件 — OCR 识别失败，请转为图片后手动上传]"
