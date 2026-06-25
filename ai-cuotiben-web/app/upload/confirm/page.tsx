"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { confirmUpload, imageSrc } from "@/lib/api";

function ConfirmContent() {
  const router = useRouter();
  const params = useSearchParams();

  const initialOcr = params.get("ocr_text") || "";
  const imageUrl = params.get("image_url") || "";
  const initialAnswer = params.get("student_answer") || "";
  const subjectId = parseInt(params.get("subject_id") || "1");

  const [ocrText, setOcrText] = useState(initialOcr);
  const [studentAnswer, setStudentAnswer] = useState(initialAnswer);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!ocrText.trim()) {
      setError("题目内容不能为空");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await confirmUpload({
        ocr_text: ocrText.trim(),
        image_url: imageUrl,
        student_answer: studentAnswer.trim(),
        subject_id: subjectId,
      });
      // 分析完成，跳转到第一个错题详情或科目页
      const firstQuestion = result.questions?.[0];
      if (firstQuestion?.id) {
        router.push(`/question/${firstQuestion.id}`);
      } else {
        router.push(`/subject/${subjectId}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "分析失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-50 dark:bg-[#050505]">
      {/* 顶部栏 */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-sm"
        >
          ← 返回
        </button>
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          OCR 修正确认
        </h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* 原图预览 */}
        {imageUrl && (
          <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
            <img
              src={imageSrc(imageUrl)}
              alt="原题图片"
              className="w-full max-h-48 object-contain"
            />
          </div>
        )}

        {/* OCR 文本编辑区 */}
        <div>
          <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
            OCR 识别结果（可修改）
          </label>
          <textarea
            value={ocrText}
            onChange={(e) => setOcrText(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            placeholder="在此修正识别错误的文字..."
          />
        </div>

        {/* 学生答案 */}
        <div>
          <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
            我的错误答案（可选）
          </label>
          <input
            type="text"
            value={studentAnswer}
            onChange={(e) => setStudentAnswer(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="你当时的错误答案..."
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* 确认按钮 */}
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3.5 text-base transition-colors"
        >
          {loading ? "分析中..." : "确认，开始 AI 分析"}
        </button>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-50 dark:bg-[#050505]">
        <p className="text-zinc-500">加载中...</p>
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
