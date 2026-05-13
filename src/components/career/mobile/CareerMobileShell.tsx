"use client";

import React from "react";
import { cn } from "@/lib/utils";

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
  return (
    <div
      className={cn(
        "relative flex min-h-svh w-full flex-col bg-beige50 font-geist text-beige900",
        className
      )}
    >
      <div
        className="sticky top-0 z-30"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {header}
      </div>

      <main
        id="career-mobile-scroll"
        className={cn(
          "relative flex-1 overflow-y-auto scroll-smooth bg-beige50",
          contentClassName
        )}
      >
        {children}
      </main>

      {bottom ? (
        <div
          className="sticky bottom-0 z-30 border-t border-beige900/10 bg-beige50"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {bottom}
        </div>
      ) : null}
    </div>
  );
}
