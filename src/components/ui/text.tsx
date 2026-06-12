import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const textVariants = cva("tracking-normal", {
  variants: {
    variant: {
      display: "text-3xl font-medium leading-none text-balance sm:text-4xl",
      head1: "text-2xl font-medium leading-tight text-balance",
      head2: "text-lg font-medium leading-snug text-balance",
      title: "text-base font-medium leading-5",
      label: "text-sm font-medium leading-5",
      body: "text-sm font-normal leading-5",
      desc: "text-sm font-normal leading-5",
      subtle: "text-xs font-normal leading-4",
      caption: "text-xs font-normal leading-4",
      eyebrow: "text-xs font-medium uppercase leading-4 tracking-[0.08em]",
      metric: "text-3xl font-medium leading-none sm:text-4xl",
    },
    tone: {
      primary: "text-neutral-primary",
      neutral: "text-neutral-primary",
      muted: "text-neutral-muted",
      caption: "text-neutral-muted",
      subtle: "text-neutral-soft",
      disabled: "text-neutral-disabled",
      inverted: "text-neutral-00",
    },
  },
  defaultVariants: {
    tone: "neutral",
    variant: "body",
  },
});

type TextTag =
  | "p"
  | "span"
  | "div"
  | "li"
  | "label"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6";

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof textVariants> {
  as?: TextTag;
  asChild?: boolean;
  type?: VariantProps<typeof textVariants>["variant"];
}

const Text = React.forwardRef<HTMLElement, TextProps>(
  (
    { as = "p", asChild = false, className, tone, type, variant, ...props },
    ref
  ) => {
    const Comp = (asChild ? Slot : as) as React.ElementType;

    return (
      <Comp
        ref={ref}
        className={cn(
          textVariants({ tone, variant: variant ?? type }),
          className
        )}
        {...props}
      />
    );
  }
);
Text.displayName = "Text";

export { Text, textVariants };
