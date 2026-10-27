import Link from "next/link";
import { useOrgEntitlements } from "@/hooks/org/useOrgBilling";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { Tooltips } from "@/components/ui/tooltip";
import { Ticket } from "@/components/ui/ticket";
import {
  creditSlotForRole,
  formatIntroCount,
  isLowCreditBalance,
} from "@/lib/org/billing/types";
import { cn } from "@/lib/utils";

export function BillingCreditNotice({
  workspaceId,
  roleId,
  compact,
  canManage,
}: {
  workspaceId: string;
  roleId?: string | null;
  compact: boolean;
  canManage: boolean;
}) {
  const { locale } = useOrgLocale();
  const { data, isError } = useOrgEntitlements(workspaceId);
  const slot = creditSlotForRole(data?.creditSlots, roleId);
  if (isError || !slot || !isLowCreditBalance(slot.remaining)) return null;
  const label =
    locale === "ko"
      ? `${formatIntroCount(slot.remaining, locale)} 남음`
      : `${formatIntroCount(slot.remaining, locale)} left`;
  const poolLabel =
    slot.slotId === null
      ? locale === "ko"
        ? "공용 Intro"
        : "Shared Intros"
      : slot.label;
  const description = `${slot.roleName ?? poolLabel} · ${label}`;
  const className = cn(
    "flex rounded-md text-neutral-primary",
    compact ? "justify-center py-2" : "flex-col gap-1 px-2.5 py-2.5"
  );
  const body = compact ? (
    <span
      className={cn(
        "text-[12px] tabular-nums",
        slot.remaining === 0 && "text-critical"
      )}
    >
      {slot.remaining}
    </span>
  ) : (
    <>
      <span className="truncate text-[11px] text-neutral-muted">
        {poolLabel}
      </span>
      <span className="text-[12px] font-medium tabular-nums">
        <span className="sr-only">{label}</span>
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          {slot.remaining}
          <Ticket size={12} />
          {locale === "ko" ? "남음" : "left"}
        </span>
      </span>
    </>
  );
  const content = canManage ? (
    <Link
      href={`/org/slots?orgId=${encodeURIComponent(workspaceId)}`}
      aria-label={description}
      className={cn(
        className,
        "outline-none transition-colors hover:bg-bg-weak focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
      )}
    >
      {body}
    </Link>
  ) : (
    <div aria-label={description} className={className}>
      {body}
    </div>
  );
  return (
    <div className="mx-3 mb-2 border-t border-neutral-1000-a05 pt-2">
      {compact ? (
        <Tooltips side="right" text={description}>
          {content}
        </Tooltips>
      ) : (
        content
      )}
    </div>
  );
}
