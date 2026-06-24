# 错题批量导入页面 — 实现计划

> **Goal:** 新增 `/import` 页面（JSON 粘贴导入）+ `/upload` 入口卡片

**Architecture:** 纯前端，调现有 `POST /api/upload/import`。新建 1 个页面组件，修改 2 个文件（upload 页 + api.ts）。

**Tech Stack:** Next.js 16 App Router + TypeScript + Tailwind CSS v4 + Motion

---

### Task 1: api.ts 新增 importQuestions

**Files:** Modify `ai-cuotiben-web/lib/api.ts`

```typescript
// ── 批量导入 ──

export interface ImportQuestion {
  subject_id: number;
  question_content: string;
  knowledge_point_name?: string;
  question_pattern_name?: string;
  question_type?: string;
  correct_answer?: string;
  student_answer?: string;
  solution_steps?: string;
  error_analysis?: string;
  improvement_tips?: string;
  image_url?: string;
}

export interface ImportResult {
  saved_count: number;
  saved_ids: number[];
}

export function importQuestions(questions: ImportQuestion[]): Promise<ImportResult> {
  return apiFetch<ImportResult>("/api/upload/import", {
    method: "POST",
    body: JSON.stringify({ questions }),
  });
}
```

---

### Task 2: /import 页面

**Files:** Create `ai-cuotiben-web/app/import/page.tsx`

完整页面：Navbar + AuthGuard + textarea + JSON 提取 + 导入按钮 + 结果展示。

---

### Task 3: /upload 入口卡片

**Files:** Modify `ai-cuotiben-web/app/upload/page.tsx`

在现有四张卡片后加第五张「成品导入」卡片，绿色主题，FileArrowDown 图标，链接到 `/import`。

---

### 验证

- `npx tsc --noEmit` 零错误
- 页面渲染正常
