"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { useAuthGuard, getTrends, getStreak, getDailyCompletion, getWeakPoints, getReport, type TrendPoint, type WeakPoint, type LearningReport } from "@/lib/api";
import ReactECharts from "echarts-for-react";
import { Fire, Target, Warning, BookOpen, CalendarCheck } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export default function StatsPage() {
  useAuthGuard();
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [streak, setStreak] = useState(0);
  const [completion, setCompletion] = useState({ due_total: 0, completed: 0, rate: 0 });
  const [weakPoints, setWeakPoints] = useState<WeakPoint[]>([]);
  const [report, setReport] = useState<LearningReport | null>(null);
  const [period, setPeriod] = useState<"week" | "month">("week");

  useEffect(() => {
    Promise.all([getTrends(30), getStreak(), getDailyCompletion(), getWeakPoints(), getReport(period)])
      .then(([t, s, c, w, r]) => { setTrends(t); setStreak(s.streak); setCompletion(c); setWeakPoints(w); setReport(r); })
      .catch(() => {});
  }, [period]);

  const trendOption = {
    backgroundColor: "transparent", tooltip: { trigger: "axis" },
    legend: { data: ["新增", "掌握"], textStyle: { color: "#a1a1aa" } },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: { type: "category", data: trends.map(t => t.date.slice(5)), axisLabel: { color: "#71717a" } },
    yAxis: { type: "value", axisLabel: { color: "#71717a" }, splitLine: { lineStyle: { color: "#27272a" } } },
    series: [
      { name: "新增", type: "line", data: trends.map(t => t.new), smooth: true, lineStyle: { color: "#3b82f6" }, itemStyle: { color: "#3b82f6" } },
      { name: "掌握", type: "line", data: trends.map(t => t.mastered), smooth: true, lineStyle: { color: "#10b981" }, itemStyle: { color: "#10b981" } },
    ],
  };

  const weakOption = {
    backgroundColor: "transparent", tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: { type: "value", axisLabel: { color: "#71717a" } },
    yAxis: { type: "category", data: weakPoints.map(w => w.knowledge_point).reverse(), axisLabel: { color: "#a1a1aa" } },
    series: [{ type: "bar", data: weakPoints.map(w => w.count).reverse(), itemStyle: { color: "#ef4444", borderRadius: [0, 4, 4, 0] }, label: { show: true, position: "right", color: "#a1a1aa", formatter: (p: { value: number }) => p.value + " 题" } }],
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 py-32 md:py-40">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}>
          <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">学习统计</h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-500 dark:text-zinc-400">你的学习轨迹、薄弱点与复习节奏，一目了然。</p>
        </motion.div>

        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Fire, label: "连续打卡", value: `${streak} 天`, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-500/10" },
            { icon: Target, label: "今日完成率", value: `${completion.rate}%`, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-500/10" },
            { icon: Warning, label: "薄弱知识点", value: `${weakPoints.length} 个`, color: "text-red-500", bg: "bg-red-50 dark:bg-red-500/10" },
            { icon: BookOpen, label: "复习次数", value: `${report?.reviews ?? 0} 次`, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
          ].map((item, i) => (
            <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 + i * 0.1 }} className="premium-shell">
              <div className="premium-core p-6 flex flex-col gap-3">
                <div className={`h-8 w-8 rounded-full ${item.bg} flex items-center justify-center`}><item.icon size={16} weight="fill" className={item.color} /></div>
                <div><p className="text-2xl font-bold tracking-tighter">{item.value}</p><p className="text-xs text-zinc-400 mt-1">{item.label}</p></div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-12">
          <PremiumCard delay={0.2} className="md:col-span-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold tracking-tight">趋势（近30天）</h3>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setPeriod("week")} className={`px-3 py-1 rounded-full ${period === "week" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>周</button>
                <button onClick={() => setPeriod("month")} className={`px-3 py-1 rounded-full ${period === "month" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>月</button>
              </div>
            </div>
            <ReactECharts option={trendOption} style={{ height: 300 }} />
          </PremiumCard>

          <PremiumCard delay={0.3} className="md:col-span-4">
            <h3 className="text-xl font-semibold tracking-tight mb-6">薄弱 TOP5</h3>
            {weakPoints.length === 0 ? <p className="text-sm text-zinc-400 py-8 text-center">暂无数据，录入更多错题后分析</p> : <ReactECharts option={weakOption} style={{ height: 300 }} />}
          </PremiumCard>
        </div>

        {report && (
          <PremiumCard delay={0.4} className="mt-6 w-full">
            <div className="flex items-center gap-4 mb-6"><CalendarCheck size={24} weight="fill" className="text-emerald-500" /><h3 className="text-xl font-semibold tracking-tight">{period === "week" ? "本周" : "本月"}学习报告</h3></div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div><p className="text-3xl font-bold">{report.new_questions}</p><p className="text-xs text-zinc-400 mt-1">新增错题</p></div>
              <div><p className="text-3xl font-bold text-emerald-500">{report.mastered}</p><p className="text-xs text-zinc-400 mt-1">已掌握</p></div>
              <div><p className="text-3xl font-bold">{report.reviews}</p><p className="text-xs text-zinc-400 mt-1">复习次数</p></div>
              <div><p className="text-3xl font-bold text-blue-500">{report.accuracy}%</p><p className="text-xs text-zinc-400 mt-1">正确率</p></div>
              <div><p className="text-3xl font-bold text-red-500">{report.weak_points.length}</p><p className="text-xs text-zinc-400 mt-1">薄弱项</p></div>
            </div>
            {report.weak_points.length > 0 && (
              <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800/50">
                <p className="text-sm font-medium text-zinc-500 mb-3">需重点关注</p>
                <div className="flex flex-wrap gap-2">{report.weak_points.map(w => <span key={w.knowledge_point} className="px-3 py-1 rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 text-sm">{w.knowledge_point} ({w.count}题)</span>)}</div>
              </div>
            )}
          </PremiumCard>
        )}
      </main>
    </>
  );
}
