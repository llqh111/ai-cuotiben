"use client";
import { motion } from "motion/react";
import React from "react";
import clsx from "clsx";

interface PremiumCardProps {
  children: React.ReactNode;
  className?: string;
  coreClassName?: string;
  delay?: number;
}

export function PremiumCard({ children, className, coreClassName, delay = 0 }: PremiumCardProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: [0.32, 0.72, 0, 1] }}
      className={clsx("premium-shell", className)}
    >
      <div className={clsx("premium-core h-full p-8 md:p-12", coreClassName)}>
        {children}
      </div>
    </motion.div>
  );
}
