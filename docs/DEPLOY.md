# AI 错题本 — 部署指南（实际部署记录）

> 部署日期：2026-06-23
> GitHub：llqh111/ai-cuotiben
> 零年费。唯一成本：DeepSeek API ≈ 几元/月。

## 实际架构（全部 Render，没用 Vercel）

```
GitHub: llqh111/ai-cuotiben (main)
    │
    ├─→ Render: ai-cuotiben          ← 后端 Python/FastAPI
    │     https://ai-cuotiben.onrender.com
    │     Free 0.1 CPU / 512MB RAM
    │
    └─→ Render: ai-cuotiben-web      ← 前端 Next.js 16
          https://ai-cuotiben-web.onrender.com
          Free 0.1 CPU / 512MB RAM
```

Vercel 原计划废弃——注册要手机号验证。

---

## 部署步骤（重来一遍看这里）

### 前提

- GitHub 空仓库 `ai-cuotiben`
- Render 账号（GitHub 登录）

### 第一步：推送代码到 GitHub

```bash
cd 项目目录
git remote add origin https://github.com/llqh111/ai-cuotiben.git
git branch -M main
git push -u origin main
```

> `.env` 已在 `.gitignore`，DeepSeek Key 不会泄露。

### 第二步：部署后端 ai-cuotiben

Render Dashboard → **New +** → **Web Service**（⚠️ 不是 Blueprint）→ 选仓库 → 填：

| 配置 | 值 |
|------|-----|
| Name | `ai-cuotiben` |
| Root Directory | `ai-cuotiben-api` |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Instance Type | Free |

> OCR 已从 Tesseract/Gemini 改为通义千问 Qwen-VL，不再需要下载 tessdata，Build Command 简化。

环境变量（Advanced → Environment Variables）——**4 个全要填，缺一个都会出问题**：

| Key | Value | 缺了会怎样 |
|-----|-------|-----------|
| `DEEPSEEK_API_KEY` | DeepSeek API Key（platform.deepseek.com） | 题目分析失效 |
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key（bailian.console.aliyun.com） | **OCR 上传 502** |
| `CLOUDINARY_URL` | `cloudinary://api_key:api_secret@cloud_name` | **换设备看不到图**（图存临时盘会丢） |
| `JWT_SECRET` | 随机字符串（如 `cuotiben-2026-secret-xyz`） | 登录态不安全 |

> ⚠️ 6-24 加的 `DASHSCOPE_API_KEY` / `CLOUDINARY_URL` 是后补的，老部署很可能漏配 → 这正是"OCR 网络问题 + 换设备看不到图"的根因。**去 Render 后端 → Environment 里补上，再 Manual Deploy。**

**验证：** `https://ai-cuotiben.onrender.com/health` → `{"status":"ok"}`

### 第三步：部署前端 ai-cuotiben-web

Render Dashboard → **New +** → **Web Service** → 选仓库 → 填：

| 配置 | 值 |
|------|-----|
| Name | `ai-cuotiben-web` |
| Root Directory | `ai-cuotiben-web` |
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Instance Type | Free |

环境变量：

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_BASE` | `https://ai-cuotiben.onrender.com` |

**⚠️ 关键：** 环境变量设完后，必须 **Manual Deploy** → **Deploy latest commit** 重新构建。`NEXT_PUBLIC_*` 是构建时变量，不重建不生效。

### 第四步：验证

1. 打开 https://ai-cuotiben-web.onrender.com
2. 昵称 + 口令 → 注册/登录
3. 上传试卷截图 → AI 分析

---

## 防休眠（解决"网络问题/卡顿"）

Render 免费版 15 分钟没请求就休眠，下次访问要等 **~50 秒**冷启动 → 表现为"网络异常/卡顿"，OCR 最容易撞上。

