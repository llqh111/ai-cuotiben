"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { PremiumCard } from "@/components/ui/PremiumCard";
import Link from "next/link";
import { ArrowLeft, Network, BookOpen } from "@phosphor-icons/react";
import { use, useEffect, useState } from "react";
import { apiFetch, useAuthGuard, subjectName } from "@/lib/api";

interface PatternNode { id: number; name: string; count: number }
interface KpNode { id: number; name: string; patterns: PatternNode[] }
interface QuestionRow { id: number; mastery_level: string }

export default function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  useAuthGuard();
  const { id } = use(params);
  const [tree, setTree] = useState<KpNode[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);

  useEffect(() => {
    apiFetch<KpNode[]>(`/api/questions/tree/${id}`).then(setTree).catch(() => {});
    apiFetch<QuestionRow[]>(`/api/questions?subject_id=${id}`).then(setQuestions).catch(() => {});
  }, [id]);

  const total = questions.length;
  const mastered = questions.filter((q) => q.mastery_level === "mastered").length;

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 pt-20 pb-24 md:py-40">
        <Link href="/dashboard" className="mb-12 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors dark:text-zinc-400 dark:hover:text-zinc-100">
          <ArrowLeft weight="bold" /> 返回仪表盘
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          >
            <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">
              {subjectName(id)}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-zinc-500 dark:text-zinc-400">
              共 {total} 道错题 · 已掌握 {mastered} 道
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
            className="flex gap-3"
          >
            <Link href={`/review/${id}`} className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
              <BookOpen size={18} weight="fill" /> 开始复习
            </Link>
            <Link href={`/graph/${id}`} className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white px-5 py-3 text-sm font-medium shadow-sm transition-all hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
              <Network size={18} /> 知识图谱
            </Link>
          </motion.div>
        </div>

        {tree.length === 0 ? (
          <PremiumCard delay={0.2} className="w-full">
            <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">
              该科目还没有错题。去 <Link href="/upload" className="underline">录入</Link> 第一道吧。
            </div>
          </PremiumCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {tree.map((kp, i) => {
              const kpTotal = kp.patterns.reduce((s, p) => s + p.count, 0);
              return (
                <PremiumCard key={kp.id} delay={0.2 + i * 0.1} className="md:col-span-6">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-semibold tracking-tight">{kp.name}</h3>
                    <span className="text-sm font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full">
                      {kpTotal} 题
                    </span>
                  </div>
                  <div className="space-y-4">
                    {kp.patterns.length === 0 ? (
                      <p className="text-sm text-zinc-400">暂无题型</p>
                    ) : (
                      kp.patterns.map((p) => (
                        <div key={p.id} className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/50 pb-4 last:border-0 last:pb-0">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">{p.name}</span>
                          <span className="text-sm text-zinc-400">{p.count} 题</span>
                        </div>
                      ))
                    )}
                  </div>
                </PremiumCard>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
