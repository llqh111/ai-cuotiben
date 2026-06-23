# OCR 修正确认页 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在上传流程中插入 OCR 修正确认步骤，让学生可以在 AI 分析前修正识别错误。

**Architecture:** 后端 `/upload/small` 新增 `confirm_first` 参数控制是否跳过 DeepSeek 直通，新增 `/upload/confirm` 端点接收修正文本后执行分析。前端新增 `/upload/confirm` 页面提供文本框修正。

**Tech Stack:** Python FastAPI + Next.js 16 + Tailwind CSS

上位 spec：`docs/superpowers/specs/2026-06-23-ocr-confirm-design.md`

---

## 文件结构（变更）

```
ai-cuotiben-api/
  app/api/upload.py              # 修改：/small 加 confirm_first 参数 + 新增 /confirm 端点
  tests/test_upload_confirm.py   # 新建：确认流程测试

ai-cuotiben-web/
  app/upload/confirm/page.tsx    # 新建：OCR 修正确认页
  app/upload/page.tsx            # 修改：加确认模式勾选，上传后跳转确认页
  lib/api.ts                     # 修改：加 confirmUpload 函数
```

---

### Task 1: 后端 — `/upload/small` 加 `confirm_first` 参数

**Files:**
- Modify: `ai-cuotiben-api/app/api/upload.py`

- [ ] **Step 1: 在 `/upload/small` 加 `confirm_first` 参数**

在 `upload_small` 函数签名中新增参数：
```python
confirm_first: bool = Form(False),
```

在 Gemini OCR 之后、`_analyze_pipeline` 之前插入分支：

```python
    # Gemini OCR 识别
    ocr_text = await recognize_image(ocr_bytes)

    # confirm_first 模式：只返回 OCR 文本，不分析
    if confirm_first:
        return {
            "status": "ocr_done",
            "data": {
                "ocr_text": ocr_text,
                "image_url": image_url,
                "student_answer": student_answer,
                "subject_id": subject_id,
            },
        }

    # 现有直通流程
    created = await _analyze_pipeline(db, user.id, ocr_text, image_url, student_answer, subject_id)
```

注意：需要把 `image_url` 变量提升到 `confirm_first` 分支之前就能访问。（当前 `image_url = display_url or ocr_url` 在 Gemini OCR 之前定义，OK。）

- [ ] **Step 2: 验证现有直通模式不受影响**

```bash
cd ai-cuotiben-api
$PY -m pytest tests/test_upload_pipeline.py -v -k "test" --timeout=60
```

预期：现有测试全绿。

---

### Task 2: 后端 — 新增 `POST /api/upload/confirm` 端点

**Files:**
- Modify: `ai-cuotiben-api/app/api/upload.py`

- [ ] **Step 1: 新增 confirm 端点**

在 `upload.py` 末尾添加：

```python
from pydantic import BaseModel

class ConfirmRequest(BaseModel):
    ocr_text: str
    image_url: str = ""
    student_answer: str = ""
    subject_id: int

@router.post("/confirm")
async def upload_confirm(
    body: ConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """接收学生修正后的 OCR 文本，执行 DeepSeek 分析并落库。"""
    if not body.ocr_text.strip():
        raise HTTPException(400, "OCR 文本不能为空")

    created = await _analyze_pipeline(
        db, user.id, body.ocr_text, body.image_url, body.student_answer, body.subject_id
    )

    return {
        "status": "success",
        "data": {
            "questions": created,
            "total": len(created),
        },
    }
```

- [ ] **Step 2: 验证端点可访问**

```bash
# 先起服务（后台）
cd ai-cuotiben-api && $PY -m uvicorn main:app --port 8000 &
sleep 3

# 登录
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -d "nickname=test&passphrase=test123" | $PY -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

# 上传图片走 confirm_first
curl -s -X POST "http://localhost:8000/api/upload/small" \
  -H "Authorization: Bearer $TOKEN" \
  -F "ocr_image=@test_image.jpg" \
  -F "confirm_first=true" | $PY -m json.tool

# 预期：status=ocr_done，包含 ocr_text
```

---

### Task 3: 后端测试

**Files:**
- Create: `ai-cuotiben-api/tests/test_upload_confirm.py`

- [ ] **Step 1: 写测试**

