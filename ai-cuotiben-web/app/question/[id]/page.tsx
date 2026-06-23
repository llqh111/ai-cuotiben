"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { Button } from "@/components/ui/Button";
import { DownloadSimple, Sparkle, ArrowLeft, CircleNotch } from "@phosphor-icons/react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { apiFetch, useAuthGuard, subjectName } from "@/lib/api";

interface QuestionDetail {
  subject_id: number;
  original_text: string;
  analysis: string;
  answer: string;
}

export default function QuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  useAuthGuard();
  const { id } = use(params);
  const [data, setData] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<QuestionDetail>(`/api/questions/${id}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="mx-auto w-full max-w-7xl px-4 py-32 md:py-40 flex justify-center items-center h-[50vh]">
           <CircleNotch size={32} className="animate-spin text-zinc-400" />
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Navbar />
        <main className="mx-auto w-full max-w-7xl px-4 py-32 md:py-40 flex justify-center items-center h-[50vh]">
           <p className="text-zinc-500">找不到该题目信息</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 py-32 md:py-40">
        <Link href="/dashboard" className="mb-12 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors dark:text-zinc-400 dark:hover:text-zinc-100">
          <ArrowLeft weight="bold" /> 返回仪表盘
        </Link>
        
        {/* Editorial Split Layout */}
        <div className="flex flex-col gap-12 md:flex-row md:gap-16">
          
          {/* Left Column: Typography & Content */}
          <div className="w-full md:w-[55%]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-black/5 bg-black/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] dark:border-white/10 dark:bg-white/5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span> 新录入
              </div>
              <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl leading-[1.1]">
                {subjectName(data.subject_id)} 错题解析
              </h1>
              
              {/* Question Content */}
              <div className="mt-12">
                <h3 className="text-sm font-medium uppercase tracking-widest text-zinc-400">原题</h3>
                <div className="mt-4 rounded-2xl bg-zinc-100 p-6 text-lg leading-relaxed dark:bg-[#0a0a0a] whitespace-pre-wrap">
                  {data.original_text}
                </div>
              </div>

              {/* AI Analysis */}
              <div className="mt-12">
                <h3 className="text-sm font-medium uppercase tracking-widest text-zinc-400">AI 错因分析</h3>
                <p className="mt-4 text-zinc-600 leading-relaxed dark:text-zinc-400 whitespace-pre-wrap">
                  {data.analysis}
                </p>
              </div>

              {/* Solution */}
              <div className="mt-12">
                <h3 className="text-sm font-medium uppercase tracking-widest text-zinc-400">正确解析</h3>
                <div className="mt-4 prose prose-zinc dark:prose-invert whitespace-pre-wrap">
                  {data.answer}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right Column: Actions (Z-Axis Cascade concept) */}
          <div className="w-full md:w-[45%] flex flex-col gap-6 relative">
            <PremiumCard delay={0.2} coreClassName="flex flex-col gap-6">
              <div>
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
                  <Sparkle size={20} weight="fill" />
                </div>
                <h3 className="text-xl font-semibold tracking-tight">AI 相似题生成</h3>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  根据这道题的考点和你的错因，生成 3 道难度相近的练习题。
                </p>
              </div>
              <Button icon className="w-full justify-center">生成相似题</Button>
            </PremiumCard>

            <PremiumCard delay={0.3} className="md:-mt-2" coreClassName="flex flex-col gap-6">
              <div>
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  <DownloadSimple size={20} weight="fill" />
                </div>
                <h3 className="text-xl font-semibold tracking-tight">导出为 PDF</h3>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  将此题与你的分析笔记导出为可打印格式。
                </p>
              </div>
              <Button icon className="w-full justify-center bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700">导出无答案版</Button>
            </PremiumCard>
          </div>

        </div>
      </main>
    </>
  );
}
