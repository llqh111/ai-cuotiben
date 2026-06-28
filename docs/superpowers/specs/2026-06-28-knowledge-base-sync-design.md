# 知识库双向同步 — 错题本 x Obsidian 联动设计

> 设计日期：2026-06-28
> 状态：待审核

## 概述

将 AI 错题本的结构化知识数据（知识点、题型、错题卡片）与个人知识库（Obsidian vault）双向同步，实现"错题本收集 + AI 分析 → 知识库存档 + 手写笔记 → 错题本复习"的闭环。

## 目标用户

- 使用 AI 错题本备战高考的学生（qh）
- 已有或准备搭建 Obsidian 知识库
- 希望在知识库里做自由笔记，同时保持与错题本的数据联通

## ASSUMPTIONS

1. 知识库工具是 Obsidian（Markdown + wiki-link 格式），未来可扩展到其他工具
2. 用户的 Obsidian vault 路径可通过设置页配置（默认 `D:\Documents\高考知识库`）
3. 同步方向以「错题本 → 知识库」为主，「知识库 → 错题本」为辅助（知识库变更不频繁）
4. 错题本后端可访问本地文件系统（开发环境），生产环境通过环境变量控制
5. 单用户场景，不需要处理多用户并发同步

---

## Phase 1 — Markdown 导出基础

### 1.1 后端：Markdown 导出 API

新增 `GET /api/export/markdown?subject_id={id}&format=obsidian`

按科目导出为 ZIP 包，内含 Obsidian 兼容目录结构：

```
{subject_name}/
├── _index.md              ← 科目概览（统计数据、掌握率）
├── 知识点说明/
│   ├── {知识点名}.md       ← 知识点定义 + [[题型链接]] + [[错题链接]]
│   └── ...
└── 错题卡片/
    ├── Q-{id}.md           ← 单道错题完整卡片
    └── ...
```

### 1.2 Markdown 模板规格

**知识点文件**（`知识点说明/导数.md`）：

```markdown
---
subject: {subject_name}
knowledge_point: {name}
total_questions: {count}
mastered: {mastered_count}
mastery_rate: {rate}%
last_reviewed: {last_date}
aliases: [{name}]
tags: [高考, {subject_name}, 知识点]
---

# {name}

## 描述
{description}

## 关联题型
{for pattern in patterns}
- [[题型-{pattern.name}]] — {pattern.count}题
{end}

## 错题列表
{for question in questions}
- [[Q-{question.id}]] — {question.error_summary}
{end}

## 关联知识点
{for relation in relations}
- [[{relation.target_name}]] — {relation.type}
{end}
```

**错题卡片**（`错题卡片/Q-{id}.md`）：

```markdown
---
id: {id}
subject: {subject_name}
knowledge_point: "{kp_name}"
question_type: {type}
status: {status}
mastery: {mastery_level}
next_review: {next_review_date}
error_category: {category}
tags: [高考, {subject_name}, 错题, {kp_name}]
---

# 题目
{question_content}

## 我的答案（错误）
{student_answer}

## 正确答案
{correct_answer}

## 解题步骤
{solution_steps}

## 错因分析
{error_analysis}

## 改进建议
{improvement_tips}

---

> 关联知识点：[[{kp_name}]]
> 下次复习：{next_review_date}
```

### 1.3 前端：导出入口

在设置页新增「知识库同步」卡片：
- 「导出所有科目」按钮 → 下载完整 ZIP
- 「导出当前科目」按钮（在科目详情页） → 下载单科 ZIP
- 说明文字引导用户解压到 Obsidian vault 目录

---

## Phase 2 — 双向同步（本期目标）

### 2.1 后端：本地同步 API

新增端点不生成 ZIP，直接写入本地 Obsidian vault 目录：

```
POST /api/knowledge/init-vault       ← 初始化 vault 目录结构 + 写入所有数据
POST /api/knowledge/sync-question/{id} ← 单题变更后增量更新对应 .md 文件
POST /api/knowledge/sync-knowledge-point/{id} ← 知识点变更后增量更新
POST /api/knowledge/delete-file/{type}/{id}  ← 错题/知识点删除后清理对应 .md
```

关键决策：在 `wrong_questions` 表和 `knowledge_points` 表各新增一个 `obsidian_path` 字段（VARCHAR, nullable），记录该实体在 vault 中的相对路径，便于增量更新时定位文件。

### 2.3 前端：同步控制面板

在设置页「知识库同步」卡片扩展为：

| 组件 | 行为 |
|------|------|
| Vault 路径输入框 | 配置本地 Obsidian vault 绝对路径 |
| 「初始化 Vault」按钮 | 一键生成全量目录结构 |
| 「自动同步」开关 | 开启后每次新增/编辑错题自动更新 vault 对应文件 |
| 同步状态指示器 | 上次同步时间 + 待同步数量 |

### 2.4 自动同步 Hook

在以下 FastAPI 路由处理成功后触发：

