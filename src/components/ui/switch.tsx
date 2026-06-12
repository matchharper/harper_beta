"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked,
      className,
      defaultChecked = false,
      disabled,
      onClick,
      onCheckedChange,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isControlled = checked !== undefined;
    const [uncontrolledChecked, setUncontrolledChecked] =
      React.useState(defaultChecked);
    const resolvedChecked = isControlled
      ? Boolean(checked)
      : uncontrolledChecked;

    const handleClick = React.useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled) return;

        const nextChecked = !resolvedChecked;
        if (!isControlled) setUncontrolledChecked(nextChecked);
        onCheckedChange?.(nextChecked);
      },
      [disabled, isControlled, onCheckedChange, onClick, resolvedChecked]
    );

    return (
      <button
        ref={ref}
        type={type}
        role="switch"
        aria-checked={resolvedChecked}
        data-state={resolvedChecked ? "checked" : "unchecked"}
        disabled={disabled}
        className={cn(
          "inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent bg-bg-weak p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:cursor-not-allowed disabled:opacity-55 data-[state=checked]:bg-black",
          className
        )}
        {...props}
        onClick={handleClick}
      >
        <span
          className="size-5 rounded-full bg-bg-floating transition-transform data-[state=checked]:translate-x-4"
          data-state={resolvedChecked ? "checked" : "unchecked"}
        />
      </button>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
