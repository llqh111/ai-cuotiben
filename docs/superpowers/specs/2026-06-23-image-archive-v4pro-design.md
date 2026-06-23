# 图片云存档 + V4 Pro 升级 — 设计文档

> 日期：2026-06-23
> 状态：已确认 → 施工中

## 目标

1. 上传题目时可附带原图，存入云端，多设备登录可见
2. AI 服务全线升级 DeepSeek-V4-Pro

## 改动一：图片云存档

### 流程

```
上传文字 + 可选图片
    ↓
图片存入 Render 持久盘 /var/data/images/{user_id}_{timestamp}.jpg
    ↓
wrong_questions.image_url = /api/images/{filename}
    ↓
详情/浏览/复习页展示原图（如有）
```

### 后端

| 文件 | 改动 |
|------|------|
| `app/api/upload.py` | `/api/upload/text` 接受可选 `image` UploadFile，保存到 `IMAGE_DIR` |
| `main.py` | 挂载 `StaticFiles(directory=IMAGE_DIR, path="/api/images")` |
| `app/models.py` | 不变，image_url 字段已有 |

### 前端

| 文件 | 改动 |
|------|------|
| `app/upload/page.tsx` | 文字输入上方加图片上传入口（可选） |
| `app/question/[id]/page.tsx` | 顶部展示原图（如有 image_url） |
| `app/browse/page.tsx` | BrowseCard 点击图像按钮展开原图 |
| `app/review/[subjectId]/page.tsx` | 复习页展示原图 |

---

## 改动二：DeepSeek → V4 Pro

| 文件 | 改动 |
|------|------|
| `app/services/ai_service.py` | `model="deepseek-v4-pro"` |

全局替换，一次生效。generate/sprint/upload 等所有 AI 调用点全部升级。

---

## 不做

- ❌ 不 OCR 图片
- ❌ 不引入第三方存储
- ❌ 不改动 review/stats/settings/graph 等其他页面