**免费解法：外部定时 ping。** 用 [cron-job.org](https://cron-job.org)（或 UptimeRobot）建一个任务：

| 配置 | 值 |
|------|-----|
| URL | `https://ai-cuotiben.onrender.com/health` |
| 间隔 | 每 5~10 分钟 |
| 方法 | GET |

这样后端一直保持唤醒，冷启动基本消失。零成本。

> 前端也已加了"打开录入页自动预热后端 + 请求 90s 超时 + 友好提示"兜底（`lib/api.ts` 的 `warmupBackend`），即使偶发休眠也不会再显示笼统的"网络异常"。

---

## OCR 方案变更（2026-06-25）

- **旧**：Gemini（`google-genai`）。问题：① key 格式不对；② Gemini API **在中国大陆地区封锁**，本地永远跑不通；③ 之前用一段写死的 mock 假题兜底，把失败全藏住了，删掉 mock 后线上直接 502。
- **新**：通义千问 **Qwen-VL**（阿里云百炼 DashScope，OpenAI 兼容）。中国大陆直连、多模态、识别数学公式。文件 `app/services/vision_service.py`。
- DeepSeek 文字分析**不变**（验证过可用）。

**本地验证 OCR：** `cd ai-cuotiben-api && python verify_ocr.py`（填好 `.env` 的 `DASHSCOPE_API_KEY` 后）。线上验证：`python verify_ocr.py --live`。

---

## 已踩坑 & 修复记录

### 坑 1：Free 版没有 Shell — Tesseract 中文包装不上
- 问题：DEPLOY.md 原方案用 Shell 装 `tesseract-ocr-chi-sim`
- 实际：Free 实例不支持 Shell 访问
- 修复：Build Command 里 `curl` 下载 `chi_sim.traineddata` 到项目 `tessdata/` 目录
- 代码配合：`app/services/ocr_service.py` 新增项目本地 `tessdata/` 路径查找

### 坑 2：CORS 跨域拦截
- 问题：前端请求后端时浏览器报跨域错误，前端显示"网络异常，请确认后端已启动"
- 原因：`main.py` 的 `allow_origins` 只配了 `http://localhost:3000`
- 修复：追加 `https://ai-cuotiben-web.onrender.com` 到 CORS 白名单
- 文件：`ai-cuotiben-api/main.py:26`

### 坑 3：NEXT_PUBLIC 环境变量不生效
- 问题：环境变量设了但前端仍连 localhost:8000
- 原因：Next.js 的 `NEXT_PUBLIC_*` 只在 `next build` 时写入客户端 bundle
- 修复：设变量后必须手动触发重建（Manual Deploy）

### 坑 4：Render Blueprint vs Web Service
- 问题：Render 可能误识别为 Blueprint 部署，报 `render.yaml not found`
- 修复：必须选 **New + → Web Service**，不是 Blueprint

### 坑 5：DEPLOY.md 明文 API Key
- 问题：原 DEPLOY.md 第 54 行硬编码了 DeepSeek API Key
- 修复：改为占位文本，Key 通过环境变量注入

---

## 本地开发

```bash
# 后端
cd ai-cuotiben-api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 前端（另一个终端）
cd ai-cuotiben-web
npm install
npm run dev
```

本地前端默认连 `http://localhost:8000`。

---

## 费用

| 项目 | 费用 |
|------|------|
| Render 后端 | 免费（15min 无请求休眠） |
| Render 前端 | 免费（同上） |
| Tesseract OCR | 免费 |
| SQLite | 免费（1GB 持久化磁盘） |
| DeepSeek API | ~几元/月 |
| **合计** | **≈ 0 元/月** |

---

## 关键文件索引

| 文件 | 作用 |
|------|------|
| `ai-cuotiben-api/main.py` | FastAPI 入口，CORS 配置 |
| `ai-cuotiben-api/app/services/ocr_service.py` | Tesseract OCR，tessdata 路径 |
| `ai-cuotiben-api/requirements.txt` | Python 依赖 |
| `ai-cuotiben-api/cuotiben.db` | SQLite 数据库（生产数据） |
| `ai-cuotiben-web/lib/api.ts` | 前端 API 客户端，`API_BASE` 配置 |
| `ai-cuotiben-web/app/login/page.tsx` | 登录页 |
