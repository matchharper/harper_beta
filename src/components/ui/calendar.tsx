"use client";

import * as React from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "secondary",
  navigationButtonClassName,
  navigationHeaderClassName,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
  navigationButtonClassName?: string;
  navigationHeaderClassName?: string;
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "w-full group/calendar bg-menu p-3 [--cell-size:2rem] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-2", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-10 select-none rounded-sm p-0 aria-disabled:opacity-50 [&_svg]:size-5",
          defaultClassNames.button_previous,
          navigationButtonClassName
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-10 select-none rounded-sm p-0 aria-disabled:opacity-50 [&_svg]:size-5",
          defaultClassNames.button_next,
          navigationButtonClassName
        ),
        month_caption: cn(
          "flex h-10 w-full items-center justify-center px-10",
          defaultClassNames.month_caption,
          navigationHeaderClassName
        ),
        dropdowns: cn(
          "flex h-10 w-full items-center justify-center gap-1.5 text-[13px] font-normal",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-md border border-neutral-300 has-focus:border-primary has-focus:ring-[3px] has-focus:ring-primary/30",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute inset-0 bg-bg-floating opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-normal",
          captionLayout === "label"
            ? "text-[13px]"
            : "[&>svg]:text-neutral-muted flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 select-none text-[11px] font-normal text-neutral-muted",
          defaultClassNames.weekday
        ),
        week: cn("mt-1 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "w-(--cell-size) select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "select-none text-[0.8rem] text-neutral-muted",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative h-(--cell-size) w-full select-none p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-sm [&:last-child[data-selected=true]_button]:rounded-r-sm",
          defaultClassNames.day
        ),
        range_start: cn(
          "rounded-l-sm bg-action-faded",
          defaultClassNames.range_start
        ),
        range_middle: cn(
          "rounded-none bg-action-faded",
          defaultClassNames.range_middle
        ),
        range_end: cn("rounded-r-sm bg-action-faded", defaultClassNames.range_end),
        today: cn(
          "rounded-sm bg-action-faded text-positive data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "text-neutral-muted aria-selected:text-neutral-muted",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-neutral-disabled opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          );
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            );
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            );
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          );
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="secondary"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "flex h-(--cell-size) w-full min-w-(--cell-size) flex-col gap-1 rounded-button border-transparent bg-transparent text-[12px] font-normal leading-none hover:bg-bg-weak data-[selected-single=true]:bg-primary data-[selected-single=true]:text-neutral-00 data-[range-middle=true]:bg-info-faded data-[range-middle=true]:text-info data-[range-start=true]:bg-info data-[range-start=true]:text-neutral-00 data-[range-end=true]:bg-info data-[range-end=true]:text-neutral-00 data-[range-end=true]:rounded-button data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-button group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-primary group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-primary/30 [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
