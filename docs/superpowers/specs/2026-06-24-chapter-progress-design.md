# 章节进度追踪模块 — 设计规格

日期：2026-06-24
作者：Rift 协助 qh
关联项目：AI 错题本 (`D:\Documents\Wrong-question-book`)

---

## 1. 问题陈述

现有系统是"题目驱动"的 —— 先有错题，再有数据。但一轮复习的核心是**系统性全覆盖**，需要在错题出现之前就能追踪每个知识点的复习进度。

当前缺口：没有一个工具能回答"数学解析几何我复习了没有？进度到哪了？"—— 因为系统里可能根本没有解析几何的错题，它就显示不出来。

## 2. 目标

在现有错题本系统中新增「章节进度追踪」模块，让用户：

- 浏览六科完整考纲章节树（三层：章 → 节 → 知识点）
- 对每个知识点自评掌握度（1-5 星）
- 将自评与错题数据交叉验证（该知识点下有多少错题）
- 在仪表盘看到全局进度概览
- 保持现有功能不受影响

## 3. 非目标（明确排除）

- 每日任务自动分配器（留待后续）
- 修改现有 `/sprint`、`/stats`、`/review`、`/graph` 的任何行为
- AI 自动评估掌握度（保持人工自评）
- 多用户共享章节树（每人独立）

---

## 4. 数据模型

### 4.1 新表：chapters

```sql
CREATE TABLE chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    parent_id INTEGER REFERENCES chapters(id),  -- 可空，顶级节点为 null
    name VARCHAR(200) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    description TEXT,                           -- 可空，章节说明
    mastery_rating INTEGER,                     -- 可空，1-5 掌握度
    reviewed_at DATETIME,                       -- 可空，最近复习时间
    notes TEXT,                                 -- 可空，用户复习笔记
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);
```

### 4.2 修改：knowledge_points

```sql
ALTER TABLE knowledge_points ADD COLUMN chapter_id INTEGER REFERENCES chapters(id);
```

新增字段 `chapter_id`，可为空。AI 分析错题时如识别出对应章节，自动填写。

### 4.3 关系

```
chapters（考纲结构）─1:N→ knowledge_points（AI标签）─1:N→ wrong_questions（错题）
```

查询某章节错题数：
```sql
SELECT COUNT(*) FROM wrong_questions
WHERE knowledge_point_id IN (
    SELECT id FROM knowledge_points WHERE chapter_id = ?
);
```

---

## 5. API 设计

新增文件：`app/api/chapters.py`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/chapters?subject_id=1` | 获取某科完整章节树（含每节点错题数） |
| POST | `/api/chapters` | 新增章节节点 |
| PUT | `/api/chapters/:id` | 编辑章节（名称/排序/描述） |
| DELETE | `/api/chapters/:id` | 删除章节（级联子节点） |
| PATCH | `/api/chapters/:id/rating` | 快速更新掌握度 1-5 |
| PATCH | `/api/chapters/:id/notes` | 快速更新复习笔记 |
| GET | `/api/chapters/progress` | 六科总体进度概览 |
| GET | `/api/chapters/:id/errors` | 该章节关联的错题列表 |

### 5.1 认证

所有端点复用 `get_current_user` JWT 中间件。用户只能操作自己的章节数据。

### 5.2 响应格式示例

`GET /api/chapters?subject_id=1`：

```json
{
    "subject_id": 1,
    "nodes": [{
        "id": 1,
        "name": "函数与导数",
        "level": 0,
        "mastery_rating": null,
        "error_count": 12,
        "reviewed_at": null,
        "children": [{
            "id": 5,
            "name": "函数概念与性质",
            "level": 1,
            "mastery_rating": 4,
            "error_count": 3,
            "children": [
                { "id": 20, "name": "定义域与值域", "level": 2, "mastery_rating": 5, "error_count": 1, "children": [] },
                { "id": 21, "name": "单调性与奇偶性", "level": 2, "mastery_rating": 3, "error_count": 2, "children": [] }
            ]
        }]
    }]
}
```

---

## 6. 前端设计

### 6.1 新页面：`/progress`

**布局（从上到下）：**
1. 顶部概览条：当前学科名 + 已复习 X/Y 知识点 + 平均掌握度 + 进度环
2. 六科 Tab 切换栏（📐数学 ⚛️物理 🧪化学 🧬生物 📖语文 🔤英语）
3. 可折叠章节树（三层）：
   - Level 0（章）：加粗，默认折叠
   - Level 1（节）：展开章后可见
   - Level 2（知识点）：叶子节点，展开节后可见
4. 每节点显示：名称 + 星星评级 (1-5) + 错题数徽标（红色）
5. 右上角浮动按钮：「+ 添加章节」

**交互：**
- ▶/▼ 展开折叠行
- 点击星星弹出快速评级面板（1-5），1 秒完成
- 点击错题数徽标 → 跳转 `/browse` 筛选该章节错题
- 节点长按/右键 → 编辑名称 / 添加子节点 / 删除
- 内联笔记：展开节点后在下方出现输入框

### 6.2 仪表盘卡片（`/dashboard`）

在现有 dashboard Bento Grid 中新增一张卡片「一轮复习进度」，展示六科覆盖率（百分比 + 迷你进度条），点击跳转 `/progress`。

### 6.3 导航

- **桌面端**：顶部导航栏在「统计」和「冲刺」之间加「进度」
- **移动端**：底部 Tab 栏加「📋 进度」

---

## 7. 预置数据（Seed）

### 7.1 考纲来源

- 语文、数学、英语：全国新高考 I 卷考纲
- 物理、化学、生物：广东自主命题考纲

### 7.2 Seed 实现

在 `app/core/seed.py` 新增 `seed_chapters(user_id)` 函数。首次登录时调用，为用户创建完整的六科章节树。

数据结构硬编码为 Python dict，格式：
```python
CHAPTERS_SEED = {
    "数学": {
        "函数与导数": ["函数概念与性质", "基本初等函数", "导数及其应用", "函数综合问题"],
        "解析几何": ["直线与圆", "椭圆", "双曲线", "抛物线", "综合应用"],
        # ...
    },
    # ...
}
```

### 7.3 幂等性

Seed 函数先检查用户是否已有章节数据，有则跳过，不重复插入。

---

## 8. 数据库迁移策略

### 8.1 问题

项目靠 `main.py` 启动时 `Base.metadata.create_all` 建表。这只会建**缺失的表**，不会修改已有表的列。

- 新 `chapters` 表 → 加 model 自动建 ✅
- `ALTER TABLE knowledge_points ADD COLUMN chapter_id` → 不会自动执行 ❌

现有 `cuotiben.db`（本地）和线上 PostgreSQL 的 `knowledge_points` 表都已有数据，ORM 查 `chapter_id` 直接炸。venv 里有 alembic 但没配（无 migrations 目录 / ini），是摆设。

### 8.2 方案：手动迁移函数

不引入 Alembic（为一次 ALTER 配整套迁移框架过重）。在 `app/core/migration.py` 写一个轻量迁移函数：

```python
async def run_migrations():
    """对 SQLite 和 PostgreSQL 安全：检测并补建缺失列"""
    # 1. 检测 knowledge_points 是否有 chapter_id 列
    #    SQLite:  PRAGMA table_info(knowledge_points)
    #    PG:     SELECT column_name FROM information_schema.columns ...
    # 2. 若无 → ALTER TABLE knowledge_points ADD COLUMN chapter_id INTEGER
    # 3. 幂等：有则跳过
