"use client";
import { motion } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import ReactECharts from "echarts-for-react";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { use, useEffect, useState } from "react";
import { apiFetch, useAuthGuard, subjectName } from "@/lib/api";

interface GraphNode { name: string; symbolSize: number; itemStyle?: { color: string } }
interface GraphData { nodes: GraphNode[]; edges: { source: string; target: string }[] }

export default function GraphPage({ params }: { params: Promise<{ subjectId: string }> }) {
  useAuthGuard();
  const { subjectId } = use(params);
  // 路由传的是科目 id，图谱标题显示中文名
  const decodedSubject = subjectName(decodeURIComponent(subjectId));
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });

  useEffect(() => {
    apiFetch<GraphData>(`/api/stats/graph/${encodeURIComponent(decodedSubject)}`)
      .then(setGraphData)
      .catch(() => {});
  }, [decodedSubject]);

  // ECharts Graph Configuration (High-end Dark Neon style)
  const option = {
    backgroundColor: 'transparent',
    tooltip: { show: true, theme: 'dark', backgroundColor: 'rgba(0,0,0,0.8)', borderColor: '#333' },
    series: [
      {
        type: 'graph',
        layout: 'force',
        animation: false,
        label: { position: 'right', formatter: '{b}', color: '#a1a1aa' },
        draggable: true,
        data: graphData.nodes.length > 0 ? graphData.nodes : [
          { name: decodedSubject, symbolSize: 50, itemStyle: { color: '#ef4444', shadowBlur: 20, shadowColor: '#ef4444' } }
        ],
        categories: [],
        force: {
          edgeLength: 120,
          repulsion: 400,
          gravity: 0.1
        },
        edges: graphData.edges,
        lineStyle: {
          color: 'source',
          curveness: 0.2,
          opacity: 0.6,
          width: 1.5
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 3 }
        }
      }
    ]
  };

  return (
    <>
      <Navbar />
      <main className="flex h-[100dvh] w-full flex-col bg-[#050505]">
        <div className="absolute top-32 left-8 z-10">
          <Link href={`/dashboard`} className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors">
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
            节点大小代表错题数量，相近的知识点产生连线。拖拽节点以探索你的知识漏洞。
          </p>
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          className="flex-grow w-full"
        >
          <ReactECharts option={option} style={{ height: '100%', width: '100%' }} theme="dark" />
        </motion.div>
      </main>
    </>
  );
}
