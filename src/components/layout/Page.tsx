"use client";

import { forwardRef, type ElementType, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pageVariants = cva("flex w-full flex-col", {
  variants: {
    minHeight: {
      none: "",
      svh: "min-h-svh",
      svhFill: "min-h-svh",
      fillScreen: "h-svh",
    },
    background: {
      none: "",
      beige: "bg-bg-default text-neutral-primary",
      beigeAlt: "bg-bg-basement text-neutral-primary",
      paper: "bg-bg-default text-neutral-primary",
      dark: "bg-neutral-1000 text-neutral-00",
    },
    safeArea: {
      none: "",
      x: "pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
      top: "pt-[env(safe-area-inset-top)]",
      bottom: "pb-[env(safe-area-inset-bottom)]",
      y: "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
      all: "pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
    },
  },
  defaultVariants: {
    minHeight: "svh",
    background: "none",
    safeArea: "none",
  },
});

type PageOwnProps = VariantProps<typeof pageVariants> & {
  as?: ElementType;
};

export type PageProps = PageOwnProps &
  Omit<HTMLAttributes<HTMLElement>, keyof PageOwnProps>;

export const Page = forwardRef<HTMLElement, PageProps>(function Page(
  {
    as: Component = "div",
    minHeight,
    background,
    safeArea,
    className,
    children,
    ...rest
  },
  ref
) {
  return (
    <Component
      ref={ref}
      className={cn(
        pageVariants({ minHeight, background, safeArea }),
        className
      )}
      {...rest}
    >
      {children}
    </Component>
  );
});

export { pageVariants };
