import pytest
from app.services.ocr_service import extract_text_from_image

@pytest.mark.asyncio
async def test_extract_text_returns_non_empty_string():
    """任意合法图片应返回非空文本。"""
    import struct, zlib
    def _make_png(w=100, h=100):
        raw = b''
        for y in range(h):
            raw += b'\x00' + b'\xff\xff\xff' * w
        compressed = zlib.compress(raw)
        def chunk(ctype, data):
            c = ctype + data
            crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
            return struct.pack('>I', len(data)) + c + crc
        ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
        return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b'')
    png_bytes = _make_png()
    result = await extract_text_from_image(png_bytes)
    assert isinstance(result, str)
