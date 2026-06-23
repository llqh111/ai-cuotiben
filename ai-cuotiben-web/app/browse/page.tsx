"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { CircleNotch, BookOpen, ArrowsOutCardinal } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { apiFetch, useAuthGuard, SUBJECTS, subjectName } from "@/lib/api";

interface QuestionRow {
  id: number;
  question_content: string;
  question_type: string;
  correct_answer: string;
  solution_steps: string;
  mastery_level: string;
  subject_id: number;
  knowledge_point_id: number;
  image_url?: string;
}

interface KpNode { id: number; name: string; patterns: { id: number; name: string }[] }

const MASTERY_LABEL: Record<string, string> = { new: "新录入", learning: "复习中", mastered: "已掌握" };
const MASTERY_COLOR: Record<string, string> = {
  new: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  learning: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  mastered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
};
const TYPE_LABEL: Record<string, string> = { choice: "选择题", fill_blank: "填空题", essay: "解答题" };

export default function BrowsePage() {
  useAuthGuard();
  const [activeSubject, setActiveSubject] = useState<number>(1);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [kps, setKps] = useState<KpNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragMode, setDragMode] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [dragOverTab, setDragOverTab] = useState(false);

  useEffect(() => {
    setLoading(true);
    setQuestions([]);
    Promise.all([
      apiFetch<QuestionRow[]>(`/api/questions?subject_id=${activeSubject}`),
      apiFetch<KpNode[]>(`/api/questions/tree/${activeSubject}`),
    ])
      .then(([qs, tree]) => {
        setQuestions(qs);
        setKps(tree);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeSubject]);

  const handleDragStart = (e: React.DragEvent, qid: number) => {
    if (!dragMode) return;
    e.dataTransfer.setData("text/plain", String(qid));
    e.dataTransfer.effectAllowed = "move";
    setDraggedId(qid);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropTarget(null);
  };

  const handleDropOnKp = useCallback(async (kpId: number) => {
    if (draggedId === null) return;
    setDropTarget(kpId);
    try {
      await apiFetch(`/api/questions/${draggedId}`, {
        method: "PUT",
        body: JSON.stringify({ knowledge_point_id: kpId }),
      });
      // 更新本地状态
      setQuestions((prev) =>
        prev.map((q) => (q.id === draggedId ? { ...q, knowledge_point_id: kpId } : q))
      );
    } catch {
      // 失败静默
    }
    setDraggedId(null);
    setDropTarget(null);
  }, [draggedId]);

  const kpName = (kpId: number | null) => kps.find((k) => k.id === kpId)?.name ?? "未分类";

  const total = questions.length;
  const mastered = questions.filter((q) => q.mastery_level === "mastered").length;

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 pt-20 pb-24 md:py-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          className="mb-10"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                <BookOpen size={24} weight="fill" />
              </div>
              <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl">错题本</h1>
              <p className="mt-2 text-lg text-zinc-500 dark:text-zinc-400">
                {subjectName(activeSubject)} · 共 {total} 道 · 已掌握 {mastered} 道
              </p>
            </div>
            <button
              onClick={() => setDragMode(!dragMode)}
              className={`rounded-full px-5 py-3 text-sm font-medium transition-all flex items-center gap-2 ${
                dragMode
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              <ArrowsOutCardinal size={16} />
              {dragMode ? "退出分类" : "拖拽分类"}
            </button>
          </div>
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

        {/* 拖拽模式：目标区域 */}
        {dragMode && kps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 rounded-2xl bg-blue-50/50 border-2 border-dashed border-blue-200 dark:bg-blue-950/20 dark:border-blue-800"
          >
            <p className="text-xs text-blue-500 dark:text-blue-400 mb-3 font-medium">拖拽题目卡片到下方知识点区域</p>
            <div className="flex flex-wrap gap-3">
              {kps.map((kp) => (
                <div
                  key={kp.id}
                  onDragOver={(e) => { e.preventDefault(); setDropTarget(kp.id); }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={() => handleDropOnKp(kp.id)}
                  className={`rounded-xl px-4 py-3 text-sm font-medium transition-all cursor-pointer select-none
                    ${dropTarget === kp.id
                      ? "bg-blue-200 scale-105 shadow-md dark:bg-blue-700"
                      : "bg-white hover:bg-blue-100 dark:bg-zinc-800 dark:hover:bg-blue-900/30 border border-zinc-200 dark:border-zinc-700"}`}
                >
                  拖到 → {kp.name}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Question Cards Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <CircleNotch size={32} className="animate-spin text-zinc-400" />
          </div>
        ) : questions.length === 0 ? (
          <div className="py-20 text-center text-zinc-400">
            还没有错题，去
            <Link href="/upload" className="underline text-zinc-900 dark:text-zinc-100 mx-1">录入</Link>
            吧。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {questions.map((q) => (
              <div
                key={q.id}
                draggable={dragMode}
                onDragStart={(e) => handleDragStart(e, q.id)}
                onDragEnd={handleDragEnd}
                className={`${dragMode ? "cursor-grab active:cursor-grabbing" : ""} ${draggedId === q.id ? "opacity-50" : ""}`}
              >
                <div className="premium-shell">
                  <div className="premium-core p-6 flex flex-col gap-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-black/5 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] dark:border-white/10 dark:bg-white/5">
                        {TYPE_LABEL[q.question_type] ?? "错题"}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400">{kpName(q.knowledge_point_id)}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${MASTERY_COLOR[q.mastery_level] ?? ""}`}>
                          {MASTERY_LABEL[q.mastery_level] ?? q.mastery_level}
                        </span>
                      </div>
                    </div>

                    {/* Image */}
                    {q.image_url && (
                      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <img
                          src={`${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"}${q.image_url}`}
                          alt="题目原图"
                          className="w-full object-cover max-h-28"
                        />
                      </div>
                    )}

                    {/* Question text */}
                    <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 line-clamp-3 whitespace-pre-wrap">
                      {q.question_content}
                    </p>

                    {/* Answer preview */}
                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                      <p className="text-xs text-zinc-400">
                        <span className="font-medium text-emerald-500 dark:text-emerald-400">答案：</span>
                        <span className="line-clamp-1">{q.correct_answer}</span>
                      </p>
                    </div>

                    {/* Link to detail */}
                    <Link
                      href={`/question/${q.id}`}
                      className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 self-end"
                    >
                      查看详情 →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
