"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type CheckboxState = "default" | "error" | "disabled";
export type CheckboxSize = "small" | "medium" | "large";

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size" | "type"
> {
  helperText?: React.ReactNode;
  indeterminate?: boolean;
  label?: React.ReactNode;
  size?: CheckboxSize;
  state?: CheckboxState;
  unstyled?: boolean;
}

const checkboxSizeClassNames: Record<CheckboxSize, string> = {
  small: "size-3 rounded-[0px]",
  medium: "size-4 rounded-sm",
  large: "size-5 rounded-sm",
};

const labelSizeClassNames: Record<CheckboxSize, string> = {
  small: "text-[13px] leading-5",
  medium: "text-[13px] leading-[20px]",
  large: "text-[16px] leading-6",
};

const checkIcon =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M3.75 8.25 6.75 11.25 12.25 5.75' stroke='white' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

const indeterminateIcon =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M4 8H12' stroke='white' stroke-width='1.9' stroke-linecap='round'/%3E%3C/svg%3E\")";

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      checked,
      className,
      defaultChecked,
      disabled,
      helperText,
      indeterminate = false,
      label,
      onChange,
      size = "small",
      state = "default",
      style,
      unstyled = false,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const isControlled = checked !== undefined;
    const [uncontrolledChecked, setUncontrolledChecked] = React.useState(
      Boolean(defaultChecked)
    );
    const resolvedChecked = isControlled
      ? Boolean(checked)
      : uncontrolledChecked;
    const resolvedDisabled = disabled || state === "disabled";
    const isIndeterminate = indeterminate && !resolvedChecked;

    React.useEffect(() => {
      if (!inputRef.current) return;
      inputRef.current.indeterminate = isIndeterminate;
    }, [isIndeterminate]);

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === "function") {
          ref(node);
          return;
        }
        if (ref) ref.current = node;
      },
      [ref]
    );

    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!isControlled) setUncontrolledChecked(event.target.checked);
        onChange?.(event);
      },
      [isControlled, onChange]
    );

    const backgroundImage = isIndeterminate
      ? indeterminateIcon
      : resolvedChecked
        ? checkIcon
        : style?.backgroundImage;

    const input = (
      <input
        ref={setRefs}
        type="checkbox"
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={resolvedDisabled}
        data-state={
          isIndeterminate
            ? "indeterminate"
            : resolvedChecked
              ? "checked"
              : "unchecked"
        }
        aria-checked={isIndeterminate ? "mixed" : resolvedChecked}
        onChange={handleChange}
        style={{ ...style, backgroundImage }}
        className={
          unstyled
            ? className
            : cn(
                "shrink-0 appearance-none bg-bg-floating bg-center bg-no-repeat bg-size-[14px_14px] outline-none transition-[opacity,transform] focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.97]",
                checkboxSizeClassNames[size],
                state === "error"
                  ? "border border-[#9b2e1e33]"
                  : "border border-neutral-1000-a10",
                "checked:border-black checked:bg-black",
                "indeterminate:border-black indeterminate:bg-black",
                resolvedDisabled &&
                  "border-neutral-1000-a05 bg-bg-weak checked:bg-neutral-disabled",
                !label && !helperText && className
              )
        }
        {...props}
      />
    );

    if (!label && !helperText) return input;

    return (
      <label
        className={cn(
          "inline-flex items-center gap-2",
          resolvedDisabled ? "cursor-not-allowed" : "cursor-pointer",
          className
        )}
      >
        {input}
        <span className="flex min-w-0 flex-col">
          {label ? (
            <span
              className={cn(
                "font-normal",
                labelSizeClassNames[size],
                resolvedDisabled
                  ? "text-neutral-disabled"
                  : "text-neutral-muted hover:text-neutral-primary"
              )}
            >
              {label}
            </span>
          ) : null}
          {helperText ? (
            <span
              className={cn(
                "text-[12px] leading-4",
                resolvedDisabled
                  ? "text-neutral-disabled"
                  : "text-neutral-muted"
              )}
            >
              {helperText}
            </span>
          ) : null}
        </span>
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