```

`main.py` 启动时在 `create_all` 之后调用 `await run_migrations()`。

### 8.3 `knowledge_points` model 同步

`app/models.py` 的 `KnowledgePoint` 类加字段（仅定义映射，不触发 DDL）：
```python
chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=True)
```

配合手动迁移，model 能正确映射到列。

---

## 9. Seed 触发点设计

### 9.1 问题

旧 spec 说"首次登录时调用"，但：
- 现有 `seed_subjects()` 是 `main.py` 启动时全局调一次（无 user 上下文）
- `auth.py` 的 `register`（37-39 行）不做 per-user seed
- `auth.py` 的 `login` 也不做

### 9.2 方案

**两个触发点：**

1. **`POST /api/auth/register`**: 注册成功后 → 检查该 user 是否有 chapters → 若无则 `seed_chapters(user_id)`
2. **`POST /api/auth/login`**: 登录成功后 → 同样检查 → 无则 seed

**幂等逻辑**（`seed_chapters` 内部）：
```python
async def seed_chapters(user_id: int):
    existing = await db.query(Chapter).filter(Chapter.user_id == user_id).first()
    if existing:
        return  # 已有章节数据，跳过
    # 否则插入六科完整章节树
```

这同时解决了"老用户第一次打开新功能时无章节数据"的问题 —— 只要他们登录一次，自动补。

---

## 10. 考纲数据（内容活，非代码活）

六科完整三层考纲硬编码于 `seed.py` 中的 `CHAPTERS_SEED` dict。这是**内容编纂任务**而非编码任务：

- 数据量：六科 × 约 8-15 章 × 约 3-6 节 × 约 2-5 个知识点 ≈ 300-600 个叶子节点
- 来源：语文/数学/英语为全国新高考 I 卷考纲；物理/化学/生物为广东自主命题考纲
- 实现阶段需按权威考纲逐科填写

---

## 11. 技术约束

- 后端：Python FastAPI + SQLAlchemy 异步（与现有一致）
- 前端：Next.js 16 App Router + TypeScript + Tailwind CSS v4（与现有一致）
- 数据库：SQLite（开发）/ PostgreSQL（生产），使用现有 `DatabaseSession` 依赖
- 不引入新依赖（不配 Alembic）
- 不改动现有表的已有列（仅新增 `knowledge_points.chapter_id`）

---

## 12. 测试策略

- 后端单元测试：章节 CRUD、树结构序列化、错题数统计、迁移幂等性
- 前端：章节树渲染、展开折叠、评级交互
- 与现有测试套件不冲突

---

## 13. 风险

- **考纲准确性**：seed 数据需按广东实际考纲填写，实现前再做一次核验
- **迁移兼容**：`ALTER TABLE` 加字段对 SQLite 和 PostgreSQL 均安全；手动迁移函数对两者都做检测再执行。SQLite 用 `PRAGMA table_info`，PostgreSQL 用 `information_schema.columns`
- **老用户兼容**：seed 挂在 register/login 上，幂等检查保证已有章节的用户不重复插。最坏情况：老用户登录后首次打开 `/progress` 需要 1-2 秒等 seed 跑完
- **性能**：三层树约 300+ 节点一次性加载，前端渲染无压力。如未来节点过多可加分页/懒加载
