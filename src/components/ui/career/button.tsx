"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";
import {
  careerDisabledClassName,
  careerToneClassNames,
  type CareerStatus,
  type CareerTone,
} from "./tokens";

export type CareerButtonVariant = "solid" | "faded" | "ghost" | "outline";
export type CareerButtonSize = "small" | "medium" | "large" | "xlarge";

export interface CareerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  color?: CareerTone;
  endIcon?: React.ReactNode;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  rounded?: boolean;
  showText?: boolean;
  size?: CareerButtonSize;
  status?: CareerStatus;
  variant?: CareerButtonVariant;
}

const buttonSizeClassNames: Record<CareerButtonSize, string> = {
  small: "h-[30px] text-[14px] leading-[22px]",
  medium: "h-9 text-[14px] leading-[22px]",
  large: "h-12 text-[16px] leading-6",
  xlarge: "h-14 text-[16px] leading-6",
};

const buttonIconSizeClassNames: Record<CareerButtonSize, string> = {
  small: "[&_svg]:size-4",
  medium: "[&_svg]:size-4",
  large: "[&_svg]:size-5",
  xlarge: "[&_svg]:size-6",
};

function getButtonPaddingClassName(
  size: CareerButtonSize,
  variant: CareerButtonVariant
) {
  if (size === "xlarge") return "gap-3 px-5 py-1";
  if (size === "large") return "gap-2 px-3 py-1";
  if (variant === "ghost") return "gap-2 px-2 py-1";
  if (size === "small") return "gap-1 px-2 py-1";
  return "gap-2 px-3 py-1";
}

function CareerLoadingDots() {
  return (
    <span
      aria-hidden
      className="inline-flex size-4 items-center justify-between"
    >
      <span className="size-1 rounded-full bg-current opacity-40" />
      <span className="size-1 rounded-full bg-current opacity-70" />
      <span className="size-1 rounded-full bg-current" />
    </span>
  );
}

const CareerButton = React.forwardRef<HTMLButtonElement, CareerButtonProps>(
  (
    {
      asChild = false,
      children,
      className,
      color = "neutral",
      disabled,
      endIcon,
      fullWidth = false,
      icon,
      rounded = false,
      showText = true,
      size = "medium",
      status = "default",
      type = "button",
      variant = "solid",
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || status === "disabled";
    const isLoading = status === "loading";

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        aria-busy={isLoading || undefined}
        disabled={asChild ? undefined : isDisabled}
        className={cn(
          "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium outline-none transition-[background-color,border-color,box-shadow,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-[#753B17]/25 disabled:pointer-events-none",
          rounded
            ? "rounded-full"
            : size === "large" || size === "xlarge"
              ? "rounded-lg"
              : "rounded-md",
          fullWidth && "w-full",
          buttonSizeClassNames[size],
          buttonIconSizeClassNames[size],
          getButtonPaddingClassName(size, variant),
          isDisabled
            ? careerDisabledClassName
            : careerToneClassNames[color][variant],
          !isDisabled &&
            variant !== "solid" &&
            "hover:bg-[#F3F1EE] active:bg-[#ECE9E5]",
          !isDisabled && variant === "solid" && "hover:brightness-[0.97]",
          className
        )}
        {...props}
      >
        {isLoading ? <CareerLoadingDots /> : icon}
        {showText && children ? <span>{children}</span> : null}
        {!isLoading ? endIcon : null}
      </Comp>
    );
  }
);

CareerButton.displayName = "CareerButton";

export interface CareerIconButtonProps extends Omit<
  CareerButtonProps,
  "children" | "endIcon" | "showText"
> {
  "aria-label": string;
}

const iconButtonSizeClassNames: Record<CareerButtonSize, string> = {
  small: "size-[30px] p-1",
  medium: "size-9 p-2",
  large: "size-12 p-3",
  xlarge: "size-14 p-4",
};

const CareerIconButton = React.forwardRef<
  HTMLButtonElement,
  CareerIconButtonProps
>(({ className, icon, size = "medium", ...props }, ref) => (
  <CareerButton
    ref={ref}
    className={cn(iconButtonSizeClassNames[size], className)}
    icon={icon}
    size={size}
    showText={false}
    {...props}
  />
));

CareerIconButton.displayName = "CareerIconButton";

export { CareerButton, CareerIconButton };
