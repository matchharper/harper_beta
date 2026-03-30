// import React, { useEffect, useState } from "react";
// import AppLayout from "@/components/layout/app";
// import { useCredits } from "@/hooks/useCredit";
// import { useCompanyUserStore } from "@/store/useCompanyUserStore";
// import { supabase } from "@/lib/supabase";
// import { useCreditRequestHistory } from "@/hooks/useCreditRequestHistory";
// import { dateToFormatLong } from "@/utils/textprocess";
// import { useMessages } from "@/i18n/useMessage";
// import { showToast } from "@/components/toast/toast";
// import PricingSection from "@/components/payment/PricingSection";
// import ConfirmModal from "@/components/Modal/ConfirmModal";
// import { useLogEvent } from "@/hooks/useLog";
// import QuestionAnswer from "@/components/landing/Questions";
// import { useRouter } from "next/router";
// import Animate from "@/components/landing/Animate";

// type BillingPeriod = "monthly" | "yearly";

// type SubscriptionInfo = {
//   planKey: "pro" | "max" | "enterprise" | "free" | null;
//   planId: string | null;
//   planName: string | null;
//   currentPeriodStart: string | null;
//   currentPeriodEnd: string | null;
//   cancelAtPeriodEnd: boolean | null;
//   billing: BillingPeriod | null;
// };

// function normalizePlanValue(value?: string | null) {
//   return (value ?? "")
//     .toLowerCase()
//     .replace(/[^a-z0-9가-힣]+/g, "")
//     .trim();
// }

// function inferBillingPeriod(args: {
//   planLabel?: string | null;
//   planId?: string | null;
//   start?: string | null;
//   end?: string | null;
// }): BillingPeriod | null {
//   const hay = normalizePlanValue(
//     `${args.planLabel ?? ""} ${args.planId ?? ""}`
//   );

//   if (
//     hay.includes("year") ||
//     hay.includes("annual") ||
//     hay.includes("yearly") ||
//     hay.includes("연간")
//   ) {
//     return "yearly";
//   }

//   if (
//     hay.includes("month") ||
//     hay.includes("monthly") ||
//     hay.includes("월간") ||
//     hay.includes("월")
//   ) {
//     return "monthly";
//   }

//   if (args.start && args.end) {
//     const start = new Date(args.start);
//     const end = new Date(args.end);
//     if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
//       const diffDays =
//         Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
//       if (diffDays >= 300) return "yearly";
//       if (diffDays > 0) return "monthly";
//     }
//   }

//   return null;
// }

// function inferPlanKey(args: {
//   planLabel?: string | null;
//   planId?: string | null;
//   pricing: typeof import("@/lang/ko").ko.companyLanding.pricing;
// }) {
//   const hay = normalizePlanValue(
//     `${args.planLabel ?? ""} ${args.planId ?? ""}`
//   );

//   if (hay.includes("free") || hay.includes("프리")) return "free";
//   const candidates = [
//     { key: "pro", label: args.pricing.plans.pro.name },
//     { key: "max", label: args.pricing.plans.max.name },
//     { key: "enterprise", label: args.pricing.plans.enterprise.name },
//   ] as const;

//   for (const c of candidates) {
//     const needle = normalizePlanValue(c.label);
//     if (needle && hay.includes(needle)) return c.key;
//     if (hay.includes(c.key)) return c.key;
//   }

//   return null;
// }

// function getPlanKeyFromPlanName(args: {
//   planName: string;
//   pricing: {
//     plans: {
//       pro: { name: string };
//       max: { name: string };
//     };
//   };
// }): "pro" | "max" | null {
//   if (args.planName === args.pricing.plans.pro.name) return "pro";
//   if (args.planName === args.pricing.plans.max.name) return "max";
//   return null;
// }

// function isDowngradeSelection(args: {
//   currentPlanKey: SubscriptionInfo["planKey"];
//   currentBilling: BillingPeriod | null;
//   nextPlanKey: "pro" | "max" | null;
//   nextBilling: BillingPeriod;
// }) {
//   const planDowngrade =
//     args.currentPlanKey === "max" && args.nextPlanKey === "pro";
//   const billingDowngrade =
//     args.currentBilling === "yearly" && args.nextBilling === "monthly";
//   return planDowngrade || billingDowngrade;
// }

