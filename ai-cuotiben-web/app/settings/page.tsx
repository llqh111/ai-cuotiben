"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { CalendarBlank, Palette, BookBookmark, Check } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useAuthGuard, getProfile, updateProfile } from "@/lib/api";

const THEMES = [
  { key: "system", label: "跟随系统" },
  { key: "light", label: "浅色模式" },
  { key: "dark", label: "深色模式" },
];

export default function SettingsPage() {
  useAuthGuard();
  const [examDate, setExamDate] = useState("");
  const [theme, setTheme] = useState("system");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile()
      .then((p) => {
        if (p.exam_date) setExamDate(p.exam_date);
        if (p.theme_preference) setTheme(p.theme_preference);
      })
      .catch(() => {});
  }, []);

  async function save(next: { exam_date?: string; theme_preference?: string }) {
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // 保存失败静默，用户可重试
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 py-32 md:py-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          className="mb-12 flex items-center justify-between"
        >
          <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl">偏好设置</h1>
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-500">
              <Check weight="bold" /> 已保存
            </span>
          )}
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
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  用于计算倒计时并自动调整冲刺期的复习策略。
                </p>
                <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
                  <input
                    type="date"
                    value={examDate}
                    disabled={saving}
                    onChange={(e) => setExamDate(e.target.value)}
                    onBlur={() => examDate && save({ exam_date: examDate })}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition-all focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-[#050505] dark:focus:border-zinc-600 dark:focus:bg-[#0a0a0a]"
                  />
                  <p className="text-xs text-zinc-400">修改后离开输入框即自动保存。</p>
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
                  {THEMES.map((t) => {
                    const active = theme === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => {
                          setTheme(t.key);
                          save({ theme_preference: t.key });
                        }}
                        className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-all ${
                          active
                            ? "border-zinc-400 bg-zinc-900 text-white ring-1 ring-zinc-900 dark:border-white/20 dark:bg-white/10 dark:ring-white/20"
                            : "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#0a0a0a] dark:text-zinc-100 dark:hover:bg-zinc-900"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </PremiumCard>

          {/* Subjects Management (本地展示，后端未提供科目开关存储) */}
          <PremiumCard delay={0.3} className="w-full">
            <div className="flex items-start gap-6">
              <div className="mt-1 h-10 w-10 shrink-0 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                <BookBookmark size={20} weight="fill" />
              </div>
              <div className="w-full">
                <h3 className="text-xl font-semibold tracking-tight">科目管理</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  关闭不需要的科目，它们将不会出现在仪表盘和复习计划中。
                </p>
                <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                  {["语文", "数学", "英语", "物理", "化学", "生物"].map((subject, i) => (
                    <label
                      key={subject}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 p-4 transition-all hover:bg-white dark:border-zinc-800/50 dark:bg-zinc-900/30 dark:hover:bg-[#0a0a0a]"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{subject}</span>
                      <div className={`h-5 w-9 rounded-full p-1 transition-colors ${i < 4 ? "bg-zinc-900 dark:bg-white" : "bg-zinc-200 dark:bg-zinc-800"}`}>
                        <div className={`h-3 w-3 rounded-full transition-transform ${i < 4 ? "translate-x-4 bg-white dark:bg-zinc-900" : "bg-white dark:bg-zinc-500"}`} />
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
