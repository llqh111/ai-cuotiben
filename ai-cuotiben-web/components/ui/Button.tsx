"use client";
import { motion } from "motion/react";
import React from "react";
import { ArrowUpRight } from "@phosphor-icons/react";

// motion.button 自带 onDrag/onAnimationStart 等手势签名，与原生 HTML 同名属性冲突，需 Omit。
interface ButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"
  > {
  children: React.ReactNode;
  icon?: boolean;
}

export function Button({ children, icon, ...props }: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className="group relative flex items-center gap-4 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-6 py-3 font-medium transition-all duration-500 ease-spring hover:bg-zinc-800 dark:hover:bg-zinc-200"
      {...props}
    >
      <span>{children}</span>
      {icon && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 dark:bg-black/10 transition-transform duration-500 ease-spring group-hover:translate-x-1 group-hover:-translate-y-[1px] group-hover:scale-105">
          <ArrowUpRight weight="bold" />
        </div>
      )}
    </motion.button>
  );
}