```python
import pytest
from httpx import AsyncClient, ASGITransport
from main import app

@pytest.fixture
async def client(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

@pytest.mark.asyncio
async def test_confirm_first_returns_ocr_text(client, db_session):
    """confirm_first=true 应返回 ocr_done 状态和 OCR 文本。"""
    # 先注册
    resp = await client.post("/api/auth/register", json={"nickname": "ocr-test", "passphrase": "pass123"})
    token = resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 生成一张简单测试图片
    from PIL import Image
    import io
    img = Image.new("RGB", (100, 100), color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    resp = await client.post(
        "/api/upload/small",
        files={"ocr_image": ("test.png", buf, "image/png")},
        data={"confirm_first": "true", "subject_id": "1"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ocr_done"
    assert "ocr_text" in data["data"]
    assert data["data"]["subject_id"] == 1

@pytest.mark.asyncio
async def test_confirm_endpoint_analyzes(client, db_session):
    """POST /api/upload/confirm 应执行分析并返回结果。"""
    resp = await client.post("/api/auth/register", json={"nickname": "confirm-test", "passphrase": "pass123"})
    token = resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/upload/confirm",
        json={
            "ocr_text": "已知函数 f(x)=x²-3x+2，求 f(x) 的单调递增区间。",
            "image_url": "/api/images/test.jpg",
            "student_answer": "(-∞, 1.5)",
            "subject_id": 1,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert len(data["data"]["questions"]) >= 1

@pytest.mark.asyncio
async def test_confirm_rejects_empty_text(client, db_session):
    """空 OCR 文本应返回 400。"""
    resp = await client.post("/api/auth/register", json={"nickname": "empty-test", "passphrase": "pass123"})
    token = resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/upload/confirm",
        json={"ocr_text": "   ", "image_url": "", "student_answer": "", "subject_id": 1},
        headers=headers,
    )
    assert resp.status_code == 400
```

- [ ] **Step 2: 运行测试**

```bash
cd ai-cuotiben-api
$PY -m pytest tests/test_upload_confirm.py -v --timeout=60
```

预期：3 个测试通过。

---

### Task 4: 前端 — `lib/api.ts` 更新

**Files:**
- Modify: `ai-cuotiben-web/lib/api.ts`

- [ ] **Step 1: 修改 `uploadSmallQuestion` 支持 `confirmFirst`**

找到现有的 `uploadSmallQuestion` 函数（约第 106 行），加上 `confirmFirst` 参数：

```typescript
// 小题上传：OCR图(必传) + 展示配图(可选)，Gemini 自动 OCR
export async function uploadSmallQuestion(
  ocrImage: File,
  displayImage: File | null,
  subjectId?: number,
  confirmFirst = false,
): Promise<UploadResult | OcrDoneResult> {
  const fd = new FormData();
  fd.append("ocr_image", ocrImage);
  if (displayImage) fd.append("display_image", displayImage);
  if (subjectId != null) fd.append("subject_id", String(subjectId));
  fd.append("confirm_first", String(confirmFirst));
  return apiFetch<UploadResult | OcrDoneResult>("/api/upload/small", { method: "POST", body: fd });
}
```

同时在 `UploadResult` interface 之后添加新类型：

```typescript
export interface OcrDoneResult {
  ocr_text: string;
  image_url: string;
  student_answer: string;
  subject_id: number;
}
```

- [ ] **Step 2: 添加 `confirmUpload` 函数**

在 `-- 上传 --` 区块末尾（`uploadText` 之后）添加：

