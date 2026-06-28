"use client";
import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { PremiumCard } from "@/components/ui/PremiumCard";
import {
  ArrowsClockwise,
  FolderOpen,
  Download,
  CheckCircle,
  Warning,
  Spinner,
} from "@phosphor-icons/react";
import {
  getSyncStatus,
  initVault,
  exportMarkdown,
  downloadBlob,
  SyncStatus,
} from "@/lib/knowledge-api";

export default function KnowledgeSyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getSyncStatus();
      setStatus(s);
    } catch {
      // vault 未配置时静默
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleInitVault() {
    setSyncing(true);
    setMessage("");
    try {
      const result = await initVault();
      setMessage(
        `初始化完成：${result.questions} 错题 + ${result.knowledge_points} 知识点已同步`
      );
      await fetchStatus();
    } catch (e: any) {
      setMessage(`初始化失败：${e.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleExport() {
    try {
      const blob = await exportMarkdown();
      downloadBlob(blob, "cuotiben-export.zip");
      setMessage("ZIP 导出成功");
    } catch (e: any) {
      setMessage(`导出失败：${e.message}`);
    }
  }

  if (loading) {
    return (
      <PremiumCard delay={0.3} className="w-full">
        <div className="flex items-center gap-3">
          <Spinner size={20} className="animate-spin text-zinc-400" />
          <span className="text-sm text-zinc-500">检查同步状态...</span>
        </div>
      </PremiumCard>
    );
  }

  return (
    <PremiumCard delay={0.3} className="w-full">
      <div className="flex items-start gap-6">
        <div className="mt-1 h-10 w-10 shrink-0 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
          <ArrowsClockwise size={20} weight="fill" />
        </div>
        <div className="w-full">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">
                知识库同步
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                将错题知识点和错题卡片同步到 Obsidian 知识库。
              </p>
            </div>
            {status?.vault_configured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <CheckCircle size={14} weight="fill" />
                已连接
              </span>
            )}
          </div>

          {/* Vault 状态 */}
          {status?.vault_configured ? (
            <div className="mt-4 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <FolderOpen size={16} />
                <span className="truncate">{status.vault_path}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-zinc-500">错题</span>
                  <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {status.questions_synced}
                    <span className="text-zinc-400"> / {status.questions_total}</span>
                  </div>
                </div>
                <div>
                  <span className="text-zinc-500">知识点</span>
                  <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {status.knowledge_points_synced}
                    <span className="text-zinc-400"> / {status.knowledge_points_total}</span>
                  </div>
                </div>
              </div>
              {status.last_sync && (
                <p className="mt-2 text-xs text-zinc-400">
                  上次同步：{new Date(status.last_sync).toLocaleString("zh-CN")}
                </p>
              )}
              {status.pending > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                  <Warning size={14} weight="fill" />
                  {status.pending} 项待同步
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                未检测到 Obsidian vault。请在 D:\Documents 下创建 vault 或在设置中手动配置路径。
              </p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={handleInitVault}
              disabled={syncing || !status?.vault_configured}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {syncing ? (
                <Spinner size={16} className="animate-spin" />
              ) : (
                <ArrowsClockwise size={16} weight="bold" />
              )}
              {syncing ? "同步中..." : "初始化 Vault"}
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Download size={16} weight="bold" />
              导出 ZIP
            </button>
          </div>

          {message && (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              {message}
            </p>
          )}
        </div>
      </div>
    </PremiumCard>
  );
}
