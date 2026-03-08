import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/app";
import { useCredits } from "@/hooks/useCredit";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { supabase } from "@/lib/supabase";
import { useCreditRequestHistory } from "@/hooks/useCreditRequestHistory";
import { dateToFormatLong } from "@/utils/textprocess";
import { useMessages } from "@/i18n/useMessage";
import { showToast } from "@/components/toast/toast";
import PricingSection from "@/components/payment/PricingSection";
import ConfirmModal from "@/components/Modal/ConfirmModal";
import BaseModal from "@/components/Modal/BaseModal";
import { useLogEvent } from "@/hooks/useLog";
import QuestionAnswer from "@/components/landing/Questions";
import { BILLING_PROVIDER } from "@/lib/polar/config";
import { useRouter } from "next/router";
import Animate from "@/components/landing/Animate";
import {
  loadTossPayments,
  type TossPaymentsPayment,
} from "@tosspayments/tosspayments-sdk";
import { X } from "lucide-react";

const TOSS_BILLING_CLIENT_KEY =
  process.env.NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY ??
  process.env.NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY ??
  "";

type BillingPeriod = "monthly" | "yearly";

function getTossAmountKRW(planKey: "pro" | "max", billing: BillingPeriod) {
  const monthly = planKey === "pro" ? 149000 : 279000;
  if (billing === "monthly") {
    return monthly;
  }
  return Math.round(monthly * 0.8);
}

type SubscriptionInfo = {
  planKey: "pro" | "max" | "enterprise" | "free" | null;
  planId: string | null;
  planName: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  billing: BillingPeriod | null;
};

type TossCheckoutPreview = {
  planKey: "pro" | "max";
  planName: string;
  billing: BillingPeriod;
  amount: number;
};

