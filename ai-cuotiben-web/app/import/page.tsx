"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { useAuthGuard, importQuestions, subjectName, type ImportQuestion, type ImportResult } from "@/lib/api";
import { FileArrowDown, CheckCircle, WarningCircle, XCircle, Trash } from "@phosphor-icons/react";

function extractJson(raw: string): string {
  // 自动从 markdown 代码块中提取 JSON
  const trimmed = raw.trim();
  if (trimmed.includes("```json")) {
    const parts = trimmed.split("```json");
    if (parts.length > 1) {
      return parts[1].split("```")[0].trim();
    }
  }
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed.slice(3, -3).trim();
  }
  return trimmed;
}

export default function ImportPage() {
  useAuthGuard();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [questions, setQuestions] = useState<ImportQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setError(null);
    setResult(null);
    setQuestions([]);

    const jsonStr = extractJson(input);

    // JSON 解析
    let parsed: ImportQuestion[] | { questions: ImportQuestion[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e: any) {
      setError(`JSON 解析失败：${e.message}`);
      return;
    }

    // 兼容两种格式
    const items: ImportQuestion[] = Array.isArray(parsed)
      ? parsed
      : (parsed as any).questions || [];

    if (items.length === 0) {
      setError("没有找到有效的题目数据");
      return;
    }

    // 基本校验
    for (let i = 0; i < items.length; i++) {
      if (!items[i].subject_id || !items[i].question_content) {
        setError(
          `第 ${i + 1} 题缺少必填字段：${!items[i].subject_id ? "subject_id" : "question_content"}`
        );
        return;
      }
    }

    setLoading(true);
    try {
      const res = await importQuestions(items);
      setResult(res);
      setQuestions(items);
    } catch (e: any) {
      setError(e.message || "导入失败，请检查网络和后端状态");
    }
    setLoading(false);
  };

  const handleClear = () => {
    setInput("");
    setResult(null);
    setQuestions([]);
    setError(null);
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-2xl px-4 pt-20 pb-24 md:py-40">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          className="mb-8"
        >
          <h1 className="text-3xl font-semibold tracking-tighter md:text-4xl">
            导入错题
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            粘贴 Claude 分析好的 JSON，一键入库
          </p>
        </motion.div>

        {/* JSON 输入区 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="premium-shell mb-6"
        >
          <div className="premium-core p-6">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={10}
              placeholder={`[\n  {\n    "subject_id": 2,\n    "knowledge_point_name": "导数及其应用",\n    "question_content": "已知 f(x)=...",\n    "correct_answer": "...",\n    "error_analysis": "..."\n  }\n]`}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-sm leading-relaxed outline-none transition-all focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus:border-zinc-600 dark:focus:bg-[#0a0a0a] resize-y"
            />
            <p className="mt-2 text-xs text-zinc-400">
              支持含 <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">```json</code> 代码块的全文粘贴，会自动提取
            </p>
          </div>
        </motion.div>

        {/* 导入按钮 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handleImport}
            disabled={!input.trim() || loading}
            className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-zinc-800 disabled:opacity-30 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "导入中…" : "导入"}
          </button>
          {input.trim() && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-600 transition-colors dark:hover:text-zinc-300"
            >
              <Trash size={14} />
              清空
            </button>
          )}
        </div>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="premium-shell mb-6 border-red-200 dark:border-red-800/50"
            >
              <div className="premium-core p-5 flex items-start gap-3">
                <XCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-600 dark:text-red-400">导入失败</p>
                  <p className="text-sm text-red-500 dark:text-red-400/80 mt-1">{error}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 导入结果 */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <div className="premium-shell mb-4 border-emerald-200 dark:border-emerald-800/50">
                <div className="premium-core p-5 flex items-center gap-3">
                  <CheckCircle size={22} weight="fill" className="text-emerald-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-white">
                      已导入 {result.saved_count} 道错题
                    </p>
                    <p className="text-sm text-zinc-500">
                      ID: {result.saved_ids?.join(", ")}
                    </p>
                  </div>
                </div>
              </div>

              {/* 题目列表 */}
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="premium-shell">
                    <div className="premium-core p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {subjectName(q.subject_id)}
                        </span>
                        {q.knowledge_point_name && (
                          <span className="text-xs text-zinc-400">
                            · {q.knowledge_point_name}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">
                        {q.question_content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* 清空继续 */}
              <button
                onClick={handleClear}
                className="mt-6 flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-600 transition-colors dark:hover:text-zinc-300"
              >
                <Trash size={14} />
                清空，继续导入
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
  );
}
