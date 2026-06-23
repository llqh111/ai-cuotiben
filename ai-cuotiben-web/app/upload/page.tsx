"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { Camera, FileImage, FilePdf, CircleNotch } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadQuestion, useAuthGuard, ApiError, SUBJECTS } from "@/lib/api";

export default function UploadPage() {
  useAuthGuard();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [subjectId, setSubjectId] = useState(2); // 默认数学
  const router = useRouter();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // 带 JWT 调 /api/upload/，AI 两轮分析后跳详情页
      const data = await uploadQuestion(file, subjectId);
      const firstQ = data.questions?.[0];
      if (firstQ) {
        router.push(`/question/${firstQ.id}`);
      } else {
        alert("上传成功但未返回题目信息，请重试");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
      } else {
        alert(error instanceof ApiError ? error.message : "网络请求失败，请确认后端 (8000) 已启动。");
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 py-32 md:py-40 relative">
        {/* 全局 Loading 遮罩 */}
        {isUploading && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md dark:bg-black/80">
            <CircleNotch size={48} className="animate-spin text-zinc-900 dark:text-white mb-4" />
            <h2 className="text-xl font-medium tracking-tight">AI 正在进行视网膜解析...</h2>
            <p className="mt-2 text-sm text-zinc-500">正在提取题目与生成名师解析，请稍候</p>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          className="text-center"
        >
          <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl">录入错题</h1>
          <p className="mx-auto mt-4 max-w-lg text-zinc-500 dark:text-zinc-400">
            上传图片或 PDF，AI 将自动识别题目内容、题型并进行错因分析。
          </p>
        </motion.div>

        {/* 科目选择器 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
          className="mt-10 flex justify-center"
        >
          <div className="inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-5 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/50">
            <span className="text-sm text-zinc-500">科目：</span>
            <div className="flex gap-1">
              {SUBJECTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSubjectId(s.id)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    subjectId === s.id
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* 隐藏的文件上传组件 */}
        <input 
          type="file" 
          accept="image/*" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
        />

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.32, 0.72, 0, 1] }}
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="premium-shell group text-left"
          >
            <div className="premium-core flex flex-col items-center justify-center gap-4 p-8 text-center transition-colors group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900/50">
              <div className="text-zinc-400 transition-colors group-hover:text-zinc-900 dark:group-hover:text-white">
                <Camera size={32} />
              </div>
              <div>
                <h3 className="font-medium text-zinc-900 dark:text-white">拍照</h3>
                <p className="text-xs text-zinc-500">调用摄像头</p>
              </div>
            </div>
          </motion.button>

          {/* 只有这里绑定了点击上传事件，用于真实对接测试 */}
          <motion.button
            onClick={() => fileInputRef.current?.click()}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.32, 0.72, 0, 1] }}
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="premium-shell group text-left"
          >
            <div className="premium-core flex flex-col items-center justify-center gap-4 p-8 text-center transition-colors group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900/50">
              <div className="text-blue-500 transition-colors">
                <FileImage size={32} weight="fill" />
              </div>
              <div>
                <h3 className="font-medium text-zinc-900 dark:text-white">相册 (点击测试)</h3>
                <p className="text-xs text-blue-500">真实验证AI链路</p>
              </div>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.32, 0.72, 0, 1] }}
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="premium-shell group text-left"
          >
            <div className="premium-core flex flex-col items-center justify-center gap-4 p-8 text-center transition-colors group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900/50">
              <div className="text-zinc-400 transition-colors group-hover:text-zinc-900 dark:group-hover:text-white">
                <FilePdf size={32} />
              </div>
              <div>
                <h3 className="font-medium text-zinc-900 dark:text-white">PDF</h3>
                <p className="text-xs text-zinc-500">自动提取题目</p>
              </div>
            </div>
          </motion.button>

        </div>
      </main>
    </>
  );
}
