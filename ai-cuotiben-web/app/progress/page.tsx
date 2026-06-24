"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Navbar } from "@/components/ui/Navbar";
import { useAuthGuard } from "@/lib/api";
import {
  getChapters,
  getProgressOverview,
  updateChapterRating,
  type ChapterNode,
  type SubjectProgress,
} from "@/lib/api";
import {
  CaretRight,
  CaretDown,
  Star,
  Plus,
} from "@phosphor-icons/react";

const SUBJECTS = [
  { id: 1, name: "数学", icon: "📐", color: "#3b82f6" },
  { id: 2, name: "物理", icon: "⚛️", color: "#8b5cf6" },
  { id: 3, name: "化学", icon: "🧪", color: "#f59e0b" },
  { id: 4, name: "生物", icon: "🧬", color: "#14b8a6" },
  { id: 5, name: "语文", icon: "📖", color: "#ef4444" },
  { id: 6, name: "英语", icon: "🔤", color: "#10b981" },
];

function StarRating({
  rating,
  onChange,
}: {
  rating: number | null;
  onChange: (r: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const current = hover || rating || 0;

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={(e) => {
            e.stopPropagation();
            onChange(n);
          }}
          onMouseEnter={() => setHover(n)}
          className="transition-colors"
        >
          <Star
            size={16}
            weight={n <= current ? "fill" : "regular"}
            className={
              n <= current
                ? "text-amber-400"
                : "text-zinc-300 dark:text-zinc-600"
            }
          />
        </button>
      ))}
    </div>
  );
}

function ChapterTreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onRate,
  onSelect,
  selectedId,
}: {
  node: ChapterNode;
  depth: number;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onRate: (id: number, rating: number) => void;
  onSelect: (id: number) => void;
  selectedId: number | null;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const isLeaf = !hasChildren && node.parent_id !== null;

  return (
    <div>
      <div
        onClick={() => {
          if (hasChildren) onToggle(node.id);
          else onSelect(node.id);
        }}
        className={`group flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-lg cursor-pointer transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/50 ${
          isSelected ? "bg-blue-50 dark:bg-blue-500/10" : ""
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Expand/collapse toggle */}
        <span className="w-4 h-4 flex items-center justify-center text-zinc-400 shrink-0">
          {hasChildren ? (
            isExpanded ? (
              <CaretDown size={14} weight="bold" />
            ) : (
              <CaretRight size={14} weight="bold" />
            )
          ) : (
            <span className="w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-600" />
          )}
        </span>

        {/* Node name */}
        <span
          className={`flex-1 text-sm truncate ${
            depth === 0
              ? "font-semibold"
              : depth === 1
                ? "font-medium"
                : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          {node.name}
        </span>

        {/* Star rating (leaf nodes) */}
        {isLeaf && (
          <div onClick={(e) => e.stopPropagation()}>
            <StarRating
              rating={node.mastery_rating}
              onChange={(r) => onRate(node.id, r)}
            />
          </div>
        )}

        {/* Error count badge */}
        {node.error_count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-[11px] font-semibold tabular-nums">
            {node.error_count}
          </span>
        )}
      </div>

      {/* Children */}
      <AnimatePresence>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {node.children.map((child) => (
              <ChapterTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onRate={onRate}
                onSelect={onSelect}
                selectedId={selectedId}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProgressPage() {
  useAuthGuard();
  const [activeSubject, setActiveSubject] = useState(2); // default: 数学
  const [tree, setTree] = useState<ChapterNode[]>([]);
  const [overview, setOverview] = useState<SubjectProgress[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTree = useCallback(async (subjectId: number) => {
    setLoading(true);
    try {
      const data = await getChapters(subjectId);
      setTree(data.nodes);
    } catch {
      setTree([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTree(activeSubject);
  }, [activeSubject, fetchTree]);

  useEffect(() => {
    getProgressOverview()
      .then((d) => setOverview(d.subjects))
      .catch(() => {});
  }, []);

  const handleToggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRate = async (id: number, rating: number) => {
    // Optimistic update
    const updateNode = (nodes: ChapterNode[]): ChapterNode[] =>
      nodes.map((n) => ({
        ...n,
        mastery_rating: n.id === id ? rating : n.mastery_rating,
        children: updateNode(n.children),
      }));
    setTree((prev) => updateNode(prev));

    try {
      await updateChapterRating(id, rating);
    } catch {
      // Revert on failure — refetch
      fetchTree(activeSubject);
    }
  };

  const currentSubject = SUBJECTS.find((s) => s.id === activeSubject)!;
  const currentOverview = overview.find((s) => s.id === activeSubject);

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 pt-20 pb-24 md:py-40">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          className="mb-8"
        >
          <h1 className="text-3xl font-semibold tracking-tighter md:text-4xl">
            一轮复习进度
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            追踪六科考纲全覆盖，掌握度自评 + 错题交叉验证
          </p>
        </motion.div>

        {/* Overview bar */}
        {currentOverview && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="premium-shell mb-8"
          >
            <div className="premium-core p-5 flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{currentSubject.icon}</span>
                <div>
                  <p className="font-semibold">{currentSubject.name}</p>
                  <p className="text-sm text-zinc-500">
                    已复习 {currentOverview.rated_kps}/{currentOverview.total_kps} 知识点
                  </p>
                </div>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-2xl font-semibold tabular-nums">
                    {currentOverview.avg_mastery}
                  </p>
                  <p className="text-xs text-zinc-500">均掌握度</p>
                </div>
                {/* Progress ring */}
                <div className="relative w-14 h-14">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18" cy="18" r="15.5"
                      fill="none"
                      stroke="currentColor"
                      className="text-zinc-100 dark:text-zinc-800"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18" cy="18" r="15.5"
                      fill="none"
                      stroke={currentSubject.color}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${currentOverview.coverage * 0.974} 97.4`}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
                    {currentOverview.coverage}%
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Subject tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {SUBJECTS.map((sub) => (
            <button
              key={sub.id}
              onClick={() => {
                setActiveSubject(sub.id);
                setExpanded(new Set());
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                activeSubject === sub.id
                  ? "text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
              style={
                activeSubject === sub.id
                  ? { backgroundColor: sub.color }
                  : undefined
              }
            >
              <span>{sub.icon}</span>
              {sub.name}
            </button>
          ))}
        </div>

        {/* Chapter tree */}
        <div className="premium-shell">
          <div className="premium-core p-6">
            {loading ? (
              <div className="text-center py-12 text-zinc-400">
                加载中...
              </div>
            ) : tree.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-zinc-400 mb-4">暂无章节数据</p>
                <p className="text-sm text-zinc-400">
                  请确认后端已启动，并尝试重新登录以触发数据初始化
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {tree.map((node) => (
                  <ChapterTreeNode
                    key={node.id}
                    node={node}
                    depth={0}
                    expanded={expanded}
                    onToggle={handleToggle}
                    onRate={handleRate}
                    onSelect={setSelectedId}
                    selectedId={selectedId}
                  />
                ))}
              </div>
            )}

            {/* Add chapter button */}
            <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                onClick={() => {
                  // TODO: add chapter modal — MVP 阶段先用 seed 数据
                }}
              >
                <Plus size={16} />
                添加章节
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
