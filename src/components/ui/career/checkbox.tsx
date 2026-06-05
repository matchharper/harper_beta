"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type CareerCheckboxState = "default" | "error" | "disabled";
export type CareerCheckboxSize = "small" | "medium" | "large";

export interface CareerCheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size" | "type"
> {
  helperText?: React.ReactNode;
  indeterminate?: boolean;
  label?: React.ReactNode;
  size?: CareerCheckboxSize;
  state?: CareerCheckboxState;
}

const checkboxSizeClassNames: Record<CareerCheckboxSize, string> = {
  small: "size-4 rounded-[5px]",
  medium: "size-5 rounded-md",
  large: "size-6 rounded-md",
};

const labelSizeClassNames: Record<CareerCheckboxSize, string> = {
  small: "text-[13px] leading-5",
  medium: "text-[14px] leading-[22px]",
  large: "text-[16px] leading-6",
};

const checkIcon =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M3.75 8.25 6.75 11.25 12.25 5.75' stroke='white' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

const indeterminateIcon =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M4 8H12' stroke='white' stroke-width='1.9' stroke-linecap='round'/%3E%3C/svg%3E\")";

const CareerCheckbox = React.forwardRef<HTMLInputElement, CareerCheckboxProps>(
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
      size = "medium",
      state = "default",
      style,
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

    return (
      <label
        className={cn(
          "inline-flex items-start gap-2",
          resolvedDisabled ? "cursor-not-allowed" : "cursor-pointer",
          className
        )}
      >
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
          className={cn(
            "mt-px shrink-0 appearance-none bg-center bg-no-repeat bg-size-[14px_14px] outline-none transition-[background-color,border-color,box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-[#753B17]/25",
            checkboxSizeClassNames[size],
            state === "error"
              ? "border border-[#9B2E1E33]"
              : "border border-[#1F1C1A1A]",
            "checked:border-[#753B17] checked:bg-[#753B17]",
            "indeterminate:border-[#753B17] indeterminate:bg-[#753B17]",
            resolvedDisabled &&
              "border-[#F3F1EE] bg-[#F8F7F5] checked:bg-[#CEC8C1]"
          )}
          {...props}
        />
        {label || helperText ? (
          <span className="flex min-w-0 flex-col">
            {label ? (
              <span
                className={cn(
                  "font-normal",
                  labelSizeClassNames[size],
                  resolvedDisabled ? "text-[#CEC8C1]" : "text-[#1F1C1A]"
                )}
              >
                {label}
              </span>
            ) : null}
            {helperText ? (
              <span
                className={cn(
                  "text-[12px] leading-4",
                  resolvedDisabled ? "text-[#CEC8C1]" : "text-[#827B75]"
                )}
              >
                {helperText}
              </span>
            ) : null}
          </span>
        ) : null}
      </label>
    );
  }
);

CareerCheckbox.displayName = "CareerCheckbox";

export { CareerCheckbox };
