# 错题浏览功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/browse` 页面，按六科展示错题卡片网格，点击卡片就地展开自测并同步更新掌握状态。

**Architecture:** 纯前端任务，无需后端改动。复用现有 `GET /api/questions?subject_id=X` 和 `POST /api/review/submit`。新增一个页面组件和一个卡片组件，修改导航栏添加入口链接。

**Tech Stack:** Next.js 16 (App Router), TypeScript, motion/react, Phosphor Icons, Tailwind CSS

---

### Task 1: 创建 BrowseCard 卡片组件

**Files:**
- Create: `ai-cuotiben-web/components/BrowseCard.tsx`

- [ ] **Step 1: 创建组件文件并实现**

```tsx
"use client";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/Button";
import { CheckCircle, XCircle, Eye } from "@phosphor-icons/react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface BrowseCardProps {
  id: number;
  question_content: string;
  question_type: string;
  correct_answer: string;
  solution_steps: string;
  mastery_level: string;
}

const TYPE_LABEL: Record<string, string> = {
  choice: "选择题",
  fill_blank: "填空题",
  essay: "解答题",
};

const MASTERY_BADGE: Record<string, { label: string; color: string }> = {
  new: { label: "新录入", color: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" },
  learning: { label: "复习中", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" },
  mastered: { label: "已掌握", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" },
};

export function BrowseCard({
  id,
  question_content,
  question_type,
  correct_answer,
  solution_steps,
  mastery_level: initialMastery,
}: BrowseCardProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mastery, setMastery] = useState(initialMastery);

  const badge = MASTERY_BADGE[mastery] ?? MASTERY_BADGE.new;

  const handleSubmit = async (isCorrect: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch<{ mastery_level: string }>("/api/review/submit", {
        method: "POST",
        body: JSON.stringify({ question_id: id, is_correct: isCorrect }),
      });
      setMastery(res.mastery_level);
      setIsRevealed(false);
    } catch {
      // 提交失败不阻断
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      className="premium-shell"
    >
      <div className="premium-core p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-black/5 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] dark:border-white/10 dark:bg-white/5">
            {TYPE_LABEL[question_type] ?? "错题"}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.color}`}>
            {badge.label}
          </span>
        </div>

        {/* Question */}
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 line-clamp-4 whitespace-pre-wrap">
          {question_content}
        </p>

        {/* Action */}
        {!isRevealed ? (
          <Button
            onClick={() => setIsRevealed(true)}
            className="w-full justify-center bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
          >
            <Eye size={16} weight="fill" className="mr-2" />
            查看答案
          </Button>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key="revealed"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
              className="flex flex-col gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50"
            >
              <div>
                <h4 className="text-[10px] uppercase tracking-widest text-emerald-500 font-medium mb-1">正确答案</h4>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">{correct_answer}</p>
              </div>
              {solution_steps && (
                <div>
                  <h4 className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium mb-1">解析</h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{solution_steps}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => handleSubmit(false)}
                  disabled={submitting}
                  className="w-full justify-center bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/40"
                >
                  <XCircle size={18} weight="fill" className="mr-1.5" /> 不记得
                </Button>
                <Button
                  onClick={() => handleSubmit(true)}
                  disabled={submitting}
                  className="w-full justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                >
                  <CheckCircle size={18} weight="fill" className="mr-1.5" /> 记得
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add ai-cuotiben-web/components/BrowseCard.tsx
git commit -m "feat: add BrowseCard component for question browsing"
```

---

### Task 2: 创建 /browse 页面

**Files:**
- Create: `ai-cuotiben-web/app/browse/page.tsx`

- [ ] **Step 1: 创建页面文件并实现**

```tsx
"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { BrowseCard } from "@/components/BrowseCard";
import { CircleNotch, BookOpen } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { apiFetch, useAuthGuard, SUBJECTS, subjectName } from "@/lib/api";

interface QuestionRow {
  id: number;
  question_content: string;
  question_type: string;
  correct_answer: string;
  solution_steps: string;
  mastery_level: string;
  subject_id: number;
}

export default function BrowsePage() {
  useAuthGuard();
  const [activeSubject, setActiveSubject] = useState<number>(1);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setQuestions([]);
    apiFetch<QuestionRow[]>(`/api/questions?subject_id=${activeSubject}`)
      .then(setQuestions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeSubject]);

  const total = questions.length;
  const mastered = questions.filter((q) => q.mastery_level === "mastered").length;

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 py-32 md:py-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          className="mb-10"
        >
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <BookOpen size={24} weight="fill" />
          </div>
          <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl">错题本</h1>
          <p className="mt-2 text-lg text-zinc-500 dark:text-zinc-400">
            {subjectName(activeSubject)} · 共 {total} 道 · 已掌握 {mastered} 道
          </p>
        </motion.div>

        {/* Subject Tabs */}
        <div className="mb-10 flex gap-2 overflow-x-auto pb-2">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSubject(s.id)}
              className={`shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-all ${
                activeSubject === s.id
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Question Cards Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <CircleNotch size={32} className="animate-spin text-zinc-400" />
          </div>
        ) : questions.length === 0 ? (
          <div className="py-20 text-center text-zinc-400">
            还没有错题，去
            <a href="/upload" className="underline text-zinc-900 dark:text-zinc-100">录入</a>
            吧。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {questions.map((q) => (
              <BrowseCard
                key={q.id}
                id={q.id}
                question_content={q.question_content}
                question_type={q.question_type}
                correct_answer={q.correct_answer}
                solution_steps={q.solution_steps}
                mastery_level={q.mastery_level}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add ai-cuotiben-web/app/browse/page.tsx
git commit -m "feat: add browse page with subject tabs and question card grid"
```

---

### Task 3: 修改 Navbar 添加「错题本」入口

**Files:**
- Modify: `ai-cuotiben-web/components/ui/Navbar.tsx`

- [ ] **Step 1: 在导航链接中添加「错题本」**

找到 Navbar.tsx 中的 `<nav>` 标签，在「冲刺」链接后添加一行：

```tsx
<Link href="/browse" className="hover:text-zinc-900 transition-colors dark:hover:text-white">错题本</Link>
```

修改后的完整 nav 部分：

```tsx
<nav className="hidden items-center gap-6 text-sm font-medium text-zinc-500 md:flex dark:text-zinc-400">
  <Link href="/dashboard" className="hover:text-zinc-900 transition-colors dark:hover:text-white">仪表盘</Link>
  <Link href="/upload" className="hover:text-zinc-900 transition-colors dark:hover:text-white">录入</Link>
  <Link href="/stats" className="hover:text-zinc-900 transition-colors dark:hover:text-white">统计</Link>
  <Link href="/sprint" className="hover:text-zinc-900 transition-colors dark:hover:text-white">冲刺</Link>
  <Link href="/browse" className="hover:text-zinc-900 transition-colors dark:hover:text-white">错题本</Link>
  <Link href="/settings" className="hover:text-zinc-900 transition-colors dark:hover:text-white">设置</Link>
</nav>
```

- [ ] **Step 2: 提交**

```bash
git add ai-cuotiben-web/components/ui/Navbar.tsx
git commit -m "feat: add browse link to navbar"
```

---

### 验证清单

部署后手动验证：

- [ ] 登录后导航栏出现「错题本」
- [ ] 点击进入 `/browse`，默认显示语文错题
- [ ] 六科标签可切换，切换后加载对应科目错题
- [ ] 卡片网格正常展示每题摘要 + 题型 + 掌握状态
- [ ] 点击「查看答案」→ 卡片展开显示答案/解析 + 自测按钮
- [ ] 点击「记得」→ 卡片状态更新，答案区域收起
- [ ] 点击「不记得」→ 同上
- [ ] 无错题的科目显示空状态提示
- [ ] light/dark 主题正常
