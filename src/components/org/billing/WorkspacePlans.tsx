import Link from "next/link";
import { useState } from "react";
import { Check, ArrowUpRight } from "lucide-react";
import { BillingIntervalTabs } from "./BillingIntervalTabs";
import { MuteButton } from "@/components/ui/button";
import {
  BILLING_SUPPORT_HREF,
  formatBillingMoney,
  type BillingCatalog,
  type BillingInterval,
} from "@/lib/org/billing/types";

export function WorkspacePlans({
  locale,
  catalog,
  onAddSlot,
  onFree,
  busy = false,
  compact = false,
  initialInterval = "year",
  contactHref,
}: {
  locale: "ko" | "en";
  catalog: BillingCatalog | undefined;
  onAddSlot: (interval: BillingInterval) => void;
  onFree?: () => void;
  busy?: boolean;
  compact?: boolean;
  initialInterval?: BillingInterval;
  contactHref?: string;
}) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
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
          locale,
          priceDisplay
        )
      : null;
  const plans = [
    {
      name: "Free",
      price: "$0",
      detail: c("이용료 없음", "No monthly fee"),
      features: [
        c("Role 무제한", "Unlimited Roles"),
        c(
          "모든 Role이 함께 쓰는 월 10 크레딧",
          "10 shared credits every month"
        ),
        c("Slack 연결 지원", "Slack integration included"),
        c("채용 성공보수 없음", "No hiring success fee"),
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
          {c("무료로 시작하기", "Start free")}
        </MuteButton>
      ) : (
        <MuteButton asChild variant="neutral" size="lg" className="w-full">
          <Link href={`/org?lang=${locale}`}>
            {c("무료로 시작하기", "Start free")}
          </Link>
        </MuteButton>
      ),
      top: "bg-bg-weak",
      bottom: "bg-bg-default",
    },
    {
      name: "Hire with Harper",
      price: price ?? (catalog ? c("별도 문의", "Contact us") : "—"),
      unit: c("/ Slot / 월", "/ Slot / month"),
      detail:
        price && amount != null && catalog?.currency
          ? interval === "year"
            ? c(
                `연 ${formatBillingMoney(amount, catalog.currency, locale, priceDisplay)} 일시 결제`,
                `${formatBillingMoney(amount, catalog.currency, locale, priceDisplay)} billed yearly`
              )
            : c("매월 결제", "Billed monthly")
          : !catalog
            ? c("가격을 확인하고 있어요.", "Loading pricing…")
            : c(
                "잠시 후 다시 확인하거나 문의해 주세요.",
                "Try again shortly or contact Harper."
              ),
      features: [
        c(
          "Role 하나에 유료 기능을 연결",
          "Paid features for one Role per slot"
        ),
        c("슬롯당 매월 50 크레딧", "50 monthly credits per slot"),
        c(
          "공용 월 10 크레딧도 계속 제공",
          "10 shared monthly credits remain included"
        ),
        c(
          "Harper가 먼저 후보자를 찾고, 수락한 사람만 연결",
          "Harper reaches out; connect with interested candidates"
        ),
        c("Slack 연결 지원", "Slack integration included"),
        c("채용 성공보수 없음", "No hiring success fee"),
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
        c("채용 진행 역할 무제한", "Unlimited active roles"),
        c("크레딧 무제한", "Unlimited credits"),
        c("Harper 팀의 도입 지원", "Onboarding support from Harper"),
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
          locale={locale}
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
                  : `flex min-h-[228px] flex-col px-7 pb-7 pt-8 lg:px-8 ${plan.top}`
              }
            >
              <h2 className="text-[24px] font-normal tracking-tight">
                {plan.name}
              </h2>
              <div className={compact ? "mt-5" : "mt-auto pt-10"}>
                <p className="flex flex-row items-end gap-2 text-[36px] font-normal leading-tight tracking-tight lg:text-[44px]">
                  {plan.price}
                  {plan.unit && (
                    <span className="text-[13px] tracking-normal mb-1 font-light text-neutral-muted">
                      {plan.unit}
                    </span>
                  )}
                </p>
                <p className="mt-2 min-h-10 text-[13px] font-light leading-5 text-neutral-muted">
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
              <ul className="space-y-2 text-[14px] font-light leading-6 text-neutral-muted lg:text-[15px]">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <Check
                      aria-hidden
                      className="mt-1 size-3.5 shrink-0 text-neutral-soft"
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
