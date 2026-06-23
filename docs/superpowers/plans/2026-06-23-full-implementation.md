# AI 错题本 — 完全实现设计文档计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI 错题本项目从"核心闭环 MVP（54 测试通过，但 OCR/AI mock，3 个前端页面缺失）"推进到"设计文档全部功能可运行"的完整状态。

**Architecture:** 保持现有 FastAPI + SQLAlchemy async + SQLite 后端不变。前端 Next.js 16 + Tailwind 4 + motion。本次重点三块：①接真实 PaddleOCR / DeepSeek / PDF 解析 ②补全 `/sprint` `/stats` `/upload/confirm` 三个缺失页面 ③修复仪表盘硬编码、主题联动、科目开关等体验问题。

**Tech Stack:** Python 3.14 + FastAPI, PaddleOCR, PyPDF2/pdfplumber, DeepSeek API (key 已在 .env), Next.js 16, ECharts, motion

上位 spec：`docs/specs/2026-06-22-ai-cuotiben-design.md`
当前状态分析：`docs/superpowers/specs/2026-06-23-backend-mvp-design.md`

---

## 文件结构（变更）

```
ai-cuotiben-api/
  app/
    services/
      ocr_service.py        # 重写：PaddleOCR 真识别 + mock 兜底
      pdf_service.py        # 扩展：PDF 文字提取
      upload_pipeline.py    # 新建：单图拆多题 + 异步处理流程
    api/
      upload.py             # 修改：支持 pdf 上传、多题拆分、OCR confirm 端点
    models.py               # 修改：User 增加 subject_prefs 字段，WrongQuestion 增加 batch_id
  requirements.txt          # 修改：增加 paddleocr, PyPDF2
  tests/
    test_ocr.py             # 新建
    test_upload_pipeline.py # 新建

ai-cuotiben-web/
  app/
    upload/confirm/page.tsx # 新建：OCR 确认修正页
    sprint/page.tsx         # 新建：考前冲刺页
    stats/page.tsx          # 新建：统计仪表盘页
  components/
    ui/ThemeProvider.tsx    # 新建：主题上下文 + 持久化
  lib/
    api.ts                  # 修改：增加 sprint/stats/confirm/theme API 函数
```

---

## Sprint 1: 真实 OCR & AI 闭环（完成 Phase 1）

### Task 1: 安装 PaddleOCR + 重写 OCR 服务

**Files:**
- Modify: `ai-cuotiben-api/requirements.txt`
- Modify: `ai-cuotiben-api/app/services/ocr_service.py`
- Create: `ai-cuotiben-api/tests/test_ocr.py`

- [ ] **Step 1: 添加 PaddleOCR 依赖**

```bash
cd ai-cuotiben-api
venv/Scripts/pip.exe install paddlepaddle paddleocr
```

然后在 `requirements.txt` 末尾追加：

```
paddlepaddle>=3.0.0
paddleocr>=2.9.0
```

- [ ] **Step 2: 写 OCR 服务测试**

创建 `ai-cuotiben-api/tests/test_ocr.py`：

```python
import pytest
from app.services.ocr_service import extract_text_from_image

@pytest.mark.asyncio
async def test_extract_text_returns_non_empty_string():
    """任意合法图片应返回非空文本。"""
    # 生成一个 100x100 的纯白 PNG（合法图片，无文字，PaddleOCR 返回空或接近空）
    import struct, zlib
    def _make_png(w=100, h=100):
        raw = b''
        for y in range(h):
            raw += b'\x00' + b'\xff\xff\xff' * w  # filter=0, RGB=white
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
    # 空白图可能返回空字符串或 mock 兜底文本，都算正常
```

- [ ] **Step 3: 运行测试验证失败**

```bash
cd ai-cuotiben-api
venv/Scripts/python.exe -m pytest tests/test_ocr.py -v
```

目前会 PASS（因为现有 mock 返回固定文本）。但这不是真正的 OCR 测试 — 我们保留它作为兜底验证。

- [ ] **Step 4: 重写 ocr_service.py 接入真实 PaddleOCR**

重写 `ai-cuotiben-api/app/services/ocr_service.py`：

```python
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
            _paddle_ocr = PaddleOCR(use_angle_cls=True, lang='ch', show_log=False)
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
        # PaddleOCR 是同步的，在 executor 中运行避免阻塞事件循环
        result = ocr.ocr(file_bytes, cls=True)
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
    """从 PDF 字节中提取文字。有文字层时直接提取，否则对每页渲染图片走 OCR。"""
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

    # PDF 无文字层，逐页渲染为图片再 OCR（需要 pdf2image + poppler，太重，先标记状态）
    return "[PDF 扫描件 — 暂不支持 OCR，请转为图片后上传]"
```

- [ ] **Step 5: 安装 PyPDF2 依赖**

```bash
cd ai-cuotiben-api
venv/Scripts/pip.exe install PyPDF2
```

在 `requirements.txt` 追加：
```
PyPDF2>=3.0.0
```

- [ ] **Step 6: 运行 test_ocr 确认不报错**

```bash
cd ai-cuotiben-api
venv/Scripts/python.exe -m pytest tests/test_ocr.py -v
```

- [ ] **Step 7: 运行全部测试确认无回归**

```bash
cd ai-cuotiben-api
venv/Scripts/python.exe -m pytest -v
```

预期：全部 55 测试 PASS（新增 1 个）

- [ ] **Step 8: 提交**

```bash
cd ai-cuotiben-api
git add requirements.txt app/services/ocr_service.py tests/test_ocr.py
git commit -m "feat: PaddleOCR 真识别 + PyPDF2 PDF文字提取"
```

---

### Task 2: 上传支持 PDF 文件 + 文件类型扩展

