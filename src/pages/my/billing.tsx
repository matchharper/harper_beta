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

const PRO_MONTHLYCHECKOUT_URL =
  "https://matchharper.lemonsqueezy.com/checkout/buy/ea41e57e-6dc1-4ddd-8b7f-f5636bc35ec5";
const MAX_MONTHLY_CHECKOUT_URL =
  "https://matchharper.lemonsqueezy.com/checkout/buy/0526b657-757f-45bb-bc9f-4466a6ec360f";

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
  const hay = normalizePlanValue(`${args.planLabel ?? ""} ${args.planId ?? ""}`);

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
  const hay = normalizePlanValue(`${args.planLabel ?? ""} ${args.planId ?? ""}`);

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
  const { credits } = useCredits();
  const { companyUser } = useCompanyUserStore();
  const { refetch: refetchCreditRequestHistory } =
    useCreditRequestHistory(companyUser?.user_id);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null
  );
  const { m } = useMessages();
  const pricing = m.companyLanding.pricing;
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
            plans (
              plan_id,
              name,
              display_name
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
        activePayment?.plans?.display_name ?? activePayment?.plans?.name ?? null;
      const billing = inferBillingPeriod({
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

    return () => {
      isCancelled = true;
    };
  }, [companyUser?.user_id, m]);

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

        {/* <div className="mt-8">
          <div className="text-base text-hgray900 font-light">
            {m.system.credit_history} (최근 10개)
          </div>

          <div className="mt-3">
            <div className="mt-3 flex flex-col gap-2">
              {creditRequestHistory?.length ? (
                creditRequestHistory.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 items-center font-light gap-3 py-4 rounded-lg hover:bg-white/5 transition-colors px-6 bg-white/5"
                  >
                    <div className="flex flex-row items-center col-span-8 text-white/90 font-normal">
                      <span className="text-accenta1">{item.credit_num}</span>
                      <span className="text-hgray700 text-sm ml-1.5">
                        {m.system.credits}
                      </span>
                    </div>

                    <div className="col-span-3 text-hgray900 text-sm truncate text-right pr-2">
                      {dateToFormatLong(item.created_at)}
                    </div>

                    <div className="col-span-1 flex justify-end">
                      <div
                        className={`px-3 py-1 rounded-xl text-sm font-normal ${item.is_done
                          ? "bg-emerald-400/10 text-emerald-300"
                          : "bg-white/10 text-white/70"
                          }`}
                      >
                        {item.is_done ? m.system.done : m.system.pending}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-hgray500 text-sm">
                  {m.system.no_credit_request}
                </div>
              )}
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
              <div className='flex flex-row items-start justify-between'>
                <div className="flex flex-col gap-2 text-sm w-[30%]">
                  <div className="text-sm text-hgray900 font-normal">구독 상태</div>
                  <div className="text-hgray900">
                    <span className="text-white text-xl font-medium">{subscriptionPlanLabel}</span>
                    <span className="text-hgray500">
                      {" "}
                      · {subscriptionBillingLabel}
                    </span>
                  </div>
                  {subscription.currentPeriodEnd ? (
                    <div className="text-hgray700">
                      {subscription.cancelAtPeriodEnd
                        ? "기간 종료 후 해지 예정"
                        : "다음 결제일"}
                      : {dateToFormatLong(subscription.currentPeriodEnd)}
                    </div>
                  ) : null}
                </div>
                <div className="w-[70%] flex items-start justify-start flex-col">
                  <div className="w-full flex flex-row items-start justify-start gap-2 text-hgray900 text-sm font-normal">
                    Credit 사용량
                    <span className="text-accenta1">
                      {credits?.remain_credit}
                    </span>
                    <span className="">
                      {" "}
                      / {credits?.charged_credit}
                    </span>
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
          onClick={(planName: string) => {
            const proName = m.companyLanding.pricing.plans.pro.name;
            const maxName = m.companyLanding.pricing.plans.max.name;

            // if (planName !== proName) {
            //   showToast({
            //     message: "현재는 Pro 플랜만 테스트 중입니다.",
            //     variant: "white",
            //   });
            //   return;
            // }

            if (!companyUser?.user_id) {
              showToast({
                message: "로그인 정보를 확인할 수 없습니다.",
                variant: "white",
              });
              return;
            }

            let url;
            if (planName === proName) {
              url = new URL(PRO_MONTHLYCHECKOUT_URL);
            } else if (planName === maxName) {
              url = new URL(MAX_MONTHLY_CHECKOUT_URL);
            } else {
              showToast({
                message: "현재는 Pro, Max 플랜만 테스트 중입니다.",
                variant: "white",
              });
              return;
            }
            url.searchParams.set("checkout[custom][user_id]", companyUser.user_id);
            window.location.href = url.toString();
          }}
        />
      </div>
    </AppLayout>
  );
};

export default Billing;
