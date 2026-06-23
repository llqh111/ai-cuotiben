# 后端核心闭环 MVP — 设计文档

> 设计日期：2026-06-23
> 状态：待用户复核
> 范围：在现有 FastAPI 后端上，实现「账号 + 真分类 + 错题管理 + 复习」四子系统
> 上位文档：`docs/specs/2026-06-22-ai-cuotiben-design.md`

## 目标

把后端从「单表 demo」推进到「核心闭环 MVP」：用户能注册登录、上传错题经 AI 两轮分析自动归类、按多维筛选查看自己的错题、并通过间隔重复算法复习。让前端 dashboard / 错题详情 / 图谱继续可用，并为后续前端接线（登录、科目、复习页）准备好接口。

## 不在本轮范围（明确缓做）

- 真 OCR（PaddleOCR）—— 继续用 mock，下一独立步骤
- AI 生成相似题（`practice_questions` 表）
- 知识点关联图谱真实算法（`knowledge_relations` 表）
- 导出 PDF
- 考前冲刺模式
- 一图拆多题（本轮一图一题，多题拆分留待后续）
- 前端页面接线（本轮只交付后端接口）

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 数据库 | 继续 SQLite（`sqlite+aiosqlite`） | 零安装、单文件，适合本地学习；schema 写成可移植到 PostgreSQL |
| 主键 | 自增整数 INT（沿用现有风格） | 比 UUID 简单直观；规格的 UUID 等上线再换 |
| 旧数据 | 重建 `cuotiben.db` | 仅测试数据，无保留价值 |
| 密码 | bcrypt 哈希存储 | 不可逆，规格要求 |
| 登录态 | JWT，有效期 7 天 | 规格要求；标准做法 |
| OCR | 保持 mock | 真 OCR 下一轮 |
| 开发方式 | TDD（先测试后实现） | 每层可单独验证 |

## 数据模型（本轮 6 张表）

主键统一自增 INT。所有用户数据通过 `user_id` 外键隔离。

### users
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| nickname | VARCHAR | 昵称（不要求全局唯一） |
| passphrase_hash | VARCHAR | bcrypt 哈希 |
| exam_date | DATE nullable | 高考日期 |
| theme_preference | VARCHAR | light / dark，默认 light |
| created_at | DATETIME | |
| last_login_at | DATETIME nullable | |

约束：`nickname + passphrase` 组合唯一。注册时若昵称已存在但口令不符 → 视为新用户；若昵称+口令组合命中 → 视为登录。详见「账号系统」。

### subjects（启动时预置 6 条）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| name | VARCHAR | 语文/数学/英语/物理/化学/生物 |
| icon | VARCHAR | 图标标识 |
| color | VARCHAR | 主题色 |

### knowledge_points
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| user_id | INT FK | 知识点按用户私有 |
| subject_id | INT FK | 所属科目 |
| parent_id | INT FK nullable | 多级嵌套（本轮可只用一级，字段预留） |
| name | VARCHAR | |
| description | TEXT nullable | |

### question_patterns
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| user_id | INT FK | |
| knowledge_point_id | INT FK | 所属知识点 |
| name | VARCHAR | 题型名称 |
| description | TEXT nullable | |
| difficulty | INT | 1-5，默认 3 |

### wrong_questions
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| user_id | INT FK | |
| subject_id | INT FK | |
| knowledge_point_id | INT FK nullable | |
| question_pattern_id | INT FK nullable | |
| image_url | VARCHAR nullable | 原图路径/文件名 |
| ocr_text | TEXT | OCR 原始文本（mock） |
| question_content | TEXT | AI 提取的题目 |
| question_type | VARCHAR | choice / fill_blank / essay |
| correct_answer | TEXT | |
| student_answer | TEXT nullable | |
| error_analysis | TEXT | AI 错因 |
| solution_steps | TEXT | AI 解题步骤 |
| improvement_tips | TEXT nullable | AI 改进建议 |
| status | VARCHAR | pending / ocr_done / analyzed |
| mastery_level | VARCHAR | new / learning / mastered，默认 new |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### review_records
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| question_id | INT FK | |
| user_id | INT FK | |
| is_correct | BOOLEAN | |
| interval_index | INT | 当前间隔在序列中的下标（0..4） |
| next_review_date | DATE nullable | 下次复习日期；mastered 时为 null |
| consecutive_correct | INT | 连续正确次数 |
| reviewed_at | DATETIME | |