// const Billing = () => {
//   const { credits, refetch: refetchCredits } = useCredits();
//   const router = useRouter();
//   const { companyUser } = useCompanyUserStore();
//   const { refetch: refetchCreditRequestHistory } = useCreditRequestHistory(
//     companyUser?.user_id
//   );
//   const [isLoading, setIsLoading] = useState(false);
//   const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(false);
//   const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
//     null
//   );
//   const [isCanceling, setIsCanceling] = useState(false);
//   const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
//   const [isDowngradeGuideOpen, setIsDowngradeGuideOpen] = useState(false);
//   const [isUpgradeConfirmOpen, setIsUpgradeConfirmOpen] = useState(false);
//   const [pendingUpgradeChange, setPendingUpgradeChange] = useState<{
//     planName: string;
//     billing: "monthly" | "yearly";
//   } | null>(null);
//   const [isUpgradeConfirming, setIsUpgradeConfirming] = useState(false);
//   const { m } = useMessages();
//   const logEvent = useLogEvent();
//   const pricing = m.companyLanding.pricing;
//   const isCheckoutSync = router.query.checkout_synced === "1";
//   const currentPlanKey =
//     subscription?.planKey ??
//     (subscription
//       ? inferPlanKey({
//           planLabel: subscription.planName,
//           planId: subscription.planId,
//           pricing: m.companyLanding.pricing as any,
//         })
//       : null);
//   const currentBilling = subscription?.billing ?? null;
//   const subscriptionPlanLabel =
//     subscription?.planName ?? subscription?.planId ?? "알 수 없음";
//   const subscriptionBillingLabel =
//     subscription?.billing === "yearly"
//       ? "연간"
//       : subscription?.billing === "monthly"
//         ? "월간"
//         : "주기 정보 없음";
//   const canCancelSubscription =
//     !!subscription &&
//     subscription.planKey !== "free" &&
//     !subscription.cancelAtPeriodEnd;
//   const freeStartDateLabel = subscription?.currentPeriodEnd
//     ? dateToFormatLong(subscription.currentPeriodEnd)
//     : "";

//   const startCheckout = async (
//     planName: string,
//     billing: "monthly" | "yearly",
//     options?: {
//       allowSubscriptionSwitch?: boolean;
//     }
//   ) => {
//     const proName = m.companyLanding.pricing.plans.pro.name;
//     const maxName = m.companyLanding.pricing.plans.max.name;
//     const allowSubscriptionSwitch = Boolean(options?.allowSubscriptionSwitch);
//     logEvent(
//       `enter_billing_checkout, planName: ${planName}, billing: ${billing}`
//     );

//     if (!companyUser?.user_id) {
//       showToast({
//         message: "로그인 정보를 확인할 수 없습니다.",
//         variant: "white",
//       });
//       return;
//     }

//     let url: URL | null = null;
//     let planKey: "pro" | "max" | null = null;
//     if (planName === proName) {
//       planKey = "pro";
//       url = new URL(
//         billing === "yearly"
//           ? PRO_YEARLY_CHECKOUT_URL
//           : PRO_MONTHLY_CHECKOUT_URL
//       );
//     } else if (planName === maxName) {
//       planKey = "max";
//       url = new URL(
//         billing === "yearly"
//           ? MAX_YEARLY_CHECKOUT_URL
//           : MAX_MONTHLY_CHECKOUT_URL
//       );
//     } else {
//       showToast({
//         message: "현재는 Pro, Max 플랜만 테스트 중입니다.",
//         variant: "white",
//       });
//       return;
//     }

//     if (planKey) {
//       try {
//         const res = await fetch("/api/toss/subscriptions/prepare", {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({
//             userId: companyUser.user_id,
//             planKey,
//             billing,
//             allowSubscriptionSwitch,
//           }),
//         });

//         if (!res.ok) {
//           let errorMessage = `Polar 결제 세션 생성에 실패했습니다. (status ${res.status})`;
//           try {
//             const payload = await res.json();
//             const detail =
//               typeof payload?.message === "string"
//                 ? payload.message
//                 : typeof payload?.error === "string"
//                   ? payload.error
//                   : null;
//             if (detail) {
//               errorMessage = `${errorMessage} ${detail}`;
//             }
//           } catch {
//             // Keep generic fallback message.
//           }

//           console.error("Polar checkout create failed", {
//             status: res.status,
//             planKey,
//             billing,
//           });
//           showToast({
//             message: errorMessage,
//             variant: "white",
//           });
//           return;
//         }

//         const data = await res.json();
//         const checkoutUrl =
//           typeof data?.url === "string" && data.url.length > 0
//             ? data.url
//             : null;
//         if (!checkoutUrl) {
//           showToast({
//             message: "Polar 결제 URL을 확인할 수 없습니다.",
//             variant: "white",
//           });
//           return;
//         }

