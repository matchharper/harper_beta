import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/app";
import { useCredits } from "@/hooks/useCredit";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { supabase } from "@/lib/supabase";
import { dateToFormatLong } from "@/utils/textprocess";
import { useMessages } from "@/i18n/useMessage";
import { showToast } from "@/components/toast/toast";
import PricingSection from "@/components/payment/PricingSection";
import QuestionAnswer from "@/components/landing/Questions";
import Animate from "@/components/landing/Animate";
import {
  getActiveSubscriptionOrFilter,
  type BillingPeriod,
  type BillingProviderStatus,
} from "@/lib/billing/common";
import { Tooltips } from "@/components/ui/tooltip";
import { MuteButton } from "@/components/ui/button";

function formatDateToDots(dateStr?: string | null) {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function getBillingProviderStatusLabel(status?: BillingProviderStatus | null) {
  switch (status) {
    case "active":
      return "활성화";
    case "past_due":
      return "미납";
    case "cancel_scheduled":
      return "해지 예정";
    case "expired":
      return "만료";
    default:
      return status ?? null;
  }
}

type SubscriptionInfo = {
  planKey: "pro" | "max" | "enterprise" | "free" | null;
  planId: string | null;
  planName: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  billing: BillingPeriod | null;
  providerStatus: BillingProviderStatus | null;
  nextChargeAt: string | null;
  retryNextAt: string | null;
  retryCount: number | null;
  graceEndsAt: string | null;
  cardCompany: string | null;
  cardNumberMasked: string | null;
};

type PlanPriceMap = {
  pro: { monthly: number | null; yearly: number | null };
  max: { monthly: number | null; yearly: number | null };
};

function normalizePlanValue(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "")
    .trim();
}

function inferBillingPeriod(args: {
  planLabel?: string | null;
  planId?: string | null;
  start?: string | null;
  end?: string | null;
}): BillingPeriod | null {
  const hay = normalizePlanValue(
    `${args.planLabel ?? ""} ${args.planId ?? ""}`
  );

  if (
    hay.includes("year") ||
    hay.includes("annual") ||
    hay.includes("yearly") ||
    hay.includes("연간")
  ) {
    return "yearly";
  }

  if (
    hay.includes("month") ||
    hay.includes("monthly") ||
    hay.includes("월간") ||
    hay.includes("월")
  ) {
    return "monthly";
  }

  if (args.start && args.end) {
    const start = new Date(args.start);
    const end = new Date(args.end);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const diffDays =
        Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 300) return "yearly";
      if (diffDays > 0) return "monthly";
    }
  }

  return null;
}

function inferPlanKey(args: {
  planLabel?: string | null;
  planId?: string | null;
  pricing: typeof import("@/lang/ko").ko.companyLanding.pricing;
}) {
  const hay = normalizePlanValue(
    `${args.planLabel ?? ""} ${args.planId ?? ""}`
  );

  if (hay.includes("free") || hay.includes("프리")) return "free";
  const candidates = [
    { key: "pro", label: args.pricing.plans.pro.name },
    { key: "max", label: args.pricing.plans.max.name },
    { key: "enterprise", label: args.pricing.plans.enterprise.name },
  ] as const;

  for (const c of candidates) {
    const needle = normalizePlanValue(c.label);
    if (needle && hay.includes(needle)) return c.key;
    if (hay.includes(c.key)) return c.key;
  }

  return null;
}

function showPaymentUnavailable() {
  showToast({
    message: "현재 결제 서비스를 이용할 수 없어요.",
    variant: "error",
  });
}

