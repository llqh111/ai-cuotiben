"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { BookOpen, ChartLineUp, ClockCountdown, Bell } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, useAuthGuard, subjectName, getProfile, getStatsDailyReview, type Profile, type DailyReview } from "@/lib/api";

interface StatsData {
  total_questions: number;
  mastery_rate: number;
  subject_distribution: Record<string, number>;
}

export default function DashboardPage() {
  useAuthGuard();
  const [stats, setStats] = useState<StatsData>({ total_questions: 0, mastery_rate: 0, subject_distribution: {} });

  const [profile, setProfile] = useState<Profile | null>(null);
  const [dailyReview, setDailyReview] = useState<DailyReview | null>(null);

  useEffect(() => {
    Promise.all([apiFetch<StatsData>("/api/stats"), getProfile(), getStatsDailyReview()])
      .then(([s, p, dr]) => { setStats(s); setProfile(p); setDailyReview(dr); })
      .catch(() => {});
  }, []);

  // 取错题最多的科目作为「开始复习」入口，缺省数学(2)
  const entries = Object.entries(stats.subject_distribution);
  const topSubjectId = entries.length
    ? entries.sort((a, b) => b[1] - a[1])[0][0]
    : "2";

  const examDate = profile?.exam_date ? new Date(profile.exam_date) : null;
  const daysToGaokao = examDate
    ? Math.ceil((examDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24))
    : null;

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 pt-20 pb-24 md:py-40">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          className="mb-16"
        >
          <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">
            欢迎回来，{profile?.nickname ?? "同学"}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-zinc-500 dark:text-zinc-400">
            总共录入了 {stats.total_questions} 道错题{daysToGaokao !== null ? `，距离高考还有 ${daysToGaokao} 天` : ""}。保持节奏。
          </p>
        </motion.div>

        {/* Asymmetrical Bento Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:grid-rows-2">

          {/* Card 0: Review Reminder — 待复习提醒 */}
          {dailyReview && dailyReview.due_total > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="md:col-span-12 premium-shell bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-500/5 dark:to-purple-500/5 border-indigo-200 dark:border-indigo-800/50"
            >
              <div className="premium-core p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
                    <Bell size={24} weight="fill" />
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-white">
                      今日复习提醒
                    </p>
                    <p className="text-sm text-zinc-500">
                      {dailyReview.due_total - dailyReview.completed} 题待复习
                      {dailyReview.streak > 0 && ` · 🔥 连续 ${dailyReview.streak} 天`}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/review/${topSubjectId}`}
                  className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                >
                  开始复习
                </Link>
              </div>
            </motion.div>
          )}

          {/* Card 1: Review Action (Large) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
            className="premium-shell md:col-span-8 md:row-span-2"
          >
            <div className="premium-core flex h-full flex-col justify-between p-8 md:p-12">
              <div>
                <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  <BookOpen size={24} weight="fill" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">题库分布</h2>
                <p className="mt-2 text-zinc-500 dark:text-zinc-400">
                  {entries.length > 0
                    ? entries.map(([sub, count]) => `${subjectName(sub)} ${count} 题`).join(' · ')
                    : "暂无录入题目"}
                </p>
              </div>
              <div className="mt-12 flex items-center justify-between border-t border-zinc-100 pt-8 dark:border-zinc-800/50">
                <div className="flex -space-x-2">
                  <div className="h-10 w-10 rounded-full border-2 border-white bg-red-100 dark:border-[#0a0a0a] dark:bg-red-900/30" />
                  <div className="h-10 w-10 rounded-full border-2 border-white bg-blue-100 dark:border-[#0a0a0a] dark:bg-blue-900/30" />
                  <div className="h-10 w-10 rounded-full border-2 border-white bg-green-100 dark:border-[#0a0a0a] dark:bg-green-900/30" />
                </div>
                <Link href={`/review/${topSubjectId}`} className="flex items-center gap-2 font-medium text-zinc-900 hover:text-zinc-600 transition-colors dark:text-zinc-100 dark:hover:text-zinc-400">
                  开始复习 &rarr;
                </Link>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Stats (Small) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="premium-shell md:col-span-4"
          >
            <div className="premium-core h-full p-8">
              <div className="mb-4 text-emerald-500">
                <ChartLineUp size={24} weight="fill" />
              </div>
              <h3 className="text-lg font-semibold">掌握率 {stats.mastery_rate}%</h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">自动实时计算</p>
            </div>
          </motion.div>

          {/* Card 3: Countdown (Small) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="premium-shell md:col-span-4"
          >
            <div className="premium-core h-full p-8 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <div className="mb-4 text-zinc-400 dark:text-zinc-500">
                <ClockCountdown size={24} weight="fill" />
              </div>
              {daysToGaokao !== null ? (
                <>
                  <h3 className="text-3xl font-semibold tracking-tighter">{daysToGaokao} <span className="text-lg text-zinc-400 dark:text-zinc-500">天</span></h3>
                  <p className="mt-1 text-sm font-medium">距离高考</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium">设置高考日期</p>
                  <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">在设置中开启倒计时</p>
                </>
              )}
            </div>
          </motion.div>

        </div>
      </main>
    </>
  );
}