type CreditFeedbackSelection = {
  planName: string;
  billing: BillingPeriod;
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

function getPlanKeyFromPlanName(args: {
  planName: string;
  pricing: {
    plans: {
      pro: { name: string };
      max: { name: string };
    };
  };
}): "pro" | "max" | null {
  if (args.planName === args.pricing.plans.pro.name) return "pro";
  if (args.planName === args.pricing.plans.max.name) return "max";
  return null;
}

function isDowngradeSelection(args: {
  currentPlanKey: SubscriptionInfo["planKey"];
  currentBilling: BillingPeriod | null;
  nextPlanKey: "pro" | "max" | null;
  nextBilling: BillingPeriod;
}) {
  const planDowngrade =
    args.currentPlanKey === "max" && args.nextPlanKey === "pro";
  const billingDowngrade =
    args.currentBilling === "yearly" && args.nextBilling === "monthly";
  return planDowngrade || billingDowngrade;
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
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isDowngradeGuideOpen, setIsDowngradeGuideOpen] = useState(false);
  const [isUpgradeConfirmOpen, setIsUpgradeConfirmOpen] = useState(false);
  const [pendingUpgradeChange, setPendingUpgradeChange] = useState<{
    planName: string;
    billing: "monthly" | "yearly";
  } | null>(null);
  const [isUpgradeConfirming, setIsUpgradeConfirming] = useState(false);
  const [tossPreview, setTossPreview] = useState<TossCheckoutPreview | null>(
    null
  );
  const [isTossBillingLoading, setIsTossBillingLoading] = useState(false);
  const [tossPreviewError, setTossPreviewError] = useState<string | null>(null);
  const [isBillingAgreementChecked, setIsBillingAgreementChecked] =
    useState(false);
  const [isCreditFeedbackModalOpen, setIsCreditFeedbackModalOpen] =
    useState(false);
  const [creditFeedbackSelection, setCreditFeedbackSelection] =
    useState<CreditFeedbackSelection | null>(null);
  const [creditFeedbackText, setCreditFeedbackText] = useState("");
  const [isCreditFeedbackSubmitting, setIsCreditFeedbackSubmitting] =
    useState(false);
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
  const closeTossPreview = () => {
    setTossPreview(null);
    setTossPreviewError(null);
    setIsTossBillingLoading(false);
    setIsBillingAgreementChecked(false);
  };

  const closeCreditFeedbackModal = () => {
    if (isCreditFeedbackSubmitting) return;
    setIsCreditFeedbackModalOpen(false);
    setCreditFeedbackSelection(null);
    setCreditFeedbackText("");
  };

  const submitCreditFeedback = async () => {
    const content = creditFeedbackText.trim();
    if (!content || isCreditFeedbackSubmitting) return;
    if (!creditFeedbackSelection) {
      showToast({
        message: "선택한 구독 정보를 확인할 수 없습니다.",
        variant: "white",
      });
      return;
    }

    setIsCreditFeedbackSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        showToast({
          message: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.",
          variant: "white",
        });
        return;
      }

      const response = await fetch("/api/feedback/credit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          content,
          planName: creditFeedbackSelection.planName,
          billing: creditFeedbackSelection.billing,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || data?.error) {
        throw new Error(data?.error ?? "피드백 제출에 실패했습니다.");
      }

      setIsCreditFeedbackModalOpen(false);
      setCreditFeedbackSelection(null);
      setCreditFeedbackText("");
      showToast({
        message: "요청이 접수되었습니다. 빠르게 연락드리겠습니다.",
        variant: "white",
      });
    } catch (error) {
      console.error("credit feedback submit failed:", error);
      showToast({
        message: "제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        variant: "white",
      });
    } finally {
      setIsCreditFeedbackSubmitting(false);
    }
  };

  const startCheckout = async (
    planName: string,
    billing: "monthly" | "yearly",
    _options?: {
      allowSubscriptionSwitch?: boolean;
    }
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

    setTossPreview({
      planKey,
      planName,
      billing,
      amount: getTossAmountKRW(planKey, billing),
    });
    setTossPreviewError(null);
    setIsBillingAgreementChecked(false);
  };

  const requestSubscriptionCancel = async () => {
    if (!companyUser?.user_id) {
      showToast({
        message: "로그인 정보를 확인할 수 없습니다.",
        variant: "white",
      });
      return false;
    }

    if (!canCancelSubscription) {
      showToast({
        message: "이미 구독 취소가 예약되어 있습니다.",
        variant: "white",
      });
      return false;
    }

    setIsCanceling(true);
    try {
      const cancelEndpoint =
        BILLING_PROVIDER === "polar"
          ? "/api/polar/cancel"
          : "/api/lemonsqueezy/cancel";
      const res = await fetch(cancelEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: companyUser.user_id,
        }),
      });
      if (!res.ok) {
        showToast({
          message: "구독 취소에 실패했습니다.",
          variant: "white",
        });
        return false;
      }

      setSubscription((prev) =>
        prev ? { ...prev, cancelAtPeriodEnd: true } : prev
      );
      showToast({
        message: "구독 취소 요청이 완료되었습니다.",
        variant: "white",
      });
      return true;
    } catch {
      showToast({
        message: "구독 취소 중 오류가 발생했습니다.",
        variant: "white",
      });
      return false;
    } finally {
      setIsCanceling(false);
    }
  };

  const requestBillingAuth = async () => {
    if (!tossPreview) {
      setTossPreviewError("먼저 플랜을 선택해주세요.");
      return;
    }

    if (!companyUser?.user_id) {
      setTossPreviewError("로그인 정보를 확인할 수 없습니다.");
      return;
    }

    if (!TOSS_BILLING_CLIENT_KEY) {
      setTossPreviewError(
        "NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY(또는 NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY)가 설정되지 않았습니다."
      );
      return;
    }

    if (TOSS_BILLING_CLIENT_KEY.includes("_gck_")) {
      setTossPreviewError(
        "현재 코드는 결제창/빌링 방식입니다. API 개별 연동 키(test_ck_/live_ck_)를 넣어주세요."
      );
      return;
    }

    if (!TOSS_BILLING_CLIENT_KEY.includes("_ck_")) {
      setTossPreviewError(
        "API 개별 연동 키 형식이 아닙니다. test_ck_ 또는 live_ck_ 키를 확인해주세요."
      );
      return;
    }

    setIsTossBillingLoading(true);
    setTossPreviewError(null);

    try {
      const tossPayments = await loadTossPayments(TOSS_BILLING_CLIENT_KEY);
      const payment: TossPaymentsPayment = tossPayments.payment({
        customerKey: companyUser.user_id,
      });

      const successUrl = `${window.location.origin}/my/billing?billing_auth=success`;
      const failUrl = `${window.location.origin}/my/billing?billing_auth=fail`;

      await payment.requestBillingAuth({
        method: "CARD",
        successUrl,
        failUrl,
        customerEmail: companyUser.email ?? undefined,
        customerName: companyUser.name ?? undefined,
      });
    } catch (error) {
      console.error("Failed to request toss billing auth:", error);
      const code =
        typeof (error as { code?: unknown })?.code === "string"
          ? ((error as { code?: string }).code as string)
          : "UNKNOWN_ERROR";
      const message =
        typeof (error as { message?: unknown })?.message === "string"
          ? ((error as { message?: string }).message as string)
          : "알 수 없는 오류";
      setTossPreviewError(
        `카드 등록창을 띄우지 못했습니다. (${code}) ${message}`
      );
    } finally {
      setIsTossBillingLoading(false);
    }
  };

  useEffect(() => {
    if (!router.isReady) return;
    const status = router.query.billing_auth;
    if (status !== "success" && status !== "fail") return;

    if (status === "success") {
      showToast({
        message: "카드 등록 인증이 완료되었습니다. (테스트)",
        variant: "white",
      });
    } else {
      const failMessage =
        typeof router.query.message === "string" ? router.query.message : null;
      showToast({
        message: failMessage
          ? `카드 등록 인증 실패: ${failMessage}`
          : "카드 등록 인증이 실패했습니다.",
        variant: "white",
      });
    }

    void router.replace("/my/billing", undefined, { shallow: true });
  }, [router]);

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
      for (const delayMs of [3000, 7000, 13000]) {
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

  return (
    <AppLayout initialCollapse={false}>
      {isCreditFeedbackModalOpen ? (
        <BaseModal
          onClose={closeCreditFeedbackModal}
          onConfirm={() => {
            void submitCreditFeedback();
          }}
          confirmLabel="제출하기"
          isLoading={isCreditFeedbackSubmitting}
          size="sm"
        >
          <div className="text-base font-normal text-hgray900">구독 문의</div>
          <p className="mt-3 text-sm text-hgray800 font-normal leading-relaxed">
            현재 결제는 각 사용자 분들을 직접 온보딩 해드리고 있습니다.
            <br />
            어떤 이유로, 얼마나 크레딧이 필요하신지 간략하게 적어주시면 바로
            도와드리겠습니다!
          </p>
          <textarea
            value={creditFeedbackText}
            onChange={(e) => setCreditFeedbackText(e.target.value)}
            rows={4}
            placeholder="예) Pro 구독 하겠습니다."
            className="w-full mt-4 text-white rounded-lg border font-light border-white/10 bg-white/5 p-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-white/10 resize-none"
          />
        </BaseModal>
      ) : null}
      <ConfirmModal
        open={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={async () => {
          const ok = await requestSubscriptionCancel();
          if (ok) {
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
        open={isDowngradeGuideOpen}
        onClose={() => setIsDowngradeGuideOpen(false)}
        onConfirm={async () => {
          const ok = await requestSubscriptionCancel();
          if (ok) {
            setIsDowngradeGuideOpen(false);
          }
        }}
        title="구독 변경"
        description={
          freeStartDateLabel
            ? `다운그레이드의 경우 우선 구독을 취소하고 기존 구독 갱신 날짜(<span class="text-accenta1 px-1">${freeStartDateLabel}</span>) 이후 새로운 플랜으로 결제하시는 것을 추천드립니다.`
            : "다운그레이드의 경우 우선 구독을 취소하고 기존 구독 갱신 날짜 이후 새로운 플랜으로 결제하시는 것을 추천드립니다."
        }
        confirmLabel="구독 취소"
        cancelLabel="닫기"
        isLoading={isCanceling}
      />
      <ConfirmModal
        open={isUpgradeConfirmOpen}
        onClose={() => {
          if (isUpgradeConfirming) return;
          setIsUpgradeConfirmOpen(false);
          setPendingUpgradeChange(null);
        }}
        onConfirm={async () => {
          if (!pendingUpgradeChange) {
            setIsUpgradeConfirmOpen(false);
            return;
          }

          setIsUpgradeConfirming(true);
          try {
            await startCheckout(
              pendingUpgradeChange.planName,
              pendingUpgradeChange.billing,
              {
                allowSubscriptionSwitch: true,
              }
            );
          } finally {
            setIsUpgradeConfirming(false);
            setIsUpgradeConfirmOpen(false);
            setPendingUpgradeChange(null);
          }
        }}
        title="플랜 변경을 진행할까요?"
        description="확인하면 즉시 결제가 진행되며 결제 완료 직후 새 플랜으로 변경됩니다. 기존 구독은 자동으로 종료됩니다."
        confirmLabel="확인하고 결제 진행"
        cancelLabel="닫기"
        isLoading={isUpgradeConfirming}
      />
      <div className="px-6 py-8 w-full">
        <div className="text-3xl font-hedvig font-light tracking-tight text-white">
          {m.system.credits}
        </div>

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
              const nextPlanKey = getPlanKeyFromPlanName({
                planName,
                pricing,
              });
              const isDowngrade = isDowngradeSelection({
                currentPlanKey: subscription.planKey,
                currentBilling: subscription.billing,
                nextPlanKey,
                nextBilling: billing,
              });
              if (isDowngrade) {
                setIsDowngradeGuideOpen(true);
                return;
              }

              setPendingUpgradeChange({ planName, billing });
              setIsUpgradeConfirmOpen(true);
              return;
            }

            const isSubscribeAction =
              !!subscription && subscription.planKey === "free";
            if (isSubscribeAction) {
              setCreditFeedbackSelection({ planName, billing });
              setCreditFeedbackText("");
              setIsCreditFeedbackModalOpen(true);
              return;
            }

            await startCheckout(planName, billing);
          }}
        />

        {tossPreview ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
            <button
              type="button"
              aria-label="close toss preview modal"
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
              onClick={closeTossPreview}
            />
            <div className="relative z-[71] w-full max-w-[560px] rounded-[24px] border border-white/10 bg-hgray200 p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-hgray900">
                    결제 정보를 확인해주세요
                  </div>
                  <div className="mt-1 text-white text-lg font-medium">
                    {tossPreview.planName} ·{" "}
                    {tossPreview.billing === "yearly" ? "연간" : "월간"}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-sm text-hgray700 hover:text-white transition-colors"
                  onClick={closeTossPreview}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {tossPreviewError ? (
                <div className="mt-4 rounded-md border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {tossPreviewError}
                </div>
              ) : null}

              <div className="mt-5 border border-hgray900/30 bg-hgray900/10 px-4 py-4">
                <div className="text-xs text-hgray700">결제 예정 금액</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight text-accenta1">
                  {tossPreview.amount.toLocaleString("ko-KR")}원
                </div>
              </div>

              <label className="mt-5 flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isBillingAgreementChecked}
                  onChange={(e) =>
                    setIsBillingAgreementChecked(e.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-white/30 bg-transparent accent-accenta1"
                />
                <span className="text-sm text-hgray800">
                  <a
                    href="https://peat-find-598.notion.site/Refund-policy-2e684af768c6800e8276ccbe16fc8cb4?pvs=74"
                    target="_blank"
                    className="text-hgray1000 decoration-dotted underline"
                  >
                    구매 조건 확인
                  </a>{" "}
                  및 결제 진행에 동의합니다.
                </span>
              </label>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl px-4 py-2 text-sm text-white hover:bg-white/5"
                  onClick={closeTossPreview}
                >
                  닫기
                </button>
                <button
                  type="button"
                  disabled={isTossBillingLoading || !isBillingAgreementChecked}
                  onClick={() => {
                    void requestBillingAuth();
                  }}
                  className="rounded-xl bg-accenta1 px-4 py-2 text-sm text-black hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isTossBillingLoading
                    ? "카드 등록창 여는 중..."
                    : "결제 진행"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section id="pricing-faq">
          <Animate>
            <div className="flex flex-col items-center justify-center w-full pt-4">
              <div className="font-hedvig text-lg mt-20">결제 및 구독 FAQ</div>
              <div className="flex flex-col items-start justify-start text-white/70 font-light w-full mt-10 px-4 md:px-0">
                {m.companyLanding.pricingFaq.items.map((item, index) => (
                  <QuestionAnswer
                    key={item.question}
                    question={item.question}
                    answer={item.answer}
                    index={index}
                    length={m.companyLanding.pricingFaq.items.length}
                  />
                ))}
              </div>
            </div>
          </Animate>
        </section>
        <div>
          <div className="mt-24 text-white/70 font-light text-center mb-40 flex flex-col items-center justify-center">
            추가 문의 사항이 있으시다면, chris@matchharper.com으로 문의해
            주세요.
            <div
              className="mt-2 underline decoration-dotted cursor-pointer text-hgray800 hover:text-hgray1000"
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
        <div className="mt-20 px-2 flex flex-row items-center justify-between">
          <button
            type="button"
            disabled={!canCancelSubscription || isCanceling}
            className="text-sm text-red-600/80 hover:text-red-600/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => setIsCancelModalOpen(true)}
          >
            {isCanceling ? "취소 중..." : "구독 취소"}
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default Billing;