const Billing = () => {
  const { credits } = useCredits();
  const { companyUser } = useCompanyUserStore();
  const [isRevealCardNumber, setIsRevealCardNumber] = useState(false);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null
  );
  const [planPrices, setPlanPrices] = useState<PlanPriceMap | null>(null);
  const { m } = useMessages();
  const currentPlanKey =
    subscription?.planKey ??
    (subscription
      ? inferPlanKey({
          planLabel: subscription.planName,
          planId: subscription.planId,
          pricing: m.companyLanding.pricing as any,
        })
      : null);
  const currentBilling = subscription?.billing ?? null;
  const currentProviderStatus = subscription?.providerStatus ?? null;
  const currentProviderStatusLabel = getBillingProviderStatusLabel(
    currentProviderStatus
  );
  const subscriptionPlanLabel =
    subscription?.planName ?? subscription?.planId ?? "알 수 없음";
  const subscriptionBillingLabel =
    subscription?.billing === "yearly"
      ? "연간"
      : subscription?.billing === "monthly"
        ? "월간"
        : "주기 정보 없음";
  const canCancelSubscription =
    !!subscription &&
    subscription.planKey !== "free" &&
    !subscription.cancelAtPeriodEnd &&
    subscription.providerStatus !== "past_due";
  const usageResetDateLabel = formatDateToDots(subscription?.currentPeriodEnd);
  const isPastDue = currentProviderStatus === "past_due";

  const fetchPlanPrices = async () => {
    const { data, error } = await supabase
      .from("plans")
      .select("name, cycle, price_krw")
      .in("name", ["pro", "max"]);

    if (error) {
      console.error("Failed to load plan prices:", error);
      return;
    }

    const nextPrices: PlanPriceMap = {
      pro: { monthly: null, yearly: null },
      max: { monthly: null, yearly: null },
    };

    for (const row of data ?? []) {
      if ((row.name !== "pro" && row.name !== "max") || row.price_krw == null) {
        continue;
      }

      if (row.cycle === 0) {
        nextPrices[row.name].monthly = row.price_krw;
      } else if (row.cycle === 1) {
        nextPrices[row.name].yearly = row.price_krw;
      }
    }

    setPlanPrices(nextPrices);
  };

  useEffect(() => {
    let isCancelled = false;

    async function loadSubscription() {
      if (!companyUser?.user_id) {
        setSubscription(null);
        return;
      }

      setIsSubscriptionLoading(true);
      const nowIso = new Date().toISOString();
      const { data: activePayment, error } = await supabase
        .from("payments")
        .select(
          `
            plan_id,
            current_period_start,
            current_period_end,
            cancel_at_period_end,
                provider_status,
            next_charge_at,
            retry_next_at,
            retry_count,
            grace_ends_at,
            card_company,
            card_number_masked,
            plans (
              plan_id,
              name,
              display_name,
              cycle
            )
          `
        )
        .eq("user_id", companyUser.user_id)
        .or(getActiveSubscriptionOrFilter(nowIso))
        .order("current_period_end", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (isCancelled) return;

      if (error) {
        console.error("Failed to load subscription:", error);
        setSubscription(null);
        setIsSubscriptionLoading(false);
        return;
      }

      if (!activePayment) {
        const { data: freePlan, error: freeError } = await supabase
          .from("plans")
          .select("plan_id, name, display_name")
          .eq("ls_variant_id", "0000000")
          .maybeSingle();

        if (freeError) {
          console.error("Failed to load free plan:", freeError);
          setSubscription(null);
          setIsSubscriptionLoading(false);
          return;
        }

        const freeName = freePlan?.display_name ?? freePlan?.name ?? "Free";

        setSubscription({
          planKey: "free",
          planId: freePlan?.plan_id ?? null,
          planName: freeName,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: null,
          billing: "monthly",
          providerStatus: null,
          nextChargeAt: null,
          retryNextAt: null,
          retryCount: null,
          graceEndsAt: null,
          cardCompany: null,
          cardNumberMasked: null,
        });
        setIsSubscriptionLoading(false);
        return;
      }

      const planName =
        (activePayment as any)?.plans?.display_name ??
        (activePayment as any)?.plans?.name ??
        null;
      const cycle = (activePayment as any)?.plans?.cycle ?? null;
      const billing =
        cycle === 1
          ? "yearly"
          : cycle === 0
            ? "monthly"
            : inferBillingPeriod({
                planLabel: planName,
                planId: activePayment.plan_id ?? null,
                start: activePayment.current_period_start ?? null,
                end: activePayment.current_period_end ?? null,
              });
      const planKey = inferPlanKey({
        planLabel: planName,
        planId: activePayment.plan_id ?? null,
        pricing: m.companyLanding.pricing as any,
      });

      setSubscription({
        planKey,
        planId: activePayment.plan_id ?? null,
        planName,
        currentPeriodStart: activePayment.current_period_start ?? null,
        currentPeriodEnd: activePayment.current_period_end ?? null,
        cancelAtPeriodEnd: activePayment.cancel_at_period_end ?? null,
        billing,
        providerStatus: (activePayment as any)?.provider_status ?? null,
        nextChargeAt: (activePayment as any)?.next_charge_at ?? null,
        retryNextAt: (activePayment as any)?.retry_next_at ?? null,
        retryCount: (activePayment as any)?.retry_count ?? null,
        graceEndsAt: (activePayment as any)?.grace_ends_at ?? null,
        cardCompany: (activePayment as any)?.card_company ?? null,
        cardNumberMasked: (activePayment as any)?.card_number_masked ?? null,
      });
      setIsSubscriptionLoading(false);
    }

    void fetchPlanPrices();
    loadSubscription();
    return () => {
      isCancelled = true;
    };
  }, [companyUser?.user_id, m]);

  return (
    <AppLayout initialCollapse={false}>
      <div className="px-6 py-8 w-full">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-3xl font-hedvig font-light tracking-tight text-neutral-primary">
              {m.system.credits}
            </div>
          </div>
          <MuteButton
            type="button"
            variant="critical"
            disabled={!canCancelSubscription}
            className="self-end"
            onClick={showPaymentUnavailable}
          >
            구독 취소
          </MuteButton>
        </div>

        <div className="mt-8">
          <div className="rounded-lg bg-bg-default border border-neutral-1000-a05 shadow-sm p-6">
            {isSubscriptionLoading ? (
              <div className="mt-2 text-sm text-neutral-primary">
                구독 정보를 불러오는 중...
              </div>
            ) : subscription ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-row items-end justify-between gap-6">
                  <div className="flex flex-col gap-2 text-sm w-[30%]">
                    <div className="text-sm text-neutral-primary font-normal">
                      구독 상태
                    </div>
                    <div className="text-neutral-primary">
                      <span className="text-neutral-primary text-xl font-medium">
                        {subscriptionPlanLabel}
                      </span>
                      <span className="text-neutral-primary">
                        {" "}
                        · {subscriptionBillingLabel}
                      </span>
                    </div>
                    {currentProviderStatus ? (
                      <div className="text-xs text-primary">
                        {currentProviderStatusLabel}
                      </div>
                    ) : null}
                    {subscription.currentPeriodEnd ? (
                      <div className="text-neutral-primary font-light">
                        구독 기간 종료일:{" "}
                        {dateToFormatLong(subscription.currentPeriodEnd)}
                      </div>
                    ) : null}
                  </div>
                  <div className="w-[70%] flex flex-col items-end justify-between h-full mb-2 gap-8">
                    {subscription.planKey !== "free" && (
                      <div className="w-full flex flex-row items-start justify-end">
                        {isRevealCardNumber && subscription.cardNumberMasked ? (
                          <div className="text-sm text-neutral-primary">
                            <Tooltips
                              text={`원본 전체 카드 정보는 저장하지 않고 있습니다.`}
                            >
                              <>
                                결제시 사용한 카드 번호:{" "}
                                {subscription.cardCompany
                                  ? `${subscription.cardCompany} · `
                                  : ""}
                                {subscription.cardNumberMasked}
                              </>
                            </Tooltips>
                          </div>
                        ) : (
                          <div className="relative px-4 py-1">
                            ****-****-****-****
                            <div
                              className="absolute left-0 top-0 text-center bg-bg-default/90 backdrop-blur-sm w-full py-1 rounded-sm text-[15px] text-neutral-primary cursor-pointer"
                              onClick={() => setIsRevealCardNumber(true)}
                            >
                              결제 카드 정보 보기
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="w-full flex flex-row items-center justify-end h-full mb-2">
                      <div className="w-[30%] flex flex-col items-start justify-end">
                        <div className="flex flex-row items-start justify-start gap-2 text-neutral-primary text-sm font-normal">
                          이번 달 남은 열람 횟수
                          <span className="text-primary">
                            {credits?.remain_credit}
                          </span>
                          <span className=""> / {credits?.charged_credit}</span>
                        </div>
                        {usageResetDateLabel ? (
                          <div className="mt-1 text-xs font-light text-neutral-muted">
                            (초기화 : {usageResetDateLabel})
                          </div>
                        ) : null}
                      </div>
                      <div className="w-[70%] flex relative rounded-xl h-1.5 bg-bg-weak">
                        <div
                          className="w-full flex absolute left-0 top-0 rounded-xl h-1.5 bg-black transition-all duration-500 ease-out"
                          style={{
                            width: `${Math.min(
                              ((credits?.remain_credit ?? 0) /
                                (credits?.charged_credit ?? 1)) *
                                100,
                              100
                            )}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
                {isPastDue ? (
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-info/30 bg-info-faded px-4 py-4 text-sm text-info">
                    <div>
                      미납 결제가 있습니다. 현재 결제 서비스를 이용할 수 없어요.
                    </div>
                    <MuteButton type="button" onClick={showPaymentUnavailable}>
                      카드 다시 등록
                    </MuteButton>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 text-sm text-neutral-primary">
                현재 활성 구독이 없습니다.
              </div>
            )}
          </div>
        </div>
        <PricingSection
          theme="cream"
          currentPlanKey={currentPlanKey}
          currentBilling={currentBilling}
          prices={planPrices}
          onClick={showPaymentUnavailable}
        />

        <section id="pricing-faq">
          <Animate>
            <div className="flex flex-col items-center justify-center w-full pt-4">
              <div className="font-hedvig text-lg mt-20">결제 및 구독 FAQ</div>
              <div className="flex flex-col items-start justify-start text-neutral-primary font-light w-full mt-10 px-4 md:px-0">
                {m.companyLanding.pricingFaq.items.map((item, index) => (
                  <QuestionAnswer
                    key={item.question}
                    question={item.question}
                    answer={item.answer}
                    index={index}
                    length={m.companyLanding.pricingFaq.items.length}
                    theme="cream"
                  />
                ))}
              </div>
            </div>
          </Animate>
        </section>
        <div>
          <div className="mt-24 text-neutral-primary font-light text-center mb-40 flex flex-col items-center justify-center">
            추가 문의 사항이 있으시다면, chris@matchharper.com으로 문의해
            주세요.
            <div
              className="mt-2 underline decoration-dotted cursor-pointer text-neutral-primary hover:text-neutral-primary"
              onClick={() =>
                window.open(
                  "https://peat-find-598.notion.site/Refund-policy-2e684af768c6800e8276ccbe16fc8cb4?pvs=74",
                  "_blank"
                )
              }
            >
              환불 규정
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Billing;
