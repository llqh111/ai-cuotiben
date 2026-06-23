"use client";
import { motion, AnimatePresence } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, CheckCircle, XCircle, CircleNotch, Confetti } from "@phosphor-icons/react";
import Link from "next/link";
import { useState, use, useEffect } from "react";
import { apiFetch, useAuthGuard, subjectName } from "@/lib/api";

interface ReviewQuestion {
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

export default function ReviewPage({ params }: { params: Promise<{ subjectId: string }> }) {
  useAuthGuard();
  const { subjectId } = use(params);
  const [queue, setQueue] = useState<ReviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<ReviewQuestion[]>(`/api/review/daily/${subjectId}`)
      .then(setQueue)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subjectId]);

  const current = queue[index];

  const handleSubmit = async (isCorrect: boolean) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/review/submit`, {
        method: "POST",
        body: JSON.stringify({ question_id: current.id, is_correct: isCorrect }),
      });
    } catch {
      // 提交失败不阻断练习，下一题继续
    } finally {
      setSubmitting(false);
      setIsRevealed(false);
      setIndex((i) => i + 1);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[100dvh] items-center justify-center">
          <CircleNotch size={32} className="animate-spin text-zinc-400" />
        </main>
      </>
    );
  }

  const finished = !current;

  return (
    <>
      <Navbar />
      <main className="flex min-h-[100dvh] flex-col items-center justify-center p-4">
        <div className="absolute top-32 w-full max-w-2xl px-4 flex justify-between items-center z-10">
          <Link href={`/subject/${subjectId}`} className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors dark:text-zinc-400 dark:hover:text-zinc-100">
            <ArrowLeft weight="bold" /> 退出复习
          </Link>
          <div className="text-sm font-medium tracking-widest uppercase text-zinc-400">
            {finished ? `${queue.length} / ${queue.length}` : `${index + 1} / ${queue.length}`}
          </div>
        </div>

        {finished ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
            className="text-center"
          >
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10">
              <Confetti size={32} weight="fill" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tighter">
              {queue.length === 0 ? `${subjectName(subjectId)} 暂无待复习` : "本轮复习完成"}
            </h1>
            <p className="mt-3 text-zinc-500 dark:text-zinc-400">
              {queue.length === 0 ? "去录入新错题，或换个科目复习。" : `刚刚复习了 ${queue.length} 道，继续保持节奏。`}
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <Link href="/dashboard" className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white dark:bg-white dark:text-zinc-900">
                返回仪表盘
              </Link>
              <Link href="/upload" className="rounded-full border border-black/5 bg-white px-6 py-3 text-sm font-medium dark:border-white/10 dark:bg-white/5">
                录入错题
              </Link>
            </div>
          </motion.div>
        ) : (
          <div className="relative w-full max-w-2xl mt-12">
            <div className="absolute inset-0 translate-y-4 scale-95 rounded-[2rem] bg-black/5 dark:bg-white/5 opacity-50 blur-[2px]" />
            <div className="absolute inset-0 translate-y-8 scale-90 rounded-[2rem] bg-black/5 dark:bg-white/5 opacity-20 blur-[4px]" />

            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
              className="relative premium-shell bg-white dark:bg-[#0a0a0a]"
            >
              <div className="premium-core p-8 md:p-12 flex flex-col min-h-[400px]">
                <div className="mb-8 flex justify-between items-start">
                  <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-black/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] dark:border-white/10 dark:bg-white/5">
                    {TYPE_LABEL[current.question_type] ?? "错题"}
                  </div>
                  <div className="text-xs font-medium text-zinc-400">
                    {current.mastery_level === "new" ? "新题" : "复习中"}
                  </div>
                </div>

                <div className="text-xl md:text-2xl font-medium leading-relaxed tracking-tight text-zinc-900 dark:text-zinc-100 flex-grow whitespace-pre-wrap">
                  {current.question_content}
                </div>

                <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800/50 relative">
                  <AnimatePresence mode="wait">
                    {!isRevealed ? (
                      <motion.div key="hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center">
                        <Button onClick={() => setIsRevealed(true)} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700">
                          查看答案
                        </Button>
                      </motion.div>
                    ) : (
                      <motion.div key="revealed" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }} className="flex flex-col gap-6">
                        <div>
                          <h4 className="text-xs uppercase tracking-widest text-emerald-500 font-medium mb-2">正确答案</h4>
                          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">{current.correct_answer}</p>
                        </div>
                        {current.solution_steps && (
                          <div>
                            <h4 className="text-xs uppercase tracking-widest text-zinc-400 font-medium mb-2">解析</h4>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{current.solution_steps}</p>
                          </div>
                        )}
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          <Button onClick={() => handleSubmit(false)} disabled={submitting} className="w-full justify-center bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/40">
                            <XCircle size={20} weight="fill" className="mr-2" /> 不记得
                          </Button>
                          <Button onClick={() => handleSubmit(true)} disabled={submitting} className="w-full justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-900/40">
                            <CheckCircle size={20} weight="fill" className="mr-2" /> 记得
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </>
  );
}
