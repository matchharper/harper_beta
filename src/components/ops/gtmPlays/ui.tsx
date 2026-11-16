import React from "react";
import { Info, LoaderCircle } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import { Tooltips } from "@/components/ui/tooltip";

export function Panel({ title, actions, children, className, id }: {
  title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string;
  /** A step's anchor (StepBar scrolls here). */
  id?: string;
}) {
  return (
    <section id={id} className={cx(opsTheme.panel, "scroll-mt-16 p-5 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-[15px] font-semibold tracking-[-0.02em]">{title}</h2> : <span />}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ variant = "secondary", loading, children, className, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary"; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={cx(variant === "primary" ? opsTheme.buttonPrimary : opsTheme.buttonSecondary, "h-9", className)}
    >
      {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ErrorNotice({ message }: { message: string | null | undefined }) {
  return message ? <p className={cx(opsTheme.errorNotice, "mt-3")} role="alert">{message}</p> : null;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[12px] text-neutral-muted">{children}</span>;
}

export function Badge({ children, tone = "default", title }: {
  children: React.ReactNode; tone?: "default" | "strong" | "positive" | "critical"; title?: string;
}) {
  const toneClass = tone === "strong" ? opsTheme.badgeStrong
    : tone === "positive" ? "inline-flex items-center rounded-md bg-positive-faded px-2.5 py-1 text-[12px] font-medium text-positive"
    : tone === "critical" ? "inline-flex items-center rounded-md bg-critical-faded px-2.5 py-1 text-[12px] font-medium text-critical"
    : opsTheme.badge;
  return <span className={toneClass} title={title}>{children}</span>;
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={cx(opsTheme.panelMuted, "px-3 py-2")}>
      <div className="text-[12px] text-neutral-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}


export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(opsTheme.input, "h-9", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(opsTheme.textarea, "px-3 py-2", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(opsTheme.input, "h-9 pr-8", props.className)} />;
}

/** ⓘ with a tooltip: what a number means, why it is there, and what to decide from it. */
export function Hint({ label, text }: { label: string; text: string }) {
  return (
    <Tooltips side="top" text={text}>
      <MuteButton aria-label={`${label} 설명`} className="-my-1" size="sm" variant="transparent">
        <Info className="h-3 w-3" aria-hidden />
      </MuteButton>
    </Tooltips>
  );
}

/**
 * A mail exactly as it will be sent, for looking at only: its buttons are not followed here (in the preview
 * they would open a sample link). The note under it says so.
 */
export function MailPreviewFrame({ title, html, className }: { title: string; html: string; className?: string }) {
  const doc = `<style>a{pointer-events:none;cursor:default}</style>${html}`;
  return (
    <>
      <iframe title={title} sandbox="" srcDoc={doc} className={className} />
      <p className="border-t border-neutral-1000-a05 px-3 py-1.5 text-[12px] text-neutral-muted">
        미리보기의 버튼은 눌리지 않아요. 실제 메일에서는 받는 사람마다 자기 링크로 열려요.
      </p>
    </>
  );
}

/** Where a play's step lives on the page (StepBar scrolls to it). */
export const stepAnchor = (id: string) => `gtm-step-${id}`;

export function scrollToStep(id: string) {
  document.getElementById(stepAnchor(id))?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export type FlowStep = {
  id: string;
  label: string;
  done: boolean;
  /** Reachable now (the steps before it are done enough to show it). */
  available: boolean;
};

/**
 * A play's steps in order, at the top of the tab: done ones are checked, the first one not done is "now".
 * Pressing a step scrolls to its section.
 */
export function StepBar({ steps }: { steps: FlowStep[] }) {
  const current = steps.find((step) => !step.done && step.available)?.id ?? null;
  return (
    <nav aria-label="단계" className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-1 bg-bg-default/95 px-1 py-2 backdrop-blur-sm">
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          {index ? <span className="h-px w-4 bg-neutral-1000-a10" aria-hidden /> : null}
          <button
            type="button"
            disabled={!step.available}
            aria-current={step.id === current ? "step" : undefined}
            onClick={() => scrollToStep(step.id)}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors",
              step.id === current ? "bg-surface-inverse text-neutral-00"
                : step.done ? "bg-positive-faded text-positive hover:opacity-80"
                  : "bg-bg-weak text-neutral-muted",
              step.available ? "cursor-pointer" : "cursor-default opacity-50",
            )}
          >
            <span className="tabular-nums">{step.done ? "✓" : index + 1}</span>
            {step.label}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

/** A step's section title: its number, what it is, and what to do there in a few words. */
export function StepTitle({ n, label, hint }: { n: number; label: React.ReactNode; hint?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-inverse text-[11px] tabular-nums text-neutral-00">{n}</span>
      <span>{label}</span>
      {hint ? <span className="text-[12px] font-normal text-neutral-muted">{hint}</span> : null}
    </span>
  );
}

/** The bar that stays at the bottom of the screen: what is chosen so far and the next thing to press. */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-3 z-20">
      <div className={cx(opsTheme.panel, "flex flex-wrap items-center justify-between gap-3 border border-neutral-1000-a10 px-4 py-3 shadow-lg")}>
        {children}
      </div>
    </div>
  );
}
