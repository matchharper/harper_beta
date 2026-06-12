"use client";

import { forwardRef, type ElementType, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pageContainerVariants = cva("mx-auto w-full", {
  variants: {
    size: {
      narrow: "max-w-[720px]",
      default: "max-w-[1260px]",
      wide: "max-w-[1440px]",
      full: "max-w-none",
    },
    padding: {
      none: "",
      tight: "px-4 md:px-6",
      default: "px-4 md:px-6 lg:px-8",
      loose: "px-4 md:px-8 lg:px-12",
    },
    safeArea: {
      none: "",
      x: "pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)]",
      top: "pt-[env(safe-area-inset-top)]",
      bottom: "pb-[env(safe-area-inset-bottom)]",
      y: "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
      all: "pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
    },
  },
  defaultVariants: {
    size: "default",
    padding: "default",
    safeArea: "none",
  },
});

type PageContainerOwnProps = VariantProps<typeof pageContainerVariants> & {
  as?: ElementType;
};

export type PageContainerProps = PageContainerOwnProps &
  Omit<HTMLAttributes<HTMLElement>, keyof PageContainerOwnProps>;

export const PageContainer = forwardRef<HTMLElement, PageContainerProps>(
  function PageContainer(
    {
      as: Component = "div",
      size,
      padding,
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
          pageContainerVariants({ size, padding, safeArea }),
          className
        )}
        {...rest}
      >
        {children}
      </Component>
    );
  }
);

export { pageContainerVariants };
