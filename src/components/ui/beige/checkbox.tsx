"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

const checkIcon =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M3.75 8.25 6.75 11.25 12.25 5.75' stroke='%23FDF6EE' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

const indeterminateIcon =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M4 8H12' stroke='%23FDF6EE' stroke-width='1.9' stroke-linecap='round'/%3E%3C/svg%3E\")";

export type BeigeCheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  indeterminate?: boolean;
};

export const beigeCheckboxClassName =
  "peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-[6px] border border-beige900/20 bg-beige100 bg-center bg-no-repeat [background-size:12px_12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(46,23,6,0.1)] outline-none transition-[background-color,border-color,box-shadow,transform] duration-200 hover:bg-beige900/60 focus-visible:ring-2 focus-visible:ring-beige500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white checked:border-beige900 checked:bg-beige900 checked:shadow-[0_10px_20px_rgba(46,23,6,0.15)] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97]";

const BeigeCheckbox = React.forwardRef<HTMLInputElement, BeigeCheckboxProps>(
  (
    {
      checked,
      defaultChecked,
      indeterminate = false,
      onChange,
      className,
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

        if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!isControlled) {
          setUncontrolledChecked(event.target.checked);
        }

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
      <input
        {...props}
        ref={setRefs}
        type="checkbox"
        checked={checked}
        defaultChecked={defaultChecked}
        data-state={
          isIndeterminate
            ? "indeterminate"
            : resolvedChecked
              ? "checked"
              : "unchecked"
        }
        aria-checked={isIndeterminate ? "mixed" : resolvedChecked}
        onChange={handleChange}
        style={{
          ...style,
          backgroundImage,
        }}
        className={cn(beigeCheckboxClassName, className)}
      />
    );
  }
);

BeigeCheckbox.displayName = "BeigeCheckbox";

export { BeigeCheckbox };
