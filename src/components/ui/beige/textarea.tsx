import * as React from "react";
import { cn } from "@/lib/cn";

export const beigeTextareaClassName =
  "w-full rounded-[8px] border border-beige900/15 bg-white/60 px-3 py-2 text-[14px] font-normal leading-6 text-beige900 outline-none transition focus:ring-1 focus:ring-beige900/30 placeholder:text-beige900/30 disabled:cursor-not-allowed disabled:opacity-60";

export type BeigeTextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const BeigeTextarea = React.forwardRef<HTMLTextAreaElement, BeigeTextareaProps>(
  ({ className, rows = 4, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(beigeTextareaClassName, "resize-none", className)}
        {...props}
      />
    );
  }
);

BeigeTextarea.displayName = "BeigeTextarea";

export { BeigeTextarea };
