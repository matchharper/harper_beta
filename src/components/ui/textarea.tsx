import * as React from "react";

import { cn } from "@/lib/utils";

export const textareaSurfaceClassName =
  "w-full resize-none rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 py-2 text-sm font-normal leading-6 text-neutral-primary outline-none transition-[border-color,background-color] duration-200 placeholder:text-neutral-placeholder focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:bg-bg-weak disabled:text-neutral-disabled disabled:placeholder:text-neutral-placeholder disabled:opacity-70";

export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    unstyled?: boolean;
  };

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows = 4, unstyled = false, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={unstyled ? className : cn(textareaSurfaceClassName, className)}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
export default Textarea;
