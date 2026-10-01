import { useOrgLocale, useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { MuteButton } from "@/components/ui/button";
import { Tooltips } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function useRoleOverviewErrorMessage() {
  const { locale } = useOrgLocale();
  return (error: unknown, fallback: string) =>
    localizedOrgErrorMessage(error, locale, fallback);
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
  const t = useOrgT();
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
              aria-label={t("role.overview.RoleOverviewShared.755ae33b", "{p0} 안내", {
                p0: title,
              })}
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
        <p className="mt-1 text-[13px] leading-5 text-neutral-muted">
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
