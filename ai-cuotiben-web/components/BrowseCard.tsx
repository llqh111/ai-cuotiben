"use client";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/Button";
import { CheckCircle, XCircle, Eye, Star, ThumbsUp } from "@phosphor-icons/react";
import { useState } from "react";
import { apiFetch, imageSrc } from "@/lib/api";

interface BrowseCardProps {
  id: number;
  question_content: string;
  question_type: string;
  correct_answer: string;
  solution_steps: string;
  mastery_level: string;
  image_url?: string;
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
  image_url,
}: BrowseCardProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mastery, setMastery] = useState(initialMastery);
  const [showImage, setShowImage] = useState(false);

  const badge = MASTERY_BADGE[mastery] ?? MASTERY_BADGE.new;

  const handleSubmit = async (rating: 1 | 2 | 3 | 4) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch<{ mastery_level: string }>("/api/review/submit", {
        method: "POST",
        body: JSON.stringify({ question_id: id, rating }),
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
        {image_url && (
          <div className="relative">
            <img
              src={imageSrc(image_url)}
              alt="题目原图"
              className={`w-full rounded-xl object-cover cursor-pointer transition-all ${showImage ? "max-h-96" : "max-h-20 opacity-60 hover:opacity-80"}`}
              onClick={() => setShowImage(!showImage)}
            />
            {!showImage && (
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-400 pointer-events-none">点击展开原图</span>
            )}
          </div>
        )}
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
              <div className="grid grid-cols-4 gap-2">
                <Button onClick={() => handleSubmit(1)} disabled={submitting} className="justify-center bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/40 text-xs px-1 py-2">
                  <XCircle size={14} weight="fill" className="mb-0.5" /> 忘了
                </Button>
                <Button onClick={() => handleSubmit(2)} disabled={submitting} className="justify-center bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-400 dark:hover:bg-orange-900/40 text-xs px-1 py-2">
                  <ThumbsUp size={14} className="mb-0.5 rotate-180" /> 困难
                </Button>
                <Button onClick={() => handleSubmit(3)} disabled={submitting} className="justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-900/40 text-xs px-1 py-2">
                  <CheckCircle size={14} weight="fill" className="mb-0.5" /> 正确
                </Button>
                <Button onClick={() => handleSubmit(4)} disabled={submitting} className="justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-900/40 text-xs px-1 py-2">
                  <Star size={14} weight="fill" className="mb-0.5" /> 简单
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
