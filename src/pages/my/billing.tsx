import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/app";
import { useCredits } from "@/hooks/useCredit";
import RequestCreditModal from "@/components/Modal/RequestCreditModal";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { supabase } from "@/lib/supabase";
import { useCreditRequestHistory } from "@/hooks/useCreditRequestHistory";
import { dateToFormatLong } from "@/utils/textprocess";
import { useMessages } from "@/i18n/useMessage";
import { showToast } from "@/components/toast/toast";
import { notifyToSlack } from "@/lib/slack";
import PricingSection from "@/components/payment/PricingSection";
import ConfirmModal from "@/components/Modal/ConfirmModal";
import { useLogEvent } from "@/hooks/useLog";
import QuestionAnswer from "@/components/landing/Questions";
import { BILLING_PROVIDER } from "@/lib/polar/config";
import { useRouter } from "next/router";

const PRO_MONTHLY_CHECKOUT_URL =
  "https://matchharper.lemonsqueezy.com/checkout/buy/ea41e57e-6dc1-4ddd-8b7f-f5636bc35ec5";
const PRO_YEARLY_CHECKOUT_URL =
  "https://matchharper.lemonsqueezy.com/checkout/buy/c2397869-0c46-477d-9315-7cbb03c2d464";
const MAX_MONTHLY_CHECKOUT_URL =
  "https://matchharper.lemonsqueezy.com/checkout/buy/0526b657-757f-45bb-bc9f-4466a6ec360f";
const MAX_YEARLY_CHECKOUT_URL =
  "https://matchharper.lemonsqueezy.com/checkout/buy/5f88e60e-f43f-4699-b4a1-3a71fe90b13d";

type BillingPeriod = "monthly" | "yearly";

