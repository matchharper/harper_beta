import { Slot } from "@radix-ui/react-slot";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ListPartProps = ComponentPropsWithoutRef<"div"> & { asChild?: boolean };

export function GroupedList({ asChild, className, ...props }: ListPartProps) {
  const Component = asChild ? Slot : "div";
  return (
    <Component
      className={cn(
        "min-w-0 divide-y divide-neutral-1000-a05 rounded-card bg-card-selected px-5",
        className
      )}
      {...props}
    />
  );
}

export function GroupedListRow({
  asChild,
  className,
  ...props
}: ListPartProps) {
  const Component = asChild ? Slot : "div";
  return (
    <Component
      className={cn(
        "relative flex min-h-[52px] w-full items-center gap-5 py-3 text-left text-[15px] font-normal text-neutral-primary",
        className
      )}
      {...props}
    />
  );
}

export function GroupedListText({
  title,
  description,
  titleId,
  descriptionId,
}: {
  title: ReactNode;
  description?: ReactNode;
  titleId?: string;
  descriptionId?: string;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span id={titleId} className="block leading-6">
        {title}
      </span>
      {description != null && (
        <span
          id={descriptionId}
          className="mt-0.5 block whitespace-pre-line text-[13px] leading-5 text-neutral-600"
        >
          {description}
        </span>
      )}
    </span>
  );
}