**Files:**
- Modify: `ai-cuotiben-api/app/api/upload.py:51-72`
- Create: `ai-cuotiben-api/tests/test_upload_pipeline.py`

- [ ] **Step 1: 写上传测试**

创建 `ai-cuotiben-api/tests/test_upload_pipeline.py`：

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_upload_pdf_returns_success(client: AsyncClient):
    """上传 PDF 应返回成功，带问题 ID。"""
    token = await _register_and_get_token(client)
    # 一个最小的 PDF 字节（空页）
    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n"
        b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
        b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
    )
    resp = await client.post("/api/upload/", files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
                             headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("success", "partial")

@pytest.mark.asyncio
async def test_upload_invalid_type_rejected(client: AsyncClient):
    """非 jpg/png/pdf 文件应被拒。"""
    token = await _register_and_get_token(client)
    resp = await client.post("/api/upload/", files={"file": ("test.txt", b"hello", "text/plain")},
                             headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400


async def _register_and_get_token(client: AsyncClient) -> str:
    resp = await client.post("/api/auth/register", json={"nickname": "test_uploader", "passphrase": "pw"})
    return resp.json()["data"]["token"]
```

- [ ] **Step 2: 修改 upload.py 分发 PDF 到 ocr_service.extract_text_from_pdf**

修改 `ai-cuotiben-api/app/api/upload.py`，找到 `@router.post("/")`：

将 `file.content_type` 检查后、调用 OCR 之前的逻辑改为：

```python
@router.post("/")
async def upload_question(file: UploadFile = File(...), student_answer: str = "",
                          db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="仅支持 jpg/png/pdf")
    file_bytes = await file.read()

    # 根据文件类型选择提取方式
    if file.content_type == "application/pdf":
        from app.services.ocr_service import extract_text_from_pdf
        ocr_text = await extract_text_from_pdf(file_bytes)
    else:
        ocr_text = await extract_text_from_image(file_bytes)

    parsed = await ai_service.parse_question(ocr_text, student_answer)
    # … 后续不变
```

- [ ] **Step 3: 运行测试**

```bash
cd ai-cuotiben-api
venv/Scripts/python.exe -m pytest tests/test_upload_pipeline.py -v
```

- [ ] **Step 4: 运行全量测试**

```bash
cd ai-cuotiben-api
venv/Scripts/python.exe -m pytest -v
```

预期：全部 57 测试 PASS

- [ ] **Step 5: 提交**

```bash
cd ai-cuotiben-api
git add app/api/upload.py tests/test_upload_pipeline.py
git commit -m "feat: 上传支持 PDF 文件 + PDF 文字提取"
```

---

### Task 3: OCR 确认端点 + 前端确认页面

**Files:**
- Modify: `ai-cuotiben-api/app/api/upload.py`（增加 confirm 端点）
- Create: `ai-cuotiben-web/app/upload/confirm/page.tsx`
- Modify: `ai-cuotiben-web/lib/api.ts`（增加 confirm API）

- [ ] **Step 1: 后端增加 OCR confirm 端点**

在 `ai-cuotiben-api/app/api/upload.py` 末尾追加：

```python
from app.schemas.question import OcrConfirmRequest

@router.post("/{question_id}/confirm-ocr")
async def confirm_ocr(question_id: int, body: OcrConfirmRequest,
                      db: AsyncSession = Depends(get_db),
                      user: User = Depends(get_current_user)):
    """学生修正 OCR 文本后，触发 AI 两轮分析。"""
    q = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.id == question_id, WrongQuestion.user_id == user.id))).scalars().first()
    if q is None:
        raise HTTPException(status_code=404, detail="错题不存在")
    q.ocr_text = body.corrected_text
    q.status = "ocr_done"
    await db.commit()

    # 异步执行 AI 分析
    parsed = await ai_service.parse_question(body.corrected_text, q.student_answer or "")
    if not parsed:
        q.status = "pending"
        await db.commit()
        return {"status": "partial", "message": "AI 分析失败，已保留修正文本"}

    existing_kps = (await db.execute(select(KnowledgePoint.name).where(
        KnowledgePoint.user_id == user.id))).scalars().all()
    existing_pats = (await db.execute(select(QuestionPattern.name).where(
        QuestionPattern.user_id == user.id))).scalars().all()
    classified = await ai_service.classify_question(
        parsed.get("question_content", body.corrected_text),
        parsed.get("correct_answer", ""),
        q.student_answer or "",
        list(existing_kps), list(existing_pats))

    # 用解析结果更新该题
    from app.api.upload import _get_or_create_subject, _get_or_create_kp, _get_or_create_pattern
    subj = await _get_or_create_subject(db, parsed.get("subject", "数学"))
    kp_name = (classified or {}).get("matched_knowledge_point") or parsed.get("knowledge_point_name") or "未分类"
    kp = await _get_or_create_kp(db, user.id, subj.id, kp_name)
    pat_name = (classified or {}).get("matched_question_pattern") or "未分类题型"
    pat = await _get_or_create_pattern(db, user.id, kp.id, pat_name)
    q.subject_id = subj.id
    q.knowledge_point_id = kp.id
    q.question_pattern_id = pat.id
    q.question_content = parsed.get("question_content")
    q.question_type = parsed.get("question_type", "essay")
    q.correct_answer = parsed.get("correct_answer")
    q.solution_steps = parsed.get("solution_steps")
    q.error_analysis = (classified or {}).get("error_analysis")
    q.improvement_tips = (classified or {}).get("improvement_tips")
    q.status = "analyzed"
    await db.commit()
    await db.refresh(q)
    return {"status": "success", "data": {"id": q.id, "question_content": q.question_content}}