//         window.location.href = checkoutUrl;
//         return;
//       } catch {
//         showToast({
//           message: "Polar 결제 요청 중 오류가 발생했습니다.",
//           variant: "white",
//         });
//         return;
//       }
//     }

//     if (!url) {
//       showToast({
//         message: "결제 URL을 확인할 수 없습니다.",
//         variant: "white",
//       });
//       return;
//     }

//     url.searchParams.set("checkout[custom][user_id]", companyUser.user_id);
//     window.location.href = url.toString();
//   };

//   const requestSubscriptionCancel = async () => {
//     if (!companyUser?.user_id) {
//       showToast({
//         message: "로그인 정보를 확인할 수 없습니다.",
//         variant: "white",
//       });
//       return false;
//     }

//     if (!canCancelSubscription) {
//       showToast({
//         message: "이미 구독 취소가 예약되어 있습니다.",
//         variant: "white",
//       });
//       return false;
//     }

//     setIsCanceling(true);
//     try {
//       const cancelEndpoint = "/api/toss/subscriptions/cancel";
//       const res = await fetch(cancelEndpoint, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           userId: companyUser.user_id,
//         }),
//       });
//       if (!res.ok) {
//         showToast({
//           message: "구독 취소에 실패했습니다.",
//           variant: "white",
//         });
//         return false;
//       }

//       setSubscription((prev) =>
//         prev ? { ...prev, cancelAtPeriodEnd: true } : prev
//       );
//       showToast({
//         message: "구독 취소 요청이 완료되었습니다.",
//         variant: "white",
//       });
//       return true;
//     } catch {
//       showToast({
//         message: "구독 취소 중 오류가 발생했습니다.",
//         variant: "white",
//       });
//       return false;
//     } finally {
//       setIsCanceling(false);
//     }
//   };

//   useEffect(() => {
//     let isCancelled = false;
//     const retryTimers: number[] = [];

//     async function loadSubscription() {
//       if (!companyUser?.user_id) {
//         setSubscription(null);
//         return;
//       }

//       setIsSubscriptionLoading(true);
//       const nowIso = new Date().toISOString();
//       const { data: activePayment, error } = await supabase
//         .from("payments")
//         .select(
//           `
//             plan_id,
//             current_period_start,
//             current_period_end,
//             cancel_at_period_end,
//             plans (
//               plan_id,
//               name,
//               display_name,
//               cycle
//             )
//           `
//         )
//         .eq("user_id", companyUser.user_id)
//         .gte("current_period_end", nowIso)
//         .order("current_period_end", { ascending: false, nullsFirst: false })
//         .limit(1)
//         .maybeSingle();

//       if (isCancelled) return;

//       if (error) {
//         console.error("Failed to load subscription:", error);
//         setSubscription(null);
//         setIsSubscriptionLoading(false);
//         return;
//       }

//       if (!activePayment) {
//         const { data: freePlan, error: freeError } = await supabase
//           .from("plans")
//           .select("plan_id, name, display_name")
//           .eq("ls_variant_id", "0000000")
//           .maybeSingle();

//         if (freeError) {
//           console.error("Failed to load free plan:", freeError);
//           setSubscription(null);
//           setIsSubscriptionLoading(false);
//           return;
//         }

//         const freeName = freePlan?.display_name ?? freePlan?.name ?? "Free";

//         setSubscription({
//           planKey: "free",
//           planId: freePlan?.plan_id ?? null,
//           planName: freeName,
//           currentPeriodStart: null,
//           currentPeriodEnd: null,
//           cancelAtPeriodEnd: null,
//           billing: "monthly",
//         });
//         setIsSubscriptionLoading(false);
//         return;
//       }

//       const planName =
//         (activePayment as any)?.plans?.display_name ??
//         (activePayment as any)?.plans?.name ??
//         null;
//       const cycle = (activePayment as any)?.plans?.cycle ?? null;
//       const billing =
//         cycle === 1
//           ? "yearly"
//           : cycle === 0
//             ? "monthly"
//             : inferBillingPeriod({
//                 planLabel: planName,
//                 planId: activePayment.plan_id ?? null,
//                 start: activePayment.current_period_start ?? null,
//                 end: activePayment.current_period_end ?? null,
//               });
//       const planKey = inferPlanKey({
//         planLabel: planName,
//         planId: activePayment.plan_id ?? null,
//         pricing: m.companyLanding.pricing as any,
//       });

//       setSubscription({
//         planKey,
//         planId: activePayment.plan_id ?? null,
//         planName,
//         currentPeriodStart: activePayment.current_period_start ?? null,
//         currentPeriodEnd: activePayment.current_period_end ?? null,
//         cancelAtPeriodEnd: activePayment.cancel_at_period_end ?? null,
//         billing,
//       });
//       setIsSubscriptionLoading(false);
//     }

