import * as React from "react";

import { cn } from "@/lib/utils";
import { Text, type TextProps } from "./typography";

const SectionHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-2", className)} {...props} />
));
SectionHeader.displayName = "SectionHeader";

type SectionTitleProps = Omit<TextProps, "type"> & {
  type?: Extract<TextProps["type"], "head1" | "head2" | "title">;
};

const SectionTitle = React.forwardRef<HTMLElement, SectionTitleProps>(
  ({ as = "h2", type = "title", ...props }, ref) => (
    <Text ref={ref} as={as} type={type} {...props} />
  )
);
SectionTitle.displayName = "SectionTitle";

type SectionDescriptionProps = Omit<TextProps, "type"> & {
  type?: Extract<TextProps["type"], "desc" | "subtle" | "caption">;
};

const SectionDescription = React.forwardRef<
  HTMLElement,
  SectionDescriptionProps
>(({ type = "desc", className, ...props }, ref) => (
  <Text
    ref={ref}
    type={type}
    className={cn("max-w-2xl", className)}
    {...props}
  />
));
SectionDescription.displayName = "SectionDescription";

export { SectionDescription, SectionHeader, SectionTitle };
