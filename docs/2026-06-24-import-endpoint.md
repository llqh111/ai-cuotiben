# 成品错题导入端点 — 实现完成

> 日期：2026-06-24
> 状态：✅ 已上线（commit a02fe47，push 至 main）

## 背景

App 自带的 5 个上传入口全部强制走 DeepSeek 分析管道（`_analyze_pipeline`），
错因 / 思路 / 改进等字段由 DeepSeek 填写，外部 AI 无法直接写入。

本次新增第六个入口：**导入已分析好的成品错题**，绕开 DeepSeek，
让外部 AI（Claude 等）输出完整字段后直接落库。

## 新增端点

`POST /api/upload/import` — 需登录（`get_current_user`），导入到当前用户名下。

### 请求体

```json
{
  "questions": [
    {
      "subject_id": 2,
      "knowledge_point_name": "导数与单调性",
      "question_pattern_name": "含参求单调区间",
      "question_content": "已知 f(x)=x²-ax，求 a 的取值范围。",
      "question_type": "essay",
      "correct_answer": "a ∈ [3, +∞)",
      "student_answer": "a > 3",
      "solution_steps": "求导分离参数，端点取等。",
      "error_analysis": "漏端点取等。",
      "improvement_tips": "含参题单独验端点。"
    }
  ]
}
```

### 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| subject_id | ✅ | 1语文 2数学 3英语 4物理 5化学 6生物 |
| question_content | ✅ | 题干 |
| knowledge_point_name | 选 | 自动匹配/新建，默认「未分类」 |
| question_pattern_name | 选 | 自动匹配/新建，默认「未分类题型」 |
| question_type | 选 | choice / fill_blank / essay，默认 essay |
| correct_answer / student_answer / solution_steps / error_analysis / improvement_tips | 选 | 原样落库 |
| image_url | 选 | 复习展示图 URL |

### 行为

- 知识点 / 题型按名称匹配已有或新建（复用 `_get_or_create_kp` / `_get_or_create_pattern`）。
- 入库状态 `status=analyzed` / `mastery_level=new`，与正常上传一致，
  自动进入间隔复习队列（review_engine：1-3-7-14-30 天）。
- subject_id 不存在 → 400；questions 空 → 400。

### 返回

```json
{ "status": "success", "data": { "saved_count": 1, "saved_ids": [42] } }
```

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 分析来源 | 外部 AI 直接给成品，绕开 DeepSeek | 用更强模型的分析质量 |
| 入库口 | 新增独立端点，不改现有 5 口 | 纯追加，零破坏 |
| 知识点/题型 | 复用现有 get_or_create 助手 | 与上传行为一致 |
| 复习排期 | 沿用 review_engine | 不破坏间隔复习逻辑 |

## 文件清单

| 文件 | 操作 |
|------|------|
| `ai-cuotiben-api/app/schemas/question.py` | 新增 `ImportQuestion` / `ImportBatch` |
| `ai-cuotiben-api/app/api/upload.py` | 新增 `POST /import` 端点 + import |
| `ai-cuotiben-api/tests/test_import.py` | 新建，4 个测试 |

## 检查

- 新增测试：✅ 4/4 passed
  - 成品字段完整落库 + 状态 new
  - 未见知识点自动新建并挂正确科目
  - 不存在 subject_id 返回 400
  - 空列表返回 400
- 基线对比：✅ 改动前后非本次测试均 22 failed / 39 passed，**0 新增失败**
  （那 22 个为既有问题：陈旧 test_classify + 多个测试本地 client 未装 get_db override 污染真实库）

## 已知遗留（非本次引入）

- 部分测试自带本地 `client` fixture 未装 `get_db` override，跑去读写真实
  `cuotiben.db`，整套同跑时互相污染 → 连环失败。建议后续统一改用 conftest 的
  `client`（已装 override + 共享内存库）。
- `tests/test_classify.py` 仍 import 旧名 `persist_analyzed_question`（现为 `_persist`），收集即报错。

## 前端

本次未动前端。当前只能用 API 工具 / PowerShell `Invoke-RestMethod` / curl 调用。
后续可加一个网页粘贴框做导入页。
