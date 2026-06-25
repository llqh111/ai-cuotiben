"use client";
import { motion, AnimatePresence } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, CheckCircle, XCircle, CircleNotch, Confetti, Star, ThumbsUp } from "@phosphor-icons/react";
import Link from "next/link";
import { useState, use, useEffect } from "react";
import { apiFetch, useAuthGuard, subjectName, imageSrc } from "@/lib/api";

interface ReviewQuestion {
  id: number;
  question_content: string;
  question_type: string;
  correct_answer: string;
  solution_steps: string;
  mastery_level: string;
  image_url?: string;
}

const TYPE_LABEL: Record<string, string> = {
  choice: "选择题", fill_blank: "填空题", essay: "解答题",
};

// 从正确选项中提取选项字母
function extractChoiceOptions(answer: string): string[] {
  // 尝试匹配 A/B/C/D 格式
  const options: string[] = [];
  for (const ch of ["A", "B", "C", "D", "E", "F"]) {
    if (answer.includes(ch)) options.push(ch);
  }
  return options.length >= 2 ? options : ["A", "B", "C", "D"];
}

export default function ReviewPage({ params }: { params: Promise<{ subjectId: string }> }) {
  useAuthGuard();
  const { subjectId } = use(params);
  const [queue, setQueue] = useState<ReviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // 选择题状态
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [choiceSubmitted, setChoiceSubmitted] = useState(false);
  // 填空题状态
  const [fillInput, setFillInput] = useState("");
  const [fillSubmitted, setFillSubmitted] = useState(false);
  // 解答题状态
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    apiFetch<ReviewQuestion[]>(`/api/review/daily/${subjectId}`)
      .then(setQueue)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subjectId]);

  const current = queue[index];

  const resetStates = () => {
    setSelectedOption(null);
    setChoiceSubmitted(false);
    setFillInput("");
    setFillSubmitted(false);
    setIsRevealed(false);
  };

  const handleSubmit = async (rating: 1 | 2 | 3 | 4) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/review/submit`, {
        method: "POST",
        body: JSON.stringify({ question_id: current.id, rating }),
      });
    } catch {
      // 提交失败不阻断
    } finally {
      setSubmitting(false);
      resetStates();
      setIndex((i) => i + 1);
    }
  };

  // 选择题：点击选项后自动判分
  const handleChoiceSelect = (opt: string) => {
    if (choiceSubmitted) return;
    setSelectedOption(opt);
    setChoiceSubmitted(true);
  };

  // 填空题：输入后点击提交比对
  const handleFillSubmit = () => {
    if (fillSubmitted || !fillInput.trim()) return;
    setFillSubmitted(true);
  };

  const isChoiceCorrect = current && selectedOption
    ? current.correct_answer.trim().toUpperCase().startsWith(selectedOption)
    : false;
  const isFillCorrect = current
    ? fillInput.trim() === current.correct_answer.trim()
    : false;

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

                {current.image_url && (
                  <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <img
                      src={imageSrc(current.image_url)}
                      alt="题目原图"
                      className="w-full object-contain max-h-72"
                    />
                  </div>
                )}

                <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800/50 relative">
                  {/* ═══════ 选择题：ABCD 按钮 ═══════ */}
                  {current.question_type === "choice" && (
                    <div className="flex flex-col gap-4">
                      {choiceSubmitted ? (
                        <AnimatePresence mode="wait">
                          <motion.div key="choice-result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
                            <div className={`rounded-2xl p-4 ${isChoiceCorrect ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-red-50 dark:bg-red-500/10"}`}>
                              <p className={`text-sm font-medium ${isChoiceCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                {isChoiceCorrect ? "✅ 回答正确" : `❌ 回答错误，正确答案是 ${current.correct_answer}`}
                              </p>
                            </div>
                            {current.solution_steps && (
                              <div>
                                <h4 className="text-xs uppercase tracking-widest text-zinc-400 font-medium mb-2">解析</h4>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{current.solution_steps}</p>
                              </div>
                            )}
                            <Button onClick={() => handleSubmit(isChoiceCorrect ? 3 : 1)} disabled={submitting}
                              className="w-full justify-center bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
                              下一题
                            </Button>
                          </motion.div>
                        </AnimatePresence>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {extractChoiceOptions(current.correct_answer).map((opt) => (
                            <button key={opt} onClick={() => handleChoiceSelect(opt)}
                              className={`rounded-xl border-2 px-6 py-4 text-lg font-semibold transition-all
                                ${selectedOption === opt
                                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-400"
                                  : "border-zinc-200 hover:border-zinc-400 bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-600 dark:bg-zinc-900/50"}
                              `}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══════ 填空题：输入框 ═══════ */}
                  {current.question_type === "fill_blank" && (
                    <div className="flex flex-col gap-4">
                      {fillSubmitted ? (
                        <AnimatePresence mode="wait">
                          <motion.div key="fill-result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
                            <div className={`rounded-2xl p-4 ${isFillCorrect ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-red-50 dark:bg-red-500/10"}`}>
                              <p className={`text-sm font-medium ${isFillCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                {isFillCorrect
                                  ? "✅ 回答正确"
                                  : `❌ 你的答案：${fillInput}\n正确答案：${current.correct_answer}`}
                              </p>
                            </div>
                            {current.solution_steps && (
                              <div>
                                <h4 className="text-xs uppercase tracking-widest text-zinc-400 font-medium mb-2">解析</h4>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{current.solution_steps}</p>
                              </div>
                            )}
                            <Button onClick={() => handleSubmit(isFillCorrect ? 3 : 1)} disabled={submitting}
                              className="w-full justify-center bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
                              下一题
                            </Button>
                          </motion.div>
                        </AnimatePresence>
                      ) : (
                        <div className="flex gap-3">
                          <input type="text" value={fillInput} onChange={(e) => setFillInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleFillSubmit()}
                            placeholder="输入你的答案…"
                            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/50" />
                          <Button onClick={handleFillSubmit} disabled={!fillInput.trim()}
                            className="bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
                            提交
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══════ 解答题：查看答案 + 自评 ═══════ */}
                  {current.question_type === "essay" && (
                    <AnimatePresence mode="wait">
                      {!isRevealed ? (
                        <motion.div key="hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center">
                          <Button onClick={() => setIsRevealed(true)} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700">
                            查看答案
                          </Button>
                        </motion.div>
                      ) : (
                        <motion.div key="revealed" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
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
                          <div className="mt-4 grid grid-cols-4 gap-2">
                            <Button onClick={() => handleSubmit(1)} disabled={submitting} className="justify-center bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/40 text-xs px-2 py-3">
                              <XCircle size={16} weight="fill" className="mb-1" /><br/>完全忘了
                            </Button>
                            <Button onClick={() => handleSubmit(2)} disabled={submitting} className="justify-center bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-400 dark:hover:bg-orange-900/40 text-xs px-2 py-3">
                              <ThumbsUp size={16} className="mb-1 rotate-180" /><br/>困难
                            </Button>
                            <Button onClick={() => handleSubmit(3)} disabled={submitting} className="justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-900/40 text-xs px-2 py-3">
                              <CheckCircle size={16} weight="fill" className="mb-1" /><br/>正确
                            </Button>
                            <Button onClick={() => handleSubmit(4)} disabled={submitting} className="justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-900/40 text-xs px-2 py-3">
                              <Star size={16} weight="fill" className="mb-1" /><br/>简单
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </>
  );
}
