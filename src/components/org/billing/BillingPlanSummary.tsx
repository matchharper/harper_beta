import { MuteButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OrgSection, OrgSectionHeader } from "../workspace/OrgSection";
import {
  BILLING_SUPPORT_HREF,
  type BillingSummary,
} from "@/lib/org/billing/types";

export function BillingPlanSummary({
  summary,
  locale,
  busy,
  date,
  onPortal,
  onAddSlot,
}: {
  summary: BillingSummary;
  locale: "ko" | "en";
  busy: boolean;
  date: (value: string | null) => string;
  onPortal: () => void;
  onAddSlot: () => void;
}) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const active = summary.slots.filter((slot) => slot.active);
  const paid = active.filter((slot) => slot.source !== "grant");
  const nextPayment = paid
    .filter(
      (slot) =>
        !slot.cancelAt &&
        slot.periodEnd &&
        !["past_due", "unpaid"].includes(slot.status)
    )
    .sort(
      (a, b) => Date.parse(a.periodEnd!) - Date.parse(b.periodEnd!)
    )[0]?.periodEnd;
  const contactOnly =
    summary.model === "scale" ||
    (summary.model === "legacy" && summary.activeRoles > 1);
  const plan =
    summary.model === "scale"
      ? "Enterprise"
      : summary.model === "legacy"
        ? c("기존 계약", "Current agreement")
        : summary.model === "slot"
          ? c(
              `Slot 플랜 · 슬롯 ${active.length}개`,
              `Slot plan · ${active.length} ${active.length === 1 ? "slot" : "slots"}`
            )
          : c("Free 플랜", "Free plan");
  const description =
    summary.model === "free"
      ? c(
          "Role은 무제한이며, 모든 Role이 매월 공용 크레딧 10개를 함께 사용해요. 슬롯을 추가해도 공용 크레딧은 별도로 유지돼요.",
          "Unlimited Roles share 10 credits every month. Shared credits remain available separately when you add paid slots."
        )
      : summary.model === "slot"
        ? paid.length === 0
          ? c(
              "Harper가 제공한 슬롯을 이용 중이에요. 각 슬롯의 종료일까지 사용할 수 있으며 자동 결제되지 않아요.",
              "Your complimentary slots are available until their end dates, with no automatic charge."
            )
          : nextPayment
            ? c(
                `다음 구독 결제는 ${date(nextPayment)}이에요.`,
                `Your next subscription payment is ${date(nextPayment)}.`
              )
            : paid.length > 0 && paid.every((slot) => slot.cancelAt)
              ? c(
                  "자동 갱신이 취소되어 있어요. 각 슬롯의 종료일까지 이용할 수 있어요.",
                  "Automatic renewal is cancelled. Each slot remains available until its end date."
                )
              : c(
                  "슬롯별 구독 상태와 결제 내역을 확인해 주세요.",
                  "Review each slot’s subscription status and billing history."
                )
        : c(
            "계약 변경과 결제 관련 서류는 Harper 팀에 문의해 주세요.",
            "Contact Harper for agreement changes and billing documents."
          );
  return (
    <OrgSection className="border-b-0 pb-0">
      <div className="text-base">{c("현재 플랜", "Current plan")}</div>
      <Card className="mt-3 flex flex-col gap-5 rounded-xl bg-bg-default py-4 px-5 shadow-none lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-[15px]">{plan}</h3>
          <p className="mt-1 max-w-2xl text-[13px] leading-6 text-neutral-muted">
            {description}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {summary.hasCustomer && (
            <MuteButton disabled={busy} onClick={onPortal}>
              {c("결제 관리", "Manage billing")}
            </MuteButton>
          )}
          {contactOnly ? (
            <MuteButton asChild variant="primary">
              <a href={BILLING_SUPPORT_HREF}>
                {c("Harper 팀에 문의", "Contact Harper")}
              </a>
            </MuteButton>
          ) : (
            <MuteButton variant="primary" disabled={busy} onClick={onAddSlot}>
              {c("슬롯 추가", "Add a slot")}
            </MuteButton>
          )}
        </div>
      </Card>
    </OrgSection>
  );
}
