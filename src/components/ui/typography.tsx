import * as React from "react";
import { Text, type TextProps } from "./text";
import { cn } from "@/lib/utils";

const scales = {
  "display-xl": "text-[48px] leading-[56px] font-medium tracking-[-1.2px] max-sm:text-[32px] max-sm:leading-[40px]",
  "display-lg": "text-[40px] leading-[48px] font-medium tracking-[-0.8px] max-sm:text-[28px] max-sm:leading-[36px]",
  "display-md": "text-[32px] leading-[40px] font-medium tracking-[-0.6px] max-sm:text-[24px] max-sm:leading-[32px]",
  "heading-lg": "text-[28px] leading-[36px] font-medium tracking-[-0.4px] max-sm:text-[24px] max-sm:leading-[32px]",
  "heading-md": "text-[24px] leading-[32px] font-medium tracking-[-0.3px]",
  "heading-sm": "text-[20px] leading-[28px] font-medium tracking-[-0.2px]",
  "title-lg": "text-[18px] leading-[26px] font-medium tracking-[-0.1px]",
  "title-md": "text-[16px] leading-[24px] font-medium tracking-[0px]",
  "title-sm": "text-[15px] leading-[22px] font-medium tracking-[0px]",
  "title-xs": "text-[14px] leading-[20px] font-medium tracking-[0px]",
  "body-lg": "text-[18px] leading-[30px] font-normal tracking-[0px]",
  "body-md": "text-[16px] leading-[26px] font-normal tracking-[0px]",
  "body-sm": "text-[15px] leading-[24px] font-normal tracking-[0px]",
  "body-xs": "text-[14px] leading-[22px] font-normal tracking-[0px]",
  "body-compact": "text-[13px] leading-[20px] font-normal tracking-[0px]",
  "label-lg": "text-[16px] leading-[20px] font-medium tracking-[0px]",
  "label-md": "text-[14px] leading-[20px] font-medium tracking-[0px]",
  "label-sm": "text-[13px] leading-[18px] font-medium tracking-[0px]",
  "label-xs": "text-[12px] leading-[16px] font-medium tracking-[0px]",
  "caption-md": "text-[12px] leading-[18px] font-normal tracking-[0px]",
  "caption-sm": "text-[11px] leading-[16px] font-normal tracking-[0px]",
  "metric-lg": "text-[32px] leading-[40px] font-medium tracking-[-0.6px] tabular-nums",
  "metric-md": "text-[24px] leading-[32px] font-medium tracking-[-0.3px] tabular-nums",
  "code-md": "text-[13px] leading-[20px] font-normal tracking-[0px] font-mono",
} as const;

const tones = {
  ink: "text-neutral-primary",
  secondary: "text-neutral-muted",
  subtle: "text-[#706d69]",
} as const;

export const typographyVariants = {
  ...scales,
  "page-title": cn(scales["heading-lg"], tones.ink),
  "section-title": cn(scales["heading-sm"], tones.ink),
  "title": cn(scales["title-md"], tones.ink),
  "item-title": cn(scales["title-sm"], tones.ink),
  "body": cn(scales["body-xs"], tones.ink),
  "reading": cn(scales["body-md"], tones.ink),
  "description": cn(scales["body-xs"], tones.secondary),
  "label": cn(scales["label-md"], tones.ink),
  "helper": cn(scales["body-compact"], tones.secondary),
  "caption": cn(scales["caption-md"], tones.subtle),
} as const;

export type TypographyVariant = keyof typeof typographyVariants;
export type TypographyProps = Omit<TextProps, "variant" | "type" | "tone"> & {
  variant?: TypographyVariant;
  tone?: keyof typeof tones;
};

// Reuse Text for semantic tags, refs and asChild; caller classes win.
export const Typography = React.forwardRef<HTMLElement, TypographyProps>(
  ({ variant = "body", tone, className, ...props }, ref) => (
    <Text
      ref={ref}
      {...props}
      className={cn(typographyVariants[variant], tone && tones[tone], className)}
    />
  )
);
Typography.displayName = "Typography";

export default Typography;
