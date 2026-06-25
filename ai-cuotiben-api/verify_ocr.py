"""一次性验证脚本：用测试题目跑通 Qwen-VL OCR。

两种模式：
  python verify_ocr.py            # 本地直连 Qwen-VL（中国大陆可用），最快验证 OCR 是否通
  python verify_ocr.py --live     # 打线上 Render 后端，验证部署后的全链路 + 图片云存储

需先在 .env 里填好 DASHSCOPE_API_KEY。验证通过后此文件可删。
"""
import io
import sys
import time

from PIL import Image, ImageDraw, ImageFont

LINES = [
    "【例2】在 △ABC 中，B = π/4，",
    "BC 边上的高等于 1/3 BC，则 cosA =",
    "",
    "A. 3√10/10      B. √10/10",
    "C. -√10/10      D. -3√10/10",
]


def make_image() -> bytes:
    img = Image.new("RGB", (900, 360), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 34)
    except Exception:
        font = ImageFont.load_default()
    y = 40
    for line in LINES:
        d.text((40, y), line, fill="black", font=font)
        y += 60
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def run_local():
    import asyncio
    from dotenv import load_dotenv
    load_dotenv()
    from app.services.vision_service import recognize_image, DASHSCOPE_API_KEY, VISION_MODEL

    if not DASHSCOPE_API_KEY:
        print("✗ .env 里 DASHSCOPE_API_KEY 还没填，去 bailian.console.aliyun.com 开通拿 key")
        return
    print(f"模型: {VISION_MODEL}")
    print("== 本地直连 Qwen-VL 识别测试题 ==")
    t = time.time()
    text = asyncio.run(recognize_image(make_image()))
    print(f"耗时 {time.time()-t:.1f}s\n--- OCR 识别文本 ---\n{text}")
    print("\n[OK] OCR 正常工作" if text.strip() else "\n[FAIL] 返回空")


def run_live():
    import httpx
    BASE = "https://ai-cuotiben.onrender.com"
    NICK, PASS = "ocrtest", "ocrtest-pass-2026"
    c = httpx.Client(timeout=120)
    print("== 唤醒后端（冷启动可能 ~50s）==")
    t = time.time()
    print("health", c.get(f"{BASE}/health").status_code, f"{time.time()-t:.1f}s")
    token = None
    for mode in ("login", "register"):
        r = c.post(f"{BASE}/api/auth/{mode}", json={"nickname": NICK, "passphrase": PASS})
        if r.status_code == 200:
            token = r.json()["data"]["token"]; print(f"{mode} ok"); break
    if not token:
        print("无法登录"); return
    print("== 上传题目图片做 OCR ==")
    t = time.time()
    r = c.post(
        f"{BASE}/api/upload/small",
        headers={"Authorization": f"Bearer {token}"},
        files={"ocr_image": ("q.jpg", make_image(), "image/jpeg")},
        data={"confirm_first": "true", "subject_id": "2"},
    )
    print(f"upload {r.status_code}  {time.time()-t:.1f}s")
    if r.status_code != 200:
        print("OCR 失败:", r.text[:500]); return
    data = r.json()["data"]
    print(f"\n--- OCR 识别文本 ---\n{data['ocr_text']}")
    print(f"\n--- 图片存储 URL ---\n{data['image_url']}")
    print("[OK] Cloudinary 云存储生效 → 跨设备可看"
          if data["image_url"].startswith("http")
          else "[FAIL] 本地存储 → 跨设备会失效，需在 Render 设 CLOUDINARY_URL")


if __name__ == "__main__":
    run_live() if "--live" in sys.argv else run_local()