> 设计说明：每题的「当前复习状态」由该题最新一条 review_record 决定。题首次创建时不写 record，由首次复习提交时初始化。`wrong_questions.mastery_level` 作为冗余快照随复习更新，便于筛选与统计。

## 账号系统

### 注册/登录逻辑（POST /api/auth/register、/api/auth/login）

口令以 bcrypt 存储，无法反查，因此「昵称+口令组合命中」需遍历同昵称用户逐一 `bcrypt.checkpw` 验证。

- **register**：输入 nickname + passphrase。
  - 若存在同 nickname 且口令校验通过的用户 → 返回该用户 token（等价登录，符合「组合即身份」）。
  - 否则创建新用户（同昵称不同口令允许并存）。
- **login**：输入 nickname + passphrase。
  - 遍历同 nickname 用户逐一校验口令；命中 → 返回 token、更新 last_login_at；不命中 → 401。

### JWT
- 载荷含 `user_id`、`exp`（7 天）。
- 受保护接口通过 `Authorization: Bearer <token>` 头解析出当前 user。
- 提供 `get_current_user` 依赖，注入到所有需要用户隔离的接口。
- 密钥从环境变量 `JWT_SECRET` 读取（写入 `.env`，已被 .gitignore）。

### 新增依赖
`bcrypt`、`python-jose[cryptography]`（JWT），写入 requirements.txt。

## 真分类（改造 /api/upload）

流程：`接收文件 → mock OCR → DeepSeek 两轮 → 落库归类`。需登录（带 token）。

**第一轮 — 题目解析**：输入 OCR 文本（+ 可选学生答案），输出 JSON：
`question_content, question_type(choice/fill_blank/essay), correct_answer, solution_steps, knowledge_point_name, subject`。

**第二轮 — 错因分类与增量匹配**：把该用户在该科目下**已有的知识点列表、题型列表**喂给 AI，要求：
- 优先匹配已有知识点/题型（返回其名称）；
- 无合适项时给出新名称（系统据此创建）。
输出 JSON：`error_analysis, improvement_tips, matched_knowledge_point, matched_question_pattern, is_new_knowledge_point(bool), is_new_question_pattern(bool)`。

**落库**：
- 解析 subject → 找/建 subject（实际是预置 6 科，按 name 命中）。
- 知识点：在该 user+subject 下按 name 查；无则建 knowledge_point。
- 题型：在该知识点下按 name 查；无则建 question_pattern。
- 写 wrong_question（status=analyzed, mastery_level=new），关联上述 id。
- AI 失败兜底：保留 ocr_text，status=pending，分类置空，不阻塞返回。

AI service 改造：拆出 `parse_question(ocr_text, student_answer)` 与 `classify_question(question, existing_kps, existing_patterns)` 两函数，各带 mock 兜底（无 key 时返回结构化假数据，便于离线测试）。

## 错题管理（/api/questions）

全部需登录，只能操作自己的题。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/questions` | 列表，query 支持 `subject_id` / `knowledge_point_id` / `question_pattern_id` / `mastery_level` 筛选 |
| GET | `/api/questions/{id}` | 详情（校验归属） |
| PUT | `/api/questions/{id}` | 编辑：可改 question_content / correct_answer / 分类归属 / mastery_level |
| DELETE | `/api/questions/{id}` | 删除（连带其 review_records） |
| GET | `/api/questions/tree/{subject_id}` | 该科目下 知识点→题型→题数 的嵌套结构（供前端科目页） |

## 复习系统（/api/review）

### 间隔重复引擎（纯函数，独立可测）
```
INTERVALS = [1, 3, 7, 14, 30]  # 天

