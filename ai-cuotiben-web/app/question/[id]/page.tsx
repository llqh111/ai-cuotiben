"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { Button } from "@/components/ui/Button";
import { DownloadSimple, Sparkle, ArrowLeft, CircleNotch, PencilSimple, CheckCircle, X } from "@phosphor-icons/react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  apiFetch,
  useAuthGuard,
  subjectName,
  generateSimilar,
  downloadPdf,
  ApiError,
  getToken,
  imageSrc,
  type PracticeQuestion,
} from "@/lib/api";
import { MathText } from "@/components/MathText";

interface QuestionDetail {
  subject_id: number;
  original_text: string;
  analysis: string;
  answer: string;
  image_url?: string;
}

export default function QuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  useAuthGuard();
  const { id } = use(params);
  const [data, setData] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // AI 相似题状态
  const [similar, setSimilar] = useState<PracticeQuestion[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // 编辑模式
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ question_content: "", correct_answer: "", solution_steps: "", error_analysis: "" });
  const [editSaving, setEditSaving] = useState(false);

  function enterEdit() {
    if (!data) return;
    setEditForm({
      question_content: data.original_text || "",
      correct_answer: data.answer || "",
      solution_steps: (data as any).solution_steps || "",
      error_analysis: data.analysis || "",
    });
    setEditMode(true);
  }

  async function saveEdit() {
    setEditSaving(true);
    try {
      const updated = await apiFetch<any>(`/api/questions/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          question_content: editForm.question_content,
          correct_answer: editForm.correct_answer,
        }),
      });
      // 更新本地
      setData({
        subject_id: updated.subject_id || data!.subject_id,
        original_text: updated.question_content || editForm.question_content,
        analysis: data!.analysis,
        answer: updated.correct_answer || editForm.correct_answer,
        image_url: data!.image_url,
        solution_steps: (updated as any).solution_steps,
      } as any);
      setEditMode(false);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "保存失败");
    } finally { setEditSaving(false); }
  }

  useEffect(() => {
    apiFetch<QuestionDetail>(`/api/questions/${id}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function handleGenerate() {
    setGenLoading(true);
    setGenError(null);
    try {
      const items = await generateSimilar(id);
      setSimilar((prev) => [...prev, ...items]);
    } catch (e) {
      setGenError(e instanceof ApiError ? e.message : "生成失败，请稍后再试");
    } finally {
      setGenLoading(false);
    }
  }

  async function handleExport(withAnswer: boolean) {
    setExporting(true);
    try {
      await downloadPdf({ title: "错题导出", with_answer: withAnswer });
    } catch {
      // 下载失败静默；按钮恢复可点
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="mx-auto w-full max-w-7xl px-4 pt-20 pb-24 md:py-40 flex justify-center items-center h-[50vh]">
           <CircleNotch size={32} className="animate-spin text-zinc-400" />
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Navbar />
        <main className="mx-auto w-full max-w-7xl px-4 pt-20 pb-24 md:py-40 flex justify-center items-center h-[50vh]">
           <p className="text-zinc-500">找不到该题目信息</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 pt-20 pb-24 md:py-40">
        <Link href="/dashboard" className="mb-12 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors dark:text-zinc-400 dark:hover:text-zinc-100">
          <ArrowLeft weight="bold" /> 返回仪表盘
        </Link>
        
        {/* Editorial Split Layout */}
        <div className="flex flex-col gap-12 md:flex-row md:gap-16">
          
          {/* Left Column: Typography & Content */}
          <div className="w-full md:w-[55%]">
            {data.image_url && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="mb-8 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800"
              >
                <img
                  src={imageSrc(data.image_url)}
                  alt="题目原图"
                  className="w-full object-contain max-h-96"
                />
              </motion.div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-black/5 bg-black/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] dark:border-white/10 dark:bg-white/5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span> 新录入
              </div>
              <div className="flex items-center justify-between gap-4">
                <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl leading-[1.1]">
                  {subjectName(data.subject_id)} 错题解析
                </h1>
                <button
                  onClick={editMode ? saveEdit : enterEdit}
                  disabled={editSaving}
                  className={`shrink-0 flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    editMode
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {editMode ? (
                    <><CheckCircle size={16} />{editSaving ? "保存中…" : "保存"}</>
                  ) : (
                    <><PencilSimple size={16} />编辑</>
                  )}
                </button>
                {editMode && (
                  <button
                    onClick={() => setEditMode(false)}
                    className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              
              {/* Question Content */}
              <div className="mt-12">
                <h3 className="text-sm font-medium uppercase tracking-widest text-zinc-400">原题</h3>
                {editMode ? (
                  <textarea
                    value={editForm.question_content}
                    onChange={(e) => setEditForm(f => ({ ...f, question_content: e.target.value }))}
                    rows={6}
                    className="mt-4 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base leading-relaxed outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-indigo-600 resize-y"
                  />
                ) : (
                  <div className="mt-4 rounded-2xl bg-zinc-100 p-6 text-lg leading-relaxed dark:bg-[#0a0a0a]">
                    <MathText text={data.original_text} />
                  </div>
                )}
              </div>

              {/* AI Analysis */}
              <div className="mt-12">
                <h3 className="text-sm font-medium uppercase tracking-widest text-zinc-400">AI 错因分析</h3>
                <p className="mt-4 text-zinc-600 leading-relaxed dark:text-zinc-400">
                  <MathText text={data.analysis} />
                </p>
              </div>

              {/* Solution */}
              <div className="mt-12">
                <h3 className="text-sm font-medium uppercase tracking-widest text-zinc-400">正确解析</h3>
                {editMode ? (
                  <textarea
                    value={editForm.correct_answer}
                    onChange={(e) => setEditForm(f => ({ ...f, correct_answer: e.target.value }))}
                    rows={5}
                    className="mt-4 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base leading-relaxed outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-indigo-600 resize-y"
                  />
                ) : (
                  <div className="mt-4 prose prose-zinc dark:prose-invert">
                    <MathText text={data.answer} />
                  </div>
                )}
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
              <Button
                icon
                onClick={handleGenerate}
                disabled={genLoading}
                className="w-full justify-center"
              >
                {genLoading ? "生成中…" : "生成相似题"}
              </Button>
              {genError && (
                <p className="text-sm text-red-500">{genError}</p>
              )}
              {similar.length > 0 && (
                <div className="flex flex-col gap-4">
                  {similar.map((p, i) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800/50 dark:bg-zinc-900/30"
                    >
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        练习题 {i + 1}
                      </p>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <MathText text={p.content} />
                      </p>
                      {p.answer && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-zinc-400">
                            查看答案与解析
                          </summary>
                          <p className="mt-2 text-sm text-zinc-500">
                            <MathText text={p.answer + (p.solution ? `\n\n${p.solution}` : "")} />
                          </p>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </PremiumCard>

            <PremiumCard delay={0.3} className="md:-mt-2" coreClassName="flex flex-col gap-6">
              <div>
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  <DownloadSimple size={20} weight="fill" />
                </div>
                <h3 className="text-xl font-semibold tracking-tight">导出为 PDF</h3>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  将你的错题与分析笔记导出为可打印的 PDF。
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <Button
                  icon
                  onClick={() => handleExport(true)}
                  disabled={exporting}
                  className="w-full justify-center"
                >
                  {exporting ? "导出中…" : "导出含答案版"}
                </Button>
                <Button
                  icon
                  onClick={() => handleExport(false)}
                  disabled={exporting}
                  className="w-full justify-center bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
                >
                  导出练习版（无答案）
                </Button>
              </div>
            </PremiumCard>
          </div>

        </div>
      </main>
    </>
  );
}
