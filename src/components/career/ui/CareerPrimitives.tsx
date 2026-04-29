import { type ClassValue } from "clsx";
import { cn } from "@/lib/utils";
import React from "react";

export function careerCx(...values: ClassValue[]) {
  return cn(...values);
}

export const careerSurfaceClassName = "";

export const careerInlinePanelClassName = "";

export const careerInputClassName =
  "h-[36px] w-full rounded-[8px] border border-beige900/15 bg-white/60 px-3 py-2 text-[14px] font-normal leading-5 text-beige900 outline-none transition focus:ring-1 focus:ring-beige900/30 placeholder:text-beige900/30";

export const careerTextareaClassName =
  "w-full rounded-[8px] border border-beige900/15 bg-white/60 px-3 py-2 text-[14px] font-normal leading-6 text-beige900 outline-none transition focus:ring-1 focus:ring-beige900/30 placeholder:text-beige900/30";

export const CareerInlinePanel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={careerCx(
      "rounded-[8px] px-4 py-4",
      careerInlinePanelClassName,
      className
    )}
  >
    {children}
  </div>
);

export const CareerSectionHeader = ({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) => (
  <div
    className={careerCx(
      "flex items-start justify-between gap-4 border-b border-beige900/10 pb-4",
      className
    )}
  >
    <div>
      <h2 className="font-hedvig text-[26px] leading-[1] text-beige900">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 max-w-[640px] text-[14px] leading-6 text-beige900/50">
          {description}
        </p>
      ) : null}
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);

export const CareerFieldLabel = ({
  icon,
  label,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
}) => (
  <div className="flex flex-row items-center gap-2 text-sm text-beige900">
    {icon && <span>{icon}</span>}
    <span>{label}</span>
  </div>
);

export const CareerField = ({
  icon,
  label,
  children,
  hint,
  className,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) => (
  <div
    className={careerCx(
      "flex flex-col items-start justify-start gap-3 pb-8",
      className
    )}
  >
    <div className="pt-1">
      <CareerFieldLabel icon={icon} label={label} />
      {hint ? (
        <div className="mt-1 text-[13px] leading-5 text-beige900/60">
          {hint}
        </div>
      ) : null}
    </div>
    <div className="w-full">{children}</div>
  </div>
);

export const CareerTextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function CareerTextInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={careerCx(careerInputClassName, className)}
    />
  );
});

export const CareerTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function CareerTextarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={careerCx(careerTextareaClassName, "resize-none", className)}
    />
  );
});

export const CareerToggleButton = ({
  active,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) => (
  <button
    type="button"
    {...props}
    className={careerCx(
      "inline-flex min-h-[36px] font-medium items-center rounded-md border px-5 py-3 min-w-[calc(30%-4px)] text-sm leading-5 transition-colors",
      active
        ? "border-beige900 bg-beige200 text-beige900 outline outline-[0.5px] outline-beige900"
        : "border-beige900/15 bg-white/45 text-beige900/70 hover:border-beige900/80 hover:text-beige900",
      className
    )}
  >
    {children}
  </button>
);

export const CareerPrimaryButton = ({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    {...props}
    className={careerCx(
      "inline-flex h-10 items-center justify-center rounded-[8px] border border-beige900 bg-beige900 px-4 text-sm font-medium text-[#f5ecdd] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
  >
    {children}
  </button>
);

export const CareerSecondaryButton = ({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    {...props}
    className={careerCx(
      "inline-flex h-10 items-center justify-center rounded-[8px] border border-beige900/15 bg-white/45 px-4 text-sm text-beige900 transition-colors hover:border-beige900/30",
      className
    )}
  >
    {children}
  </button>
);

export const CareerProgressBar = ({
  value,
  className,
}: {
  value: number;
  className?: string;
}) => {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div
      className={careerCx(
        "h-1.5 overflow-hidden rounded-full border border-beige900/10 bg-white/45",
        className
      )}
    >
      <div
        className="h-full rounded-full bg-beige900 transition-[width] duration-300"
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
};
