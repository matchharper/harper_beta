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
          "inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent bg-neutral-400 p-[1px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:cursor-not-allowed disabled:opacity-55 data-[state=checked]:bg-black",
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

const AppleSwitch = React.forwardRef<HTMLButtonElement, SwitchProps>(
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
          "relative inline-flex h-[22px] w-[42px] shrink-0 touch-manipulation appearance-none items-center rounded-full border-0 bg-[#e5e5ea] p-0 transition-colors duration-[250ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-floating disabled:cursor-not-allowed disabled:opacity-55 data-[state=checked]:bg-[#34c759] motion-reduce:transition-none",
          className
        )}
        {...props}
        onClick={handleClick}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-[2px] top-[2px] size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25),0_1px_1px_rgba(0,0,0,0.12)] transition-transform duration-[250ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] will-change-transform motion-reduce:transition-none",
            resolvedChecked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    );
  }
);
AppleSwitch.displayName = "AppleSwitch";

export { AppleSwitch, Switch };
