import { useOrgBillingFormat } from "@/hooks/org/useOrgBillingFormat";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import Link from "next/link";
import { useState } from "react";
import { Check, ArrowUpRight } from "lucide-react";
import { BillingIntervalTabs } from "./BillingIntervalTabs";
import { MuteButton } from "@/components/ui/button";
import {
  BILLING_SUPPORT_HREF,
  type BillingCatalog,
  type BillingInterval,
} from "@/lib/org/billing/types";

export function WorkspacePlans({
  catalog,
  onAddSlot,
  onFree,
  busy = false,
  compact = false,
  initialInterval = "year",
  contactHref,
}: {
  catalog: BillingCatalog | undefined;
  onAddSlot: (interval: BillingInterval) => void;
  onFree?: () => void;
  busy?: boolean;
  compact?: boolean;
  initialInterval?: BillingInterval;
  contactHref?: string;
}) {
  const { locale, c } = useOrgLocale();
  const { formatBillingMoney } = useOrgBillingFormat();
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);
  const priceDisplay = {
    minimumFractionDigits: 0,
    currencyDisplay: "narrowSymbol",
  } as const;
  const amount = interval === "year" ? catalog?.annualAmount : catalog?.amount;
  const price =
    catalog?.available && amount != null && catalog.currency
      ? formatBillingMoney(
          amount / (interval === "year" ? 12 : 1),
          catalog.currency,
          priceDisplay
        )
      : null;
  const plans = [
    {
      name: "Free",
      price: "$0",
      detail: c("이용료 없음", "No monthly fee"),
      features: [
        c("카드 등록 필요없음", "No credit card required"),
        c("활성 Role 1개", "1 active role"),
        c("월 10개의 Intro", "10 Intros every month"),
        c("Slack 연결 지원", "Slack integration included"),
        c("채용 성공보수 없음", "No placement fee"),
      ],
      action: contactHref ? (
        <MuteButton asChild variant="neutral" size="lg" className="w-full">
          <Link href={contactHref}>{c("미팅 신청하기", "Request a demo")}</Link>
        </MuteButton>
      ) : onFree ? (
        <MuteButton
          variant="neutral"
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={onFree}
        >
          {c("무료로 시작하기", "Start for free")}
        </MuteButton>
      ) : (
        <MuteButton asChild variant="neutral" size="lg" className="w-full">
          <Link href={`/org?lang=${locale}`}>
            {c("무료로 시작하기", "Start for free")}
          </Link>
        </MuteButton>
      ),
      top: "bg-bg-weak",
      bottom: "bg-bg-default",
    },
    {
      name: "Hire with Harper",
      price: price ?? (catalog ? c("별도 문의", "Contact us") : "—"),
      unit: c("/ Slot / 월", "/ slot / month"),
      detail:
        price && amount != null && catalog?.currency
          ? interval === "year"
            ? c(
                `연 ${formatBillingMoney(amount, catalog.currency, priceDisplay)} 일시 결제`,
                `${formatBillingMoney(amount, catalog.currency, priceDisplay)} billed yearly`
              )
            : c("매월 결제", "Billed monthly")
          : !catalog
            ? c("가격을 확인하고 있어요.", "Loading pricing…")
            : c(
                "잠시 후 다시 확인하거나 문의해 주세요.",
                "Try again shortly or contact Harper."
              ),
      features: [
        c("슬롯당 매월 50 Intro", "50 monthly Intros per slot"),
        c("공용 월 10 Intro도 계속 제공", "Plus 10 shared Intros per month"),
        c(
          "Harper-first 채용: Harper가 먼저 후보자를 찾고, 역할을 소개하고, 수락한 사람만 연결",
          "Harper finds candidates, introduces your role, and brings you people who want to talk."
        ),
        c("Slack 연결 지원", "Slack integration included"),
        c("채용 성공보수 없음", "No placement fee"),
      ],
      action: contactHref ? (
        <MuteButton asChild variant="dark" size="lg" className="w-full">
          <Link href={contactHref}>{c("미팅 신청하기", "Request a demo")}</Link>
        </MuteButton>
      ) : !catalog ? (
        <MuteButton variant="dark" size="lg" className="w-full" disabled>
          {c("가격 확인 중", "Loading pricing")}
        </MuteButton>
      ) : price ? (
        <MuteButton
          variant="dark"
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={() => onAddSlot(interval)}
        >
          {c("채용 시작하기", "Start hiring")}
        </MuteButton>
      ) : (
        <MuteButton asChild variant="dark" size="lg" className="w-full">
          <a href={BILLING_SUPPORT_HREF}>
            {c("Harper 팀에 문의", "Contact Harper")}
          </a>
        </MuteButton>
      ),
      top: "bg-accent-100",
      bottom: "bg-accent-100/25",
    },
    {
      name: "Enterprise",
      price: c("문의 요청", "Talk to us"),
      detail: c("별도 협의", "Custom pricing"),
      features: [
        c("채용 진행 역할 수 제한 없음", "Unlimited active roles"),
        c("무제한 Intro", "Unlimited Intros"),
        c("Harper 팀의 도입 지원", "Hands-on onboarding support"),
      ],
      action: (
        <MuteButton asChild variant="neutral" size="lg" className="w-full">
          <a href={BILLING_SUPPORT_HREF}>
            {c("문의하기", "Contact")} <ArrowUpRight size={14} />
          </a>
        </MuteButton>
      ),
      top: "bg-neutral-200",
      bottom: "bg-bg-default",
    },
  ];
  return (
    <div className="space-y-6">
      <div className={compact ? "" : "flex justify-center"}>
        <BillingIntervalTabs
          value={interval}
          onChange={setInterval}
          disabled={busy}
        />
      </div>
      <div
        className={
          compact
            ? "divide-y divide-neutral-1000-a05"
            : "grid gap-5 md:grid-cols-3"
        }
      >
        {plans.map((plan) => (
          <section
            key={plan.name}
            aria-label={plan.name}
            className={
              compact
                ? "flex flex-col gap-5 py-6 sm:flex-row sm:justify-between"
                : "flex min-w-0 flex-col overflow-hidden rounded-sm"
            }
          >
            <div
              className={
                compact
                  ? "sm:w-1/3"
                  : `flex min-h-[180px] flex-col px-7 pb-4 pt-8 lg:px-8 ${plan.top}`
              }
            >
              <h2 className="text-[24px] font-normal tracking-tight">
                {plan.name}
              </h2>
              <div className={compact ? "mt-5" : "mt-auto pt-10"}>
                <p className="flex flex-row items-end gap-2 text-[36px] font-normal leading-tight tracking-tight lg:text-[44px]">
                  {plan.price}
                  {plan.unit && (
                    <span className="text-[13px] tracking-normal mb-1 font-normal text-neutral-muted">
                      {plan.unit}
                    </span>
                  )}
                </p>
                <p className="mt-2 min-h-10 text-[14px] font-normal leading-5 text-neutral-800">
                  {plan.detail}
                </p>
              </div>
            </div>
            <div
              className={
                compact
                  ? "flex flex-1 flex-col gap-6 sm:pl-5"
                  : `flex flex-1 flex-col px-7 py-8 lg:px-8 ${plan.bottom}`
              }
            >
              <ul className="space-y-2 text-[14px] font-normal leading-6 text-neutral-muted lg:text-[15px]">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <Check
                      aria-hidden
                      className="mt-1 size-3.5 shrink-0 text-neutral-muted"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-20">{plan.action}</div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