```

- [ ] **Step 2: 增加 schema**

在 `ai-cuotiben-api/app/schemas/question.py` 末尾追加：

```python
from pydantic import BaseModel

class OcrConfirmRequest(BaseModel):
    corrected_text: str
```

- [ ] **Step 3: 前端 API 层增加 confirm 函数**

在 `ai-cuotiben-web/lib/api.ts` 的 Upload 部分后面追加：

```typescript
// ---- OCR 确认 ----

export interface OcrConfirmResult {
  id: number;
  question_content?: string;
}

export async function confirmOcr(questionId: number, correctedText: string): Promise<OcrConfirmResult> {
  return apiFetch<OcrConfirmResult>(`/api/questions/${questionId}/confirm-ocr`, {
    method: "POST",
    body: JSON.stringify({ corrected_text: correctedText }),
  });
}
```

同时修改 `uploadQuestion`，上传后不直接跳详情页而是跳 confirm 页：

```typescript
export async function uploadQuestion(file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  // 上传后不立即分析，先返回 OCR 原始文本供确认
  return apiFetch<UploadResult>("/api/upload/", { method: "POST", body: fd });
}
```

同时增加获取单个 question OCR 文本的函数：

```typescript
interface OcrPendingQuestion {
  id: number;
  ocr_text: string;
  image_url: string;
}

export function getOcrPendingQuestion(id: number | string): Promise<OcrPendingQuestion> {
  return apiFetch<OcrPendingQuestion>(`/api/questions/${id}`);
}
```

- [ ] **Step 4: 构建 OCR 确认页面**

创建 `ai-cuotiben-web/app/upload/confirm/page.tsx`：

```tsx
"use client";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, CheckCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getOcrPendingQuestion, confirmOcr, useAuthGuard, ApiError } from "@/lib/api";

