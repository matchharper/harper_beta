"use client";

import React from "react";
import { motion } from "motion/react";

export function CareerMobileJobsEmptyState({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-1 items-center justify-center px-6 py-20 text-center text-[15px] text-neutral-muted"
    >
      {children}
    </motion.div>
  );
}
