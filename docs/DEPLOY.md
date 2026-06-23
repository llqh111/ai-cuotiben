# AI 错题本 — 白嫖部署指南

> 零年费。唯一成本：DeepSeek API ≈ 几元/月。

## 架构

```
你的电脑/GitHub
    │
    ├─→ Vercel (免费)      ← 前端 ai-cuotiben-web
    │     自动 HTTPS + CDN
    │
    └─→ Render (免费)      ← 后端 ai-cuotiben-api
          FastAPI + SQLite + Tesseract
```

---

## 第一步：推到 GitHub

```bash
# 在项目根目录
cd D:\Documents\Wrong-question-book

# 创建 GitHub 仓库（先在 github.com/new 创建空仓库，名为 ai-cuotiben）
git remote add origin https://github.com/你的用户名/ai-cuotiben.git
git branch -M main
git push -u origin main
```

> **注意**：`.env` 文件已加入 `.gitignore`，DeepSeek API key 不会泄露。

---

## 第二步：部署后端到 Render（5 分钟）

### 2.1 创建 Render 账号
访问 https://render.com → Sign Up → 用 GitHub 登录

### 2.2 创建 Web Service
1. 点 **New +** → **Web Service**
2. 选择你的 `ai-cuotiben` 仓库
3. 填写配置：
   - **Name**: `ai-cuotiben-api`
   - **Root Directory**: `ai-cuotiben-api`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: **Free**
4. 点 **Advanced** → **Add Environment Variable**：

   | Key | Value |
   |-----|-------|
   | `DEEPSEEK_API_KEY` | `你的DeepSeek API Key（在 platform.deepseek.com 获取）` |
   | `JWT_SECRET` | 随机生成一个（如 `cuotiben-2026-secret-xyz`） |

5. 点 **Create Web Service**

### 2.3 等待部署
约 3-5 分钟后，你会得到一个 URL：
```
https://ai-cuotiben-api.onrender.com
```

验证：浏览器打开 `https://ai-cuotiben-api.onrender.com/health` → 返回 `{"status":"ok"}`

### 2.4 关于 Tesseract OCR
Render 免费实例自带 Tesseract，但需要安装中文语言包。在 Render Dashboard 中：
1. 进入你的 Web Service
2. 点 **Shell**（左侧菜单）
3. 执行：
```bash
apt-get update && apt-get install -y tesseract-ocr-chi-sim
export TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata
```

---

## 第三步：部署前端到 Vercel（3 分钟）

### 3.1 创建 Vercel 账号
访问 https://vercel.com → Sign Up → 用 GitHub 登录

### 3.2 导入项目
1. 点 **Add New...** → **Project**
2. 选择 `ai-cuotiben` 仓库
3. 配置：
   - **Framework Preset**: Next.js（自动检测）
   - **Root Directory**: `ai-cuotiben-web`
   - **Environment Variables**：

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_API_BASE` | `https://ai-cuotiben-api.onrender.com` |

4. 点 **Deploy**

### 3.3 等待部署
约 2 分钟后，你会得到一个 URL：
```
https://ai-cuotiben.vercel.app
```

---

## 第四步：验证

1. 打开 `https://ai-cuotiben.vercel.app`
2. 输入昵称 + 口令 → 注册/登录
3. 上传一张试卷截图 → 查看 AI 分析结果
4. 进入冲刺、统计、知识图谱页面逐一验证

---

## 常见问题

**Q: Render 免费实例 15 分钟无请求就休眠怎么办？**
A: 前端访问时会自动唤醒，冷启动约 30 秒。不影响使用。

**Q: SQLite 数据会丢吗？**
A: Render 免费实例有 1GB 持久化磁盘，重启不丢数据。但建议定期备份 `cuotiben.db`。

**Q: 想用自己的域名？**
A: Vercel 和 Render 都支持自定义域名 → Settings → Domains。

**Q: 用户多了怎么办？**
A: Render 免费版升级到 $7/月（512MB→1GB RAM）。SQLite 换 PostgreSQL 只需改 `database.py` 三行。

---

## 费用

| 项目 | 费用 |
|------|------|
| Vercel 前端托管 | **免费** |
| Render 后端托管 | **免费** |
| Tesseract OCR | **免费** |
| SQLite 数据库 | **免费** |
| DeepSeek API | ~几元/月 |
| **合计** | **≈ 0 元/月** |
