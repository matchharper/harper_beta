"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pieces the one screen's sections share: labels, error lines, marks. */

export const ONE_SCREEN_INPUT_CLASS = "h-11 text-base lg:text-sm";
export const ONE_SCREEN_CIRCLED = ["①", "②", "③"] as const;

/**
 * "N개 중 M개 완료" at the top of a box: a bar and one line per step, ticked when done.
 * Inside its box in the other tone, so it reads as a box within the box.
 */
export function OneScreenProgressBox({
  id,
  layout,
  title,
  rows,
}: {
  id: string;
  layout: "card" | "page";
  title: (done: number) => string;
  rows: ReadonlyArray<{ label: string; done: boolean }>;
}) {
  const done = rows.filter((row) => row.done).length;
  const percent = rows.length ? Math.round((done / rows.length) * 100) : 0;
  return (
    <div
      className={cn(
        "rounded-md border border-beige900/10 p-4",
        layout === "page" ? "bg-beige50/65" : "bg-bg-floating/80"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p id={id} className="text-[13px] font-medium leading-5 text-neutral-primary">
          {title(done)}
        </p>
        <span className="text-[13px] tabular-nums text-neutral-primary/50" aria-hidden="true">
          {percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={rows.length}
        aria-valuenow={done}
        className="mt-3 h-1 overflow-hidden rounded-full bg-beige900/10"
      >
        <div
          className="h-full rounded-full bg-neutral-primary transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <li key={row.label} className="flex items-center gap-2.5 text-[13px] leading-5">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                row.done
                  ? "border-neutral-primary bg-neutral-primary text-neutral-00"
                  : "border-beige900/15"
              )}
            >
              {row.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
            </span>
            <span className={row.done ? "text-neutral-primary" : "text-neutral-primary/45"}>
              {ONE_SCREEN_CIRCLED[index]} {row.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OneScreenFieldLabel({
  htmlFor,
  id,
  children,
  className,
}: {
  htmlFor?: string;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  const labelClassName = cn(
    "mb-2 block text-[13px] font-medium leading-5 text-neutral-primary",
    className
  );
  return htmlFor ? (
    <label htmlFor={htmlFor} id={id} className={labelClassName}>
      {children}
    </label>
  ) : (
    <p id={id} className={labelClassName}>
      {children}
    </p>
  );
}

/** "또는" between two ways to do the same step, or two different next steps. */
export function OneScreenOrDivider({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 text-[12px] text-neutral-primary/45",
        className
      )}
      aria-hidden="true"
    >
      <span className="h-px flex-1 bg-beige900/10" />
      {label}
      <span className="h-px flex-1 bg-beige900/10" />
    </div>
  );
}

/** Always rendered so screen readers hear the message when it appears. */
export function OneScreenFieldError({
  id,
  message,
  className,
}: {
  id: string;
  message?: string | null;
  className?: string;
}) {
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn(
        "text-[12px] leading-5 text-critical",
        message ? "mt-1.5" : "",
        className
      )}
    >
      {message || ""}
    </p>
  );
}

export function GoogleMark() {
  return (
    <Image
      src="/images/logos/google.png"
      alt=""
      width={16}
      height={16}
      aria-hidden="true"
      className="h-4 w-4"
    />
  );
}

export function LinkedInMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("h-5 w-5", className)}
      fill="currentColor"
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
