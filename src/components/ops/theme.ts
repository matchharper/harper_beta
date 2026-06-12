type ClassValue = string | false | null | undefined;

export const cx = (...values: ClassValue[]) => values.filter(Boolean).join(" ");

export const opsTheme = {
  backgroundGlow:
    "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--color-neutral-00)_45%,transparent),transparent_42%)]",
  badge:
    "inline-flex items-center rounded-md bg-bg-weak px-2.5 py-1 text-[12px] font-medium tracking-[-0.02em] text-neutral-primary",
  badgeStrong:
    "inline-flex items-center rounded-md bg-black px-2.5 py-1 text-[12px] font-medium tracking-[-0.02em] text-neutral-00",
  badgeInverse:
    "inline-flex items-center rounded-md bg-neutral-00/10 px-2.5 py-1 text-[12px] font-medium tracking-[-0.02em] text-neutral-00",
  buttonPrimary:
    "inline-flex items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-medium text-neutral-00 transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50",
  buttonSecondary:
    "inline-flex items-center justify-center gap-2 rounded-md bg-bg-weak px-4 text-sm font-medium shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-neutral-00)_70%,transparent)] transition hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-50",
  buttonSoft:
    "inline-flex items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-medium text-neutral-00 transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50",
  copy: "text-sm leading-6 text-neutral-muted",
  divider: "divide-neutral-1000-a05",
  errorNotice:
    "rounded-md bg-critical-faded px-4 py-3 text-sm text-critical shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-neutral-00)_55%,transparent)]",
  eyebrow: "text-[11px] font-medium text-neutral-soft",
  input:
    "h-11 w-full rounded-md border border-neutral-1000-a05 bg-bg-default/80 px-3 text-sm text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-1000-a10 focus:bg-bg-default",
  label: "text-sm font-medium text-neutral-primary",
  link: "text-neutral-primary underline decoration-neutral-1000-a10 underline-offset-4 transition hover:decoration-neutral-800",
  page: "relative min-h-screen overflow-hidden bg-bg-basement text-neutral-primary",
  panel: "rounded-lg bg-bg-default/90 backdrop-blur-sm",
  panelMuted:
    "rounded-md bg-bg-weak shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-neutral-00)_75%,transparent)]",
  panelSoft:
    "rounded-md bg-bg-default/70 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-neutral-00)_75%,transparent)]",
  successNotice:
    "rounded-md bg-positive-faded px-4 py-3 text-sm text-positive shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-neutral-00)_55%,transparent)]",
  textarea:
    "w-full rounded-lg border border-neutral-1000-a05 bg-bg-default/80 px-4 py-4 text-sm leading-6 text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-1000-a10 focus:bg-bg-default",
  title:
    "font-hedvig text-[2.55rem] leading-[0.92] tracking-[-0.08em] text-neutral-primary",
  titleSm:
    "font-hedvig text-[1.6rem] leading-[0.96] tracking-[-0.07em] text-neutral-primary",
} as const;
