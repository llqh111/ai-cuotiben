# BugFix 设计文档：OCR 升级 + 设置页科目开关对接

**日期**: 2026-06-23
**范围**: AI 错题本 v1 打磨
**类型**: BugFix + 增量优化

---

## 一、背景

项目已跑通全流程（20+ API、11 页面、测试全绿），但存在两个影响核心体验的问题：
1. OCR 识别不准——当前用 Tesseract + mock 兜底，拍照上传的题目几乎识别不了
2. 设置页科目开关是假的——UI 硬编码 `i < 4`，无法真正控制科目显隐

---

## 二、Bug 1：OCR 升级（Tesseract mock → EasyOCR）

### 2.1 当前状态

`ai-cuotiben-api/app/services/ocr_service.py`：
- 默认尝试 Tesseract OCR
- Tesseract 失败或中文不准时 fallback 到硬编码 mock 文本
- mock 文本是固定的，跟用户上传的图片完全无关

### 2.2 为什么不用 PaddleOCR

用户反馈 PaddleOCR（百度）与 Python 环境存在兼容冲突，Windows 安装 PaddlePaddle 需要特定 Python 版本和 VC++ 运行时，容易踩坑。

### 2.3 方案：EasyOCR

**EasyOCR** 是纯 Python 实现，基于 PyTorch，支持 80+ 语言（含中文），安装极简：

```
pip install easyocr
```

优势：
- 不需要额外系统依赖（不像 Tesseract 需要装 exe）
- 中文识别质量远好于 Tesseract
- 纯 Python，Windows 兼容性好
- 首次运行会下载模型（~200MB），之后缓存

### 2.4 实现计划

| 步骤 | 文件 | 改动 |
|------|------|------|
| 1 | `requirements.txt` | 加 `easyocr`，移除 `pytesseract`（可选保留） |
| 2 | `app/services/ocr_service.py` | 重写 `extract_text()`：初始化 EasyOCR reader（lazy load），调用 `reader.readtext()` 提取文字 |
| 3 | `tests/test_ocr.py` | 更新测试——mock EasyOCR reader 而非 Tesseract |
| 4 | 兜底策略 | 保留 mock 作为 EasyOCR 加载失败时的兜底（首次下载模型可能超时） |

### 2.5 关键代码结构

```python
# ocr_service.py 新结构
import easyocr

_reader = None

def _get_reader():
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(['ch_sim', 'en'], gpu=False)
    return _reader

async def extract_text(image_data: bytes) -> str:
    try:
        reader = _get_reader()
        image = Image.open(BytesIO(image_data))
        result = reader.readtext(np.array(image))
        text = '\n'.join([item[1] for item in result])
        return text.strip() or _mock_text()
    except Exception:
        return _mock_text()
```

### 2.6 风险

| 风险 | 概率 | 缓解 |
|------|------|------|
| EasyOCR 首次下载模型超时 | 中 | 保留 mock 兜底，提示用户等待 |
| PyTorch 依赖体积大 | 高 | 可接受，不影响运行时 |
| 中文手写体识别不准 | 中 | 后续可加 DeepSeek 视觉 API 增强 |

---

## 三、Bug 2：设置页科目开关对接后端

### 3.1 当前状态

`ai-cuotiben-web/app/settings/page.tsx` 第 125-150 行：
```tsx
// 当前：硬编码
{subjectPrefs.map((pref, i) => (
  <Toggle key={pref.id} defaultChecked={i < 4} />
))}
```

后端 `User.subject_prefs` 字段已存在（models.py），类型为 JSON，存储格式：
```json
{"1": true, "2": true, "3": true, "4": false, "5": false, "6": false}
```

API `GET /api/auth/me` 已返回 `subject_prefs`，`PUT /api/auth/profile` 已支持更新。

### 3.2 方案：前端直连后端

**后端零改动**，只需要改前端：

| 步骤 | 文件 | 改动 |
|------|------|------|
| 1 | `app/settings/page.tsx` | 页面加载时从 `GET /me` 读取 `subject_prefs` |
| 2 | 同上 | `Toggle` 的 `checked` 从 `subject_prefs` 取值而非硬编码 |
| 3 | 同上 | `Toggle` 的 `onChange` 调用 `PUT /profile` 保存 |
| 4 | `lib/api.ts`（如需） | 确保 `updateProfile` 方法存在且传 `subject_prefs` |

### 3.3 关键逻辑

```tsx
// 加载
const { data: user } = useQuery({ queryKey: ['me'], queryFn: getMe });
const subjectPrefs = user?.subject_prefs || {};

// 显示
<Toggle 
  checked={subjectPrefs[subject.id] !== false}  // 默认 true
/>

// 保存
const handleToggle = (subjectId: string, value: boolean) => {
  const newPrefs = { ...subjectPrefs, [subjectId]: value };
  updateProfile({ subject_prefs: newPrefs });
};
```

### 3.4 风险：低

前后端字段已对齐，纯前端改动，风险极小。

---

## 四、整体影响评估

| 维度 | OCR 升级 | 设置页对接 |
|------|----------|------------|
| 改动文件数 | 3 | 2 |
| 后端改动 | 有（OCR 服务） | 无 |
| 前端改动 | 无 | 有（设置页） |
| 测试更新 | 需要 | 低优先级 |
| 预估时间 | 30min | 15min |
| 风险 | 中（依赖下载） | 低 |

---

## 五、验收标准

### OCR 升级
- [ ] `pip install` 成功安装 easyocr 及依赖
- [ ] 用测试图片（`test_question.png`）调用 OCR，返回真实中文文字（非 mock）
- [ ] OCR 加载失败时 fallback 到 mock，不崩溃
- [ ] 现有测试通过

### 设置页对接
- [ ] 页面加载后科目开关状态与后端 `subject_prefs` 一致
- [ ] 切换开关后调 `PUT /profile` 保存
- [ ] 刷新页面后开关状态保持
