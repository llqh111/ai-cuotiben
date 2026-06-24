"""图片存储：Cloudinary 优先，本地文件系统兜底。

设置 CLOUDINARY_URL 环境变量后自动切换 Cloudinary：
  cloudinary://api_key:api_secret@cloud_name
"""

from __future__ import annotations

import os
import time
import uuid
import logging
from io import BytesIO
from urllib.parse import urlparse

import cloudinary
import cloudinary.uploader

logger = logging.getLogger(__name__)

IMAGE_DIR = os.environ.get("IMAGE_DIR", "images")
os.makedirs(IMAGE_DIR, exist_ok=True)

_cloudinary_configured = False


def _parse_cloudinary_url(url: str) -> dict:
    """cloudinary://api_key:api_secret@cloud_name → {cloud_name, api_key, api_secret}"""
    parsed = urlparse(url)
    return {
        "cloud_name": parsed.hostname or "",
        "api_key": parsed.username or "",
        "api_secret": parsed.password or "",
    }


def _ensure_cloudinary():
    global _cloudinary_configured
    if _cloudinary_configured:
        return
    cloud_url = os.environ.get("CLOUDINARY_URL", "")
    if cloud_url:
        creds = _parse_cloudinary_url(cloud_url)
        cloudinary.config(**creds)
        logger.info("Cloudinary configured: %s", creds["cloud_name"])
    _cloudinary_configured = True


def _save_local(file_bytes: bytes, user_id: int, original_name: str, prefix: str = "") -> str:
    """保存到本地 images/ 目录，返回相对路径如 /api/images/xxx.jpg。"""
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in (original_name or "") else "jpg"
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        ext = "jpg"
    filename = f"{prefix}{user_id}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(IMAGE_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(file_bytes)
    return f"/api/images/{filename}"


def save_image(file_bytes: bytes, user_id: int, original_name: str, prefix: str = "") -> str:
    """保存图片，返回公开可访问的 URL。

    Cloudinary 可用时上传到云端，返回 https://res.cloudinary.com/... URL。
    否则存本地，返回 /api/images/... 相对路径。
    """
    _ensure_cloudinary()

    cloud_url = os.environ.get("CLOUDINARY_URL", "")
    if cloud_url:
        try:
            ext = original_name.rsplit(".", 1)[-1].lower() if "." in (original_name or "") else "jpg"
            if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
                ext = "jpg"
            public_id = f"cuotiben/{user_id}/{prefix}{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
            result = cloudinary.uploader.upload(
                BytesIO(file_bytes),
                public_id=public_id,
                resource_type="image",
                format=ext,
            )
            logger.info("Cloudinary upload: %s → %s", public_id, result.get("secure_url"))
            return result["secure_url"]
        except Exception:
            logger.exception("Cloudinary upload failed, falling back to local")
            # Cloudinary 挂了不阻塞上传，兜底到本地
            return _save_local(file_bytes, user_id, original_name, prefix)

    return _save_local(file_bytes, user_id, original_name, prefix)
