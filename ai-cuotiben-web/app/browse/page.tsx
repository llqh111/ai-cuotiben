"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { BrowseCard } from "@/components/BrowseCard";
import { CircleNotch, BookOpen } from "@phosphor-icons/react";
import Link from "next/link";
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
            <Link href="/upload" className="underline text-zinc-900 dark:text-zinc-100 mx-1">
              录入
            </Link>
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