```typescript
// OCR 确认后提交修正文本，触发 DeepSeek 分析
export function confirmUpload(body: {
  ocr_text: string;
  image_url: string;
  student_answer: string;
  subject_id: number;
}): Promise<UploadResult> {
  return apiFetch<UploadResult>("/api/upload/confirm", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 3: 确认 TypeScript 编译通过**

```bash
cd ai-cuotiben-web
npx tsc --noEmit --pretty 2>&1 | head -20
```

预期：无新增类型错误。

---

### Task 5: 前端 — 新建 `/upload/confirm/page.tsx`

**Files:**
- Create: `ai-cuotiben-web/app/upload/confirm/page.tsx`

- [ ] **Step 1: 写页面组件**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { confirmUpload } from "@/lib/api";

function ConfirmContent() {
  const router = useRouter();
  const params = useSearchParams();

  const initialOcr = params.get("ocr_text") || "";
  const imageUrl = params.get("image_url") || "";
  const initialAnswer = params.get("student_answer") || "";
  const subjectId = parseInt(params.get("subject_id") || "1");

  const [ocrText, setOcrText] = useState(initialOcr);
  const [studentAnswer, setStudentAnswer] = useState(initialAnswer);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!ocrText.trim()) {
      setError("题目内容不能为空");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await confirmUpload({
        ocr_text: ocrText.trim(),
        image_url: imageUrl,
        student_answer: studentAnswer.trim(),
        subject_id: subjectId,
      });
      // 分析完成，跳转到第一个错题详情或科目页
      const firstQuestion = result.data?.questions?.[0];
      if (firstQuestion?.id) {
        router.push(`/question/${firstQuestion.id}`);
      } else {
        router.push(`/subject/${subjectId}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "分析失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-50 dark:bg-[#050505]">
      {/* 顶部栏 */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-sm"
        >
          ← 返回
        </button>
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          OCR 修正确认
        </h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* 原图预览 */}
        {imageUrl && (
          <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
            <img
              src={imageUrl}
              alt="原题图片"
              className="w-full max-h-48 object-contain"
            />
          </div>
        )}

        {/* OCR 文本编辑区 */}
        <div>
          <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
            OCR 识别结果（可修改）
          </label>
          <textarea
            value={ocrText}
            onChange={(e) => setOcrText(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            placeholder="在此修正识别错误的文字..."
          />
        </div>

        {/* 学生答案 */}
        <div>
          <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
            我的错误答案（可选）
          </label>
          <input
            type="text"
            value={studentAnswer}
            onChange={(e) => setStudentAnswer(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="你当时的错误答案..."
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* 确认按钮 */}
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3.5 text-base transition-colors"
        >
          {loading ? "分析中..." : "确认，开始 AI 分析"}
        </button>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-50 dark:bg-[#050505]">
        <p className="text-zinc-500">加载中...</p>
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
```

- [ ] **Step 2: 确认编译通过**

```bash
cd ai-cuotiben-web
npx tsc --noEmit --pretty 2>&1 | head -20
```

---

### Task 6: 前端 — 修改 `app/upload/page.tsx` 连接确认流程

**Files:**
- Modify: `ai-cuotiben-web/app/upload/page.tsx`

- [ ] **Step 1: 添加 `confirmMode` 状态**

在第 29 行（`smallSubject` 之后）加入：

```tsx
  const [smallConfirmMode, setSmallConfirmMode] = useState(false);
```

- [ ] **Step 2: 修改 `handleSmallSubmit` 支持确认模式**

替换现有的 `handleSmallSubmit` 函数（第 46-58 行）：

```tsx
  const handleSmallSubmit = async () => {
    if (!ocrFile) return;
    setSmallUploading(true);
    try {
      const data = await uploadSmallQuestion(ocrFile, displayFile, smallSubject, smallConfirmMode);
      if (smallConfirmMode && "ocr_text" in data) {
        // 确认模式：跳转到 OCR 修正页
        const params = new URLSearchParams({
          ocr_text: data.ocr_text || "",
          image_url: data.image_url || "",
          student_answer: "",
          subject_id: String(data.subject_id || smallSubject),
        });
        router.push(`/upload/confirm?${params.toString()}`);
      } else if ("questions" in data) {
        const firstQ = data.questions?.[0];
        if (firstQ) { router.push(`/question/${firstQ.id}`); }
        else { alert("上传成功但未返回题目信息"); }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { router.replace("/login"); }
      else { alert(e instanceof ApiError ? e.message : "网络请求失败"); }
    } finally { setSmallUploading(false); }
  };
```

- [ ] **Step 3: 在小题卡片提交按钮前加确认模式 checkbox**

在提交按钮（第 190 行 `<button onClick={handleSmallSubmit}...`）之前插入：

```tsx
                <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smallConfirmMode}
                    onChange={(e) => setSmallConfirmMode(e.target.checked)}
                    className="rounded accent-blue-600"
                  />
                  识别后让我先修正 OCR 文字再分析
                </label>
```

- [ ] **Step 4: 确认 TypeScript 编译通过**

```bash
cd ai-cuotiben-web
npx tsc --noEmit --pretty 2>&1 | head -20
```

预期：无新增类型错误。
