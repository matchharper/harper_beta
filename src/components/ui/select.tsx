import * as React from "react";

import { cn } from "@/lib/utils";

export const selectSurfaceClassName =
  "w-full rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 py-2 text-sm font-normal text-neutral-primary outline-none transition-[border-color,background-color] duration-200 focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:bg-bg-weak disabled:text-neutral-disabled disabled:opacity-70";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  unstyled?: boolean;
};

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, unstyled = false, ...props }, ref) => (
    <select
      ref={ref}
      className={unstyled ? className : cn(selectSurfaceClassName, className)}
      {...props}
    />
  )
);
Select.displayName = "Select";

export { Select };
export default Select;
