"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ChartPieSlice,
  Upload,
  ChartLineUp,
  Notebook,
  GearSix,
} from "@phosphor-icons/react";

const TABS = [
  { href: "/dashboard", label: "仪表盘", icon: ChartPieSlice },
  { href: "/upload", label: "录入", icon: Upload },
  { href: "/stats", label: "统计", icon: ChartLineUp },
  { href: "/browse", label: "错题本", icon: Notebook },
  { href: "/settings", label: "设置", icon: GearSix },
];

export function MobileTabBar() {
  const pathname = usePathname();

  // Auto-highlight: /subject/anything → dashboard, /review/anything → browse, etc.
  function isActive(href: string): boolean {
    if (pathname === href) return true;
    if (href === "/dashboard" && pathname === "/") return true;
    // Sub-pages: /question/123, /subject/123 → dashboard
    if (href === "/dashboard" && (pathname.startsWith("/question") || pathname.startsWith("/subject"))) return true;
    // /upload/confirm → upload
    if (href === "/upload" && pathname.startsWith("/upload")) return true;
    // /review/123, /graph/123 → browse
    if (href === "/browse" && (pathname.startsWith("/review") || pathname.startsWith("/graph"))) return true;
    return false;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-zinc-200/80 bg-white/90 px-1 pb-safe-offset backdrop-blur-xl dark:border-zinc-800/80 dark:bg-[#0a0a0a]/90 md:hidden">
      {TABS.map((tab) => {
        const active = isActive(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
              active
                ? "text-blue-600 dark:text-blue-400"
                : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            }`}
          >
            <Icon
              size={22}
              weight={active ? "fill" : "regular"}
            />
            <span className="text-[10px] font-medium leading-none">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