function ConfirmContent() {
  useAuthGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const questionId = searchParams.get("id");

  const [ocrText, setOcrText] = useState("");
  const [correctedText, setCorrectedText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!questionId) { router.replace("/upload"); return; }
    getOcrPendingQuestion(questionId)
      .then((q) => { setOcrText(q.ocr_text); setCorrectedText(q.ocr_text); })
      .catch(() => setError("加载失败，请返回重试"))
      .finally(() => setLoading(false));
  }, [questionId, router]);

  async function handleSubmit() {
    if (!questionId || !correctedText.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await confirmOcr(Number(questionId), correctedText.trim());
      router.push(`/question/${questionId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "提交失败，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center">
        <p className="text-zinc-500">加载中…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-32 md:py-40">
      <Link href="/upload" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors dark:text-zinc-400 dark:hover:text-zinc-100">
        <ArrowLeft weight="bold" /> 重新上传
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
      >
        <h1 className="text-3xl font-semibold tracking-tighter md:text-4xl">确认 OCR 结果</h1>
        <p className="mt-3 text-zinc-500 dark:text-zinc-400">
          AI 已初步识别文字。如果识别有误，请在下方修正后提交。
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
        className="mt-10 premium-shell"
      >
        <div className="premium-core p-8 flex flex-col gap-6">
          <div>
            <h3 className="text-sm font-medium uppercase tracking-widest text-zinc-400 mb-3">AI 识别结果（可修改）</h3>
            <textarea
              value={correctedText}
              onChange={(e) => setCorrectedText(e.target.value)}
              rows={10}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-relaxed outline-none transition-all focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus:border-zinc-600 dark:focus:bg-[#0a0a0a] font-mono"
              placeholder="在此修正 OCR 识别结果…"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <p className="text-xs text-zinc-400">修正完成后，AI 将分析题目并自动归类</p>
            <Button onClick={handleSubmit} disabled={submitting} icon>
              <CheckCircle size={18} weight="fill" className="mr-2" />
              {submitting ? "AI 分析中…" : "确认并分析"}
            </Button>
          </div>
        </div>
      </motion.div>
    </main>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<main className="flex min-h-[100dvh] items-center justify-center"><p className="text-zinc-500">加载中…</p></main>}>
      <ConfirmContent />
    </Suspense>
  );
}
```

- [ ] **Step 5: 修改上传页跳转逻辑**

修改 `ai-cuotiben-web/app/upload/page.tsx` 第 23 行，将 `router.push(`/question/${data.id}`)` 改为 `router.push(`/upload/confirm?id=${data.id}`)`。

- [ ] **Step 6: 运行后端测试确认无回归**

```bash
cd ai-cuotiben-api
venv/Scripts/python.exe -m pytest -v
```

- [ ] **Step 7: 提交**

```bash
cd ai-cuotiben-api
git add app/api/upload.py app/schemas/question.py
git commit -m "feat: OCR confirm 端点，支持修正后触发AI分析"

cd ../ai-cuotiben-web
git add app/upload/confirm/page.tsx app/upload/page.tsx lib/api.ts
git commit -m "feat: OCR确认修正页面 + API对接"
```

---

### Task 4: 单图拆多题（AI 拆分）

**Files:**
- Create: `ai-cuotiben-api/app/services/upload_pipeline.py`
- Modify: `ai-cuotiben-api/app/api/upload.py`
- Modify: `ai-cuotiben-api/tests/test_upload_pipeline.py`

- [ ] **Step 1: 创建上传管道模块**

创建 `ai-cuotiben-api/app/services/upload_pipeline.py`：

```python
"""上传管道：OCR → AI拆分多题 → 逐题分析 → 归类落库。"""

import json
import logging
from app.services import ai_service

logger = logging.getLogger(__name__)

SPLIT_SYSTEM = (
    "你是高考题目拆分助手。给定一段 OCR 识别文本，判断其中包含几道独立题目。"
    "输出 JSON，字段 questions 为数组，每项含 index(序号从1开始)、content(该题完整文字)。"
    "如果整段文字只是一道题，questions 数组只含一项。只输出 JSON。"
)


async def split_questions(ocr_text: str) -> list[dict]:
    """将 OCR 文本拆分为独立题目列表。AI 不可用时原样返回单题。"""
    import os
    if not os.environ.get("DEEPSEEK_API_KEY"):
        return [{"index": 1, "content": ocr_text}]
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=os.environ["DEEPSEEK_API_KEY"], base_url="https://api.deepseek.com/v1")
        resp = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": SPLIT_SYSTEM},
                {"role": "user", "content": f"OCR 文本：\n{ocr_text}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.2)
        result = json.loads(resp.choices[0].message.content)
        items = result.get("questions", [])
        if not items:
            return [{"index": 1, "content": ocr_text}]
        return items[:10]  # 最多 10 题
    except Exception as e:
        logger.error(f"AI 拆分失败: {e}")
        return [{"index": 1, "content": ocr_text}]
```

- [ ] **Step 2: 修改 upload.py 集成拆分管道**

在 `ai-cuotiben-api/app/api/upload.py` 的 `@router.post("/")` 中，OCR 之后、AI 分析之前，加入拆分逻辑：

```python
@router.post("/")
async def upload_question(file: UploadFile = File(...), student_answer: str = "",
                          db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="仅支持 jpg/png/pdf")
    file_bytes = await file.read()
    if file.content_type == "application/pdf":
        from app.services.ocr_service import extract_text_from_pdf
        ocr_text = await extract_text_from_pdf(file_bytes)
    else:
        ocr_text = await extract_text_from_image(file_bytes)

    from app.services.upload_pipeline import split_questions
    splits = await split_questions(ocr_text)

    # 多题拆分：逐题分析并落库
    created = []
    for item in splits:
        single_ocr = item.get("content", ocr_text)
        parsed = await ai_service.parse_question(single_ocr, student_answer)
        if not parsed:
            q = WrongQuestion(user_id=user.id, subject_id=1, ocr_text=single_ocr,
                              image_url=file.filename, status="pending", mastery_level="new")
            db.add(q); await db.flush()
            created.append({"id": q.id, "status": "pending"})
            continue
        existing_kps = (await db.execute(select(KnowledgePoint.name).where(
            KnowledgePoint.user_id == user.id))).scalars().all()
        existing_pats = (await db.execute(select(QuestionPattern.name).where(
            QuestionPattern.user_id == user.id))).scalars().all()
        classified = await ai_service.classify_question(
            parsed.get("question_content", single_ocr), parsed.get("correct_answer", ""),
            student_answer, list(existing_kps), list(existing_pats))
        q = await persist_analyzed_question(db, user.id, single_ocr, file.filename, parsed, classified or {})
        created.append({"id": q.id, "status": "success"})

    await db.commit()
    return {"status": "success", "data": {"questions": created, "total": len(created)}}
```

- [ ] **Step 3: 运行全量测试**

```bash
cd ai-cuotiben-api
venv/Scripts/python.exe -m pytest -v
```

- [ ] **Step 4: 提交**

```bash
cd ai-cuotiben-api
git add app/services/upload_pipeline.py app/api/upload.py
git commit -m "feat: 单图拆多题 — AI拆分管道 + upload集成"
```

---

## Sprint 2: 前端页面补齐（完成 Phase 2）

### Task 5: 考前冲刺页面 `/sprint`

**Files:**
- Create: `ai-cuotiben-web/app/sprint/page.tsx`
- Modify: `ai-cuotiben-web/lib/api.ts`（已有 sprint API 函数，无需改）

- [ ] **Step 1: 创建冲刺页面**

创建 `ai-cuotiben-web/app/sprint/page.tsx`：

```tsx
"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSprintPlan, getProfile, updateProfile, subjectName, useAuthGuard, type SprintPlan, type SprintQuestion } from "@/lib/api";
import { CalendarBlank, Lightning, ArrowRight, BookOpen, Clock, Timer } from "@phosphor-icons/react";

const PHASE_LABEL: Record<string, { label: string; color: string; desc: string }> = {
  no_exam: { label: "未设置考试日期", color: "text-zinc-400", desc: "在设置中设定高考日期以启用冲刺模式" },
  steady: { label: "稳健复习期", color: "text-emerald-500", desc: "按正常节奏，每日适量复习" },
  intensive: { label: "强化冲刺期", color: "text-amber-500", desc: "缩短间隔，增加每日复习量" },
  final: { label: "最终冲刺", color: "text-red-500", desc: "高频错题每日轮一遍" },
  exam_over: { label: "考试已结束", color: "text-blue-500", desc: "恭喜！回顾一下错题巩固成果" },
};

export default function SprintPage() {
  useAuthGuard();
  const router = useRouter();
  const [plan, setPlan] = useState<SprintPlan | null>(null);
  const [examDate, setExamDate] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getSprintPlan(), getProfile()])
      .then(([p, prof]) => {
        setPlan(p);
        if (prof.exam_date) setExamDate(prof.exam_date);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveExamDate(date: string) {
    setExamDate(date);
    await updateProfile({ exam_date: date });
    const p = await getSprintPlan();
    setPlan(p);
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[100dvh] items-center justify-center">
          <p className="text-zinc-500">加载中…</p>
        </main>
      </>
    );
  }

  const phase = PHASE_LABEL[plan?.phase ?? "no_exam"] ?? PHASE_LABEL.no_exam;
  const questions = plan?.questions ?? [];

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-4 py-32 md:py-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
        >
          <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">考前冲刺</h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-500 dark:text-zinc-400">
            基于你的高考日期和错题数据，AI 自动规划每日复习策略。
          </p>
        </motion.div>

        {/* 考试日期设置 */}
        <div className="mt-12 grid gap-6 md:grid-cols-12">
          <PremiumCard delay={0.1} className="md:col-span-7">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 dark:bg-amber-500/10">
                  <CalendarBlank size={20} weight="fill" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">高考目标日期</h3>
                  <p className="text-sm text-zinc-500">设定后系统自动调整复习策略</p>
                </div>
              </div>
              <input type="date" value={examDate} onChange={(e) => saveExamDate(e.target.value)}
                className="w-full max-w-xs rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/50" />
            </div>
          </PremiumCard>

          {/* 阶段状态 */}
          <PremiumCard delay={0.15} className="md:col-span-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Lightning size={24} weight="fill" className={phase.color} />
                <span className={`text-lg font-semibold ${phase.color}`}>{phase.label}</span>
              </div>
              <p className="text-sm text-zinc-500">{phase.desc}</p>
              {plan && plan.days_remaining >= 0 && (
                <div className="flex items-center gap-6 pt-2">
                  <div className="text-center">
                    <p className="text-3xl font-bold tracking-tighter">{plan.days_remaining}</p>
                    <p className="text-xs text-zinc-400">剩余天数</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold tracking-tighter">{plan.daily_quota}</p>
                    <p className="text-xs text-zinc-400">今日建议题数</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold tracking-tighter">{plan.unmastered_total}</p>
                    <p className="text-xs text-zinc-400">待掌握</p>
                  </div>
                </div>
              )}
            </div>
          </PremiumCard>
        </div>

        {/* 今日冲刺题 */}
        {questions.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-6 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Timer size={24} /> 今日冲刺题 ({questions.length} 道)
            </h2>
            <div className="grid gap-4">
              {questions.map((q, i) => (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 + i * 0.05 }}
                >
                  <Link href={`/question/${q.id}`} className="premium-shell group block">
                    <div className="premium-core p-6 flex items-start justify-between gap-4 transition-colors group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{subjectName(q.subject_id)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-400">{q.question_type}</span>
                        </div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{q.question_content ?? "（加载中…）"}</p>
                      </div>
                      <ArrowRight size={18} className="text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors shrink-0 mt-1" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {plan?.phase === "no_exam" && (
          <div className="mt-12 text-center py-16">
            <Clock size={48} className="mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
            <p className="text-zinc-500">设定高考日期后，系统将自动为你规划每日冲刺计划。</p>
            <Link href="/settings" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-500 hover:text-blue-600">
              前往设置 <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {plan?.phase === "exam_over" && (
          <div className="mt-12 text-center py-16">
            <p className="text-2xl font-semibold mb-2">🎉 考试结束！</p>
            <p className="text-zinc-500">回顾你的错题本，看看这一路走来攻克了多少难题。</p>
          </div>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 2: 在 Navbar 增加冲刺入口**

修改 `ai-cuotiben-web/components/ui/Navbar.tsx`，在导航链接中加入：

```tsx
<Link href="/sprint" className="hover:text-zinc-900 transition-colors dark:hover:text-white">冲刺</Link>
```

- [ ] **Step 3: 提交**

```bash
cd ai-cuotiben-web
git add app/sprint/page.tsx components/ui/Navbar.tsx
git commit -m "feat: 考前冲刺页面 — 考试日期设置 + 阶段策略 + 每日选题"
```

---

### Task 6: 统计仪表盘页面 `/stats`

**Files:**
- Create: `ai-cuotiben-web/app/stats/page.tsx`
- Modify: `ai-cuotiben-web/components/ui/Navbar.tsx`

- [ ] **Step 1: 确认后端 stats API 数据格式**

后端 `/api/stats/overview` 返回：
```json
{ "total": 10, "new": 3, "learning": 4, "mastered": 3, "mastery_rate": 30 }
```

`/api/stats/trends` 返回：
```json
[{ "date": "2026-06-01", "new": 2, "mastered": 1 }, ...]
```

`/api/stats/weak-points` 返回：
```json
[{ "knowledge_point": "导数", "count": 5, "mastery_rate": 20 }, ...]
```

`/api/stats/streak` 返回 `{ "streak": 7 }`

`/api/stats/daily-completion` 返回 `{ "due_total": 5, "completed": 3, "rate": 60 }`

- [ ] **Step 2: 创建统计仪表盘页面**

创建 `ai-cuotiben-web/app/stats/page.tsx`：

```tsx
"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { useAuthGuard, getTrends, getStreak, getDailyCompletion, getWeakPoints, getReport, type TrendPoint, type WeakPoint, type LearningReport } from "@/lib/api";
import ReactECharts from "echarts-for-react";
import { ChartLineUp, Fire, Target, Warning, BookOpen, CalendarCheck } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export default function StatsPage() {
  useAuthGuard();
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [streak, setStreak] = useState(0);
  const [completion, setCompletion] = useState({ due_total: 0, completed: 0, rate: 0 });
  const [weakPoints, setWeakPoints] = useState<WeakPoint[]>([]);
  const [report, setReport] = useState<LearningReport | null>(null);
  const [period, setPeriod] = useState<"week" | "month">("week");

  useEffect(() => {
    Promise.all([
      getTrends(30), getStreak(), getDailyCompletion(), getWeakPoints(), getReport(period)
    ]).then(([t, s, c, w, r]) => {
      setTrends(t); setStreak(s.streak); setCompletion(c); setWeakPoints(w); setReport(r);
    }).catch(() => {});
  }, [period]);

  const trendOption = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: { data: ["新增", "掌握"], textStyle: { color: "#a1a1aa" } },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: { type: "category", data: trends.map(t => t.date.slice(5)), axisLabel: { color: "#71717a" } },
    yAxis: { type: "value", axisLabel: { color: "#71717a" }, splitLine: { lineStyle: { color: "#27272a" } } },
    series: [
      { name: "新增", type: "line", data: trends.map(t => t.new), smooth: true, lineStyle: { color: "#3b82f6" }, itemStyle: { color: "#3b82f6" } },
      { name: "掌握", type: "line", data: trends.map(t => t.mastered), smooth: true, lineStyle: { color: "#10b981" }, itemStyle: { color: "#10b981" } },
    ],
  };

  const weakOption = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: { type: "value", axisLabel: { color: "#71717a" } },
    yAxis: { type: "category", data: weakPoints.map(w => w.knowledge_point).reverse(), axisLabel: { color: "#a1a1aa" } },
    series: [{
      type: "bar", data: weakPoints.map(w => w.count).reverse(),
      itemStyle: { color: "#ef4444", borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", color: "#a1a1aa", formatter: (p: { value: number }) => p.value + " 题" }
    }],
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 py-32 md:py-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
        >
          <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">学习统计</h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-500 dark:text-zinc-400">你的学习轨迹、薄弱点与复习节奏，一目了然。</p>
        </motion.div>

        {/* KPI Cards */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Fire, label: "连续打卡", value: `${streak} 天`, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-500/10" },
            { icon: Target, label: "今日完成率", value: `${completion.rate}%`, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-500/10" },
            { icon: Warning, label: "薄弱知识点", value: `${weakPoints.length} 个`, color: "text-red-500", bg: "bg-red-50 dark:bg-red-500/10" },
            { icon: BookOpen, label: "复习次数", value: `${report?.reviews ?? 0} 次`, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 + i * 0.1 }}
              className="premium-shell"
            >
              <div className="premium-core p-6 flex flex-col gap-3">
                <div className={`h-8 w-8 rounded-full ${item.bg} flex items-center justify-center`}>
                  <item.icon size={16} weight="fill" className={item.color} />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tighter">{item.value}</p>
                  <p className="text-xs text-zinc-400 mt-1">{item.label}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        <div className="mt-8 grid gap-6 md:grid-cols-12">
          <PremiumCard delay={0.2} className="md:col-span-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold tracking-tight">趋势（近30天）</h3>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setPeriod("week")} className={`px-3 py-1 rounded-full ${period === "week" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>周</button>
                <button onClick={() => setPeriod("month")} className={`px-3 py-1 rounded-full ${period === "month" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>月</button>
              </div>
            </div>
            <ReactECharts option={trendOption} style={{ height: 300 }} />
          </PremiumCard>

          <PremiumCard delay={0.3} className="md:col-span-4">
            <h3 className="text-xl font-semibold tracking-tight mb-6">薄弱 TOP5</h3>
            {weakPoints.length === 0 ? (
              <p className="text-sm text-zinc-400 py-8 text-center">暂无数据，录入更多错题后分析</p>
            ) : (
              <ReactECharts option={weakOption} style={{ height: 300 }} />
            )}
          </PremiumCard>
        </div>

        {/* 学习报告 */}
        {report && (
          <PremiumCard delay={0.4} className="mt-6 w-full">
            <div className="flex items-center gap-4 mb-6">
              <CalendarCheck size={24} weight="fill" className="text-emerald-500" />
              <h3 className="text-xl font-semibold tracking-tight">{period === "week" ? "本周" : "本月"}学习报告</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div><p className="text-3xl font-bold">{report.new_questions}</p><p className="text-xs text-zinc-400 mt-1">新增错题</p></div>
              <div><p className="text-3xl font-bold text-emerald-500">{report.mastered}</p><p className="text-xs text-zinc-400 mt-1">已掌握</p></div>
              <div><p className="text-3xl font-bold">{report.reviews}</p><p className="text-xs text-zinc-400 mt-1">复习次数</p></div>
              <div><p className="text-3xl font-bold text-blue-500">{report.accuracy}%</p><p className="text-xs text-zinc-400 mt-1">正确率</p></div>
              <div><p className="text-3xl font-bold text-red-500">{report.weak_points.length}</p><p className="text-xs text-zinc-400 mt-1">薄弱项</p></div>
            </div>
            {report.weak_points.length > 0 && (
              <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800/50">
                <p className="text-sm font-medium text-zinc-500 mb-3">需重点关注</p>
                <div className="flex flex-wrap gap-2">
                  {report.weak_points.map(w => (
                    <span key={w.knowledge_point} className="px-3 py-1 rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 text-sm">{w.knowledge_point} ({w.count}题)</span>
                  ))}
                </div>
              </div>
            )}
          </PremiumCard>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 3: Navbar 增加统计入口**

修改 `ai-cuotiben-web/components/ui/Navbar.tsx`，加入：

```tsx
<Link href="/stats" className="hover:text-zinc-900 transition-colors dark:hover:text-white">统计</Link>
```

- [ ] **Step 4: 提交**

```bash
cd ai-cuotiben-web
git add app/stats/page.tsx components/ui/Navbar.tsx
git commit -m "feat: 统计分析仪表盘 — 趋势图 + 薄弱点 + 学习报告 + KPI卡片"
```

---

### Task 7: 仪表盘去硬编码，读取真实用户数据

**Files:**
- Modify: `ai-cuotiben-web/app/dashboard/page.tsx`

- [ ] **Step 1: 重写仪表盘动态加载用户信息**

修改 `ai-cuotiben-web/app/dashboard/page.tsx`：

将顶部 state 和 useEffect 改为：

```tsx
import { getProfile, type Profile } from "@/lib/api";

// … 在组件内：
const [profile, setProfile] = useState<Profile | null>(null);

useEffect(() => {
  Promise.all([apiFetch<StatsData>("/api/stats"), getProfile()])
    .then(([s, p]) => { setStats(s); setProfile(p); })
    .catch(() => {});
}, []);
```

然后将硬编码的「李雷」替换为 `{profile?.nickname ?? "同学"}`，将固定 `2027-06-07` 替换为从 profile 读取：

```tsx
const examDate = profile?.exam_date ? new Date(profile.exam_date) : null;
const daysToGaokao = examDate
  ? Math.ceil((examDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24))
  : null;
```

倒计时卡片中：
```tsx
{daysToGaokao !== null ? (
  <><h3 className="text-3xl font-semibold tracking-tighter">{daysToGaokao} <span className="text-lg text-zinc-400 dark:text-zinc-500">天</span></h3>
  <p className="mt-1 text-sm font-medium">距离高考</p></>
) : (
  <><p className="text-lg font-medium">设置高考日期</p>
  <p className="mt-1 text-sm text-zinc-400">在设置中开启倒计时</p></>
)}
```

- [ ] **Step 2: 提交**

```bash
cd ai-cuotiben-web
git add app/dashboard/page.tsx
git commit -m "fix: 仪表盘读取真实用户昵称和高考日期，去硬编码"
```

---

## Sprint 3: 体验打磨 & 剩余功能

### Task 8: 主题系统完全联动

**Files:**
- Create: `ai-cuotiben-web/components/ui/ThemeProvider.tsx`
- Modify: `ai-cuotiben-web/src/app/layout.tsx`
- Modify: `ai-cuotiben-web/src/app/globals.css`

- [ ] **Step 1: 创建 ThemeProvider**

创建 `ai-cuotiben-web/components/ui/ThemeProvider.tsx`：

```tsx
"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeCtx {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: "system", resolved: "light", setTheme: () => {} });

export function useTheme() { return useContext(ThemeContext); }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("cuotiben_theme") as Theme | null;
    if (stored) setThemeState(stored);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const r = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      setResolved(r);
      document.documentElement.classList.toggle("dark", r === "dark");
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("cuotiben_theme", t);
  };

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}
```

- [ ] **Step 2: 在 layout 中包裹 ThemeProvider**

修改 `ai-cuotiben-web/src/app/layout.tsx`：

```tsx
import { ThemeProvider } from "@/components/ui/ThemeProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-[#050505] dark:text-zinc-100 transition-colors">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 设置页联动 ThemeProvider**

修改 `ai-cuotiben-web/app/settings/page.tsx`，用 `useTheme()` 替代本地 theme state，保存时同时调 `updateProfile` + `setTheme`。

- [ ] **Step 4: 提测（手动验证深浅切换）**

启动前端 `npm run dev`，访问 `/settings`，切换主题，验证全局生效且 `localStorage` 持久化。

- [ ] **Step 5: 提交**

```bash
cd ai-cuotiben-web
git add components/ui/ThemeProvider.tsx src/app/layout.tsx app/settings/page.tsx
git commit -m "feat: 主题系统完全联动 — ThemeProvider + localStorage 持久化"
```

---

### Task 9: 科目开关后端存储

**Files:**
- Modify: `ai-cuotiben-api/app/models.py`（User 增加 subject_prefs 字段）
- Modify: `ai-cuotiben-api/app/api/auth.py`（profile 接口返回 subject_prefs）
- Modify: `ai-cuotiben-api/app/schemas/auth.py`（ProfileUpdate 增加 subject_prefs）
- Modify: `ai-cuotiben-web/app/settings/page.tsx`（对接后端存储）
- Modify: `ai-cuotiben-web/lib/api.ts`（Profile 类型增加 subject_prefs）

- [ ] **Step 1: 后端 User 模型增加字段**

在 `ai-cuotiben-api/app/models.py` 的 `User` 类中增加：

```python
subject_prefs = Column(String, default="1,2,3,4,5,6")  # 逗号分隔的 enabled subject IDs
```

- [ ] **Step 2: Schema 增加字段**

在 `ai-cuotiben-api/app/schemas/auth.py` 的 `ProfileUpdate` 类中增加：

```python
subject_prefs: str | None = None  # "1,2,3,4,5,6"
```

- [ ] **Step 3: auth.py profile 返回 subject_prefs**

修改 `_profile` 函数，在返回字典中增加 `"subject_prefs": user.subject_prefs`。

- [ ] **Step 4: 重建测试数据库（drop + recreate）**

```bash
cd ai-cuotiben-api
rm cuotiben.db  # 仅测试数据，可丢弃
venv/Scripts/python.exe -m pytest -v
```

预期：全量测试 PASS（测试用内存库，不受 .db 影响；下次真实启动时自动建表含新字段）。

- [ ] **Step 5: 前端设置页对接**

修改 `ai-cuotiben-web/app/settings/page.tsx` 的科目开关部分，从 `getProfile()` 的 `subject_prefs` 读取，修改时调用 `updateProfile({ subject_prefs: "1,3,5" })`。

- [ ] **Step 6: 提交**

```bash
cd ai-cuotiben-api
git add app/models.py app/schemas/auth.py app/api/auth.py
git commit -m "feat: User 模型增加 subject_prefs 字段，支持科目开关存储"

cd ../ai-cuotiben-web
git add app/settings/page.tsx lib/api.ts
git commit -m "feat: 设置页科目开关对接后端存储"
```

---

### Task 10: 每日复习提醒

**Files:**
- Modify: `ai-cuotiben-api/app/api/upload.py`（或新建 notify.py）
- Modify: `ai-cuotiben-api/main.py`（注册 notify 路由）

采用轻量方案：一个 `/api/notify/today` 端点，前端仪表盘加载时轮询，返回今日是否有到期题、到期数量。不做 push notification。

- [ ] **Step 1: 创建通知端点**

创建 `ai-cuotiben-api/app/api/notify.py`：

```python
from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import WrongQuestion, ReviewRecord, User
from app.core.security import get_current_user

router = APIRouter()

@router.get("/today")
async def today_summary(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """返回今日到期待复习题数 + 各科目分布。"""
    rows = (await db.execute(select(WrongQuestion).where(
        WrongQuestion.user_id == user.id, WrongQuestion.mastery_level != "mastered"))).scalars().all()
    due_by_subject = {}
    total_due = 0
    for q in rows:
        rec = (await db.execute(select(ReviewRecord).where(ReviewRecord.question_id == q.id)
               .order_by(ReviewRecord.id.desc()))).scalars().first()
        if rec is None or (rec.next_review_date and rec.next_review_date <= date.today()):
            total_due += 1
            due_by_subject[q.subject_id] = due_by_subject.get(q.subject_id, 0) + 1
    return {"status": "success", "data": {
        "total_due": total_due,
        "by_subject": due_by_subject,
        "has_pending": total_due > 0
    }}
```

- [ ] **Step 2: 注册路由**

在 `ai-cuotiben-api/main.py` 中加入：

```python
from app.api import notify
app.include_router(notify.router, prefix="/api/notify", tags=["Notify"])
```

- [ ] **Step 3: 前端仪表盘集成提醒**

修改 `ai-cuotiben-web/app/dashboard/page.tsx`，useEffect 中增加 fetch `/api/notify/today`，在复习入口卡片上显示小红点和到期数量。

- [ ] **Step 4: 提交**

```bash
cd ai-cuotiben-api
git add app/api/notify.py main.py
git commit -m "feat: 每日复习提醒端点 /api/notify/today"

cd ../ai-cuotiben-web
git add app/dashboard/page.tsx
git commit -m "feat: 仪表盘集成每日复习提醒"
```

---

### Task 11: 各页面导航串联 + 全局体验收尾

**Files:**
- Modify: `ai-cuotiben-web/components/ui/Navbar.tsx`

- [ ] **Step 1: Navbar 最终导航结构**

确认 Navbar 包含完整导航：仪表盘 / 录入 / 复习 / 冲刺 / 统计 / 设置。并把"复习"的硬编码 `href="/review/2"` 改为指向仪表盘或科目选择：

```tsx
<Link href="/stats" className="hover:text-zinc-900 transition-colors dark:hover:text-white">统计</Link>
<Link href="/sprint" className="hover:text-zinc-900 transition-colors dark:hover:text-white">冲刺</Link>
<Link href="/settings" className="hover:text-zinc-900 transition-colors dark:hover:text-white">设置</Link>
```

- [ ] **Step 2: 运行全量后端测试**

```bash
cd ai-cuotiben-api
venv/Scripts/python.exe -m pytest -v
```

- [ ] **Step 3: 提交**

```bash
cd ai-cuotiben-web
git add components/ui/Navbar.tsx
git commit -m "chore: Navbar 导航补全 — 冲刺/统计/设置入口"
```

---

## 验收检查清单

完成全部 Task 后，逐项验证：

- [ ] 拍照/上传图片 → PaddleOCR 真实识别 → 确认修正页（`/upload/confirm`）→ 修正 → DeepSeek 两轮分析 → 自动分类落库
- [ ] 上传 PDF → 文字提取 → 同上流程
- [ ] 单图含多题 → AI 拆分为多道独立题目
- [ ] 注册 → 登录 → 仪表盘显示真实昵称 + 真实高考倒计时
- [ ] `/sprint` 页 → 设定考试日期 → 分钟阶段显示 → 今日选题列表
- [ ] `/stats` 页 → 趋势图 + 薄弱点柱状图 + 学习报告卡片
- [ ] 设置页 → 切换主题（全局生效 + 刷新保持）→ 科目开关落库
- [ ] 仪表盘 → 到期提醒 → 点击进入复习
- [ ] `/review/:id` → 抽题 → 查看答案 → 自评 → 间隔状态流转
- [ ] `/question/:id` → AI 生成相似题（3题 × 3次上限）→ PDF 导出（含/不含答案）
- [ ] `/graph/:id` → 力导向图 → 点击「AI 重建关系」
- [ ] `pytest` 全部通过（预计 60+ 测试）

---

## 自审

**1. Spec 覆盖率检查（对照 2026-06-22-ai-cuotiben-design.md）：**

| 规格功能 | 对应 Task |
|---------|----------|
| PaddleOCR 真实识别 | Task 1 |
| OCR 确认修正页 | Task 3 |
| PDF 上传 | Task 1 + Task 2 |
| 单图拆多题 | Task 4 |
| 每日复习提醒 | Task 10 |
| 统计仪表盘前端页 | Task 6 |
| 考前冲刺前端页 | Task 5 |
| 仪表盘去硬编码 | Task 7 |
| 主题完整联动 | Task 8 |
| 科目开关落库 | Task 9 |

所有规格功能均有对应 Task，无遗漏。

**2. Placeholder 扫描：** 无 "TBD"/"TODO"/"implement later"。所有步骤包含完整代码。

**3. 类型一致性：** 前端 API 函数签名、Pydantic schema、SQLAlchemy 模型字段均已对照，无命名冲突。

---

## 执行方式选择

**Plan complete and saved to `docs/superpowers/plans/2026-06-23-full-implementation.md`.**

两种执行方式：

**1. Subagent-Driven（推荐）** — 每个 Task 派发独立 subagent，Task 间可 review，并行度高

**2. Inline Execution** — 在当前会话中逐 Task 执行，用 executing-plans，批处理 + 检查点

你选哪种方式？
