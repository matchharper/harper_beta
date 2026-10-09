import { ProgressBar } from "@/components/ui/progress";
import { OrgSection, OrgSectionHeader } from "../workspace/OrgSection";
import { billingErrorCopy, type BillingSummary } from "@/lib/org/billing/types";

export function BillingCredits({
  summary,
  locale,
  date,
}: {
  summary: BillingSummary;
  locale: "ko" | "en";
  date: (value: string | null, time?: boolean) => string;
}) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  return (
    <OrgSection>
      <OrgSectionHeader title={c("크레딧", "Credits")} />
      {summary.model === "scale" || summary.model === "legacy" ? (
        <p className="text-[20px] font-medium">
          {summary.model === "scale" ? c("무제한", "Unlimited") : "—"}
        </p>
      ) : !Array.isArray(summary.creditSlots) ? (
        <p role="alert" className="text-[13px] text-neutral-muted">
          {billingErrorCopy("billing_unavailable", locale)}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-1000-a05">
          {summary.creditSlots.map((slot) => {
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
                  <p className="text-[14px] font-medium">
                    {slot.slotId === null
                      ? c("공용 크레딧", "Shared credits")
                      : slot.label}
                  </p>
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
                    aria-label={`${slot.label} · ${c("남은 크레딧", "Remaining credits")}`}
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
                      {date(boundary)}
                    </time>
                    <p>
                      {ending
                        ? c("이용 종료", "Access ends")
                        : c("크레딧 갱신", "Credits reset")}
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
