# OCR 修正确认页 — 设计文档

> 日期：2026-06-23
> 状态：已确认
> 范围：补全上传流程中缺失的 OCR 修正确认环节

## 目标

当前 `/upload/small` 在 Gemini OCR 后直接进入 DeepSeek 分析，学生没有机会修正 OCR 识别错误。本次新增确认页让上传流程变为：

```
上传图片 → Gemini OCR → 返回 OCR 文本 → /upload/confirm 修正 → DeepSeek 分析 → 入库
```

## 后端改动

### 修改：`POST /api/upload/small`

新增可选 query 参数 `confirm_first`（默认 false，保持现有行为）：

- `confirm_first=false`：现有行为不变（直通分析）
- `confirm_first=true`：只做 Gemini OCR + 存图，返回 OCR 文本和上下文数据，**不入库、不调用 DeepSeek**

`confirm_first=true` 返回格式：
```json
{
  "status": "ocr_done",
  "data": {
    "ocr_text": "Gemini 识别文本...",
    "image_url": "/api/images/ocr_xxx.jpg",
    "display_image_url": "/api/images/disp_xxx.jpg",
    "student_answer": "",
    "subject_id": 1
  }
}
```

### 新增：`POST /api/upload/confirm`

接收修正后的 OCR 文本，执行 DeepSeek 分析落库：

| 参数 | 类型 | 说明 |
|------|------|------|
| `ocr_text` | str | 学生修正后的 OCR 文本 |
| `image_url` | str | 之前返回的 image_url |
| `student_answer` | str | 学生错误答案 |
| `subject_id` | int | 科目 ID |

返回完整分析结果（与现有 `/upload/small` 直通模式一致）。

## 前端改动

### 修改：`app/upload/page.tsx`

小题入口：上传图片后，如果开启确认模式 → 跳转 `/upload/confirm?ocr_text=...&image_url=...`

### 新建：`app/upload/confirm/page.tsx`

简洁版 OCR 修正页：

**布局**（从上到下）：
1. 顶部栏：「← 返回」+ 「OCR 修正确认」
2. 原图缩略图（小尺寸预览）
3. OCR 文本 textarea（可编辑，字号略大方便校对）
4. 「学生错误答案」输入框（可选）
5. 「确认，开始 AI 分析」按钮（主色调，全宽）

**交互**：
- 用户修改 OCR 文本后点确认
- 调用 `POST /api/upload/confirm`
- 成功后跳转到错题详情或科目页

### 修改：`lib/api.ts`

新增函数：
```ts
confirmUpload(data: { ocr_text, image_url, student_answer, subject_id }) → Promise<Response>
```

## 不做

- ❌ 不做对照版（左图右文）
- ❌ 不修改 `/upload/big-question` 和 `/upload/text`（这两个入口用户已自带文本）
- ❌ 不在这一轮做手机端适配（下一步统一做）
