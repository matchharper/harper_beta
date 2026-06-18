"use client";

import { AttentionBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useHideOnScroll } from "@/hooks/useHideOnScroll";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

export type CareerInPageTabItem<T extends string> = {
  id: T;
  label: string;
  count?: number;
  attention?: boolean;
  attentionLabel?: string;
};

const MOBILE_SCROLL_CONTAINER_ID = "career-mobile-scroll";

const CareerInPageTabs = <T extends string>({
  items,
  activeId,
  onChange,
  className,
  mobileFloating = false,
}: {
  items: CareerInPageTabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  className?: string;
  mobileFloating?: boolean;
}) => {
  const t = useCareerT();
  const isMobile = useIsMobile();
  const floatingEnabled = mobileFloating && isMobile;
  const visible = useHideOnScroll({
    enabled: floatingEnabled,
    scrollContainerId: MOBILE_SCROLL_CONTAINER_ID,
    threshold: 10,
    topRevealThreshold: 24,
  });

  const tabList = (
    <div
      role="tablist"
      className="inline-flex min-w-max items-center gap-1 rounded-full border border-neutral-1000-a05 bg-bg-weak/80 p-[3px]"
    >
      {items.map((item) => {
        const active = item.id === activeId;
        const showCount = !isMobile && typeof item.count === "number";
        const showAttention = Boolean(item.attention);
        return (
          <BareButton
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative inline-flex h-7 items-center overflow-visible rounded-full text-[13px] font-medium transition-all md:h-7 md:text-[13px]",
              showAttention ? "pl-3.5 pr-5 md:pl-3.5 md:pr-5" : "px-3.5",
              active
                ? "bg-bg-floating text-neutral-primary"
                : "text-neutral-muted hover:bg-bg-floating/70 hover:text-neutral-primary"
            )}
          >
            <span className="flex items-center gap-2">
              <span>{item.label}</span>
              {showCount && (
                <span
                  className={cn(
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                    active
                      ? "bg-black text-neutral-00"
                      : "bg-bg-weak text-neutral-muted"
                  )}
                >
                  {item.count}
                </span>
              )}
            </span>
            {showAttention ? (
              <AttentionBadge
                label={
                  item.attentionLabel ??
                  t(
                    "career.common.career_in_page_tabs.1h43miz",
                    "확인이 필요합니다"
                  )
                }
                className="right-[-2px] top-[-2px] h-3.5 w-3.5"
              />
            ) : null}
          </BareButton>
        );
      })}
    </div>
  );

  if (mobileFloating) {
    return (
      <div className={cn("relative", className)}>
        <div className="fixed top-12 z-20 h-0 overflow-visible md:static md:h-auto md:overflow-x-auto w-full">
          <div
            className={cn(
              "pointer-events-none w-full flex justify-center px-3 py-2 transition-all duration-300 ease-out will-change-transform md:pointer-events-auto md:block md:translate-y-0 md:px-0 md:py-0 md:opacity-100",
              visible
                ? "translate-y-0 opacity-100"
                : "-translate-y-14 opacity-0"
            )}
          >
            <div className="pointer-events-auto max-w-[calc(100vw-24px)] overflow-x-auto rounded-full md:max-w-none">
              {tabList}
            </div>
          </div>
        </div>
        <div className="h-14 md:hidden" aria-hidden />
      </div>
    );
  }

  return <div className={cn("overflow-x-auto", className)}>{tabList}</div>;
};

export default CareerInPageTabs;
