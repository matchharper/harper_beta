"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type CareerTextFieldVariant = "outline" | "faded" | "headless";
export type CareerTextFieldStatus =
  | "default"
  | "error"
  | "disabled"
  | "focused";
export type CareerTextFieldSize = "small" | "medium" | "large" | "xlarge";

export interface CareerTextFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size" | "prefix"
> {
  endSlot?: React.ReactNode;
  errorText?: React.ReactNode;
  helperText?: React.ReactNode;
  label?: React.ReactNode;
  prefix?: React.ReactNode;
  rounded?: boolean;
  size?: CareerTextFieldSize;
  startSlot?: React.ReactNode;
  status?: CareerTextFieldStatus;
  suffix?: React.ReactNode;
  variant?: CareerTextFieldVariant;
}

const fieldSizeClassNames: Record<CareerTextFieldSize, string> = {
  small: "h-8 text-[13px] leading-5",
  medium: "h-[38px] text-[14px] leading-[22px]",
  large: "h-11 text-[16px] leading-6",
  xlarge: "h-12 text-[16px] leading-6",
};

function getFieldVariantClassName(
  variant: CareerTextFieldVariant,
  status: CareerTextFieldStatus
) {
  if (variant === "headless") return "bg-transparent";
  if (status === "disabled") {
    return variant === "outline"
      ? "border border-[#F3F1EE] bg-[#F8F7F5]"
      : "bg-[#F8F7F5]";
  }
  if (status === "error") {
    return variant === "outline"
      ? "border border-[#9B2E1E33] bg-white"
      : "border border-[#9B2E1E33] bg-[#F8F7F5]";
  }
  if (status === "focused") {
    return variant === "outline"
      ? "border border-[#753B1766] bg-white shadow-[0_0_0_3px_rgba(117,59,23,0.08)]"
      : "bg-[#F8F7F5] shadow-[0_0_0_3px_rgba(117,59,23,0.08)]";
  }
  return variant === "outline"
    ? "border border-[#1F1C1A1A] bg-white"
    : "bg-[#F8F7F5]";
}

const CareerTextField = React.forwardRef<
  HTMLInputElement,
  CareerTextFieldProps
>(
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
            className="text-[14px] font-medium leading-[22px] text-[#1F1C1A]"
          >
            {label}
          </label>
        ) : null}
        <div
          className={cn(
            "flex w-full items-center gap-1 px-1 transition-[background-color,border-color,box-shadow]",
            fieldSizeClassNames[size],
            rounded ? "rounded-full" : "rounded-md",
            getFieldVariantClassName(variant, resolvedStatus)
          )}
        >
          {startSlot}
          {prefix ? (
            <span className="px-1 text-[#827B75]">{prefix}</span>
          ) : null}
          <input
            ref={ref}
            disabled={resolvedStatus === "disabled"}
            aria-invalid={resolvedStatus === "error" || undefined}
            aria-describedby={describedBy}
            className={cn(
              "min-w-0 flex-1 bg-transparent px-2 font-normal text-[#1F1C1A] outline-none placeholder:text-[#827B75] disabled:cursor-not-allowed disabled:text-[#CEC8C1] disabled:placeholder:text-[#CEC8C1]"
            )}
            {...props}
          />
          {suffix ? (
            <span className="px-1 text-[#827B75]">{suffix}</span>
          ) : null}
          {endSlot}
        </div>
        {resolvedStatus === "error" && errorText ? (
          <p
            id={props.id ? `${props.id}-error` : undefined}
            className="text-[12px] leading-4 text-[#9B2E1E]"
          >
            {errorText}
          </p>
        ) : helperText ? (
          <p
            id={props.id ? `${props.id}-helper` : undefined}
            className="text-[12px] leading-4 text-[#827B75]"
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

CareerTextField.displayName = "CareerTextField";

export { CareerTextField };
