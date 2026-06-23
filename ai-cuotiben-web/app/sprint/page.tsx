"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSprintPlan, getProfile, updateProfile, subjectName, useAuthGuard, type SprintPlan, type SprintQuestion } from "@/lib/api";
import { CalendarBlank, Lightning, ArrowRight, Clock } from "@phosphor-icons/react";

const PHASE_LABEL: Record<string, { label: string; color: string; desc: string }> = {
  no_exam: { label: "未设置考试日期", color: "text-zinc-400", desc: "在设置中设定高考日期以启用冲刺模式" },
  steady: { label: "稳健复习期", color: "text-emerald-500", desc: "按正常节奏，每日适量复习" },
  intensive: { label: "强化冲刺期", color: "text-amber-500", desc: "缩短间隔，增加每日复习量" },
  final: { label: "最终冲刺", color: "text-red-500", desc: "高频错题每日轮一遍" },
  exam_over: { label: "考试已结束", color: "text-blue-500", desc: "恭喜！回顾一下错题巩固成果" },
};

export default function SprintPage() {
  useAuthGuard();
  const [plan, setPlan] = useState<SprintPlan | null>(null);
  const [examDate, setExamDate] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getSprintPlan(), getProfile()])
      .then(([p, prof]) => { setPlan(p); if (prof.exam_date) setExamDate(prof.exam_date); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveExamDate(date: string) {
    setExamDate(date);
    await updateProfile({ exam_date: date });
    const p = await getSprintPlan();
    setPlan(p);
  }

  if (loading) {
    return <><Navbar /><main className="flex min-h-[100dvh] items-center justify-center"><p className="text-zinc-500">加载中…</p></main></>;
  }

  const phase = PHASE_LABEL[plan?.phase ?? "no_exam"] ?? PHASE_LABEL.no_exam;
  const questions = plan?.questions ?? [];

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-4 py-32 md:py-40">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}>
          <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">考前冲刺</h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-500 dark:text-zinc-400">基于你的高考日期和错题数据，AI 自动规划每日复习策略。</p>
        </motion.div>

        <div className="mt-12 grid gap-6 md:grid-cols-12">
          <PremiumCard delay={0.1} className="md:col-span-7">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 dark:bg-amber-500/10">
                  <CalendarBlank size={20} weight="fill" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">高考目标日期</h3>
                  <p className="text-sm text-zinc-500">设定后系统自动调整复习策略</p>
                </div>
              </div>
              <input type="date" value={examDate} onChange={(e) => saveExamDate(e.target.value)}
                className="w-full max-w-xs rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/50" />
            </div>
          </PremiumCard>

          <PremiumCard delay={0.15} className="md:col-span-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Lightning size={24} weight="fill" className={phase.color} />
                <span className={`text-lg font-semibold ${phase.color}`}>{phase.label}</span>
              </div>
              <p className="text-sm text-zinc-500">{phase.desc}</p>
              {plan && plan.days_remaining >= 0 && (
                <div className="flex items-center gap-6 pt-2">
                  <div className="text-center"><p className="text-3xl font-bold tracking-tighter">{plan.days_remaining}</p><p className="text-xs text-zinc-400">剩余天数</p></div>
                  <div className="text-center"><p className="text-3xl font-bold tracking-tighter">{plan.daily_quota}</p><p className="text-xs text-zinc-400">今日建议题数</p></div>
                  <div className="text-center"><p className="text-3xl font-bold tracking-tighter">{plan.unmastered_total}</p><p className="text-xs text-zinc-400">待掌握</p></div>
                </div>
              )}
            </div>
          </PremiumCard>
        </div>

        {questions.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-6 flex items-center gap-2 text-2xl font-semibold tracking-tight">今日冲刺题 ({questions.length} 道)</h2>
            <div className="grid gap-4">
              {questions.map((q, i) => (
                <motion.div key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 + i * 0.05 }}>
                  <Link href={`/question/${q.id}`} className="premium-shell group block">
                    <div className="premium-core p-6 flex items-start justify-between gap-4 transition-colors group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{subjectName(q.subject_id)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-400">{q.question_type}</span>
                        </div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{q.question_content ?? "（加载中…）"}</p>
                      </div>
                      <ArrowRight size={18} className="text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors shrink-0 mt-1" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {plan?.phase === "no_exam" && (
          <div className="mt-12 text-center py-16">
            <Clock size={48} className="mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
            <p className="text-zinc-500">设定高考日期后，系统将自动为你规划每日冲刺计划。</p>
            <Link href="/settings" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-500 hover:text-blue-600">前往设置 <ArrowRight size={14} /></Link>
          </div>
        )}

        {plan?.phase === "exam_over" && (
          <div className="mt-12 text-center py-16">
            <p className="text-2xl font-semibold mb-2">🎉 考试结束！</p>
            <p className="text-zinc-500">回顾你的错题本，看看这一路走来攻克了多少难题。</p>
          </div>
        )}
      </main>
    </>
  );
}
