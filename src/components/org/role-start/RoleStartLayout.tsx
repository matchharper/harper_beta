import type { ReactNode } from "react";
import { Typography } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

/** Shared heading rhythm for every role hiring step; callers own copy and state. */
export function RoleStartStepHeader({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      <Typography
        as="h1"
        variant="section-title"
        className="text-xl font-normal"
      >
        {title}
      </Typography>
      {description ? (
        <Typography variant="description" className="leading-6">
          {description}
        </Typography>
      ) : null}
      {children}
    </header>
  );
}

export function RoleStartCentered({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mx-auto flex w-full max-w-[640px] flex-col", className)}
    >
      {children}
    </div>
  );
}

export function RoleStartSplit({ children }: { children: ReactNode }) {
  return (
    <div
      data-role-start-split
      className="grid min-h-full w-full gap-10 md:h-full md:min-h-0 md:grid-cols-[0.4fr_0.6fr] md:gap-0"
    >
      {children}
    </div>
  );
}

export function RoleStartPane({
  children,
  side,
}: {
  children: ReactNode;
  side: "left" | "right";
}) {
  return (
    <div
      data-role-start-pane={side}
      className={cn(
        "flex min-h-0 min-w-0 flex-col items-center md:overflow-y-auto",
        side === "left" && "md:pb-[20vh]"
      )}
    >
      <div
        className={cn(
          "my-auto w-full shrink-0 py-8",
          side === "right"
            ? "max-w-[640px]"
            : "flex flex-col gap-5 md:w-[90%] md:max-w-[580px]"
        )}
      >
        {children}
      </div>
    </div>
  );
}
