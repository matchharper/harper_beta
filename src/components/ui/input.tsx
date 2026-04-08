import * as React from "react";
import { cn } from "@/lib/cn";

export const inputSurfaceClassName =
  "w-full rounded-md border border-white/10 bg-transparent font-normal px-3 py-2 text-sm text-white outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-white/50 focus:border-white/15 focus:ring-2 focus:ring-white/10 disabled:cursor-not-allowed disabled:opacity-50";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(inputSurfaceClassName, className)}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
