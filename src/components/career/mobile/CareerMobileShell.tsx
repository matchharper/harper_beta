"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useHtmlClass } from "@/hooks/useHtmlClass";

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
  return (
    <div
      className={cn(
        "relative flex h-svh w-full flex-col overflow-hidden bg-beige50 font-geist text-beige900",
        className
      )}
    >
      <div
        className="z-30 shrink-0"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {header}
      </div>

      <main
        id="career-mobile-scroll"
        className={cn(
          "relative min-h-0 flex-1 overflow-y-auto scroll-smooth bg-beige50",
          contentClassName
        )}
      >
        {children}
      </main>

      {bottom ? (
        <div
          className="z-30 shrink-0 border-t border-beige900/10 bg-beige50"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {bottom}
        </div>
      ) : null}
    </div>
  );
}