//     loadSubscription();
//     if (isCheckoutSync) {
//       for (const delayMs of [3000, 7000, 13000]) {
//         const timerId = window.setTimeout(() => {
//           void loadSubscription();
//           void refetchCredits();
//         }, delayMs);
//         retryTimers.push(timerId);
//       }
//       const cleanupTimer = window.setTimeout(() => {
//         router.replace("/my/billing", undefined, { shallow: true });
//       }, 12000);
//       retryTimers.push(cleanupTimer);
//     }

//     return () => {
//       isCancelled = true;
//       for (const timerId of retryTimers) {
//         window.clearTimeout(timerId);
//       }
//     };
//   }, [companyUser?.user_id, isCheckoutSync, m, refetchCredits, router]);

//   return (
//     <AppLayout initialCollapse={false}>
//       <ConfirmModal
//         open={isCancelModalOpen}
//         onClose={() => setIsCancelModalOpen(false)}
//         onConfirm={async () => {
//           const ok = await requestSubscriptionCancel();
//           if (ok) {
//             setIsCancelModalOpen(false);
//           }
//         }}
//         isLoading={isCanceling}
//         title="구독을 취소할까요?"
//         description={
//           freeStartDateLabel
//             ? `현재 결제 주기 종료(<span class="text-accenta1 px-1">${freeStartDateLabel}</span>)후 Free 플랜으로 전환됩니다.`
//             : "현재 결제 주기 종료 후 Free 플랜으로 전환됩니다."
//         }
//         confirmLabel="구독 취소"
//         cancelLabel="닫기"
//       />
//       <ConfirmModal
//         open={isDowngradeGuideOpen}
//         onClose={() => setIsDowngradeGuideOpen(false)}
//         onConfirm={async () => {
//           const ok = await requestSubscriptionCancel();
//           if (ok) {
//             setIsDowngradeGuideOpen(false);
//           }
//         }}
//         title="구독 변경"
//         description={
//           freeStartDateLabel
//             ? `다운그레이드의 경우 우선 구독을 취소하고 기존 구독 갱신 날짜(<span class="text-accenta1 px-1">${freeStartDateLabel}</span>) 이후 새로운 플랜으로 결제하시는 것을 추천드립니다.`
//             : "다운그레이드의 경우 우선 구독을 취소하고 기존 구독 갱신 날짜 이후 새로운 플랜으로 결제하시는 것을 추천드립니다."
//         }
//         confirmLabel="구독 취소"
//         cancelLabel="닫기"
//         isLoading={isCanceling}
//       />
//       <ConfirmModal
//         open={isUpgradeConfirmOpen}
//         onClose={() => {
//           if (isUpgradeConfirming) return;
//           setIsUpgradeConfirmOpen(false);
//           setPendingUpgradeChange(null);
//         }}
//         onConfirm={async () => {
//           if (!pendingUpgradeChange) {
//             setIsUpgradeConfirmOpen(false);
//             return;
//           }

//           setIsUpgradeConfirming(true);
//           try {
//             await startCheckout(
//               pendingUpgradeChange.planName,
//               pendingUpgradeChange.billing,
//               {
//                 allowSubscriptionSwitch: true,
//               }
//             );
//           } finally {
//             setIsUpgradeConfirming(false);
//             setIsUpgradeConfirmOpen(false);
//             setPendingUpgradeChange(null);
//           }
//         }}
//         title="플랜 변경을 진행할까요?"
//         description="확인하면 즉시 결제가 진행되며 결제 완료 직후 새 플랜으로 변경됩니다. 기존 구독은 자동으로 종료됩니다."
//         confirmLabel="확인하고 결제 진행"
//         cancelLabel="닫기"
//         isLoading={isUpgradeConfirming}
//       />
//       <div className="px-6 py-8 w-full">
//         <div className="text-3xl font-hedvig font-light tracking-tight text-white">
//           {m.system.credits}
//         </div>

