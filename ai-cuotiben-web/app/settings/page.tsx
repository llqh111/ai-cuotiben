"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { CalendarBlank, Palette, BookBookmark } from "@phosphor-icons/react";

export default function SettingsPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 py-32 md:py-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          className="mb-12"
        >
          <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl">偏好设置</h1>
        </motion.div>

        <div className="flex flex-col gap-6">
          
          {/* Target Exam Date */}
          <PremiumCard delay={0.1} className="w-full">
            <div className="flex items-start gap-6">
              <div className="mt-1 h-10 w-10 shrink-0 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                <CalendarBlank size={20} weight="fill" />
              </div>
              <div className="w-full">
                <h3 className="text-xl font-semibold tracking-tight">高考目标日期</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">用于计算倒计时并自动调整冲刺期的复习策略。</p>
                <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
                  <input 
                    type="date" 
                    defaultValue="2027-06-07"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition-all focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-[#050505] dark:focus:border-zinc-600 dark:focus:bg-[#0a0a0a]"
                  />
                </div>
              </div>
            </div>
          </PremiumCard>

          {/* Theme Preferences */}
          <PremiumCard delay={0.2} className="w-full">
            <div className="flex items-start gap-6">
              <div className="mt-1 h-10 w-10 shrink-0 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                <Palette size={20} weight="fill" />
              </div>
              <div className="w-full">
                <h3 className="text-xl font-semibold tracking-tight">外观主题</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">自定义应用色彩和亮度模式。</p>
                <div className="mt-6 flex flex-wrap gap-4">
                  <button className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-900 shadow-sm transition-all hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#0a0a0a] dark:text-zinc-100 dark:hover:bg-zinc-900">
                    跟随系统
                  </button>
                  <button className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-900 transition-all hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
                    浅色模式
                  </button>
                  <button className="flex items-center gap-2 rounded-xl border-zinc-400 bg-zinc-900 px-5 py-3 text-sm font-medium text-white ring-1 ring-zinc-900 transition-all dark:border-white/20 dark:bg-white/10 dark:ring-white/20">
                    深色模式
                  </button>
                </div>
              </div>
            </div>
          </PremiumCard>

          {/* Subjects Management */}
          <PremiumCard delay={0.3} className="w-full">
            <div className="flex items-start gap-6">
              <div className="mt-1 h-10 w-10 shrink-0 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                <BookBookmark size={20} weight="fill" />
              </div>
              <div className="w-full">
                <h3 className="text-xl font-semibold tracking-tight">科目管理</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">关闭不需要的科目，它们将不会出现在仪表盘和复习计划中。</p>
                <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                  {['语文', '数学', '英语', '物理', '化学', '生物'].map((subject, i) => (
                    <label key={subject} className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 p-4 transition-all hover:bg-white dark:border-zinc-800/50 dark:bg-zinc-900/30 dark:hover:bg-[#0a0a0a]">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{subject}</span>
                      <div className={`h-5 w-9 rounded-full p-1 transition-colors ${i < 4 ? 'bg-zinc-900 dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-800'}`}>
                        <div className={`h-3 w-3 rounded-full transition-transform ${i < 4 ? 'translate-x-4 bg-white dark:bg-zinc-900' : 'bg-white dark:bg-zinc-500'}`} />
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </PremiumCard>

        </div>
      </main>
    </>
  );
}
