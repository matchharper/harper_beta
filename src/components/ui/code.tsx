import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CodeType = "inline" | "block";

export type CodeProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  children: ReactNode;
  type?: CodeType;
};

export function Code({
  children,
  className,
  type = "inline",
  ...props
}: CodeProps) {
  if (type === "block") {
    return (
      <pre
        className={cn(
          "block w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-neutral-1000-a05 bg-bg-weak p-4 font-mono text-[13px] font-normal leading-6 text-neutral-primary",
          className
        )}
        {...props}
      >
        <code>{children}</code>
      </pre>
    );
  }

  return (
    <code
      className={cn(
        "rounded bg-bg-weak px-1.5 py-0.5 font-mono text-[0.9em] font-normal text-neutral-primary",
        className
      )}
      {...props}
    >
      {children}
    </code>
  );
}
