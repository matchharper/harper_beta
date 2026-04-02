type ClassValue = string | false | null | undefined;

export const cx = (...values: ClassValue[]) => values.filter(Boolean).join(" ");

export const opsTheme = {
  backgroundGlow:
    "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.6),transparent_42%)]",
  badge:
    "inline-flex items-center rounded-md bg-beige500/80 px-2.5 py-1 font-geist text-[12px] font-medium tracking-[-0.02em] text-beige900",
  badgeStrong:
    "inline-flex items-center rounded-md bg-beige900 px-2.5 py-1 font-geist text-[12px] font-medium tracking-[-0.02em] text-beige100",
  badgeInverse:
    "inline-flex items-center rounded-md bg-white/10 px-2.5 py-1 font-geist text-[12px] font-medium tracking-[-0.02em] text-beige100",
  buttonPrimary:
    "inline-flex items-center justify-center gap-2 rounded-md bg-beige900 px-4 font-geist text-sm font-medium text-beige100 transition hover:bg-beige900/90 disabled:cursor-not-allowed disabled:opacity-50",
  buttonSecondary:
    "inline-flex items-center justify-center gap-2 rounded-md bg-beige500/70 px-4 font-geist text-sm font-medium text-beige900 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:bg-beige500/90 disabled:cursor-not-allowed disabled:opacity-50",
  buttonSoft:
    "inline-flex items-center justify-center gap-2 rounded-md bg-beige900 px-4 font-geist text-sm font-medium text-beige100 transition hover:bg-beige900/90 disabled:cursor-not-allowed disabled:opacity-50",
  copy: "font-geist text-sm leading-6 text-beige900/65",
  divider: "divide-beige900/10",
  errorNotice:
    "rounded-md bg-[#F7DBD3] px-4 py-3 font-geist text-sm text-[#8A2E1D] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  eyebrow:
    "font-geist text-[11px] font-medium tracking-[0.14em] text-beige900/45",
  input:
    "h-11 w-full rounded-md border border-beige900/10 bg-white/80 px-3 font-geist text-sm text-beige900 outline-none transition placeholder:text-beige900/35 focus:border-beige900/25 focus:bg-white",
  label: "font-geist text-sm font-medium text-beige900/80",
  link: "text-beige900 underline decoration-beige900/20 underline-offset-4 transition hover:decoration-beige900/50",
  page: "relative min-h-screen overflow-hidden bg-beige200 text-beige900",
  panel: "rounded-lg bg-beige100/90 backdrop-blur-sm",
  panelMuted:
    "rounded-md bg-beige500/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
  panelSoft:
    "rounded-md bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
  successNotice:
    "rounded-md bg-[#E4EDE2] px-4 py-3 font-geist text-sm text-[#29513A] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  textarea:
    "w-full rounded-lg border border-beige900/10 bg-white/80 px-4 py-4 font-geist text-sm leading-6 text-beige900 outline-none transition placeholder:text-beige900/35 focus:border-beige900/25 focus:bg-white",
  title:
    "font-halant text-[2.55rem] leading-[0.92] tracking-[-0.08em] text-beige900",
  titleSm:
    "font-halant text-[1.6rem] leading-[0.96] tracking-[-0.07em] text-beige900",
} as const;
