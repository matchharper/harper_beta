import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrgSection, OrgSectionHeader } from "../workspace/OrgSection";
import {
  BILLING_SUPPORT_HREF,
  isEndedBillingSlot,
  formatBillingMoney,
  type BillingSlot,
  type BillingSummary,
} from "@/lib/org/billing/types";

export function BillingSubscriptionOverview({
  summary,
  locale,
  busy,
  date,
  canAssign,
  onAddSlot,
  onCredits,
  onCancel,
  onResume,
  onAssign,
  onPortal,
}: {
  summary: BillingSummary;
  locale: "ko" | "en";
  busy: boolean;
  date: (value: string | null, time?: boolean) => string;
  canAssign: boolean;
  onAddSlot: () => void;
  onCredits: () => void;
  onPortal: () => void;
  onCancel: (slot: BillingSlot) => void;
  onResume: (slot: BillingSlot) => void;
  onAssign: (slot: BillingSlot) => void;
}) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const paid = summary.slots.filter((a) => a.active);
  const slots = summary.slots.filter((a) => !isEndedBillingSlot(a));
  const ended = summary.slots.filter((a) => !slots.includes(a));
  const unlimited = summary.model === "scale";
  const legacy = summary.model === "legacy";
  const plan = unlimited
    ? "Enterprise"
    : legacy
      ? c("기존 계약", "Current agreement")
      : summary.model === "slot"
        ? "Slot"
        : "Free";
  const paymentProblem = slots.some((a) =>
    ["past_due", "unpaid", "incomplete"].includes(a.status)
  );
  const nextPayment = paid
    .filter(
      (a) =>
        !a.cancelAt && a.periodEnd && !["past_due", "unpaid"].includes(a.status)
    )
    .sort(
      (a, b) => Date.parse(a.periodEnd!) - Date.parse(b.periodEnd!)
    )[0]?.periodEnd;
  return (
    <div className="space-y-8">
      {paymentProblem && (
        <div
          className="flex flex-col gap-3 rounded-lg bg-info-faded px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <div className="text-[13px] leading-5">
            <p className="font-medium">
              {c(
                "결제 확인이 필요한 슬롯이 있어요.",
                "A slot needs payment attention."
              )}
            </p>
            <p className="mt-1 text-neutral-muted">
              {c(
                "결제를 완료하면 해당 슬롯의 이용과 크레딧이 다시 시작돼요.",
                "Complete the payment to restore that slot’s access and credits."
              )}
            </p>
          </div>
          <MuteButton onClick={onPortal} disabled={busy}>
            {c("결제 확인", "Review payment")}
          </MuteButton>
        </div>
      )}
      <OrgSection>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="mt-2 flex items-center gap-3">
            <h2 className="text-[28px] font-medium tracking-tight">{plan}</h2>
            {paid.length > 0 && (
              <Badge variant="outline" size="sm">
                {paid.length} Slots
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unlimited || (legacy && summary.activeRoles > 1) ? (
              <MuteButton asChild>
                <a href={BILLING_SUPPORT_HREF}>
                  {c("Harper 팀에 문의", "Contact Harper")}
                </a>
              </MuteButton>
            ) : (
              <MuteButton variant="dark" onClick={onAddSlot} disabled={busy}>
                {c("슬롯 추가", "Add a slot")}
              </MuteButton>
            )}
          </div>
        </div>
        <dl className="mt-7 grid grid-cols-2 gap-y-6 sm:grid-cols-3 sm:divide-x sm:divide-neutral-1000-a05">
          <div className="sm:pr-6">
            <dt className="text-[12px] text-neutral-muted">
              {c("진행 중인 채용", "Active Roles")}
            </dt>
            <dd className="mt-2 text-[22px] font-medium tabular-nums">
              {summary.activeRoles}
              <span className="ml-1.5 text-[14px] font-normal text-neutral-muted">
                / ∞
              </span>
            </dd>
            <p className="mt-1 text-[12px] text-neutral-soft">
              {c("Role 무제한", "Unlimited Roles")}
            </p>
          </div>
          <div className="sm:px-6">
            <dt className="text-[12px] text-neutral-muted">
              {paid.length
                ? c("슬롯당 월 크레딧", "Monthly credits per slot")
                : c("월 공용 크레딧", "Monthly shared credits")}
            </dt>
            <dd className="mt-2 text-[22px] font-medium tabular-nums">
              {unlimited ? "∞" : legacy ? "—" : paid.length ? 50 : 10}
            </dd>
            <MuteButton
              size="sm"
              variant="transparent"
              onClick={onCredits}
              className="mt-0.5"
            >
              {c("잔액과 갱신일 보기", "Balance & reset dates")}
            </MuteButton>
          </div>
          <div className="col-span-2 sm:col-span-1 sm:pl-6">
            <dt className="text-[12px] text-neutral-muted">
              {c("다음 결제", "Next payment")}
            </dt>
            <dd className="mt-3 text-[14px] font-medium">
              {nextPayment
                ? date(nextPayment)
                : c("예정 없음", "None scheduled")}
            </dd>
            <p className="mt-2 text-[12px] text-neutral-soft">
              {nextPayment
                ? c(
                    "슬롯별 결제일은 아래에서 확인하세요",
                    "Each slot’s schedule is shown below"
                  )
                : c("", "")}
            </p>
          </div>
        </dl>
      </OrgSection>
      <OrgSection>
        <OrgSectionHeader title={c("구독 중인 슬롯", "Your slots")} />
        {slots.length ? (
          <div>
            <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,.7fr)_minmax(0,1fr)_36px] gap-5 border-b border-neutral-1000-a05 pb-3 text-[12px] text-neutral-muted md:grid">
              <span>Slot / Role</span>
              <span>{c("결제 주기", "Billing cycle")}</span>
              <span>{c("다음 일정", "Next date")}</span>
              <span className="sr-only">{c("관리", "Manage")}</span>
            </div>
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 border-b border-neutral-1000-a05 py-4 last:border-0 md:grid-cols-[minmax(0,1.5fr)_minmax(0,.7fr)_minmax(0,1fr)_36px] md:gap-x-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium">
                      {slot.label}
                    </span>
                    {slot.cancelAt ? (
                      <Badge variant="outline" size="sm">
                        {c("종료 예정", "Ending")}
                      </Badge>
                    ) : ["past_due", "unpaid", "incomplete"].includes(
                        slot.status
                      ) ? (
                      <Badge tone="warning" variant="faded" size="sm">
                        {c("결제 확인 필요", "Payment due")}
                      </Badge>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[11px] text-neutral-muted">
                        <span className="size-1.5 rounded-full bg-positive" />
                        {c("이용 중", "Active")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-[12px] text-neutral-muted">
                    {slot.roleName ??
                      c("새 채용을 시작할 수 있어요", "Ready for a new search")}
                  </p>
                </div>
                <div className="col-start-1 text-[13px] md:col-auto">
                  {slot.billingInterval === "year"
                    ? c("연간", "Yearly")
                    : c("월간", "Monthly")}
                  {slot.recurringAmount != null && slot.currency && (
                    <p className="mt-1 text-[12px] tabular-nums text-neutral-muted">
                      {formatBillingMoney(
                        slot.recurringAmount,
                        slot.currency,
                        locale
                      )}
                    </p>
                  )}
                </div>
                <div className="col-start-1 text-[12px] leading-5 md:col-auto">
                  <time
                    title={date(slot.cancelAt ?? slot.periodEnd, true)}
                    dateTime={slot.cancelAt ?? slot.periodEnd ?? undefined}
                  >
                    {date(slot.cancelAt ?? slot.periodEnd)}
                  </time>
                  <p className="text-neutral-muted">
                    {slot.cancelAt
                      ? c("이용 종료", "Access ends")
                      : ["past_due", "unpaid", "incomplete"].includes(
                            slot.status
                          )
                        ? c(
                            "결제 수단을 확인해 주세요",
                            "Review your payment method"
                          )
                        : c("자동 갱신", "Renews automatically")}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <MuteButton
                      variant="transparent"
                      disabled={busy}
                      className="col-start-2 row-start-1 md:col-auto md:row-auto"
                      aria-label={c(
                        `${slot.label} 관리`,
                        `Manage ${slot.label}`
                      )}
                    >
                      <MoreHorizontal className="size-4" />
                    </MuteButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {slot.active && canAssign && (
                      <DropdownMenuItem onSelect={() => onAssign(slot)}>
                        {c("담당 Role 변경", "Change assigned Role")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={onPortal}>
                      {c("결제 수단 관리", "Manage payment method")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {slot.cancelAt ? (
                      <DropdownMenuItem onSelect={() => onResume(slot)}>
                        {c("구독 유지", "Keep subscription")}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => onCancel(slot)}>
                        {c("구독 취소", "Cancel subscription")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-[13px] leading-6 text-neutral-muted">
            <p>
              {unlimited
                ? c(
                    "Enterprise에서는 슬롯 수와 관계없이 채용을 진행할 수 있어요.",
                    "Enterprise supports unlimited active searches."
                  )
                : legacy
                  ? c(
                      "현재 계약에는 개별 슬롯 구독이 없어요.",
                      "Your agreement has no individual slot subscriptions."
                    )
                  : ""}
            </p>
          </div>
        )}
        {ended.length > 0 && (
          <details className="mt-5 border-t border-neutral-1000-a05 pt-4">
            <summary className="cursor-pointer text-[12px] text-neutral-muted">
              {c(
                `종료된 슬롯 ${ended.length}개`,
                `${ended.length} ended slots`
              )}
            </summary>
            <div className="mt-2 divide-y divide-neutral-1000-a05">
              {ended.map((a) => (
                <div
                  key={a.id}
                  className="flex justify-between gap-4 py-3 text-[12px] text-neutral-muted"
                >
                  <span>{a.label}</span>
                  <span>
                    {date(a.endedAt ?? a.cancelAt ?? a.periodEnd)} ·{" "}
                    {c("종료", "Ended")}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </OrgSection>
      {/* {!unlimited && (
        <div className="flex flex-col gap-2 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">
              {c(
                "더 큰 규모의 채용을 계획하고 있나요?",
                "Hiring at a larger scale?"
              )}
            </p>
            <p className="mt-1 text-neutral-muted">
              {c(
                "Enterprise는 채용 수와 크레딧 제한 없이 함께해요.",
                "Enterprise includes unlimited active Roles and credits."
              )}
            </p>
          </div>
          <MuteButton asChild variant="transparent">
            <a href={BILLING_SUPPORT_HREF}>
              {c("Enterprise 문의", "Contact sales")}
            </a>
          </MuteButton>
        </div>
      )} */}
    </div>
  );
}
