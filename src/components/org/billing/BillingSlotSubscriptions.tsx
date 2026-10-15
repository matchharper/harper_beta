import { useOrgBillingFormat } from "@/hooks/org/useOrgBillingFormat";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { Badge } from "@/components/ui/badge";
import {
  OrgTable,
  OrgTableBody,
  OrgTableCell,
  OrgTableHead,
  OrgTableHeader,
  OrgTableRow,
} from "../workspace/OrgTable";
import { isEndedBillingSlot, type BillingSlot } from "@/lib/org/billing/types";
import { BillingSlotMenu, type BillingSlotActions } from "./BillingSlotMenu";

export function BillingSlotSubscriptions({
  slots,
  now,
  busy,
  canManage,
  ...actions
}: BillingSlotActions & {
  slots: BillingSlot[];
  now: number;
  busy: boolean;
  canManage: boolean;
}) {
  const { c } = useOrgLocale();
  const { formatBillingMoney, date, formatBillingDaysUntil } =
    useOrgBillingFormat();
  const paid = slots.filter((slot) => slot.source !== "grant");
  if (!paid.length) return null;
  return (
    <div className="mt-4">
      <OrgTable className="min-w-[640px] [&_th]:h-9 [&_th]:px-4 [&_td]:px-4 [&_td]:py-2.5 [&_td]:text-[12px]">
        <caption className="sr-only">{c("결제한 슬롯", "Paid slots")}</caption>
        <OrgTableHeader>
          <OrgTableRow>
            <OrgTableHead>Slot</OrgTableHead>
            <OrgTableHead>{c("구독", "Subscription")}</OrgTableHead>
            <OrgTableHead>{c("시작일", "Started")}</OrgTableHead>
            <OrgTableHead>{c("다음 결제", "Next payment")}</OrgTableHead>
            <OrgTableHead>{c("상태", "Status")}</OrgTableHead>
            <OrgTableHead className="w-10">
              <span className="sr-only">{c("관리", "Manage")}</span>
            </OrgTableHead>
          </OrgTableRow>
        </OrgTableHeader>
        <OrgTableBody>
          {paid.map((slot) => {
            const ended = isEndedBillingSlot(slot, now);
            const paymentDue = ["past_due", "unpaid", "incomplete"].includes(
              slot.status
            );
            const ending = !ended && Boolean(slot.cancelAt);
            const boundary = slot.cancelAt ?? slot.periodEnd;
            return (
              <OrgTableRow key={slot.id}>
                <OrgTableCell className="whitespace-nowrap font-medium">
                  {slot.label}
                </OrgTableCell>
                <OrgTableCell>
                  <div className="flex flex-wrap items-baseline gap-x-1.5 text-neutral-muted">
                    {slot.recurringAmount != null && slot.currency && (
                      <span className="tabular-nums text-neutral-primary">
                        {formatBillingMoney(
                          slot.recurringAmount,
                          slot.currency
                        )}
                      </span>
                    )}
                    <span>
                      {slot.billingInterval === "year"
                        ? c("연간", "Yearly")
                        : c("월간", "Monthly")}
                    </span>
                  </div>
                </OrgTableCell>
                <OrgTableCell className="whitespace-nowrap text-neutral-muted">
                  <time
                    dateTime={slot.startedAt}
                    title={date(slot.startedAt, true)}
                  >
                    {date(slot.startedAt)}
                  </time>
                </OrgTableCell>
                <OrgTableCell className="whitespace-nowrap tabular-nums">
                  {ended ? (
                    "—"
                  ) : paymentDue ? (
                    c("결제 확인 필요", "Payment due")
                  ) : boundary ? (
                    <time dateTime={boundary} title={date(boundary, true)}>
                      {ending
                        ? c(
                            `${formatBillingDaysUntil(boundary, now)} 종료`,
                            `Ends ${formatBillingDaysUntil(boundary, now)}`
                          )
                        : formatBillingDaysUntil(boundary, now)}
                    </time>
                  ) : (
                    "—"
                  )}
                </OrgTableCell>
                <OrgTableCell className="whitespace-nowrap">
                  {ended ? (
                    <span className="text-neutral-muted">
                      {c("종료", "Ended")}
                    </span>
                  ) : paymentDue ? (
                    <Badge size="sm" variant="faded" tone="warning">
                      {c("결제 확인", "Payment due")}
                    </Badge>
                  ) : ending ? (
                    <span className="text-neutral-muted">
                      {c("갱신 취소됨", "Renewal cancelled")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-positive" />
                      {c("이용 중", "Active")}
                    </span>
                  )}
                </OrgTableCell>
                <OrgTableCell className="text-right">
                  <BillingSlotMenu
                    slot={slot}
                    now={now}
                    busy={busy}
                    canManage={canManage}
                    canViewBilling
                    {...actions}
                  />
                </OrgTableCell>
              </OrgTableRow>
            );
          })}
        </OrgTableBody>
      </OrgTable>
    </div>
  );
}
