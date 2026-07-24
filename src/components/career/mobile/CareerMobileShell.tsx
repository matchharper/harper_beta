"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useHtmlClass } from "@/hooks/useHtmlClass";
import { useHideOnScroll } from "@/hooks/useHideOnScroll";

const MOBILE_SCROLL_CONTAINER_ID = "career-mobile-scroll";

type CareerMobileShellProps = {
  header: React.ReactNode;
  bottom?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export default function CareerMobileShell({
  header,
  bottom,
  children,
  className,
  contentClassName,
}: CareerMobileShellProps) {
  useHtmlClass("noneoverscroll");
  const headerVisible = useHideOnScroll({
    scrollContainerId: MOBILE_SCROLL_CONTAINER_ID,
    threshold: 4,
    topRevealThreshold: 16,
  });

  return (
    <div
      className={cn(
        "relative flex h-svh w-full flex-col overflow-hidden bg-bg-basement text-neutral-primary",
        className
      )}
    >
      <div
        aria-hidden={!headerVisible}
        inert={!headerVisible}
        className={cn(
          "z-30 grid shrink-0 transition-[grid-template-rows] ease-out motion-reduce:transition-none",
          headerVisible
            ? "grid-rows-[1fr] duration-150"
            : "grid-rows-[0fr] duration-300"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              "transition-transform ease-out will-change-transform motion-reduce:transition-none",
              headerVisible
                ? "translate-y-0 duration-150"
                : "-translate-y-full duration-300"
            )}
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            {header}
          </div>
        </div>
      </div>

      <main
        id={MOBILE_SCROLL_CONTAINER_ID}
        className={cn(
          "relative min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth bg-bg-basement",
          contentClassName
        )}
      >
        {children}
      </main>

      {bottom ? (
        <div
          className="z-30 shrink-0 border-t border-neutral-1000-a05 bg-bg-floating"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {bottom}
        </div>
      ) : null}
    </div>
  );
}
