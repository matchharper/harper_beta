"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import * as React from "react";
import { cn } from "@/lib/cn";

export type BeigeButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type BeigeButtonSize = "sm" | "md" | "lg" | "icon";

export type BeigeButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  icon?: React.ReactNode;
  label?: React.ReactNode;
  size?: BeigeButtonSize;
  variant?: BeigeButtonVariant;
  animate?: boolean;
};

const beigeButtonVariantClassNames: Record<BeigeButtonVariant, string> = {
  primary: "border border-black bg-black text-neutral-50 font-normal",
  secondary: "bg-neutral-200 text-black hover:bg-neutral-300",
  outline:
    "border border-beige900/15 bg-white/45 text-beige900 hover:border-beige900/30 hover:bg-white/65",
  ghost:
    "border border-transparent bg-transparent text-beige900 hover:bg-beige900/5",
};

function getBeigeButtonSizeClassName(
  size: BeigeButtonSize,
  variant: BeigeButtonVariant
) {
  if (size === "icon") return "h-10 w-10 p-0";
  if (size === "lg") return "h-12 px-6 text-base";

  if (size === "sm") {
    return variant === "secondary"
      ? "h-[42px] px-4 text-[15px]"
      : "h-[44px] px-5 text-[14px]";
  }

  return "h-[44px] px-4 text-base";
}

function getBeigeButtonAnimationRowClassName(size: BeigeButtonSize) {
  if (size === "lg") return "h-12";
  if (size === "icon") return "h-10";
  if (size === "sm") return "h-[44px]";
  return "h-[44px]";
}

const BeigeButtonRoot = React.forwardRef<HTMLButtonElement, BeigeButtonProps>(
  (
    {
      icon,
      label,
      children,
      size = "md",
      variant = "primary",
      type = "button",
      className,
      animate = false,
      disabled,
      ...props
    },
    ref
  ) => {
    const rowHeightClassName = getBeigeButtonAnimationRowClassName(size);
    const content = label ?? children;

    const renderContent = () => (
      <>
        {icon ? (
          <span className="flex shrink-0 items-center">{icon}</span>
        ) : null}
        {content ? <span className="leading-none">{content}</span> : null}
      </>
    );

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={disabled}
        whileHover={disabled ? undefined : { y: -1 }}
        whileTap={disabled ? undefined : { scale: 0.985 }}
        className={cn(
          "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-[8px] font-medium tracking-[-0.03em] outline-none transition-[background-color,border-color,box-shadow,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-beige500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60",
          beigeButtonVariantClassNames[variant],
          getBeigeButtonSizeClassName(size, variant),
          className
        )}
        {...props}
      >
        {variant === "secondary" ? (
          <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        ) : null}
        {animate ? (
          <span className="relative flex h-full items-start overflow-hidden">
            <span
              className="flex flex-col transition-transform duration-500 group-hover:-translate-y-1/2"
              style={{
                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <span
                className={cn(
                  "flex items-center justify-center gap-2",
                  rowHeightClassName
                )}
              >
                {renderContent()}
              </span>
              <span
                className={cn(
                  "flex items-center justify-center gap-2",
                  rowHeightClassName
                )}
              >
                {renderContent()}
              </span>
            </span>
          </span>
        ) : (
          <span className="relative flex items-center justify-center gap-2">
            {renderContent()}
          </span>
        )}
      </motion.button>
    );
  }
);

BeigeButtonRoot.displayName = "BeigeButton";

const BeigeButton = React.memo(BeigeButtonRoot);

export {
  BeigeButton,
  BeigeButtonRoot,
  beigeButtonVariantClassNames,
  getBeigeButtonSizeClassName,
};

export default BeigeButton;
