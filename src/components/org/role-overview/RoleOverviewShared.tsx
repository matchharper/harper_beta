import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { MuteButton } from "@/components/ui/button";
import { Tooltips } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function getRoleOverviewErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function RoleSectionHeading({
  description,
  info,
  size = "default",
  title,
}: {
  description?: string;
  info?: string;
  size?: "default" | "large";
  title: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <h3
          className={cn(
            "font-medium text-neutral-primary",
            size === "large" ? "text-[18px] leading-7" : "text-[14px]"
          )}
        >
          {title}
        </h3>
        {info ? (
          <Tooltips side="right" text={info}>
            <span
              aria-label={`${title} 안내`}
              className="inline-flex cursor-help text-neutral-soft hover:text-neutral-primary"
              role="img"
              tabIndex={0}
            >
              <Info className="size-3.5" />
            </span>
          </Tooltips>
        ) : null}
      </div>
      {description ? (
        <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function RoleToggleButton({
  active,
  children,
  disabled,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <MuteButton
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      variant={active ? "dark" : "default"}
    >
      {children}
    </MuteButton>
  );
}
