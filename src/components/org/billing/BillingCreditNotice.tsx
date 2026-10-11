import Link from "next/link";
import { useOrgEntitlements } from "@/hooks/org/useOrgBilling";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { Tooltips } from "@/components/ui/tooltip";
import { creditSlotForRole, isLowCreditBalance } from "@/lib/org/billing/types";
import { cn } from "@/lib/utils";
import { canUseWorkspaceBilling } from "@/lib/org/billing/rollout";

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
  if (!canUseWorkspaceBilling(workspaceId) || isError || !slot || !isLowCreditBalance(slot.remaining)) return null;
  const label =
    locale === "ko"
      ? `${slot.remaining} 크레딧 남음`
      : `${slot.remaining} credits left`;
  const poolLabel =
    slot.slotId === null
      ? locale === "ko"
        ? "공용 크레딧"
        : "Shared credits"
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
      <span className="text-[12px] font-medium tabular-nums">{label}</span>
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
