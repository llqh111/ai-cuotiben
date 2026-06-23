"use client";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react";
import { logout } from "@/lib/api";

export function Navbar() {
  const router = useRouter();
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
      className="fixed top-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-8 rounded-full border border-black/5 bg-white/80 px-6 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0a0a0a]/80"
    >
      <Link href="/" className="font-semibold tracking-tight">AI 错题本</Link>
      <nav className="hidden items-center gap-6 text-sm font-medium text-zinc-500 md:flex dark:text-zinc-400">
        <Link href="/dashboard" className="hover:text-zinc-900 transition-colors dark:hover:text-white">仪表盘</Link>
        <Link href="/upload" className="hover:text-zinc-900 transition-colors dark:hover:text-white">录入</Link>
        <Link href="/stats" className="hover:text-zinc-900 transition-colors dark:hover:text-white">统计</Link>
        <Link href="/sprint" className="hover:text-zinc-900 transition-colors dark:hover:text-white">冲刺</Link>
        <Link href="/browse" className="hover:text-zinc-900 transition-colors dark:hover:text-white">错题本</Link>
        <Link href="/settings" className="hover:text-zinc-900 transition-colors dark:hover:text-white">设置</Link>
      </nav>
      <button
        onClick={() => logout(router)}
        title="退出登录"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-white"
      >
        <SignOut size={16} weight="bold" />
      </button>
    </motion.header>
  );
}
