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
import { useLogEvent } from "@/hooks/useLog";
import QuestionAnswer from "@/components/landing/Questions";
import { useRouter } from "next/router";
import Animate from "@/components/landing/Animate";
import {
  loadTossPayments,
  type TossPaymentsPayment,
} from "@tosspayments/tosspayments-sdk";
import { X } from "lucide-react";
import {
  getActiveSubscriptionOrFilter,
  type BillingPeriod,
  type BillingProvider,
  type BillingProviderStatus,
  type BillingSessionReason,
} from "@/lib/billing/common";
import { logger } from "@/utils/logger";
import { Tooltips } from "@/components/ui/tooltip";

function formatDateToDots(dateStr?: string | null) {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

type SubscriptionInfo = {
  planKey: "pro" | "max" | "enterprise" | "free" | null;
  planId: string | null;
  planName: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  billing: BillingPeriod | null;
  provider: BillingProvider | null;
  providerStatus: BillingProviderStatus | null;
  nextChargeAt: string | null;
  retryNextAt: string | null;
  retryCount: number | null;
  graceEndsAt: string | null;
  cardCompany: string | null;
  cardNumberMasked: string | null;
  lsSubscriptionId: string | null;
};

type TossCheckoutPreview = {
  planKey: "pro" | "max";
  planName: string;
  billing: BillingPeriod;
  amount: number;
  clientKey: string;
  customerKey: string;
  sessionToken: string;
  successUrl: string;
  failUrl: string;
  reason: BillingSessionReason;
};

type OneTimePaymentPreview = {
  amount: number;
  orderId: string;
  orderName: string;
  clientKey: string;
  customerKey: string;
  successUrl: string;
  failUrl: string;
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

function inferProvider(
  value?: string | null,
  legacySubscriptionId?: string | null
) {
  if (value === "toss" || value === "polar" || value === "lemonsqueezy") {
    return value;
  }
  if (legacySubscriptionId) {
    return "polar" as const;
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
  const [isRevealCardNumber, setIsRevealCardNumber] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null
  );
  const [planPrices, setPlanPrices] = useState<PlanPriceMap | null>(null);
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
  const [isOneTimePaymentLoading, setIsOneTimePaymentLoading] = useState(false);
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
  const currentProvider = subscription?.provider ?? null;
  const currentProviderStatus = subscription?.providerStatus ?? null;
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
  const freeStartDateLabel = subscription?.currentPeriodEnd
    ? dateToFormatLong(subscription.currentPeriodEnd)
    : "";
  const usageResetDateLabel = formatDateToDots(subscription?.currentPeriodEnd);
  const retryDateLabel = formatDateToDots(subscription?.retryNextAt);
  const isTossPastDue =
    currentProvider === "toss" && currentProviderStatus === "past_due";
  const isTossCancelScheduled =
    currentProvider === "toss" && currentProviderStatus === "cancel_scheduled";
  const canRecoverBilling =
    isTossPastDue &&
    (subscription?.planKey === "pro" || subscription?.planKey === "max") &&
    !!subscription.billing;
  const closeTossPreview = () => {
    setTossPreview(null);
    setTossPreviewError(null);
    setIsTossBillingLoading(false);
    setIsBillingAgreementChecked(false);
  };

  const requestOneTimePayment = async () => {
    if (!companyUser?.user_id) {
      showToast({
        message: "로그인 정보를 확인할 수 없습니다.",
        variant: "white",
      });
      return;
    }

    setIsOneTimePaymentLoading(true);
    try {
      const res = await fetch("/api/toss/payments/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: companyUser.user_id,
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | (OneTimePaymentPreview & { error?: never })
        | { error?: string }
        | null;

      if (!res.ok || !payload || "error" in payload) {
        showToast({
          message:
            payload && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "일회성 결제창을 준비하지 못했습니다.",
          variant: "white",
        });
        return;
      }

      const preview = payload as OneTimePaymentPreview;

      if (!preview.clientKey.includes("_ck_")) {
        showToast({
          message: "일회성 결제에는 Toss API 개별 연동 키가 필요합니다.",
          variant: "white",
        });
        return;
      }

      const tossPayments = await loadTossPayments(preview.clientKey);
      const payment: TossPaymentsPayment = tossPayments.payment({
        customerKey: preview.customerKey,
      });

      logger.log(`\n\n🐙 ${preview} \n\n`);

      await payment.requestPayment({
        method: "CARD",
        amount: {
          value: preview.amount,
          currency: "KRW",
        },
        orderId: preview.orderId,
        orderName: preview.orderName,
        successUrl: preview.successUrl,
        failUrl: preview.failUrl,
        customerEmail: companyUser.email ?? undefined,
        customerName: companyUser.name ?? undefined,
      });
    } catch (error) {
      console.error("Failed to request one-time toss payment:", error);
      const message =
        typeof (error as { message?: unknown })?.message === "string"
          ? ((error as { message?: string }).message as string)
          : "알 수 없는 오류";
      showToast({
        message: `일회성 결제창을 띄우지 못했습니다. ${message}`,
        variant: "white",
      });
    } finally {
      setIsOneTimePaymentLoading(false);
    }
  };

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

  const prepareTossCheckout = async (args: {
    planKey: "pro" | "max";
    planName: string;
    billing: BillingPeriod;
    reason: BillingSessionReason;
  }) => {
    if (!companyUser?.user_id) {
      showToast({
        message: "로그인 정보를 확인할 수 없습니다.",
        variant: "white",
      });
      return false;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/toss/subscriptions/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: companyUser.user_id,
          planKey: args.planKey,
          billing: args.billing,
          reason: args.reason,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        showToast({
          message:
            typeof payload?.error === "string"
              ? payload.error
              : "Toss 결제 세션 생성에 실패했습니다.",
          variant: "white",
        });
        return false;
      }

      setTossPreview({
        planKey: args.planKey,
        planName: args.planName,
        billing: args.billing,
        amount: Number(payload?.amount ?? 0),
        clientKey: String(payload?.clientKey ?? ""),
        customerKey: String(payload?.customerKey ?? ""),
        sessionToken: String(payload?.sessionToken ?? ""),
        successUrl: String(payload?.successUrl ?? ""),
        failUrl: String(payload?.failUrl ?? ""),
        reason: args.reason,
      });
      setTossPreviewError(null);
      setIsBillingAgreementChecked(false);
      return true;
    } catch (error) {
      console.error("Failed to prepare toss checkout:", error);
      showToast({
        message: "Toss 결제 세션 생성 중 오류가 발생했습니다.",
        variant: "white",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const startLegacyCheckout = async (args: {
    planKey: "pro" | "max";
    billing: BillingPeriod;
    allowSubscriptionSwitch: boolean;
  }) => {
    if (!companyUser?.user_id) {
      showToast({
        message: "로그인 정보를 확인할 수 없습니다.",
        variant: "white",
      });
      return;
    }

    setIsLoading(true);
    try {
      if (currentProvider === "polar" && args.allowSubscriptionSwitch) {
        const res = await fetch("/api/polar/change-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: companyUser.user_id,
            planKey: args.planKey,
            billing: args.billing,
          }),
        });

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          showToast({
            message:
              typeof payload?.error === "string"
                ? payload.error
                : "기존 구독 플랜 변경에 실패했습니다.",
            variant: "white",
          });
          return;
        }

        showToast({
          message: "기존 구독 플랜 변경이 완료되었습니다.",
          variant: "white",
        });
        void refetchCredits();
        void router.replace("/my/billing?checkout_synced=1", undefined, {
          shallow: true,
        });
        return;
      }

      const res = await fetch("/api/polar/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: companyUser.user_id,
          planKey: args.planKey,
          billing: args.billing,
          allowSubscriptionSwitch: args.allowSubscriptionSwitch,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || typeof payload?.url !== "string") {
        showToast({
          message:
            typeof payload?.error === "string"
              ? payload.error
              : "기존 결제 세션 생성에 실패했습니다.",
          variant: "white",
        });
        return;
      }

      window.location.href = payload.url;
    } catch (error) {
      console.error("Failed to start legacy checkout:", error);
      showToast({
        message: "기존 결제 요청 중 오류가 발생했습니다.",
        variant: "white",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const requestTossPlanChange = async (args: {
    planKey: "pro" | "max";
    billing: BillingPeriod;
  }) => {
    if (!companyUser?.user_id) {
      showToast({
        message: "로그인 정보를 확인할 수 없습니다.",
        variant: "white",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/toss/subscriptions/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: companyUser.user_id,
          planKey: args.planKey,
          billing: args.billing,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        showToast({
          message:
            typeof payload?.error === "string"
              ? payload.error
              : "Toss 플랜 변경에 실패했습니다.",
          variant: "white",
        });
        return;
      }

      showToast({
        message:
          payload?.status === "no_change"
            ? "이미 동일한 플랜입니다."
            : "플랜 변경이 완료되었습니다.",
        variant: "white",
      });
      void refetchCredits();
      void refetchCreditRequestHistory();
      void router.replace("/my/billing?checkout_synced=1", undefined, {
        shallow: true,
      });
    } catch (error) {
      console.error("Failed to change toss plan:", error);
      showToast({
        message: "Toss 플랜 변경 중 오류가 발생했습니다.",
        variant: "white",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startCheckout = async (
    planName: string,
    billing: "monthly" | "yearly",
    options?: {
      allowSubscriptionSwitch?: boolean;
      reason?: BillingSessionReason;
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

    if (options?.reason === "recover") {
      await prepareTossCheckout({
        planKey,
        planName,
        billing,
        reason: "recover",
      });
      return;
    }

    if (!subscription || subscription.planKey === "free" || !currentProvider) {
      await prepareTossCheckout({
        planKey,
        planName,
        billing,
        reason: "signup",
      });
      return;
    }

    if (currentProvider === "toss") {
      if (!options?.allowSubscriptionSwitch) {
        await prepareTossCheckout({
          planKey,
          planName,
          billing,
          reason: "signup",
        });
        return;
      }

      await requestTossPlanChange({
        planKey,
        billing,
      });
      return;
    }

    await startLegacyCheckout({
      planKey,
      billing,
      allowSubscriptionSwitch: Boolean(options?.allowSubscriptionSwitch),
    });
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
        currentProvider === "toss"
          ? "/api/toss/subscriptions/cancel"
          : currentProvider === "lemonsqueezy"
            ? "/api/lemonsqueezy/cancel"
            : "/api/polar/cancel";
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
        prev
          ? {
              ...prev,
              cancelAtPeriodEnd: true,
              providerStatus:
                prev.provider === "toss"
                  ? "cancel_scheduled"
                  : prev.providerStatus,
            }
          : prev
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

    if (!tossPreview.clientKey) {
      setTossPreviewError("Toss 클라이언트 키를 확인할 수 없습니다.");
      return;
    }

    if (tossPreview.clientKey.includes("_gck_")) {
      setTossPreviewError(
        "현재 코드는 결제창/빌링 방식입니다. API 개별 연동 키(test_ck_/live_ck_)를 넣어주세요."
      );
      return;
    }

    if (!tossPreview.clientKey.includes("_ck_")) {
      setTossPreviewError(
        "API 개별 연동 키 형식이 아닙니다. test_ck_ 또는 live_ck_ 키를 확인해주세요."
      );
      return;
    }

    setIsTossBillingLoading(true);
    setTossPreviewError(null);

    try {
      const tossPayments = await loadTossPayments(tossPreview.clientKey);
      const payment: TossPaymentsPayment = tossPayments.payment({
        customerKey: tossPreview.customerKey,
      });

      logger.log(`\n\n🐙 ${tossPreview} \n\n`);

      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: tossPreview.successUrl,
        failUrl: tossPreview.failUrl,
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

    if (status === "fail") {
      const failMessage =
        typeof router.query.message === "string" ? router.query.message : null;
      showToast({
        message: failMessage
          ? `카드 등록 인증 실패: ${failMessage}`
          : "카드 등록 인증이 실패했습니다.",
        variant: "white",
      });
      void router.replace("/my/billing", undefined, { shallow: true });
      return;
    }

    const sessionToken =
      typeof router.query.session_token === "string"
        ? router.query.session_token
        : "";
    const authKey =
      typeof router.query.authKey === "string" ? router.query.authKey : "";
    const customerKey =
      typeof router.query.customerKey === "string"
        ? router.query.customerKey
        : "";

    if (!sessionToken || !authKey || !customerKey) {
      showToast({
        message: "결제 확인에 필요한 정보가 누락되었습니다.",
        variant: "white",
      });
      void router.replace("/my/billing", undefined, { shallow: true });
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    void (async () => {
      try {
        const res = await fetch("/api/toss/subscriptions/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionToken,
            authKey,
            customerKey,
          }),
        });

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          showToast({
            message:
              typeof payload?.error === "string"
                ? payload.error
                : "Toss 결제 확인에 실패했습니다.",
            variant: "white",
          });
          if (isMounted) {
            void router.replace("/my/billing", undefined, { shallow: true });
          }
          return;
        }

        showToast({
          message:
            payload?.status === "already_confirmed"
              ? "결제 상태를 동기화했습니다."
              : "카드 등록과 결제가 완료되었습니다.",
          variant: "white",
        });
        await Promise.all([refetchCredits(), refetchCreditRequestHistory()]);

        if (isMounted) {
          void router.replace("/my/billing?checkout_synced=1", undefined, {
            shallow: true,
          });
        }
      } catch (error) {
        console.error("Failed to confirm toss billing:", error);
        showToast({
          message: "Toss 결제 확인 중 오류가 발생했습니다.",
          variant: "white",
        });
        if (isMounted) {
          void router.replace("/my/billing", undefined, { shallow: true });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router, refetchCredits, refetchCreditRequestHistory]);

  useEffect(() => {
    if (!router.isReady) return;
    const status = router.query.one_time_payment;
    if (status !== "success" && status !== "fail") return;

    if (status === "fail") {
      const failMessage =
        typeof router.query.message === "string" ? router.query.message : null;
      showToast({
        message: failMessage
          ? `일회성 결제 실패: ${failMessage}`
          : "일회성 결제가 실패했습니다.",
        variant: "white",
      });
      void router.replace("/my/billing", undefined, { shallow: true });
      return;
    }

    const paymentKey =
      typeof router.query.paymentKey === "string"
        ? router.query.paymentKey
        : "";
    const orderId =
      typeof router.query.orderId === "string" ? router.query.orderId : "";
    const amount =
      typeof router.query.amount === "string" ? router.query.amount : "";

    if (!paymentKey || !orderId || !amount) {
      showToast({
        message: "일회성 결제 확인에 필요한 정보가 누락되었습니다.",
        variant: "white",
      });
      void router.replace("/my/billing", undefined, { shallow: true });
      return;
    }

    let isMounted = true;
    setIsOneTimePaymentLoading(true);

    void (async () => {
      try {
        const res = await fetch("/api/toss/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount,
          }),
        });

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          showToast({
            message:
              typeof payload?.error === "string"
                ? payload.error
                : "일회성 결제 확인에 실패했습니다.",
            variant: "white",
          });
          if (isMounted) {
            void router.replace("/my/billing", undefined, { shallow: true });
          }
          return;
        }

        showToast({
          message:
            payload?.status === "already_confirmed"
              ? "일회성 결제 상태를 동기화했습니다."
              : "일회성 결제가 완료되었습니다.",
          variant: "white",
        });

        if (isMounted) {
          void router.replace("/my/billing", undefined, { shallow: true });
        }
      } catch (error) {
        console.error("Failed to confirm one-time toss payment:", error);
        showToast({
          message: "일회성 결제 확인 중 오류가 발생했습니다.",
          variant: "white",
        });
        if (isMounted) {
          void router.replace("/my/billing", undefined, { shallow: true });
        }
      } finally {
        if (isMounted) {
          setIsOneTimePaymentLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
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
            provider,
            provider_status,
            next_charge_at,
            retry_next_at,
            retry_count,
            grace_ends_at,
            card_company,
            card_number_masked,
            ls_subscription_id,
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
          provider: null,
          providerStatus: null,
          nextChargeAt: null,
          retryNextAt: null,
          retryCount: null,
          graceEndsAt: null,
          cardCompany: null,
          cardNumberMasked: null,
          lsSubscriptionId: null,
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
      const provider = inferProvider(
        (activePayment as any)?.provider ?? null,
        (activePayment as any)?.ls_subscription_id ?? null
      );
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
        provider,
        providerStatus: (activePayment as any)?.provider_status ?? null,
        nextChargeAt: (activePayment as any)?.next_charge_at ?? null,
        retryNextAt: (activePayment as any)?.retry_next_at ?? null,
        retryCount: (activePayment as any)?.retry_count ?? null,
        graceEndsAt: (activePayment as any)?.grace_ends_at ?? null,
        cardCompany: (activePayment as any)?.card_company ?? null,
        cardNumberMasked: (activePayment as any)?.card_number_masked ?? null,
        lsSubscriptionId: (activePayment as any)?.ls_subscription_id ?? null,
      });
      setIsSubscriptionLoading(false);
    }

    void fetchPlanPrices();
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
        {isLoading ? (
          <div className="mt-2 text-sm text-hgray700">
            결제 정보를 처리하는 중...
          </div>
        ) : null}

        <div className="mt-8">
          <div className="rounded-lg bg-white/5 p-6">
            {isSubscriptionLoading ? (
              <div className="mt-2 text-sm text-hgray700">
                구독 정보를 불러오는 중...
              </div>
            ) : subscription ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-row items-end justify-between gap-6">
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
                    {currentProviderStatus ? (
                      <div className="text-xs text-accenta1">
                        {currentProviderStatus}
                      </div>
                    ) : null}
                    {subscription.currentPeriodEnd ? (
                      <div className="text-hgray700 font-light">
                        {isTossPastDue
                          ? "결제 재시도 예정"
                          : subscription.cancelAtPeriodEnd
                            ? "기간 종료 후 해지 예정"
                            : "다음 결제일"}
                        :{" "}
                        {dateToFormatLong(
                          isTossPastDue
                            ? (subscription.retryNextAt ??
                                subscription.currentPeriodEnd)
                            : subscription.currentPeriodEnd
                        )}
                      </div>
                    ) : null}
                  </div>
                  <div className="w-[70%] flex flex-col items-end justify-between h-full mb-2 gap-8">
                    <div className="w-full flex flex-row items-start justify-end">
                      {isRevealCardNumber && subscription.cardNumberMasked ? (
                        <div className="text-sm text-hgray700">
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
                            className="absolute left-0 top-0 text-center bg-white/20 backdrop-blur-sm w-full py-1 rounded-sm text-[15px] text-hgray900 cursor-pointer"
                            onClick={() => setIsRevealCardNumber(true)}
                          >
                            결제 카드 정보 보기
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="w-full flex flex-row items-center justify-end h-full mb-2">
                      <div className="w-[30%] flex flex-col items-start justify-end">
                        <div className="flex flex-row items-start justify-start gap-2 text-hgray900 text-sm font-normal">
                          이번 달 남은 검색 횟수
                          <span className="text-accenta1">
                            {credits?.remain_credit}
                          </span>
                          <span className=""> / {credits?.charged_credit}</span>
                        </div>
                        {usageResetDateLabel ? (
                          <div className="mt-1 text-xs font-light text-hgray700">
                            (초기화 : {usageResetDateLabel})
                          </div>
                        ) : null}
                      </div>
                      <div className="w-[70%] flex relative rounded-xl h-1.5 bg-accenta1/20">
                        <div
                          className="w-full flex absolute left-0 top-0 rounded-xl h-1.5 bg-accenta1 transition-all duration-500 ease-out"
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
                {isTossPastDue ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-yellow-400/20 bg-yellow-500/10 px-4 py-4 text-sm text-yellow-100">
                    <div>
                      미납 결제가 있습니다.{" "}
                      {retryDateLabel
                        ? `${retryDateLabel}에 자동 재시도가 예정되어 있습니다.`
                        : "자동 재시도가 예정되어 있습니다."}
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xs text-yellow-100/80">
                        카드 정보를 다시 등록하면 즉시 미납 금액을 결제하고
                        구독을 복구합니다.
                      </div>
                      <button
                        type="button"
                        className="rounded-xl bg-yellow-300 px-4 py-2 text-xs font-medium text-black"
                        onClick={() => {
                          if (!subscription?.billing || !subscription.planKey) {
                            return;
                          }
                          const planLabel =
                            subscription.planKey === "pro"
                              ? pricing.plans.pro.name
                              : pricing.plans.max.name;
                          void startCheckout(planLabel, subscription.billing, {
                            reason: "recover",
                          });
                        }}
                      >
                        카드 다시 등록
                      </button>
                    </div>
                  </div>
                ) : null}
                {isTossCancelScheduled ? (
                  <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-hgray800">
                    현재 결제 주기가 끝나면 자동으로 Free 플랜으로 전환됩니다.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 text-sm text-hgray700">
                현재 활성 구독이 없습니다.
              </div>
            )}
          </div>
        </div>
        {/* <div className="mt-6">
          <div className="rounded-lg border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-normal text-hgray900">
                  일회성 결제
                </div>
                <div className="text-sm text-hgray700">
                  구독 결제와 별개로 Toss 일반 결제창을 바로 열 수 있습니다.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void requestOneTimePayment();
                }}
                disabled={isOneTimePaymentLoading}
                className="inline-flex items-center justify-center rounded-xl border border-accenta1/30 bg-accenta1/10 px-4 py-2 text-sm font-medium text-accenta1 hover:bg-accenta1/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isOneTimePaymentLoading
                  ? "일회성 결제창 여는 중..."
                  : "토스 일회성 결제창 열기"}
              </button>
            </div>
          </div>
        </div> */}

        <PricingSection
          currentPlanKey={currentPlanKey}
          currentBilling={currentBilling}
          prices={planPrices}
          onClick={async (planName: string, billing: "monthly" | "yearly") => {
            const isPlanChange =
              !!subscription && subscription.planKey !== "free";
            if (isPlanChange) {
              if (
                currentProvider === "toss" &&
                currentProviderStatus !== "active"
              ) {
                showToast({
                  message:
                    currentProviderStatus === "past_due"
                      ? "미납 상태에서는 카드 재등록 후 플랜을 변경해주세요."
                      : "현재 상태에서는 플랜 변경을 진행할 수 없습니다.",
                  variant: "white",
                });
                return;
              }

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
                    {tossPreview.reason === "recover"
                      ? "카드 정보를 다시 등록해주세요"
                      : "결제 정보를 확인해주세요"}
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
                <div className="text-xs text-hgray700">
                  {tossPreview.reason === "recover"
                    ? "미납 결제 금액"
                    : "결제 예정 금액"}
                </div>
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
                    : tossPreview.reason === "recover"
                      ? "카드 다시 등록"
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
            className="cursor-pointer text-sm px-4 py-2 rounded-sm hover:bg-red-500 bg-red-500/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
