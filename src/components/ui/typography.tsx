import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const textVariants = cva("tracking-normal text-black", {
  variants: {
    type: {
      head1: "text-2xl font-medium leading-tight text-balance",
      head2: "text-lg font-medium leading-snug text-balance",
      title: "text-base font-normal leading-5",
      label: "text-sm font-normal leading-5",
      body: "text-sm font-normal leading-5",
      desc: "text-sm font-normal leading-5 text-black/80",
      subtle: "text-xs font-normal leading-4 text-black/55",
      caption: "text-xs font-normal leading-4 text-black/70",
      eyebrow:
        "text-xs font-medium uppercase leading-4 tracking-[0.08em] text-black/55",
      metric: "text-3xl font-medium leading-none sm:text-4xl",
    },
  },
  defaultVariants: {
    type: "body",
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
}

const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ as = "p", asChild = false, type, className, ...props }, ref) => {
    const Comp = (asChild ? Slot : as) as React.ElementType;

    return (
      <Comp
        ref={ref}
        className={cn(textVariants({ type, className }))}
        {...props}
      />
    );
  }
);
Text.displayName = "Text";

export { Text, textVariants };
