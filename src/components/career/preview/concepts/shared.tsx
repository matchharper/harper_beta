// career-i18n-skip-file: Local design preview.
import type { ComponentProps, KeyboardEvent } from "react";
import { BareButton } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import s from "./Concepts.module.css";
export type Practice = { question: string; answer: string; id: string };
export type ChatContext = { label: string; prompt: string; items?: string[] };
export type Context = {
  ask: (context: ChatContext) => void;
  practice: (question: string) => void;
  activeQuestion?: string;
  records: Practice[];
};

export function Quiet({
  children,
  label,
  className = "",
  ...props
}: ComponentProps<typeof BareButton> & { label?: string }) {
  return (
    <BareButton
      aria-label={label}
      className={`${s.quiet} ${className}`}
      type="button"
      {...props}
    >
      {children}
    </BareButton>
  );
}

export function navigateTabs(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]:not([disabled])'
    ),
  ];
  const current = tabs.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  event.preventDefault();
  tabs[index]?.focus();
  tabs[index]?.click();
}
export function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label} size="sm" className="w-auto min-w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Reading({ text }: { text: string }) {
  return (
    <Typography className="whitespace-pre-wrap leading-7 [overflow-wrap:anywhere]">
      {text}
    </Typography>
  );
}
