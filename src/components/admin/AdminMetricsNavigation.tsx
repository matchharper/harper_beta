import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AdminMetricsSection = "search" | "career";

export type AdminMetricsNavTab = {
  href: string;
  label: string;
  active: boolean;
};

type AdminMetricsNavigationProps = {
  activeSection: AdminMetricsSection;
  tabs: AdminMetricsNavTab[];
  title: string;
  subtitle: string;
  actions?: ReactNode;
};

const sectionTabs: Array<{
  href: string;
  key: AdminMetricsSection;
  label: string;
  subtitle: string;
}> = [
  {
    href: "/admin?section=search&tab=metrics",
    key: "search",
    label: "Search Metrics",
    subtitle: "search 제품 지표",
  },
  {
    href: "/admin/career?tab=overview",
    key: "career",
    label: "Career Metrics",
    subtitle: "career 퍼널 지표",
  },
];

export default function AdminMetricsNavigation({
  activeSection,
  actions,
  subtitle,
  tabs,
  title,
}: AdminMetricsNavigationProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-stroke bg-bg-floating/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="grid gap-2 sm:grid-cols-2">
              {sectionTabs.map((section) => {
                const isActive = activeSection === section.key;

                return (
                  <Link
                    key={section.key}
                    href={section.href}
                    className={cn(
                      "block min-w-[190px] border px-4 py-3 transition",
                      isActive
                        ? "border-stroke-strong bg-surface-inverse text-on-inverse"
                        : "border-stroke bg-bg-floating text-neutral-primary hover:border-stroke-strong/25 hover:bg-surface-inverse/[0.03]"
                    )}
                  >
                    <div className="text-[13px] font-semibold">
                      {section.label}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-[11px]",
                        isActive ? "text-on-inverse/60" : "text-neutral-primary/45"
                      )}
                    >
                      {section.subtitle}
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="mt-4">
              <div className="text-[15px] font-semibold tracking-tight">
                {title}
              </div>
              {subtitle ? (
                <div className="mt-1 text-[12px] leading-5 text-neutral-primary/50">
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>

          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>

        <nav className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "inline-flex h-8 items-center border px-3 text-[12px] font-medium transition",
                tab.active
                  ? "border-stroke-strong bg-surface-inverse text-on-inverse"
                  : "border-stroke-strong/15 bg-bg-floating text-neutral-primary hover:border-stroke-strong/30 hover:bg-surface-inverse/[0.03]"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
