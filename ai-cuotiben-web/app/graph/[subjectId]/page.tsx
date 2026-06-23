"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import ReactECharts from "echarts-for-react";
import Link from "next/link";
import { ArrowLeft, ArrowsClockwise } from "@phosphor-icons/react";
import { use, useEffect, useState, useCallback } from "react";
import {
  useAuthGuard,
  subjectName,
  getGraph,
  rebuildGraph,
  type GraphNode,
  type GraphEdge,
} from "@/lib/api";

export default function GraphPage({ params }: { params: Promise<{ subjectId: string }> }) {
  useAuthGuard();
  const { subjectId } = use(params);
  const decodedSubject = subjectName(decodeURIComponent(subjectId));
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [rebuilding, setRebuilding] = useState(false);

  const load = useCallback(() => {
    getGraph(subjectId)
      .then((d) => {
        setNodes(d.nodes);
        setEdges(d.edges);
      })
      .catch(() => {});
  }, [subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRebuild() {
    setRebuilding(true);
    try {
      await rebuildGraph(subjectId);
      load();
    } catch {
      // 重建失败静默
    } finally {
      setRebuilding(false);
    }
  }

  // ECharts 力导向图：节点大小=错题数，颜色=掌握程度，连线=知识点关系
  const option = {
    backgroundColor: "transparent",
    tooltip: {
      show: true,
      backgroundColor: "rgba(0,0,0,0.8)",
      borderColor: "#333",
      formatter: (p: { dataType: string; data: { count?: number; relation_type?: string }; name: string }) =>
        p.dataType === "edge"
          ? p.data.relation_type ?? "相关"
          : `${p.name}：${p.data.count ?? 0} 题`,
    },
    series: [
      {
        type: "graph",
        layout: "force",
        animation: false,
        roam: true,
        label: { show: true, position: "right", formatter: "{b}", color: "#a1a1aa" },
        draggable: true,
        data:
          nodes.length > 0
            ? nodes
            : [{ name: decodedSubject, symbolSize: 50, itemStyle: { color: "#ef4444" } }],
        edges: edges,
        force: { edgeLength: 120, repulsion: 400, gravity: 0.1 },
        lineStyle: { color: "source", curveness: 0.2, opacity: 0.6, width: 1.5 },
        emphasis: { focus: "adjacency", lineStyle: { width: 3 } },
      },
    ],
  };

  return (
    <>
      <Navbar />
      <main className="flex h-[100dvh] w-full flex-col bg-[#050505]">
        <div className="absolute top-32 left-8 z-10">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft weight="bold" /> 返回仪表盘
          </Link>
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
            className="mt-6 text-4xl font-semibold tracking-tighter text-white"
          >
            {decodedSubject} 知识图谱
          </motion.h1>
          <p className="mt-2 text-zinc-500 max-w-sm text-sm leading-relaxed">
            节点大小代表错题数量，颜色代表掌握程度（红=薄弱 黄=学习中 绿=已掌握），连线为知识点关系。
          </p>
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <ArrowsClockwise weight="bold" className={rebuilding ? "animate-spin" : ""} />
            {rebuilding ? "AI 分析中…" : "用 AI 重建关系"}
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          className="flex-grow w-full"
        >
          <ReactECharts option={option} style={{ height: "100%", width: "100%" }} theme="dark" />
        </motion.div>
      </main>
    </>
  );
}
