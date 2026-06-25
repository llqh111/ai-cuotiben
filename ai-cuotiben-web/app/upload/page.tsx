"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { Camera, FileImage, CircleNotch, Article, Image, Stack, ArrowRight, FilePdf, FileArrowDown } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { uploadSmallQuestion, uploadBigQuestion, uploadText, useAuthGuard, ApiError, SUBJECTS, uploadPdf, warmupBackend } from "@/lib/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function checkFileSize(file: File): boolean {
  if (file.size > MAX_FILE_SIZE) {
    alert(`文件 "${file.name}" 超过 10MB 限制，请压缩后上传。`);
    return false;
  }
  return true;
}

export default function UploadPage() {
  useAuthGuard();
  const router = useRouter();

  // 进页面就预热后端，唤醒休眠的免费实例，避免上传时干等冷启动
  useEffect(() => {
    warmupBackend();
  }, []);

  // 小题
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const displayInputRef = useRef<HTMLInputElement>(null);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [displayFile, setDisplayFile] = useState<File | null>(null);
  const [smallSubject, setSmallSubject] = useState(2);
  const [smallConfirmMode, setSmallConfirmMode] = useState(false);
  const [smallUploading, setSmallUploading] = useState(false);

  // 大题
  const bigImageRef = useRef<HTMLInputElement>(null);
  const [bigImage, setBigImage] = useState<File | null>(null);
  const [bigText, setBigText] = useState("");
  const [bigSubject, setBigSubject] = useState(2);
  const [bigUploading, setBigUploading] = useState(false);

  // 文本粘贴
  const textImageRef = useRef<HTMLInputElement>(null);
  const [textInput, setTextInput] = useState("");
  const [textImage, setTextImage] = useState<File | null>(null);
  const [textSubject, setTextSubject] = useState(2);
  const [textUploading, setTextUploading] = useState(false);

  // PDF
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfSubject, setPdfSubject] = useState(2);
  const [pdfUploading, setPdfUploading] = useState(false);

  // ─── 小题上传 ───
  const handleSmallSubmit = async () => {
    if (!ocrFile) return;
    setSmallUploading(true);
    try {
      const data = await uploadSmallQuestion(ocrFile, displayFile, smallSubject, smallConfirmMode);
      if (smallConfirmMode && "ocr_text" in data) {
        // 确认模式：跳转到 OCR 修正页
        const params = new URLSearchParams({
          ocr_text: data.ocr_text || "",
          image_url: data.image_url || "",
          student_answer: "",
          subject_id: String(data.subject_id || smallSubject),
        });
        router.push(`/upload/confirm?${params.toString()}`);
      } else if ("questions" in data) {
        const firstQ = data.questions?.[0];
        if (firstQ) { router.push(`/question/${firstQ.id}`); }
        else { alert("上传成功但未返回题目信息"); }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { router.replace("/login"); }
      else { alert(e instanceof ApiError ? e.message : "网络请求失败"); }
    } finally { setSmallUploading(false); }
  };

  // ─── 大题上传 ───
  const handleBigSubmit = async () => {
    if (!bigImage || !bigText.trim()) return;
    setBigUploading(true);
    try {
      const data = await uploadBigQuestion(bigImage, bigText.trim(), bigSubject);
      const firstQ = data.questions?.[0];
      if (firstQ) { router.push(`/question/${firstQ.id}`); }
      else { alert("上传成功但未返回题目信息"); }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { router.replace("/login"); }
      else { alert(e instanceof ApiError ? e.message : "网络请求失败"); }
    } finally { setBigUploading(false); }
  };

  // ─── 文本粘贴上传 ───
  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    setTextUploading(true);
    try {
      const data = await uploadText(textInput.trim(), textSubject, textImage);
      const firstQ = data.questions?.[0];
      if (firstQ) { router.push(`/question/${firstQ.id}`); }
      else { alert("提交成功但未返回题目信息"); }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { router.replace("/login"); }
      else { alert(e instanceof ApiError ? e.message : "网络请求失败"); }
    } finally { setTextUploading(false); }
  };

  // ─── PDF 上传 ───
  const handlePdfSubmit = async () => {
    if (!pdfFile) return;
    setPdfUploading(true);
    try {
      const data = await uploadPdf(pdfFile, pdfSubject);
      sessionStorage.setItem("pdf_review_data", JSON.stringify(data));
      router.push("/upload/pdf-review");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { router.replace("/login"); }
      else { alert(e instanceof ApiError ? e.message : "PDF 上传失败"); }
    } finally { setPdfUploading(false); }
  };

  const isAnyUploading = smallUploading || bigUploading || textUploading || pdfUploading;

  // 科目选择器组件
  const SubjectPicker = ({ value, onChange }: { value: number; onChange: (id: number) => void }) => (
    <div className="flex gap-1 flex-wrap">
      {SUBJECTS.map((s) => (
        <button key={s.id} onClick={() => onChange(s.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
            value === s.id
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          {s.name}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-2xl px-4 pt-20 pb-24 md:py-40 relative">
        {/* 上传中遮罩 */}
        {isAnyUploading && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md dark:bg-black/80">
            <CircleNotch size={48} className="animate-spin text-zinc-900 dark:text-white mb-4" />
            <h2 className="text-xl font-medium tracking-tight">AI 正在分析…</h2>
            <p className="mt-2 text-sm text-zinc-500">提取题目与名师解析中，请稍候</p>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          className="text-center"
        >
          <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl">录入错题</h1>
          <p className="mx-auto mt-4 max-w-lg text-sm text-zinc-500 dark:text-zinc-400">
            小题 AI 自动识别，大题粘贴外部 AI 文字，DeepSeek 逐题分析
          </p>
        </motion.div>

        <div className="mt-12 flex flex-col gap-8">
          {/* ═══════════ 小题录入 ═══════════ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="premium-shell">
              <div className="premium-core p-6 flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                    <Camera size={20} weight="fill" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">小题录入</h3>
                    <p className="text-xs text-zinc-400">AI 自动 OCR 识别 + DeepSeek 分析</p>
                  </div>
                  <div className="ml-auto">
                    <SubjectPicker value={smallSubject} onChange={setSmallSubject} />
                  </div>
                </div>

                {/* OCR 图（必传） */}
                <div className="flex items-center gap-4">
                  <input type="file" accept="image/*" className="hidden" ref={ocrInputRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && checkFileSize(f)) setOcrFile(f);
                    }} />
                  <button onClick={() => ocrInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl border-2 border-dashed border-blue-200 px-4 py-3 text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50/50 transition-colors dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30">
                    <FileImage size={18} /> {ocrFile ? ocrFile.name : "选择 OCR 识别图（必选）"}
                  </button>
                  {ocrFile && (
                    <button onClick={() => { setOcrFile(null); if (ocrInputRef.current) ocrInputRef.current.value = ""; }}
                      className="text-xs text-red-400 hover:text-red-600 shrink-0">移除</button>
                  )}
                </div>

                {/* 展示配图（可选） */}
                <div className="flex items-center gap-4">
                  <input type="file" accept="image/*" className="hidden" ref={displayInputRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && checkFileSize(f)) setDisplayFile(f);
                    }} />
                  <button onClick={() => displayInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 px-4 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900/50">
                    <Image size={18} /> {displayFile ? displayFile.name : "展示配图（可选，不识别）"}
                  </button>
                  {displayFile && (
                    <button onClick={() => { setDisplayFile(null); if (displayInputRef.current) displayInputRef.current.value = ""; }}
                      className="text-xs text-red-400 hover:text-red-600 shrink-0">移除</button>
                  )}
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smallConfirmMode}
                    onChange={(e) => setSmallConfirmMode(e.target.checked)}
                    className="rounded accent-blue-600"
                  />
                  识别后让我先修正 OCR 文字再分析
                </label>

                <button onClick={handleSmallSubmit} disabled={!ocrFile || smallUploading}
                  className="self-end rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-zinc-800 disabled:opacity-30 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                  {smallUploading ? "识别中…" : "提交识别"}
                </button>
              </div>
            </div>
          </motion.div>

          {/* ═══════════ 大题录入 ═══════════ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="premium-shell">
              <div className="premium-core p-6 flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                    <Stack size={20} weight="fill" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">大题录入</h3>
                    <p className="text-xs text-zinc-400">图片直接展示，粘贴外部 AI 文字后 DeepSeek 分析</p>
                  </div>
                  <div className="ml-auto">
                    <SubjectPicker value={bigSubject} onChange={setBigSubject} />
                  </div>
                </div>

                {/* 题目图（必传） */}
                <div className="flex items-center gap-4">
                  <input type="file" accept="image/*" className="hidden" ref={bigImageRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && checkFileSize(f)) setBigImage(f);
                    }} />
                  <button onClick={() => bigImageRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl border-2 border-dashed border-amber-200 px-4 py-3 text-sm font-medium text-amber-600 hover:border-amber-400 hover:bg-amber-50/50 transition-colors dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30">
                    <FileImage size={18} /> {bigImage ? bigImage.name : "选择题目图片（必选）"}
                  </button>
                  {bigImage && (
                    <button onClick={() => { setBigImage(null); if (bigImageRef.current) bigImageRef.current.value = ""; }}
                      className="text-xs text-red-400 hover:text-red-600 shrink-0">移除</button>
                  )}
                </div>

                {/* 外部 AI 文字（必填） */}
                <div>
                  <p className="mb-2 text-xs text-zinc-400">
                    去 Claude / Gemini Chat 等外部 AI 转文字，粘贴到这里
                  </p>
                  <textarea value={bigText} onChange={(e) => setBigText(e.target.value)}
                    rows={6}
                    placeholder="已知函数 f(x) = x³ - 3x² + ax + 1，若 f(x) 在区间 (1, +∞) 上单调递增，求实数 a 的取值范围。"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-relaxed outline-none transition-all focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus:border-zinc-600 dark:focus:bg-[#0a0a0a] resize-y"
                  />
                </div>

                <button onClick={handleBigSubmit} disabled={!bigImage || !bigText.trim() || bigUploading}
                  className="self-end rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-zinc-800 disabled:opacity-30 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                  {bigUploading ? "分析中…" : "提交分析"}
                </button>
              </div>
            </div>
          </motion.div>

          {/* ═══════════ 粘贴题目 ═══════════ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="premium-shell">
              <div className="premium-core p-6 flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                    <Article size={20} weight="fill" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">粘贴题目</h3>
                    <p className="text-xs text-zinc-400">直接粘贴文字，或附带图片存档</p>
                  </div>
                  <div className="ml-auto">
                    <SubjectPicker value={textSubject} onChange={setTextSubject} />
                  </div>
                </div>

                {/* 可选图片 */}
                <div className="flex items-center gap-4">
                  <input type="file" accept="image/*" className="hidden" ref={textImageRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && checkFileSize(f)) setTextImage(f);
                    }} />
                  <button onClick={() => textImageRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 px-4 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900/50">
                    <Image size={18} /> {textImage ? textImage.name : "原图存档（可选）"}
                  </button>
                  {textImage && (
                    <button onClick={() => { setTextImage(null); if (textImageRef.current) textImageRef.current.value = ""; }}
                      className="text-xs text-red-400 hover:text-red-600 shrink-0">移除</button>
                  )}
                </div>

                <div>
                  <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)}
                    rows={5}
                    placeholder="已知函数 f(x) = x³ - 3x² + ax + 1，若 f(x) 在区间 (1, +∞) 上单调递增，求实数 a 的取值范围。"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-relaxed outline-none transition-all focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus:border-zinc-600 dark:focus:bg-[#0a0a0a] resize-y"
                  />
                </div>

                <button onClick={handleTextSubmit} disabled={!textInput.trim() || textUploading}
                  className="self-end rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-zinc-800 disabled:opacity-30 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                  {textUploading ? "分析中…" : "提交分析"}
                </button>
              </div>
            </div>
          </motion.div>

          {/* ═══════════ PDF 上传 ═══════════ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className="premium-shell">
              <div className="premium-core p-6 flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                    <FilePdf size={20} weight="fill" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">PDF 上传</h3>
                    <p className="text-xs text-zinc-400">提取 PDF 文字 → AI 拆分分析 → 选题入库</p>
                  </div>
                  <div className="ml-auto">
                    <SubjectPicker value={pdfSubject} onChange={setPdfSubject} />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <input type="file" accept=".pdf" className="hidden" ref={pdfInputRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && checkFileSize(f)) setPdfFile(f);
                    }} />
                  <button onClick={() => pdfInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 px-4 py-3 text-sm font-medium text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950/30">
                    <FilePdf size={18} /> {pdfFile ? pdfFile.name : "选择 PDF 文件（试卷/练习册）"}
                  </button>
                  {pdfFile && (
                    <button onClick={() => { setPdfFile(null); if (pdfInputRef.current) pdfInputRef.current.value = ""; }}
                      className="text-xs text-red-400 hover:text-red-600 shrink-0">移除</button>
                  )}
                </div>

                <button onClick={handlePdfSubmit} disabled={!pdfFile || pdfUploading}
                  className="self-end rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-zinc-800 disabled:opacity-30 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                  {pdfUploading ? "分析中…" : "开始分析"}
                </button>
              </div>
            </div>
          </motion.div>

          {/* ═══════════ 成品导入 ═══════════ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Link href="/import" className="block">
              <div className="premium-shell hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <div className="premium-core p-6 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 shrink-0">
                    <FileArrowDown size={20} weight="fill" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-zinc-900 dark:text-white">成品导入</h3>
                    <p className="text-xs text-zinc-400">Claude 已分析好的 JSON → 一键入库</p>
                  </div>
                  <ArrowRight size={20} className="text-zinc-300 dark:text-zinc-600" />
                </div>
              </div>
            </Link>
          </motion.div>
        </div>
      </main>
    </>
  );
}
