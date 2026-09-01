"use client";

import type { ComponentProps, ReactNode } from "react";
import { Calendar } from "@/components/ui/calendar";
import { MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AVAILABLE_DAY_CLASS_NAME =
  "available-day [&>button]:rounded-md [&>button]:bg-primary-faded [&>button]:text-neutral-primary [&>button]:hover:bg-primary/20 [&>button[data-selected-single=true]]:bg-primary [&>button[data-selected-single=true]]:text-neutral-00 [&>button[data-selected-single=true]]:hover:bg-primary";

export function MeetingAvailabilityCalendar({
  className,
  classNames,
  modifiersClassNames,
  navigationButtonClassName,
  navigationHeaderClassName,
  ...props
}: ComponentProps<typeof Calendar>) {
  return (
    <Calendar
      className={cn(
        "mx-auto mt-3 max-w-[380px] rounded-xl bg-bg-default p-0 [--cell-size:1.95rem] [&_.available-day+_.available-day>button]:rounded-l-none [&_.available-day:has(+_.available-day)>button]:rounded-r-none [&_.rdp-week]:mt-1 [&_.rdp-weekday]:text-[10px] [&_button[data-day]]:min-w-0 [&_button[data-day]]:rounded-md [&_button[data-day]]:text-[12px] [&_button[data-day]]:transition-[background-color,color,box-shadow] [&_button[data-day]:disabled]:cursor-not-allowed [&_button[data-day]:disabled]:bg-transparent [&_button[data-day]:disabled]:text-neutral-disabled sm:[&_.rdp-weekday]:text-[11px] sm:[&_button[data-day]]:text-[13px] sm:[--cell-size:2.3rem]",
        className
      )}
      classNames={{
        ...classNames,
        today: cn(
          "[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-neutral-1000-a10",
          classNames?.today
        ),
      }}
      modifiersClassNames={{
        ...modifiersClassNames,
        available: cn(AVAILABLE_DAY_CLASS_NAME, modifiersClassNames?.available),
      }}
      navigationButtonClassName={cn(
        "size-10 hover:bg-neutral-100 sm:size-10 [&_svg]:size-5",
        navigationButtonClassName
      )}
      navigationHeaderClassName={cn(
        "h-10 px-10 sm:h-11 sm:px-11",
        navigationHeaderClassName
      )}
      showOutsideDays={false}
      {...props}
    />
  );
}

export function MeetingAvailabilitySplitLayout({
  calendar,
  calendarPaneClassName,
  children,
  className,
  contentPaneClassName,
}: {
  calendar: ReactNode;
  calendarPaneClassName?: string;
  children: ReactNode;
  className?: string;
  contentPaneClassName?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-0 overflow-y-auto md:grid md:grid-cols-[minmax(330px,0.88fr)_minmax(480px,1.12fr)] md:grid-rows-1 md:overflow-hidden",
        className
      )}
    >
      <aside
        className={cn(
          "border-b border-neutral-1000-a05 bg-bg-default p-5 md:overflow-y-auto md:border-b-0 md:border-r md:p-6",
          calendarPaneClassName
        )}
      >
        {calendar}
      </aside>
      <section
        className={cn(
          "relative min-h-0 bg-bg-floating md:overflow-y-auto",
          contentPaneClassName
        )}
      >
        {children}
      </section>
    </div>
  );
}

export function MeetingAvailabilityTimeButton({
  className,
  ...props
}: ComponentProps<typeof MuteButton>) {
  return (
    <MuteButton
      {...props}
      className={cn(
        "min-h-9 w-full justify-between tabular-nums text-neutral-primary",
        className
      )}
      size="md"
      variant="default"
    />
  );
}
