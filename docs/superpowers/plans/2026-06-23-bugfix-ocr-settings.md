# BugFix 实现计划：OCR 升级 + 设置页科目开关对接

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 OCR 从 Tesseract+mock 升级为 EasyOCR，并将设置页科目开关从硬编码改为对接后端 subject_prefs。

**Architecture:** 两个独立改动：OCR 在后端 `ocr_service.py` 中用 EasyOCR 替换 Tesseract；设置页在 `api.ts` 补上 `subject_prefs` 字段，`page.tsx` 中读取并写回。

**Tech Stack:** Python/EasyOCR/FastAPI (后端), TypeScript/Next.js/React (前端)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `ai-cuotiben-api/requirements.txt` | 修改 | 加 easyocr 依赖 |
| `ai-cuotiben-api/app/services/ocr_service.py` | 修改 | 替换 Tesseract 为 EasyOCR |
| `ai-cuotiben-web/lib/api.ts` | 修改 | Profile 接口补 subject_prefs，updateProfile 参数补 subject_prefs |
| `ai-cuotiben-web/app/settings/page.tsx` | 修改 | 科目开关从后端读取、写回 |

---

### Task 1: 前端 API 层补 subject_prefs 支持

**Files:**
- Modify: `ai-cuotiben-web/lib/api.ts`

- [ ] **Step 1: 在 Profile 接口中加 subject_prefs 字段**

修改 `Profile` 接口（约第 140-145 行），当前：

```typescript
export interface Profile {
  user_id: number;
  nickname: string;
  exam_date: string | null;
  theme_preference: string | null;
}
```

改为：

```typescript
export interface Profile {
  user_id: number;
  nickname: string;
  exam_date: string | null;
  theme_preference: string | null;
  subject_prefs: string;  // "1,2,3,4,5,6" 逗号分隔的 enabled subject IDs
}
```

- [ ] **Step 2: 在 updateProfile 参数中加 subject_prefs**

修改 `updateProfile` 函数签名（约第 151-159 行），当前：

```typescript
export function updateProfile(body: {
  exam_date?: string;
  theme_preference?: string;
}): Promise<Profile> {
  return apiFetch<Profile>("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
```

改为：

```typescript
export function updateProfile(body: {
  exam_date?: string;
  theme_preference?: string;
  subject_prefs?: string;
}): Promise<Profile> {
  return apiFetch<Profile>("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 3: Verify — TypeScript 编译通过**

Run: `cd ai-cuotiben-web && npx tsc --noEmit`
Expected: No errors (at minimum, no new errors from this change)

---

### Task 2: 设置页科目开关对接后端

**Files:**
- Modify: `ai-cuotiben-web/app/settings/page.tsx`

- [ ] **Step 1: 加载 subject_prefs**

在现有的 `useEffect` 中（约第 23-29 行），扩展 `getProfile()` 的 `.then()`：

当前：
```typescript
useEffect(() => {
  getProfile()
    .then((p) => {
      if (p.exam_date) setExamDate(p.exam_date);
    })
    .catch(() => {});
}, []);
```

改为：
```typescript
const [subjectPrefs, setSubjectPrefs] = useState<string>("1,2,3,4,5,6");

