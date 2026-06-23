"use client";
import { motion } from "motion/react";
import { ArrowLeft, CheckCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PdfQuestion, confirmPdfQuestions, useAuthGuard, ApiError } from "@/lib/api";

export default function PdfReviewPage() {
  useAuthGuard();
  const router = useRouter();
  const [data, setData] = useState<{
    filename: string;
    subject_id: number;
    subject_name: string;
    total_count: number;
    questions: PdfQuestion[];
  } | null>(null);
  const [questions, setQuestions] = useState<PdfQuestion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("pdf_review_data");
    if (!raw) { router.replace("/upload"); return; }
    try {
      const parsed = JSON.parse(raw);
      const qs = parsed.questions.map((q: PdfQuestion) => ({ ...q, selected: true }));
      setData(parsed);
      setQuestions(qs);
    } catch { router.replace("/upload"); }
  }, [router]);

  const toggleSelect = (idx: number) => {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, selected: !q.selected } : q));
  };

  const selectAll = () => setQuestions(prev => prev.map(q => ({ ...q, selected: true })));
  const deselectAll = () => setQuestions(prev => prev.map(q => ({ ...q, selected: false })));

  const selectedCount = questions.filter(q => q.selected).length;

  const handleConfirm = async () => {
    if (!data || selectedCount === 0) return;
    setSubmitting(true);
    try {
      const result = await confirmPdfQuestions(data.subject_id, questions);
      sessionStorage.removeItem("pdf_review_data");
      if (result.first_question_id) {
        router.replace(`/question/${result.first_question_id}`);
      } else {
        router.replace(`/subject/${data.subject_id}`);
      }
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "入库失败，请重试");
    } finally { setSubmitting(false); }
  };

  if (!data || !questions.length) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 pt-20 pb-24">
        <p className="text-center text-zinc-400">加载中…</p>
      </main>
    );
  }

  const typeLabels: Record<string, string> = { choice: "选择题", fill_blank: "填空题", essay: "解答题" };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-20 pb-24">
      {/* 提交遮罩 */}
      {submitting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md dark:bg-black/80">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full mb-4" />
          <p className="text-sm text-zinc-500">正在入库…</p>
        </div>
      )}

      {/* 顶部栏 */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
          <ArrowLeft size={18} /> 返回
        </button>
        <div className="flex gap-2">
          <button onClick={selectAll} className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">全选</button>
          <button onClick={deselectAll} className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">取消全选</button>
        </div>
      </div>

      <h1 className="text-xl font-semibold tracking-tight mb-1">{data.filename}</h1>
      <p className="text-sm text-zinc-400 mb-6">{data.subject_name} · 共识别 {data.total_count} 题</p>

      {/* 题目卡片列表 */}
      <div className="flex flex-col gap-3 mb-6">
        {questions.map((q, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`premium-shell cursor-pointer transition-all ${q.selected ? "" : "opacity-40"}`}
            onClick={() => toggleSelect(i)}
          >
            <div className="premium-core p-4">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  q.selected ? "bg-indigo-500 border-indigo-500" : "border-zinc-300 dark:border-zinc-600"
                }`}>
                  {q.selected && <CheckCircle size={14} weight="fill" className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      q.question_type === "choice" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" :
                      q.question_type === "fill_blank" ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" :
                      "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                    }`}>
                      {typeLabels[q.question_type] || q.question_type}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">{q.knowledge_point_name}</span>
                    <span className="text-[10px] text-zinc-400">{q.question_pattern_name}</span>
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed line-clamp-2">{q.question_content}</p>
                  {/* 展开详情 */}
                  <button onClick={(e) => { e.stopPropagation(); setExpandedIdx(expandedIdx === i ? null : i); }}
                    className="mt-2 text-xs text-indigo-500 hover:text-indigo-600">
                    {expandedIdx === i ? "收起 ▲" : "查看答案与解析 ▼"}
                  </button>
                  {expandedIdx === i && (
                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2 text-sm">
                      <div><span className="font-medium text-zinc-500">正确答案：</span><span className="text-emerald-600 dark:text-emerald-400">{q.correct_answer || "无"}</span></div>
                      <div><span className="font-medium text-zinc-500">解题步骤：</span><span className="text-zinc-600 dark:text-zinc-400">{q.solution_steps || "无"}</span></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-zinc-200 dark:bg-zinc-950/90 dark:border-zinc-800 md:relative md:bg-transparent md:border-none md:p-0 md:dark:bg-transparent">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <span className="text-sm text-zinc-500">已选 {selectedCount} / {questions.length} 题</span>
          <button onClick={handleConfirm} disabled={selectedCount === 0 || submitting}
            className="rounded-full bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-indigo-700 disabled:opacity-30">
            确认入库 ({selectedCount})
          </button>
        </div>
      </div>
      {/* 底部安全区占位（移动端） */}
      <div className="pb-20 md:hidden" />
    </main>
  );
}