//         <div className="mt-8">
//           <div className="rounded-lg bg-white/5 p-6">
//             {isSubscriptionLoading ? (
//               <div className="mt-2 text-sm text-hgray700">
//                 구독 정보를 불러오는 중...
//               </div>
//             ) : subscription ? (
//               <div className="flex flex-row items-start justify-between">
//                 <div className="flex flex-col gap-2 text-sm w-[30%]">
//                   <div className="text-sm text-hgray900 font-normal">
//                     구독 상태
//                   </div>
//                   <div className="text-hgray900">
//                     <span className="text-white text-xl font-medium">
//                       {subscriptionPlanLabel}
//                     </span>
//                     <span className="text-hgray700">
//                       {" "}
//                       · {subscriptionBillingLabel}
//                     </span>
//                   </div>
//                   {subscription.currentPeriodEnd ? (
//                     <div className="text-hgray700 font-light">
//                       {subscription.cancelAtPeriodEnd
//                         ? "기간 종료 후 해지 예정"
//                         : "다음 결제일"}
//                       : {dateToFormatLong(subscription.currentPeriodEnd)}
//                     </div>
//                   ) : null}
//                 </div>
//                 <div className="w-[70%] flex items-end justify-end flex-col h-full">
//                   <div className="w-full flex flex-row items-start justify-start gap-2 text-hgray900 text-sm font-normal">
//                     Credit 사용량
//                     <span className="text-accenta1">
//                       {credits?.remain_credit}
//                     </span>
//                     <span className=""> / {credits?.charged_credit}</span>
//                   </div>
//                   <div className="mt-2 w-full flex relative rounded-xl h-2 bg-accenta1/20">
//                     <div
//                       className="w-full flex absolute left-0 top-0 rounded-xl h-2 bg-accenta1 transition-all duration-500 ease-out"
//                       style={{
//                         width: `${Math.min(
//                           ((credits?.remain_credit ?? 0) /
//                             (credits?.charged_credit ?? 1)) *
//                             100,
//                           100
//                         )}%`,
//                       }}
//                     ></div>
//                   </div>
//                 </div>
//               </div>
//             ) : (
//               <div className="mt-2 text-sm text-hgray700">
//                 현재 활성 구독이 없습니다.
//               </div>
//             )}
//           </div>
//         </div>

//         <PricingSection
//           currentPlanKey={currentPlanKey}
//           currentBilling={currentBilling}
//           onClick={async (planName: string, billing: "monthly" | "yearly") => {
//             const isPlanChange =
//               !!subscription && subscription.planKey !== "free";
//             if (isPlanChange) {
//               const nextPlanKey = getPlanKeyFromPlanName({
//                 planName,
//                 pricing,
//               });
//               const isDowngrade = isDowngradeSelection({
//                 currentPlanKey: subscription.planKey,
//                 currentBilling: subscription.billing,
//                 nextPlanKey,
//                 nextBilling: billing,
//               });
//               if (isDowngrade) {
//                 setIsDowngradeGuideOpen(true);
//                 return;
//               }

//               setPendingUpgradeChange({ planName, billing });
//               setIsUpgradeConfirmOpen(true);
//               return;
//             }

//             await startCheckout(planName, billing);
//           }}
//         />

//         <section id="pricing-faq">
//           <Animate>
//             <div className="flex flex-col items-center justify-center w-full pt-4">
//               <div className="font-hedvig text-lg mt-20">결제 및 구독 FAQ</div>
//               <div className="flex flex-col items-start justify-start text-white/70 font-light w-full mt-10 px-4 md:px-0">
//                 {m.companyLanding.pricingFaq.items.map((item, index) => (
//                   <QuestionAnswer
//                     key={item.question}
//                     question={item.question}
//                     answer={item.answer}
//                     index={index}
//                     length={m.companyLanding.pricingFaq.items.length}
//                   />
//                 ))}
//               </div>
//             </div>
//           </Animate>
//         </section>
//         <div>
//           <div className="mt-24 text-white/70 font-light text-center mb-40 flex flex-col items-center justify-center">
//             추가 문의 사항이 있으시다면, chris@matchharper.com으로 문의해
//             주세요.
//             <div
//               className="mt-2 underline decoration-dotted cursor-pointer text-hgray800 hover:text-hgray1000"
//               onClick={() =>
//                 window.open(
//                   "https://peat-find-598.notion.site/Refund-policy-2e684af768c6800e8276ccbe16fc8cb4?pvs=74",
//                   "_blank"
//                 )
//               }
//             >
//               환불 규정
//             </div>
//           </div>
//         </div>
//         <div className="mt-20 px-2 flex flex-row items-center justify-between">
//           <button
//             type="button"
//             disabled={!canCancelSubscription || isCanceling}
//             className="text-sm text-red-600/80 hover:text-red-600/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
//             onClick={() => setIsCancelModalOpen(true)}
//           >
//             {isCanceling ? "취소 중..." : "구독 취소"}
//           </button>
//         </div>
//       </div>
//     </AppLayout>
//   );
// };

// export default Billing;

import React from "react";

const BillingOld = () => {
  return <div>BillingOld</div>;
};

export default BillingOld;
