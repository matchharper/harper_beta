import * as React from "react";
import { cn } from "@/lib/cn";

export const inputSurfaceClassName =
  "w-full rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 py-2 text-sm font-normal text-neutral-primary outline-none transition-[border-color,background-color] duration-200 placeholder:text-neutral-placeholder focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:bg-bg-weak disabled:text-neutral-disabled disabled:placeholder:text-neutral-placeholder disabled:opacity-70";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  unstyled?: boolean;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", unstyled = false, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={unstyled ? className : cn(inputSurfaceClassName, className)}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export type TextFieldVariant = "outline" | "faded" | "headless";
export type TextFieldStatus = "default" | "error" | "disabled" | "focused";
export type TextFieldSize = "small" | "medium" | "large" | "xlarge";

export interface TextFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size" | "prefix"
> {
  endSlot?: React.ReactNode;
  errorText?: React.ReactNode;
  helperText?: React.ReactNode;
  label?: React.ReactNode;
  prefix?: React.ReactNode;
  rounded?: boolean;
  size?: TextFieldSize;
  startSlot?: React.ReactNode;
  status?: TextFieldStatus;
  suffix?: React.ReactNode;
  variant?: TextFieldVariant;
}

const fieldSizeClassNames: Record<TextFieldSize, string> = {
  small: "h-8 text-[13px] leading-5",
  medium: "h-[38px] text-[14px] leading-[22px]",
  large: "h-11 text-[16px] leading-6",
  xlarge: "h-12 text-[16px] leading-6",
};

function getFieldVariantClassName(
  variant: TextFieldVariant,
  status: TextFieldStatus
) {
  if (variant === "headless") return "bg-transparent";
  if (status === "disabled") {
    return variant === "outline"
      ? "border border-neutral-1000-a05 bg-bg-weak"
      : "bg-bg-weak";
  }
  if (status === "error") {
    return variant === "outline"
      ? "border border-critical/30 bg-bg-floating"
      : "border border-critical/30 bg-bg-weak";
  }
  if (status === "focused") {
    return variant === "outline"
      ? "border border-neutral-800 bg-bg-floating"
      : "bg-bg-weak";
  }
  return variant === "outline"
    ? "border border-neutral-1000-a10 bg-bg-floating"
    : "bg-bg-weak";
}

const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  (
    {
      className,
      disabled,
      endSlot,
      errorText,
      helperText,
      label,
      prefix,
      rounded = false,
      size = "medium",
      startSlot,
      status = "default",
      suffix,
      variant = "outline",
      ...props
    },
    ref
  ) => {
    const resolvedStatus = disabled ? "disabled" : status;
    const describedBy =
      errorText && resolvedStatus === "error"
        ? `${props.id}-error`
        : helperText
          ? `${props.id}-helper`
          : undefined;

    return (
      <div className={cn("flex w-full flex-col gap-1", className)}>
        {label && variant !== "headless" ? (
          <label
            htmlFor={props.id}
            className="text-[14px] font-medium leading-[22px] text-neutral-primary"
          >
            {label}
          </label>
        ) : null}
        <div
          className={cn(
            "flex w-full items-center gap-1 px-1 transition-[background-color,border-color]",
            fieldSizeClassNames[size],
            rounded ? "rounded-full" : "rounded-md",
            getFieldVariantClassName(variant, resolvedStatus)
          )}
        >
          {startSlot}
          {prefix ? (
            <span className="px-1 text-neutral-muted">{prefix}</span>
          ) : null}
          <input
            ref={ref}
            disabled={resolvedStatus === "disabled"}
            aria-invalid={resolvedStatus === "error" || undefined}
            className="min-w-0 flex-1 bg-transparent px-2 font-normal text-neutral-primary outline-none placeholder:text-neutral-muted disabled:cursor-not-allowed disabled:text-neutral-disabled disabled:placeholder:text-neutral-placeholder"
            {...props}
          />
          {suffix ? (
            <span className="px-1 text-neutral-muted">{suffix}</span>
          ) : null}
          {endSlot}
        </div>
        {resolvedStatus === "error" && errorText ? (
          <p
            id={props.id ? `${props.id}-error` : undefined}
            className="text-[12px] leading-4 text-critical"
          >
            {errorText}
          </p>
        ) : helperText ? (
          <p
            id={props.id ? `${props.id}-helper` : undefined}
            className="text-[12px] leading-4 text-neutral-muted"
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);
TextField.displayName = "TextField";

export { Input, TextField };
