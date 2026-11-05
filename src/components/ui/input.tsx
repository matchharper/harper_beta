import * as React from "react";
import { cn } from "@/lib/cn";

export const inputSurfaceClassName =
  "w-full rounded-control border-(length:--control-border-width) border-control-border bg-control bg-control-image text-control-foreground shadow-(--shadow-control) backdrop-blur-control px-3 py-2 text-sm font-control outline-none transition-[border-color,background-color] duration-200 placeholder:text-neutral-placeholder focus:border-stroke-focus focus:bg-control-focus focus:ring-2 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-control-disabled disabled:text-neutral-disabled disabled:placeholder:text-neutral-placeholder disabled:opacity-70";

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
  if (variant === "headless") return "border-0 bg-transparent bg-none shadow-none backdrop-blur-none";
  if (status === "disabled") {
    return variant === "outline"
      ? "border-stroke-subtle bg-control-disabled"
      : "bg-control-disabled";
  }
  if (status === "error") {
    return variant === "outline"
      ? "border-critical/30 bg-control"
      : "border-critical/30 bg-control-faded";
  }
  if (status === "focused") {
    return variant === "outline"
      ? "border-stroke-strong bg-control-focus"
      : "bg-control-faded";
  }
  return variant === "outline"
    ? "border-control-border bg-control"
    : "bg-control-faded";
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
            className="text-[14px] font-label leading-[22px] text-control-foreground"
          >
            {label}
          </label>
        ) : null}
        <div
          className={cn(
            "flex w-full items-center gap-1 border-(length:--control-border-width) border-transparent bg-control-image text-control-foreground shadow-(--shadow-control) backdrop-blur-control px-1 transition-[background-color,border-color]",
            fieldSizeClassNames[size],
            rounded ? "rounded-pill" : "rounded-control",
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
            className="min-w-0 flex-1 bg-transparent px-2 font-control text-control-foreground outline-none placeholder:text-neutral-muted disabled:cursor-not-allowed disabled:text-neutral-disabled disabled:placeholder:text-neutral-placeholder"
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