type SubscriptionInfo = {
  planKey: "pro" | "max" | "enterprise" | "free" | null;
  planId: string | null;
  planName: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  billing: BillingPeriod | null;
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

const Billing = () => {
  const { credits, refetch: refetchCredits } = useCredits();
  const router = useRouter();
  const { companyUser } = useCompanyUserStore();
  const { refetch: refetchCreditRequestHistory } = useCreditRequestHistory(
    companyUser?.user_id
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null
  );
  const [isCanceling, setIsCanceling] = useState(false);
  const [isPlanChanging, setIsPlanChanging] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isPlanChangeConfirmOpen, setIsPlanChangeConfirmOpen] = useState(false);
  const [pendingPlanChange, setPendingPlanChange] = useState<{
    planName: string;
    billing: "monthly" | "yearly";
  } | null>(null);
  const { m } = useMessages();
  const logEvent = useLogEvent();
  const pricing = m.companyLanding.pricing;
  const isCheckoutSync = router.query.checkout_synced === "1";
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
    !subscription.cancelAtPeriodEnd;
  const freeStartDateLabel = subscription?.currentPeriodEnd
    ? dateToFormatLong(subscription.currentPeriodEnd)
    : "";

  const startCheckout = async (
    planName: string,
    billing: "monthly" | "yearly"
  ) => {
    const proName = m.companyLanding.pricing.plans.pro.name;
    const maxName = m.companyLanding.pricing.plans.max.name;
    logEvent(
      `enter_billing_checkout, planName: ${planName}, billing: ${billing}`
    );

    if (!companyUser?.user_id) {
      showToast({
        message: "로그인 정보를 확인할 수 없습니다.",
        variant: "white",
      });
      return;
    }

    let url: URL | null = null;
    let planKey: "pro" | "max" | null = null;
    if (planName === proName) {
      planKey = "pro";
      url = new URL(
        billing === "yearly"
          ? PRO_YEARLY_CHECKOUT_URL
          : PRO_MONTHLY_CHECKOUT_URL
      );
    } else if (planName === maxName) {
      planKey = "max";
      url = new URL(
        billing === "yearly"
          ? MAX_YEARLY_CHECKOUT_URL
          : MAX_MONTHLY_CHECKOUT_URL
      );
    } else {
      showToast({
        message: "현재는 Pro, Max 플랜만 테스트 중입니다.",
        variant: "white",
      });
      return;
    }

    if (BILLING_PROVIDER === "polar" && planKey) {
      try {
        const res = await fetch("/api/polar/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: companyUser.user_id,
            planKey,
            billing,
          }),
        });

        if (!res.ok) {
          let errorMessage = `Polar 결제 세션 생성에 실패했습니다. (status ${res.status})`;
          try {
            const payload = await res.json();
            const detail =
              typeof payload?.message === "string"
                ? payload.message
                : typeof payload?.error === "string"
                  ? payload.error
                  : null;
            if (detail) {
              errorMessage = `${errorMessage} ${detail}`;
            }
          } catch {
            // Keep generic fallback message.
          }

          console.error("Polar checkout create failed", {
            status: res.status,
            planKey,
            billing,
          });
          showToast({
            message: errorMessage,
            variant: "white",
          });
          return;
        }

        const data = await res.json();
        const checkoutUrl =
          typeof data?.url === "string" && data.url.length > 0
            ? data.url
            : null;
        if (!checkoutUrl) {
          showToast({
            message: "Polar 결제 URL을 확인할 수 없습니다.",
            variant: "white",
          });
          return;
        }

        window.location.href = checkoutUrl;
        return;
      } catch {
        showToast({
          message: "Polar 결제 요청 중 오류가 발생했습니다.",
          variant: "white",
        });
        return;
      }
    }

    if (!url) {
      showToast({
        message: "결제 URL을 확인할 수 없습니다.",
        variant: "white",
      });
      return;
    }

    url.searchParams.set("checkout[custom][user_id]", companyUser.user_id);
    window.location.href = url.toString();
  };

  const changePlanWithPolarUpdate = async (
    planName: string,
    billing: "monthly" | "yearly"
  ) => {
    const proName = m.companyLanding.pricing.plans.pro.name;
    const maxName = m.companyLanding.pricing.plans.max.name;

    if (!companyUser?.user_id) {
      showToast({
        message: "로그인 정보를 확인할 수 없습니다.",
        variant: "white",
      });
      return;
    }

    let planKey: "pro" | "max" | null = null;
    if (planName === proName) {
      planKey = "pro";
    } else if (planName === maxName) {
      planKey = "max";
    } else {
      showToast({
        message: "현재는 Pro, Max 플랜만 테스트 중입니다.",
        variant: "white",
      });
      return;
    }

    if (BILLING_PROVIDER !== "polar") {
      await startCheckout(planName, billing);
      return;
    }

    setIsPlanChanging(true);
    try {
      const res = await fetch("/api/polar/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: companyUser.user_id,
          planKey,
          billing,
        }),
      });

      if (!res.ok) {
        let errorMessage = `구독 플랜 변경에 실패했습니다. (status ${res.status})`;
        try {
          const payload = await res.json();
          const detail =
            typeof payload?.message === "string"
              ? payload.message
              : typeof payload?.error === "string"
                ? payload.error
                : null;
          if (detail) {
            errorMessage = `${errorMessage} ${detail}`;
          }
        } catch {
          // Keep generic fallback message.
        }
        showToast({
          message: errorMessage,
          variant: "white",
        });
        return;
      }

      const payload = await res.json();
      if (payload?.status === "no_change") {
        showToast({
          message: "이미 동일한 플랜을 사용 중입니다.",
          variant: "white",
        });
      } else {
        showToast({
          message:
            "플랜이 즉시 변경되었습니다. 요금 정산은 Polar 정책에 따라 즉시 또는 다음 청구서에서 처리될 수 있습니다.",
          variant: "white",
        });
      }

      await router.replace("/my/billing?checkout_synced=1", undefined, {
        shallow: true,
      });
    } catch {
      showToast({
        message: "플랜 변경 요청 중 오류가 발생했습니다.",
        variant: "white",
      });
    } finally {
      setIsPlanChanging(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;
    const retryTimers: number[] = [];

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
            plans (
              plan_id,
              name,
              display_name,
              cycle
            )
          `
        )
        .eq("user_id", companyUser.user_id)
        .gte("current_period_end", nowIso)
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
      });
      setIsSubscriptionLoading(false);
    }

    loadSubscription();
    if (isCheckoutSync) {
      for (const delayMs of [2000, 5000, 9000]) {
        const timerId = window.setTimeout(() => {
          void loadSubscription();
          void refetchCredits();
        }, delayMs);
        retryTimers.push(timerId);
      }
      const cleanupTimer = window.setTimeout(() => {
        router.replace("/my/billing", undefined, { shallow: true });
      }, 12000);
      retryTimers.push(cleanupTimer);
    }

    return () => {
      isCancelled = true;
      for (const timerId of retryTimers) {
        window.clearTimeout(timerId);
      }
    };
  }, [companyUser?.user_id, isCheckoutSync, m, refetchCredits, router]);

  const onConfirm = async (credit_num: number) => {
    if (!companyUser?.user_id) return false;
    setIsLoading(true);
    const { error } = await supabase.from("credit_request").insert({
      user_id: companyUser.user_id,
      credit_num: credit_num,
    });
    await notifyToSlack(`💳 *Credit Request*

• *이름*: *${companyUser.name}* (${companyUser?.company ?? "회사 정보 없음"})
• *이메일*: ${companyUser.email}
• *요청 크레딧*: *${credit_num}*
• *요청 시간*: ${new Date().toLocaleString("ko-KR")}`);
    refetchCreditRequestHistory();
    setIsLoading(false);
    return true;
  };

  return (
    <AppLayout initialCollapse={false}>
      <ConfirmModal
        open={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={async () => {
          if (!companyUser?.user_id) {
            showToast({
              message: "로그인 정보를 확인할 수 없습니다.",
              variant: "white",
            });
            return;
          }
          if (!canCancelSubscription) return;

          setIsCanceling(true);
          try {
            const cancelEndpoint =
              BILLING_PROVIDER === "polar"
                ? "/api/polar/cancel"
                : "/api/lemonsqueezy/cancel";
            const res = await fetch(cancelEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: companyUser.user_id }),
            });
            if (!res.ok) {
              showToast({
                message: "구독 취소에 실패했습니다.",
                variant: "white",
              });
              return;
            }
            setSubscription((prev) =>
              prev ? { ...prev, cancelAtPeriodEnd: true } : prev
            );
            showToast({
              message: "구독 취소 요청이 완료되었습니다.",
              variant: "white",
            });
          } catch (error) {
            showToast({
              message: "구독 취소 중 오류가 발생했습니다.",
              variant: "white",
            });
          } finally {
            setIsCanceling(false);
            setIsCancelModalOpen(false);
          }
        }}
        isLoading={isCanceling}
        title="구독을 취소할까요?"
        description={
          freeStartDateLabel
            ? `현재 결제 주기 종료(<span class="text-accenta1 px-1">${freeStartDateLabel}</span>)후 Free 플랜으로 전환됩니다.`
            : "현재 결제 주기 종료 후 Free 플랜으로 전환됩니다."
        }
        confirmLabel="구독 취소"
        cancelLabel="닫기"
      />
      <ConfirmModal
        open={isPlanChangeConfirmOpen}
        onClose={() => {
          if (isPlanChanging) return;
          setIsPlanChangeConfirmOpen(false);
          setPendingPlanChange(null);
        }}
        onConfirm={async () => {
          if (!pendingPlanChange) {
            setIsPlanChangeConfirmOpen(false);
            return;
          }
          const next = pendingPlanChange;
          await changePlanWithPolarUpdate(next.planName, next.billing);
          setIsPlanChangeConfirmOpen(false);
          setPendingPlanChange(null);
        }}
        title="플랜 변경을 진행할까요?"
        description="플랜 변경은 즉시 적용됩니다. 요금 정산은 Polar 청구 정책에 따라 즉시 또는 다음 청구서에 반영될 수 있습니다."
        confirmLabel="확인하고 진행"
        cancelLabel="닫기"
        isLoading={isPlanChanging}
      />
      <div className="px-6 py-8 w-full">
        <div className="text-3xl font-hedvig font-light tracking-tight text-white">
          {m.system.credits}
        </div>
        {/* <div className="mt-4 text-sm text-hgray700 font-light">현재 베타 테스트 진행 중이며, 크레딧은 요청하신 만큼 지급될 예정입니다.<br />경우에 따라 추가 연락이 갈 수 있습니다.</div> */}
        {/* <div className="mt-8">
          <div className="rounded-lg bg-white/5 p-6">
            <div className="flex flex-col items-start justify-center">
              <div className="text-lg text-hgray900 font-normal">
                Credit Usage
              </div>
              <div className="mt-4 w-full flex relative rounded-xl h-2 bg-accenta1/20">
                <div
                  className="w-full flex absolute left-0 top-0 rounded-xl h-2 bg-accenta1 transition-all duration-500 ease-out"
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
              <div className="mt-2 w-full flex flex-row items-start justify-between">
                <div></div>
                <div>
                  <span className="text-accenta1">
                    {credits?.remain_credit}
                  </span>
                  <span className="text-hgray500">
                    {" "}
                    / {credits?.charged_credit}
                  </span>
                </div>
              </div>
              <div>
                <button
                  onClick={() => setIsRequestModalOpen(true)}
                  className="mt-4 text-accenta1 bg-accenta1/10 px-5 py-3 rounded-lg cursor-pointer text-sm font-normal"
                  disabled={isLoading}
                >
                  {isLoading ? m.loading.processing : m.system.credit_request}
                </button>
              </div>
            </div>
          </div>
        </div> */}

        <div className="mt-8">
          <div className="rounded-lg bg-white/5 p-6">
            {isSubscriptionLoading ? (
              <div className="mt-2 text-sm text-hgray700">
                구독 정보를 불러오는 중...
              </div>
            ) : subscription ? (
              <div className="flex flex-row items-start justify-between">
                <div className="flex flex-col gap-2 text-sm w-[30%]">
                  <div className="text-sm text-hgray900 font-normal">
                    구독 상태
                  </div>
                  <div className="text-hgray900">
                    <span className="text-white text-xl font-medium">
                      {subscriptionPlanLabel}
                    </span>
                    <span className="text-hgray700">
                      {" "}
                      · {subscriptionBillingLabel}
                    </span>
                  </div>
                  {subscription.currentPeriodEnd ? (
                    <div className="text-hgray700 font-light">
                      {subscription.cancelAtPeriodEnd
                        ? "기간 종료 후 해지 예정"
                        : "다음 결제일"}
                      : {dateToFormatLong(subscription.currentPeriodEnd)}
                    </div>
                  ) : null}
                </div>
                <div className="w-[70%] flex items-end justify-end flex-col h-full">
                  <div className="w-full flex flex-row items-start justify-start gap-2 text-hgray900 text-sm font-normal">
                    Credit 사용량
                    <span className="text-accenta1">
                      {credits?.remain_credit}
                    </span>
                    <span className=""> / {credits?.charged_credit}</span>
                  </div>
                  <div className="mt-2 w-full flex relative rounded-xl h-2 bg-accenta1/20">
                    <div
                      className="w-full flex absolute left-0 top-0 rounded-xl h-2 bg-accenta1 transition-all duration-500 ease-out"
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
            ) : (
              <div className="mt-2 text-sm text-hgray700">
                현재 활성 구독이 없습니다.
              </div>
            )}
          </div>
        </div>

        <PricingSection
          currentPlanKey={currentPlanKey}
          currentBilling={currentBilling}
          onClick={async (planName: string, billing: "monthly" | "yearly") => {
            const isPlanChange =
              !!subscription && subscription.planKey !== "free";
            if (isPlanChange) {
              setPendingPlanChange({ planName, billing });
              setIsPlanChangeConfirmOpen(true);
              return;
            }

            await startCheckout(planName, billing);
          }}
        />

        <div>
          <div className="font-hedvig text-lg mt-20">결제 및 구독 FAQ</div>
          <br />
          <QuestionAnswer
            key={"item.question"}
            question={"크레딧은 언제 차감되나요?"}
            answer={
              "검색이 실제로 실행될 때만 1회 차감됩니다. 실패한 검색이나 중단된 요청에는 크레딧이 차감되지 않습니다."
            }
            index={0}
            variant="small"
          />
          <QuestionAnswer
            key={"item.question2"}
            question={"크레딧은 매달 초기화되나요?"}
            answer={
              "네. 구독 갱신 시 크레딧은 새로 지급되며 이월되지는 않습니다."
            }
            index={1}
            variant="small"
          />
          <QuestionAnswer
            key={"item.question3"}
            question={"주기 중간에 플랜을 변경하면 어떻게 되나요?"}
            answer={
              "플랜 변경은 구독 업데이트로 즉시 반영됩니다. 요금 차액은 Polar 청구 정책에 따라 즉시 또는 다음 청구서에서 정산됩니다."
            }
            index={3}
            variant="small"
          />
        </div>

        <div className="mt-20 px-2 flex flex-row items-center justify-between">
          <button
            type="button"
            disabled={!canCancelSubscription || isCanceling}
            className="text-sm text-red-600/80 hover:text-red-600/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => setIsCancelModalOpen(true)}
          >
            {isCanceling ? "취소 중..." : "구독 취소"}
          </button>
          <button className="text-sm text-white/50 hover:text-white/70 transition-colors">
            환불 정책
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default Billing;
