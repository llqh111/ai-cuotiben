"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { Camera, FileImage, FilePdf, CircleNotch, Article } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadQuestion, uploadText, useAuthGuard, ApiError, SUBJECTS } from "@/lib/api";

export default function UploadPage() {
  useAuthGuard();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [subjectId, setSubjectId] = useState(2); // 默认数学
  const [mode, setMode] = useState<"file" | "text">("file");
  const [textInput, setTextInput] = useState("");
  const router = useRouter();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const data = await uploadQuestion(file, subjectId);
      const firstQ = data.questions?.[0];
      if (firstQ) { router.push(`/question/${firstQ.id}`); }
      else { alert("上传成功但未返回题目信息，请重试"); }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { router.replace("/login"); }
      else { alert(error instanceof ApiError ? error.message : "网络请求失败"); }
    } finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    setIsUploading(true);
    try {
      const data = await uploadText(textInput.trim(), subjectId);
      const firstQ = data.questions?.[0];
      if (firstQ) { router.push(`/question/${firstQ.id}`); }
      else { alert("提交成功但未返回题目信息"); }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { router.replace("/login"); }
      else { alert(error instanceof ApiError ? error.message : "网络请求失败"); }
    } finally { setIsUploading(false); }
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 py-32 md:py-40 relative">
        {isUploading && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md dark:bg-black/80">
            <CircleNotch size={48} className="animate-spin text-zinc-900 dark:text-white mb-4" />
            <h2 className="text-xl font-medium tracking-tight">AI 正在分析…</h2>
            <p className="mt-2 text-sm text-zinc-500">正在提取题目与生成名师解析，请稍候</p>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }} className="text-center">
          <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl">录入错题</h1>
          <p className="mx-auto mt-4 max-w-lg text-zinc-500 dark:text-zinc-400">上传图片，或粘贴 Claude/AI 识别好的题目文本。</p>
        </motion.div>

        {/* 科目选择器 */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="mt-10 flex justify-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-5 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/50">
            <span className="text-sm text-zinc-500">科目：</span>
            <div className="flex gap-1">
              {SUBJECTS.map((s) => (
                <button key={s.id} onClick={() => setSubjectId(s.id)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${subjectId === s.id ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"}`}>{s.name}</button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* 模式切换 */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.15 }} className="mt-8 flex justify-center gap-2">
          <button onClick={() => setMode("file")} className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${mode === "file" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>📷 上传图片</button>
          <button onClick={() => setMode("text")} className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${mode === "text" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>📝 粘贴题目</button>
        </motion.div>

        {/* 文件上传模式 */}
        {mode === "file" && (
          <>
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {[
                { icon: Camera, label: "拍照", desc: "调用摄像头" },
                { icon: FileImage, label: "相册", desc: "选择图片上传", onClick: () => fileInputRef.current?.click(), color: "text-blue-500" },
                { icon: FilePdf, label: "PDF", desc: "自动提取文字" },
              ].map((item, i) => (
                <motion.button key={item.label} onClick={item.onClick} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 + i * 0.1 }}
                  whileHover={{ y: -4, scale: 1.02 }} whileTap={{ scale: 0.98 }} className="premium-shell group text-left">
                  <div className="premium-core flex flex-col items-center justify-center gap-4 p-8 text-center transition-colors group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900/50">
                    <div className={item.color || "text-zinc-400 transition-colors group-hover:text-zinc-900 dark:group-hover:text-white"}><item.icon size={32} weight="fill" /></div>
                    <div><h3 className="font-medium text-zinc-900 dark:text-white">{item.label}</h3><p className="text-xs text-zinc-500">{item.desc}</p></div>
                  </div>
                </motion.button>
              ))}
            </div>
          </>
        )}

        {/* 文本粘贴模式 */}
        {mode === "text" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="mt-10 premium-shell">
            <div className="premium-core p-8 flex flex-col gap-6">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2"><Article size={20} /> 粘贴题目文本</h3>
                <p className="mt-1 text-sm text-zinc-500">先用 Claude / 其他 AI 识别图片中的题目，把识别结果粘贴到这里。</p>
              </div>
              <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)}
                rows={8} placeholder="已知函数 f(x) = x³ - 3x² + ax + 1，若 f(x) 在区间 (1, +∞) 上单调递增，求实数 a 的取值范围。"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-relaxed outline-none transition-all focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus:border-zinc-600 dark:focus:bg-[#0a0a0a] resize-y" />
              <button onClick={handleTextSubmit} disabled={!textInput.trim() || isUploading}
                className="self-end rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                {isUploading ? "分析中…" : "提交分析"}
              </button>
            </div>
          </motion.div>
        )}
      </main>
    </>
  );
}
