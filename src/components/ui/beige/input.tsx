import * as React from "react";
import { cn } from "@/lib/cn";

export const beigeInputClassName =
  "h-[36px] w-full rounded-[8px] border border-beige900/15 bg-white/60 px-3 py-2 text-[14px] font-normal leading-5 text-beige900 outline-none transition focus:ring-1 focus:ring-beige900/30 placeholder:text-beige900/30 disabled:cursor-not-allowed disabled:opacity-60";

export type BeigeInputProps = React.InputHTMLAttributes<HTMLInputElement>;

const BeigeInput = React.forwardRef<HTMLInputElement, BeigeInputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(beigeInputClassName, className)}
        {...props}
      />
    );
  }
);

BeigeInput.displayName = "BeigeInput";

export { BeigeInput };
