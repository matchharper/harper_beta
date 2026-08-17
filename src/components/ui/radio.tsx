"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type RadioSize = "small" | "medium" | "large";

export interface RadioProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size" | "type"
> {
  label?: React.ReactNode;
  size?: RadioSize;
  unstyled?: boolean;
}

const radioSizeClassNames: Record<RadioSize, string> = {
  small: "size-3",
  medium: "size-4",
  large: "size-5",
};

const labelSizeClassNames: Record<RadioSize, string> = {
  small: "text-[13px] leading-5",
  medium: "text-[14px] leading-[22px]",
  large: "text-[16px] leading-6",
};

const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  (
    { className, disabled, label, size = "small", unstyled = false, ...props },
    ref
  ) => {
    const input = (
      <input
        ref={ref}
        type="radio"
        disabled={disabled}
        className={
          unstyled
            ? className
            : cn(
                "shrink-0 appearance-none rounded-full border border-neutral-1000-a10 bg-bg-floating outline-none transition-[background-color,border-color,opacity,transform] checked:border-black checked:bg-[radial-gradient(circle,var(--color-neutral-00)_0_35%,var(--color-neutral-1000)_38%)] focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.97]",
                radioSizeClassNames[size],
                !label && className
              )
        }
        {...props}
      />
    );

    if (!label) return input;

    return (
      <label
        className={cn(
          "inline-flex items-start gap-2",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          className
        )}
      >
        {input}
        <span
          className={cn(
            "font-normal mt-[-3px]",
            labelSizeClassNames[size],
            disabled ? "text-neutral-disabled" : "text-neutral-primary"
          )}
        >
          {label}
        </span>
      </label>
    );
  }
);
Radio.displayName = "Radio";

export { Radio };
