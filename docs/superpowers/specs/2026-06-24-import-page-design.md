# 错题批量导入页面 — 设计规格

日期：2026-06-24
关联项目：AI 错题本

## 1. 目标

新增 `/import` 页面 + `/upload` 入口卡片，让用户粘贴 Claude 分析好的错题 JSON，一键导入到错题本。

## 2. 设计

### 2.1 `/import` 页面

**布局：**
- 页面头部：标题「导入错题」+ 副标题「粘贴 Claude 分析好的 JSON，一键入库」
- JSON 输入区：大文本域（monospace），8 行高，placeholder 含示例
- 支持含 ` ```json ` 包裹的全文粘贴（前端自动提取 JSON 内容）
- 「导入」按钮 → 调 `POST /api/upload/import`
- 导入结果区：成功显示题目列表（科目名 + 知识点 + 题干摘要），失败显示错误
- 「清空，继续导入」按钮（导入成功后出现）

**交互：**
- JSON 解析失败 → 红色提示具体行号
- API 返回 400 → 显示后端错误信息
- 导入成功不清空输入框，方便核对

### 2.2 `/upload` 入口

在现有四张上传卡片（小题/大题/粘贴/PDF）旁边加第五张卡片：「成品导入」，主题色 green，图标 FileArrowDown。点击跳转 `/import`。

### 2.3 API 客户端

`lib/api.ts` 新增 `importQuestions()` 函数。

## 3. 技术约束

- Next.js 16 App Router + TypeScript + Tailwind CSS v4
- 复用 `getToken()` + `API_BASE`，直接调 `/api/upload/import`
- 遵循现有页面模式（Navbar + AuthGuard + motion 动画）

## 4. 非目标

- 不做知识点参考表的在线展示（已在提示词模板里）
- 不做批量 JSON 文件上传
- 不改后端

## 5. 文件清单

| 文件 | 操作 |
|------|------|
| `app/import/page.tsx` | 新建 |
| `app/upload/page.tsx` | 修改 — 加第五张卡片 |
| `lib/api.ts` | 修改 — 加 `importQuestions()` |
