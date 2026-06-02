"use client";

import CareerAttentionBadge from "./ui/CareerAttentionBadge";
import { careerCx } from "./ui/CareerPrimitives";
import { useHideOnScroll } from "@/hooks/useHideOnScroll";
import { useIsMobile } from "@/hooks/useMediaQuery";

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
      className="inline-flex min-w-max items-center gap-1 rounded-full border border-beige500/50 bg-beige500/70 p-[3px]"
    >
      {items.map((item) => {
        const active = item.id === activeId;
        const showCount = !isMobile && typeof item.count === "number";
        const showAttention = Boolean(item.attention);
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={careerCx(
              "relative inline-flex h-7 items-center overflow-visible rounded-full text-[13px] font-medium transition-all md:h-7 md:text-[13px]",
              showAttention ? "pl-3.5 pr-5 md:pl-3.5 md:pr-5" : "px-3.5",
              active
                ? "bg-white text-beige900 shadow-[0_1px_2px_rgba(46,23,6,0.08)]"
                : "text-beige900/60 hover:bg-beige100/70 hover:text-beige900"
            )}
          >
            <span className="flex items-center gap-2">
              <span>{item.label}</span>
              {showCount && (
                <span
                  className={careerCx(
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                    active
                      ? "bg-beige700 text-beige50"
                      : "bg-beige900/10 text-beige900/55"
                  )}
                >
                  {item.count}
                </span>
              )}
            </span>
            {showAttention ? (
              <CareerAttentionBadge
                label={item.attentionLabel ?? "확인이 필요합니다"}
                className="right-[-2px] top-[-2px] h-3.5 w-3.5"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );

  if (mobileFloating) {
    return (
      <div className={careerCx("relative", className)}>
        <div className="fixed top-12 z-20 h-0 overflow-visible md:static md:h-auto md:overflow-x-auto w-full">
          <div
            className={careerCx(
              "pointer-events-none w-full flex justify-center px-3 py-2 transition-all duration-300 ease-out will-change-transform md:pointer-events-auto md:block md:translate-y-0 md:px-0 md:py-0 md:opacity-100",
              visible
                ? "translate-y-0 opacity-100"
                : "-translate-y-14 opacity-0"
            )}
          >
            <div className="pointer-events-auto bg-beige50 max-w-[calc(100vw-24px)] overflow-x-auto rounded-full shadow-[0_10px_30px_rgba(46,23,6,0.12)] md:max-w-none md:shadow-none">
              {tabList}
            </div>
          </div>
        </div>
        <div className="h-14 md:hidden" aria-hidden />
      </div>
    );
  }

  return (
    <div className={careerCx("overflow-x-auto", className)}>{tabList}</div>
  );
};

export default CareerInPageTabs;