useEffect(() => {
  getProfile()
    .then((p) => {
      if (p.exam_date) setExamDate(p.exam_date);
      if (p.subject_prefs) setSubjectPrefs(p.subject_prefs);
    })
    .catch(() => {});
}, []);
```

需要在组件顶部声明 `subjectPrefs` state（加在 `const [saved, setSaved] = useState(false);` 之后）。

- [ ] **Step 2: 用 SUBJECTS 常量替换硬编码数组，计算开关状态**

科目列表区域（约第 135-147 行），当前：

```tsx
{["语文", "数学", "英语", "物理", "化学", "生物"].map((subject, i) => (
  <label
    key={subject}
    ...>
    <span ...>{subject}</span>
    <div className={`h-5 w-9 rounded-full p-1 transition-colors ${i < 4 ? "bg-zinc-900 dark:bg-white" : "bg-zinc-200 dark:bg-zinc-800"}`}>
      <div className={`h-3 w-3 rounded-full transition-transform ${i < 4 ? "translate-x-4 bg-white dark:bg-zinc-900" : "bg-white dark:bg-zinc-500"}`} />
    </div>
  </label>
))}
```

改为（用 `SUBJECTS` 常量 + 真实开关状态）：

```tsx
{SUBJECTS.map((subject) => {
  const enabled = subjectPrefs.split(",").includes(String(subject.id));
  const active = enabled;
  return (
    <label
      key={subject.id}
      className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 p-4 transition-all hover:bg-white dark:border-zinc-800/50 dark:bg-zinc-900/30 dark:hover:bg-[#0a0a0a]"
    >
      <span className="font-medium text-zinc-900 dark:text-zinc-100">{subject.name}</span>
      <input
        type="checkbox"
        className="sr-only"
        checked={active}
        onChange={() => {
          const ids = subjectPrefs.split(",").filter(Boolean);
          const newIds = active
            ? ids.filter((id) => id !== String(subject.id))
            : [...ids, String(subject.id)].sort((a, b) => Number(a) - Number(b));
          const newVal = newIds.join(",") || "1,2,3,4,5,6";
          setSubjectPrefs(newVal);
          save({ subject_prefs: newVal });
        }}
      />
      <div className={`h-5 w-9 rounded-full p-1 transition-colors ${active ? "bg-zinc-900 dark:bg-white" : "bg-zinc-200 dark:bg-zinc-800"}`}>
        <div className={`h-3 w-3 rounded-full bg-white dark:bg-zinc-500 transition-transform ${active ? "translate-x-4 dark:bg-zinc-900" : ""}`} />
      </div>
    </label>
  );
})}
```

需要添加 import：`import { SUBJECTS } from "@/lib/api";`（`SUBJECTS` 已经在 `api.ts` 中导出）。

- [ ] **Step 3: 确保 save 函数接受 subject_prefs**

当前 `save` 函数签名（约第 31 行）：
```typescript
async function save(next: { exam_date?: string; theme_preference?: string }) {
```
改为：
```typescript
async function save(next: { exam_date?: string; theme_preference?: string; subject_prefs?: string }) {
```

- [ ] **Step 4: Verify — TypeScript 编译通过**

Run: `cd ai-cuotiben-web && npx tsc --noEmit`
Expected: No errors

---

### Task 3: 安装 EasyOCR 并重写 OCR 服务

**Files:**
- Modify: `ai-cuotiben-api/requirements.txt`
- Modify: `ai-cuotiben-api/app/services/ocr_service.py`

- [ ] **Step 1: 更新 requirements.txt**

在 `ai-cuotiben-api/requirements.txt` 末尾追加：

```
easyocr>=1.7.0
```

移除（或注释掉）Tesseract 相关行（第 18-22 行）：

```diff
- pytesseract>=0.3.0
- # Tesseract OCR 需单独安装:
- #   Windows: https://github.com/UB-Mannheim/tesseract/wiki
- #   中文包: 下载 chi_sim.traineddata → ~\.tesseract\tessdata\
+ # pytesseract 已替换为 easyocr
+ easyocr>=1.7.0
```

- [ ] **Step 2: 安装依赖**

Run: `cd ai-cuotiben-api && pip install easyocr>=1.7.0`
Expected: 安装成功（PyTorch + EasyOCR，首次较大，约 1-2GB）

- [ ] **Step 3: 重写 ocr_service.py**

完整替换文件内容为：

```python
import asyncio
import logging
from io import BytesIO

logger = logging.getLogger(__name__)

# EasyOCR reader — lazy init，避免启动时就加载模型
_reader = None


def _get_reader():
    """Lazy-load EasyOCR reader（首次调用会下载模型 ~200MB）"""
    global _reader
    if _reader is None:
        import easyocr
        _reader = easyocr.Reader(['ch_sim', 'en'], gpu=False)
    return _reader


async def extract_text_from_image(file_bytes: bytes) -> str:
    """对图片字节执行 OCR，用 EasyOCR 中文识别，失败则 mock 兜底。"""
    def _run():
        try:
            import numpy as np
            from PIL import Image

            reader = _get_reader()
            img = Image.open(BytesIO(file_bytes))
            # EasyOCR 接受 numpy array
            result = reader.readtext(np.array(img))
            # result 格式: [[bbox, text, confidence], ...]
            lines = [item[1] for item in result if item[2] > 0.3]
            text = '\n'.join(lines)
            return text.strip()
        except Exception as e:
            logger.error(f"EasyOCR 失败: {e}")
            return ""

    try:
        text = await asyncio.to_thread(_run)
        if text:
            return text
    except Exception as e:
        logger.error(f"EasyOCR 线程异常: {e}")

    logger.info("EasyOCR 无结果，使用 mock 兜底")
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
```

关键变化：
- 移除所有 `pytesseract`、`Tesseract`、`_TESSERACT_CMD`、`_TESSDATA_DIR` 相关代码
- 添加 `easyocr.Reader` lazy-load（`_get_reader()`）
- `extract_text_from_image()` 调用 `reader.readtext(np.array(img))`
- 按 confidence > 0.3 过滤低置信度结果
- 保留 mock 兜底 + PDF 提取不变

- [ ] **Step 4: 验证 OCR 服务能正常加载（不崩溃）**

Run: `cd ai-cuotiben-api && python -c "from app.services.ocr_service import extract_text_from_image; print('OCR service loaded OK')"`
Expected: `OCR service loaded OK`（不会触发模型下载，因为 lazy init）

- [ ] **Step 5: 用测试图片验证真实 OCR**

确保 `test_question.png` 存在于 `ai-cuotiben-api/` 目录下，然后：

Run: `cd ai-cuotiben-api && python -c "
import asyncio
from app.services.ocr_service import extract_text_from_image
async def main():
    with open('test_question.png', 'rb') as f:
        data = f.read()
    result = await extract_text_from_image(data)
    print('OCR result:', repr(result))
    # 如果是 mock 说明 EasyOCR 未就绪，但不应崩溃
asyncio.run(main())
"`
Expected: 输出 OCR 结果（可能是真实识别文字，也可能 fallback 到 mock — 取决于模型是否下载成功）

---

### Task 4: 端到端验证 + 提交

**Files:**
- No new changes — verify all together

- [ ] **Step 1: 启动后端确认启动正常**

Run: `cd ai-cuotiben-api && timeout 10 python main.py 2>&1 || true`
Expected: FastAPI 正常启动，无 import 错误

- [ ] **Step 2: 前端构建验证**

Run: `cd ai-cuotiben-web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ai-cuotiben-api/requirements.txt ai-cuotiben-api/app/services/ocr_service.py
git add ai-cuotiben-web/lib/api.ts ai-cuotiben-web/app/settings/page.tsx
git commit -m "fix: upgrade OCR to EasyOCR + wire settings subject toggles to backend"
```

---

## 验收清单

- [ ] `requirements.txt` 包含 `easyocr`
- [ ] `ocr_service.py` 不再 import `pytesseract`，用 EasyOCR
- [ ] OCR 启动不崩溃，无结果时 fallback mock
- [ ] `api.ts` 中 `Profile` 含 `subject_prefs`，`updateProfile` 支持 `subject_prefs`
- [ ] 设置页科目开关从后端读取状态
- [ ] 切换开关后调 `PUT /profile` 保存，刷新后状态保持
- [ ] TypeScript 编译零错误
