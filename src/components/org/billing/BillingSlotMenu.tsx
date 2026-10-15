import { useOrgBillingFormat } from "@/hooks/org/useOrgBillingFormat";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { MoreHorizontal } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isEndedBillingSlot, type BillingSlot } from "@/lib/org/billing/types";

export type BillingSlotActions = {
  onCancel: (slot: BillingSlot) => void;
  onResume: (slot: BillingSlot) => void;
  onPortal: () => void;
};

export function BillingSlotMenu({
  slot,
  now,
  busy,
  canManage,
  canViewBilling,
  onCancel,
  onResume,
  onPortal,
}: BillingSlotActions & {
  slot: BillingSlot;
  now: number;
  busy: boolean;
  canManage: boolean;
  canViewBilling: boolean;
}) {
  const { c } = useOrgLocale();
  const { formatBillingDaysUntil, date } = useOrgBillingFormat();
  const granted = slot.source === "grant";
  const ended = isEndedBillingSlot(slot, now);
  const paymentDue = ["past_due", "unpaid", "incomplete"].includes(slot.status);
  const boundary = slot.cancelAt ?? slot.periodEnd;
  const relative = formatBillingDaysUntil(boundary, now);
  const cycle =
    slot.billingInterval === "year"
      ? c("연간 구독", "Yearly subscription")
      : c("월간 구독", "Monthly subscription");
  const status = ended
    ? c("이용 종료", "Ended")
    : granted
      ? c(
          "Harper 제공 · 자동 결제 없음",
          "Provided by Harper · No automatic charge"
        )
      : slot.cancelAt
        ? c(
            `${relative} 이용 종료 · 자동 갱신 취소됨`,
            `Access ends ${relative} · Renewal cancelled`
          )
        : paymentDue
          ? c("결제 수단을 확인해 주세요", "Review your payment method")
          : boundary
            ? c(`${relative} 자동 갱신`, `Renews automatically ${relative}`)
            : c("갱신 예정 없음", "No renewal scheduled");
  const hasActions = !granted && (canViewBilling || (canManage && !ended));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MuteButton
          variant="transparent"
          size="sm"
          disabled={busy}
          aria-label={c(`${slot.label} 관리`, `Manage ${slot.label}`)}
        >
          <MoreHorizontal className="size-4" />
        </MuteButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel className="px-3 py-2 text-[12px] font-normal leading-5">
          {!granted && <p className="text-neutral-primary">{cycle}</p>}
          <p title={boundary ? date(boundary, true) : undefined}>{status}</p>
        </DropdownMenuLabel>
        {hasActions && <DropdownMenuSeparator />}
        {!granted && canViewBilling && (
          <DropdownMenuItem onSelect={onPortal} variant="sm">
            {c("결제 수단 관리", "Manage payment method")}
          </DropdownMenuItem>
        )}
        {!granted &&
          canManage &&
          !ended &&
          (slot.cancelAt ? (
            <DropdownMenuItem onSelect={() => onResume(slot)} variant="sm">
              {c("구독 유지", "Keep subscription")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => onCancel(slot)}
              variant="sm"
              className="text-critical focus:text-critical"
            >
              {c("구독 취소", "Cancel subscription")}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