| 事件 | 触发动作 |
|------|---------|
| `POST /api/questions` (新增错题) | 生成 `错题卡片/Q-{id}.md` |
| `PUT /api/questions/{id}` (编辑错题) | 覆盖更新 `错题卡片/Q-{id}.md` |
| `DELETE /api/questions/{id}` (删除错题) | 删除对应 .md 文件 |
| 知识点增/改/删 | 对应更新 `知识点说明/{name}.md` |
| `POST /api/review/submit` (复习提交) | 更新对应错题的 frontmatter + 知识点 `_index.md` 统计 |

同步为异步执行（BackgroundTasks），不阻塞 API 响应。同步失败记录日志但不影响主流程。

### 2.5 配置文件

vault 根目录生成 `.cuotiben-sync.json`：

```json
{
  "version": 1,
  "api_base": "http://localhost:8000",
  "last_sync": "2026-06-28T10:30:00+08:00",
  "synced_questions": 156,
  "synced_knowledge_points": 48
}
```

用于 Obsidian 侧插件/脚本判断同步状态。

---

## 数据模型变更

### 新增字段

`wrong_questions` 表：
```sql
ALTER TABLE wrong_questions ADD COLUMN obsidian_path VARCHAR(500);
```

`knowledge_points` 表：
```sql
ALTER TABLE knowledge_points ADD COLUMN obsidian_path VARCHAR(500);
```

`users` 表：
```sql
ALTER TABLE users ADD COLUMN vault_path VARCHAR(500);
```

---

## API 路由规划

```
/api/knowledge/
  GET  /export-markdown           → 下载 ZIP（Phase 1）
  POST /init-vault                → 初始化 vault 目录
  POST /sync-question/{id}        → 增量同步单题
  POST /sync-knowledge-point/{id} → 增量同步知识点
  POST /delete-file/{type}/{id}   → 删除 vault 文件
  GET  /status                    → 同步状态查询
```

---

## 前端变更

### 新增文件
- `ai-cuotiben-web/app/settings/knowledge-sync.tsx` — 同步控制面板组件
- `ai-cuotiben-web/lib/knowledge-api.ts` — 知识库 API 客户端

### 修改文件
- `ai-cuotiben-web/app/settings/page.tsx` — 集成同步控制面板
- `ai-cuotiben-web/lib/api.ts` — 新增 `exportMarkdown` 函数

---

## 后端变更

### 新增文件
- `ai-cuotiben-api/app/api/knowledge.py` — 知识库同步路由
- `ai-cuotiben-api/app/services/knowledge_sync.py` — 同步核心逻辑
- `ai-cuotiben-api/app/services/markdown_renderer.py` — Markdown 模板渲染
- `ai-cuotiben-api/app/schemas/knowledge.py` — 请求/响应 schema

### 修改文件
- `ai-cuotiben-api/main.py` — 注册 knowledge 路由
- `ai-cuotiben-api/app/models.py` — 新增字段 + user_notes 表
- `ai-cuotiben-api/app/api/questions.py` — 增/改/删后触发同步
- `ai-cuotiben-api/app/api/review.py` — 复习提交后触发同步
- `ai-cuotiben-api/app/core/migration.py` — 新增 migration

---

## 技术细节

### Vault 路径安全

```python
import os

def resolve_vault_path(user_vault_dir: str, relative_path: str) -> str:
    """防止路径穿越攻击"""
    vault = os.path.abspath(user_vault_dir)
    target = os.path.abspath(os.path.join(vault, relative_path))
    if not target.startswith(vault + os.sep) and target != vault:
        raise ValueError("路径穿越检测")
    return target
```

### 同步幂等性

- init-vault：检查文件是否已存在，存在则跳过或覆盖（由 `overwrite` query param 控制）
- sync-question：通过 `obsidian_path` 字段定位，若路径记录缺失则自动重建
- 所有文件写入前确保父目录存在

### 前端路径配置存储

vault 路径存储在 `users` 表新增字段：
```sql
ALTER TABLE users ADD COLUMN vault_path VARCHAR(500);
```

通过 `PUT /api/auth/profile` 更新（复用现有 `updateProfile` 接口）。

---

## 测试策略

| 层级 | 内容 | 工具 |
|------|------|------|
| 单元测试 | Markdown 模板渲染、路径安全验证 | pytest |
| 集成测试 | API 端点 + 文件系统操作（temp_dir） | pytest + tmp_path |
| 端到端 | 前端设置页 → 配置路径 → 初始化 → 验证文件 | Playwright（可选） |

---

## 边界

- **Always do**：同步失败不阻塞 API 响应、路径穿越防护、文件写入前建目录
- **Ask first**：修改生产环境 vault 路径、删除 vault 中已存在文件
- **Never do**：同步到用户未配置的路径、在未授权情况下读取 vault 目录

---

## 已决议

1. **Vault 路径**：自动检测 `D:\Documents\` 下含 `.obsidian` 子目录的文件夹；设置页可手动覆盖
2. **反向同步**：本期不做，只做正向（错题本 → Obsidian）
3. **user_notes 表**：本期不建，先不复用现有字段