calculate_next(is_correct, interval_index, consecutive_correct):
  答对:
    consecutive_correct += 1
    若 consecutive_correct >= 5 → mastered, next_date=None
    否则若 interval_index >= 4 → mastered, next_date=None
    否则 interval_index += 1, next_date = today + INTERVALS[interval_index], learning
  答错:
    consecutive_correct = 0
    interval_index = 0, next_date = today + INTERVALS[0], learning
```

### 接口
| 方法 | 路径 | 抽题逻辑 |
|------|------|---------|
| GET | `/api/review/daily/{subject_id}` | 该科目 next_review_date ≤ 今天 且未 mastered 的题 |
| GET | `/api/review/random/{subject_id}?count=10` | 该科目未 mastered 题随机抽 count 道 |
| GET | `/api/review/pattern/{pattern_id}` | 该题型下未 mastered 题 |
| POST | `/api/review/submit` | body: `question_id, is_correct`；写 review_record、更新题 mastery_level，返回新状态与下次复习日 |

抽题返回完整字段，解答题「先不看答案」的展示策略由前端控制（与规格一致）。

## 统计扩展（/api/stats）

- GET `/api/stats/overview` → total / mastered / learning / new 计数、掌握率（真实计算，不再用假公式）、连续复习天数。
- GET `/api/stats/weak-points` → 错题最多且掌握率最低的知识点 TOP5。
- 保留 `/api/stats`（dashboard 用）与 `/api/stats/graph/{subject}`（图谱用），改为真实按 user 统计。

> 注：现有 stats 接口未带用户隔离，本轮统一加 `get_current_user`。前端调用需带 token —— 前端接线属下一轮，后端先就位。

## 项目结构（目标）

```
app/
  database.py            # 不变（SQLite async）
  models.py              # 扩展为 6 个模型
  core/
    security.py          # bcrypt 哈希、JWT 签发/校验、get_current_user 依赖
    seed.py              # 启动时预置 6 科目
  schemas/               # Pydantic 请求/响应模型（按域拆文件）
  services/
    ocr_service.py       # 不变（mock）
    ai_service.py        # 拆为 parse_question / classify_question
    review_engine.py     # 间隔重复纯函数
  api/
    auth.py              # 新增
    upload.py            # 改造
    questions.py         # 扩展
    review.py            # 新增
    stats.py             # 扩展
main.py                  # 注册新路由 + 启动时 seed
tests/                   # pytest，按域分文件
```

## 错误处理

| 场景 | 处理 |
|------|------|
| 未带/无效 token | 401 |
| 访问他人数据 | 404（不泄露存在性） |
| DeepSeek 超时/失败 | 保留 OCR 文本，status=pending，分类置空，正常返回 |
| AI 返回非法 JSON | 兜底默认值，标记 status=pending |
| 文件类型非白名单 | 400（jpg/jpeg/png/pdf） |

## 测试策略（TDD）

每子系统先写 pytest：
1. **security**：bcrypt 往返、JWT 签发/过期/篡改、get_current_user。
2. **auth**：注册新建、组合命中即登录、错误口令 401、同昵称不同口令并存。
3. **review_engine**（纯函数，重点）：答对升档、答错重置、到顶 mastered、连续 5 次 mastered。
4. **classify 落库**：新知识点创建、已有知识点复用、题型同理（用 mock AI）。
5. **questions**：筛选、归属校验、编辑、删除连带。
6. **review 接口**：daily 到期筛选、submit 后状态流转。

目标：核心逻辑（引擎、auth、分类落库）覆盖优先。

## 验收标准

- 注册 → 拿 token → 带 token 上传 → AI 两轮分析后题目带知识点/题型落库 → 列表能按知识点筛到 → 复习提交答错/答对后 next_review_date 与 mastery_level 正确变化。
- 全链路可用 curl 跑通；pytest 绿。
