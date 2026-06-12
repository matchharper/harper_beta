import * as React from "react";

import { cn } from "@/lib/utils";

export const ProgressBar = ({
  value,
  className,
}: {
  value: number;
  className?: string;
}) => {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        "h-1.5 overflow-hidden rounded-full border border-neutral-1000-a05 bg-bg-floating",
        className
      )}
    >
      <div
        className="h-full rounded-full bg-black transition-[width] duration-300"
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
};
