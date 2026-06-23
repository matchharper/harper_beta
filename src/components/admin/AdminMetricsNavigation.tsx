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
    <header className="sticky top-0 z-10 border-b border-black/10 bg-white/90 backdrop-blur">
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
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white text-black hover:border-black/25 hover:bg-black/[0.03]"
                    )}
                  >
                    <div className="text-[13px] font-semibold">
                      {section.label}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-[11px]",
                        isActive ? "text-white/60" : "text-black/45"
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
              <div className="mt-1 text-[12px] leading-5 text-black/50">
                {subtitle}
              </div>
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
                  ? "border-black bg-black text-white"
                  : "border-black/15 bg-white text-black hover:border-black/30 hover:bg-black/[0.03]"
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
