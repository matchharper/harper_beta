import { useOrgBillingFormat } from "@/hooks/org/useOrgBillingFormat";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { ProgressBar } from "@/components/ui/progress";
import { OrgSection, OrgSectionHeader } from "../workspace/OrgSection";
import { type BillingSummary } from "@/lib/org/billing/types";
import { useBillingClock } from "@/hooks/org/useBillingClock";

export function BillingCredits({ summary }: { summary: BillingSummary }) {
  const { c } = useOrgLocale();
  const { billingErrorCopy, date, formatBillingDaysUntil } =
    useOrgBillingFormat();
  const now = useBillingClock();
  return (
    <OrgSection>
      <OrgSectionHeader title={c("Intro", "Intros")} />
      {summary.model === "scale" || summary.model === "legacy" ? (
        <p className="text-[20px] font-medium">
          {summary.model === "scale" ? c("무제한", "Unlimited") : "—"}
        </p>
      ) : !Array.isArray(summary.creditSlots) ? (
        <p role="alert" className="text-[13px] text-neutral-muted">
          {billingErrorCopy("billing_unavailable")}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-1000-a05">
          {summary.creditSlots.map((slot) => {
            const label =
              slot.slotId === null
                ? c("공용 Intro", "Shared Intros")
                : slot.label;
            const ending =
              !!slot.cancelAt &&
              !!slot.renewsAt &&
              Date.parse(slot.cancelAt) <= Date.parse(slot.renewsAt);
            const boundary = ending ? slot.cancelAt : slot.renewsAt;
            return (
              <li
                key={slot.id}
                className="grid gap-4 py-5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] sm:items-center sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-medium">{label}</p>
                  <p
                    className="mt-1 truncate text-[13px] text-neutral-muted"
                    title={slot.roleName ?? undefined}
                  >
                    {slot.slotId === null
                      ? c("전체 Role 공용", "Shared across all Roles")
                      : (slot.roleName ??
                        c("담당 Role 없음", "No Role assigned"))}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-[14px] tabular-nums">
                    {slot.remaining}
                    <span className="text-neutral-muted">
                      {" "}
                      / {slot.allowance} {c("남음", "left")}
                    </span>
                  </p>
                  <div
                    role="meter"
                    aria-label={`${label} · ${c("남은 Intro", "Remaining Intros")}`}
                    aria-valuemin={0}
                    aria-valuemax={slot.allowance}
                    aria-valuenow={slot.remaining}
                  >
                    <ProgressBar
                      value={
                        slot.allowance
                          ? (slot.remaining / slot.allowance) * 100
                          : 0
                      }
                    />
                  </div>
                </div>
                {boundary && (
                  <div className="text-[12px] leading-5 text-neutral-muted sm:text-right">
                    <time title={date(boundary, true)} dateTime={boundary}>
                      {formatBillingDaysUntil(boundary, now)}
                    </time>
                    <p>
                      {ending
                        ? c("이용 종료", "Access ends")
                        : c("Intro 갱신", "Intros reset")}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </OrgSection>
  );
}
