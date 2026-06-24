"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { useEffect, useState } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import {
  StatsOverview, SubjectStat, TrendPoint, WeakPoint, DailyReview,
  ErrorCategoriesData,
  getStatsOverview, getStatsSubjects, getStatsTrends, getStatsWeakPoints, getStatsDailyReview,
  getErrorCategories,
  useAuthGuard, ApiError,
} from "@/lib/api";
import { useRouter } from "next/navigation";

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export default function StatsPage() {
  useAuthGuard();
  const router = useRouter();
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [subjects, setSubjects] = useState<SubjectStat[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [weakPoints, setWeakPoints] = useState<WeakPoint[]>([]);
  const [daily, setDaily] = useState<DailyReview | null>(null);
  const [errorCats, setErrorCats] = useState<ErrorCategoriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getStatsOverview(), getStatsSubjects(), getStatsTrends(),
      getStatsWeakPoints(), getStatsDailyReview(), getErrorCategories(),
    ]).then(([ov, sb, tr, wp, dr, ec]) => {
      setOverview(ov); setSubjects(sb); setTrends(tr); setWeakPoints(wp); setDaily(dr);
      setErrorCats(ec);
    }).catch((e) => {
      if (e instanceof ApiError && e.status === 401) { router.replace("/login"); return; }
      setError(e instanceof ApiError ? e.message : "统计数据加载失败，请稍后重试");
    }).finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="mx-auto w-full max-w-2xl px-4 pt-20 pb-24">
          <p className="text-center text-zinc-400 mt-20">加载中…</p>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar />
        <main className="mx-auto w-full max-w-2xl px-4 pt-20 pb-24">
          <div className="mt-20 text-center">
            <p className="text-5xl mb-4">⚠️</p>
            <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300">{error}</p>
            <button
              onClick={() => { setError(null); setLoading(true); router.refresh(); location.reload(); }}
              className="mt-6 rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
            >
              重新加载
            </button>
          </div>
        </main>
      </>
    );
  }

  const isEmpty = !overview || overview.total === 0;

  const kpiCards = overview ? [
    { label: "总错题数", value: overview.total, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10" },
    { label: "已掌握", value: overview.mastered, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
    { label: "掌握率", value: `${overview.mastery_rate}%`, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10" },
    { label: "连续复习", value: `${daily?.streak ?? 0} 天`, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-500/10" },
  ] : [];

  const subjectOption = {
    tooltip: { trigger: "axis" as const },
    legend: { data: ["已掌握", "学习中", "新录入"], bottom: 0, textStyle: { fontSize: 11 } },
    grid: { left: 40, right: 20, top: 20, bottom: 40 },
    xAxis: { type: "category" as const, data: subjects.map(s => s.name), axisLabel: { fontSize: 11 } },
    yAxis: { type: "value" as const, axisLabel: { fontSize: 11 } },
    series: [
      { name: "已掌握", type: "bar", stack: "total", data: subjects.map(s => s.mastered), color: "#34D399", barWidth: 24 },
      { name: "学习中", type: "bar", stack: "total", data: subjects.map(s => s.learning), color: "#FBBF24" },
      { name: "新录入", type: "bar", stack: "total", data: subjects.map(s => s.new), color: "#F87171" },
    ],
  };

  const trendOption = {
    tooltip: { trigger: "axis" as const },
    legend: { data: ["新增错题", "掌握"], bottom: 0, textStyle: { fontSize: 11 } },
    grid: { left: 40, right: 20, top: 20, bottom: 40 },
    xAxis: { type: "category" as const, data: trends.map(t => t.date.slice(5)), axisLabel: { fontSize: 10, rotate: 45 } },
    yAxis: { type: "value" as const, axisLabel: { fontSize: 11 } },
    series: [
      { name: "新增错题", type: "line", data: trends.map(t => t.new), color: "#60A5FA", smooth: true, areaStyle: { color: "rgba(96,165,250,0.1)" } },
      { name: "掌握", type: "line", data: trends.map(t => t.mastered), color: "#34D399", smooth: true, areaStyle: { color: "rgba(52,211,153,0.1)" } },
    ],
  };

  const weakOption = {
    tooltip: { trigger: "axis" as const },
    grid: { left: 100, right: 60, top: 10, bottom: 10 },
    xAxis: { type: "value" as const, axisLabel: { fontSize: 11 } },
    yAxis: {
      type: "category" as const,
      data: weakPoints.map(w => w.knowledge_point).reverse(),
      axisLabel: { fontSize: 11, width: 90, overflow: "truncate" },
    },
    series: [{
      type: "bar", data: weakPoints.map(w => ({
        value: w.count,
        itemStyle: { color: (w.mastery_rate ?? 0) < 30 ? "#F87171" : (w.mastery_rate ?? 0) < 60 ? "#FBBF24" : "#34D399" }
      })).reverse(),
      barWidth: 16,
      label: { show: true, position: "right", fontSize: 11, formatter: (p: unknown) => `${(p as { value: number }).value}题` },
    }],
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-2xl px-4 pt-20 pb-24 md:py-40">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <h1 className="text-3xl font-semibold tracking-tighter md:text-4xl">学习统计</h1>
          <p className="mt-2 text-sm text-zinc-500">掌握趋势一目了然，薄弱环节精准定位</p>
        </motion.div>

        {isEmpty ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="mt-16 text-center py-20">
            <p className="text-5xl mb-4">📊</p>
            <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400">还没有错题数据</p>
            <p className="text-sm text-zinc-400 mt-1">上传错题后，这里会显示你的学习统计</p>
          </motion.div>
        ) : (
          <div className="mt-8 flex flex-col gap-8">
            {/* KPI */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {kpiCards.map((card, i) => (
                <div key={i} className={`premium-shell ${card.bg}`}>
                  <div className="premium-core p-4 text-center">
                    <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                    <div className="text-xs text-zinc-400 mt-1">{card.label}</div>
                  </div>
                </div>
              ))}
            </motion.div>

            {/* 每日复习进度条 */}
            {daily && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="premium-shell">
                <div className="premium-core p-5 flex items-center gap-5">
                  <div className="relative w-16 h-16">
                    <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5"
                        className="text-zinc-100 dark:text-zinc-800" />
                      <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="2.5"
                        stroke="url(#grad)" strokeLinecap="round"
                        strokeDasharray={`${daily.rate} ${100 - daily.rate}`}
                        className="text-indigo-500" />
                      <defs>
                        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#6366F1" />
                          <stop offset="100%" stopColor="#8B5CF6" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-zinc-700 dark:text-zinc-300">{daily.rate}%</div>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">今日复习</p>
                    <p className="text-sm text-zinc-500">{daily.completed} / {daily.due_total} 题已完成</p>
                    <p className="text-xs text-purple-500 mt-0.5">🔥 连续 {daily.streak} 天打卡</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 学科分布 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              className="premium-shell">
              <div className="premium-core p-5">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">学科分布</h3>
                <p className="text-xs text-zinc-400 mb-4">六科错题数量与掌握情况</p>
                <ReactEChartsCore echarts={echarts} option={subjectOption} style={{ height: 260 }} />
              </div>
            </motion.div>

            {/* 掌握趋势 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="premium-shell">
              <div className="premium-core p-5">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">掌握趋势</h3>
                <p className="text-xs text-zinc-400 mb-4">近 30 天 新增 vs 掌握</p>
                <ReactEChartsCore echarts={echarts} option={trendOption} style={{ height: 260 }} />
              </div>
            </motion.div>

            {/* 薄弱 TOP5 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="premium-shell">
              <div className="premium-core p-5">
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">薄弱知识点 TOP5</h3>
                <p className="text-xs text-zinc-400 mb-4">错题最多、掌握率最低的知识点</p>
                {weakPoints.length > 0 ? (
                  <ReactEChartsCore echarts={echarts} option={weakOption} style={{ height: 220 }} />
                ) : (
                  <p className="text-sm text-zinc-400 py-8 text-center">暂无数据，上传错题后 AI 会自动分类</p>
                )}
              </div>
            </motion.div>

            {/* 错因分布 */}
            {errorCats && errorCats.total > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="premium-card">
                <div className="premium-core p-5">
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">错因分布</h3>
                  <p className="text-xs text-zinc-400 mb-4">按错因类型聚合，发现薄弱环节</p>
                  <ReactEChartsCore echarts={echarts} option={{
                    tooltip: { trigger: "item", formatter: "{b}: {c} 题 ({d}%)" },
                    legend: { bottom: 0, textStyle: { fontSize: 11 } },
                    series: [{
                      type: "pie",
                      radius: ["40%", "70%"],
                      center: ["50%", "45%"],
                      avoidLabelOverlap: false,
                      label: { show: false },
                      emphasis: { label: { show: true, fontWeight: "bold" } },
                      data: errorCats.categories.filter(c => c.count > 0).map(c => ({
                        name: c.label, value: c.count,
                      })),
                      color: ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#10b981", "#9ca3af"],
                    }],
                  }} style={{ height: 250 }} />
                </div>
              </motion.div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
