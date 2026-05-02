"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useMessages } from "@/i18n/useMessage";
import { useLogEvent } from "@/hooks/useLog";

type Billing = "monthly" | "yearly";
type PlanKey = "pro" | "max" | "enterprise" | "free";

function formatKRW(n: number) {
  return n.toLocaleString("ko-KR");
}
const formatPrice = (isEnglish: boolean, value: number) => {
  if (isEnglish) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return formatKRW(value);
};

function calcDiscountedMonthly(monthly: number, discountRate: number) {
  // 20% off => * 0.8
  return Math.round(monthly * (1 - discountRate));
}

type Theme = "dark" | "cream";

export default function PricingSection({
  onClick,
  currentPlanKey,
  currentBilling,
  currentLabel,
  changeLabel,
  prices,
  theme = "dark",
}: {
  onClick: (plan: string, billing: Billing) => void;
  currentPlanKey?: PlanKey | null;
  currentBilling?: Billing | null;
  currentLabel?: string;
  changeLabel?: string;
  prices?: {
    pro: { monthly: number | null; yearly: number | null };
    max: { monthly: number | null; yearly: number | null };
  } | null;
  theme?: Theme;
}) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const { m, locale } = useMessages();
  const pricing = m.companyLanding.pricing;
  const logEvent = useLogEvent();

  const DISCOUNT = 0.2;
  const isEnglish = locale === "en";

  const plans = useMemo(() => {
    const proMonthlyKRW = prices?.pro.monthly ?? 149000;
    const maxMonthlyKRW = prices?.max.monthly ?? 279000;
    const proYearlyKRW =
      prices?.pro.yearly != null
        ? Math.round(prices.pro.yearly / 12)
        : calcDiscountedMonthly(proMonthlyKRW, DISCOUNT);
    const maxYearlyKRW =
      prices?.max.yearly != null
        ? Math.round(prices.max.yearly / 12)
        : calcDiscountedMonthly(maxMonthlyKRW, DISCOUNT);
    const proMonthlyUSD = 100;
    const maxMonthlyUSD = 180;
    const proYearlyUSD = 80;
    const maxYearlyUSD = 144;

    const proShown =
      billing === "monthly"
        ? isEnglish
          ? proMonthlyUSD
          : proMonthlyKRW
        : isEnglish
          ? proYearlyUSD
          : proYearlyKRW;

    const maxShown =
      billing === "monthly"
        ? isEnglish
          ? maxMonthlyUSD
          : maxMonthlyKRW
        : isEnglish
          ? maxYearlyUSD
          : maxYearlyKRW;

    return [
      {
        key: "pro",
        name: pricing.plans.pro.name,
        tagline: pricing.plans.pro.tagline,
        price: proShown,
        priceUnit: pricing.plans.pro.priceUnit2,
        buttonLabel: pricing.plans.pro.buttonLabel,
        isPrimary: false,
        isMostPopular: false,
        features: pricing.plans.pro.features,
      },
      {
        key: "max",
        name: pricing.plans.max.name,
        tagline: pricing.plans.max.tagline,
        price: maxShown,
        priceUnit: pricing.plans.max.priceUnit2,
        buttonLabel: pricing.plans.max.buttonLabel,
        isPrimary: true,
        isMostPopular: true,
        features: pricing.plans.max.features,
      },
      {
        key: "enterprise",
        name: pricing.plans.enterprise.name,
        tagline: pricing.plans.enterprise.tagline,
        price: null as number | null,
        priceUnit: pricing.plans.enterprise.priceUnit2,
        buttonLabel: pricing.plans.enterprise.buttonLabel,
        isPrimary: false,
        isMostPopular: false,
        features: pricing.plans.enterprise.features,
      },
    ];
  }, [billing, isEnglish, pricing, prices]);

  const hasCurrent = Boolean(currentPlanKey && currentBilling);
  const currentButtonLabel =
    currentLabel ?? (isEnglish ? "Current plan" : "현재 이용 중");
  const changeButtonLabel =
    changeLabel ?? (isEnglish ? "Change plan" : "구독 변경하기");
  const subscribeButtonLabel = isEnglish ? "Subscribe" : "이용하기";
  const enterpriseButtonLabel = pricing.plans.enterprise.buttonLabel;
  const shouldShowSubscribe = hasCurrent && currentPlanKey === "free";

  const isDark = theme === "dark";

  return (
    <section id="pricing" className={`w-full ${isDark ? "text-hgray900" : "text-beige900"}`}>
      <div className="w-full flex flex-col items-center justify-center text-center px-4 md:px-0">
        <div className="mt-16 md:mt-10">
          <BillingToggle billing={billing} setBilling={setBilling} theme={theme} />
        </div>
        <div className="mt-4 w-full max-w-[1200px]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-4">
            {plans.map((p) => {
              const isEnterprise = p.key === "enterprise";
              const isCurrent =
                hasCurrent &&
                currentPlanKey === p.key &&
                currentBilling === billing;
              const buttonLabel = isEnterprise
                ? enterpriseButtonLabel
                : isCurrent
                  ? currentButtonLabel
                  : shouldShowSubscribe
                    ? subscribeButtonLabel
                    : hasCurrent
                      ? changeButtonLabel
                      : p.buttonLabel;
              const isDisabled = isCurrent;
              const handleClick = isEnterprise
                ? (_plan: string, _billing: Billing) => {
                    logEvent("enter_billing_enterprise_contact");
                    window.open(
                      "https://form.typeform.com/to/sYZQlYOd",
                      "_blank"
                    );
                  }
                : onClick;

              return (
                <PlanCard
                  key={p.key}
                  name={p.name}
                  tagline={p.tagline}
                  price={p.price}
                  priceUnit={p.priceUnit}
                  isPrimary={p.isPrimary}
                  isMostPopular={p.isMostPopular}
                  buttonLabel={buttonLabel}
                  features={Array.from(p.features)}
                  disabled={isDisabled}
                  billing={billing}
                  onClick={handleClick}
                  theme={theme}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function BillingToggle({
  billing,
  setBilling,
  theme = "dark",
}: {
  billing: Billing;
  setBilling: (b: Billing) => void;
  theme?: Theme;
}) {
  const { m } = useMessages();
  const pricing = m.companyLanding.pricing;
  const isYearly = billing === "yearly";
  const isDark = theme === "dark";

  return (
    <div className="relative inline-flex items-center">
      <div className={`relative flex items-center ${isDark ? "bg-white/10 border border-white/10" : "bg-beige500/55 border border-beige900/8"} rounded-full p-1 backdrop-blur`}>
        <button
          type="button"
          onClick={() => setBilling("monthly")}
          className={`relative z-10 px-6 py-2 rounded-full text-sm md:text-sm transition-colors ${
            !isYearly
              ? isDark ? "text-black" : "text-beige100"
              : isDark ? "text-white/70 hover:text-white" : "text-beige900/70 hover:text-beige900"
          }`}
        >
          {pricing.billing.monthly}
        </button>
        <button
          type="button"
          onClick={() => setBilling("yearly")}
          className={`relative z-10 px-6 py-2 rounded-full text-sm md:text-sm transition-colors ${
            isYearly
              ? isDark ? "text-black" : "text-beige100"
              : isDark ? "text-white/70 hover:text-white" : "text-beige900/70 hover:text-beige900"
          }`}
        >
          {pricing.billing.yearly}
        </button>

        {/* sliding pill */}
        <motion.div
          className={`absolute top-1 bottom-1 w-[48%] rounded-full ${isDark ? "bg-white" : "bg-beige900"}`}
          initial={false}
          animate={{ x: isYearly ? "100%" : "0%" }}
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      </div>

      {/* discount badge */}
      <div className="absolute -right-6 -top-3 md:-right-8 md:-top-3">
        <div className={`px-3 py-1 rounded-full text-[11px] md:text-xs font-semibold ${isDark ? "bg-accenta1 text-black" : "bg-accentBronze text-beige100"} shadow-sm`}>
          {pricing.billing.discountLabel}
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  billing,
  name,
  tagline,
  price,
  priceUnit,
  isPrimary,
  isMostPopular,
  buttonLabel,
  features,
  disabled,
  onClick,
  theme = "dark",
}: {
  name: string;
  tagline: string;
  price: number | null;
  priceUnit: string;
  isPrimary: boolean;
  isMostPopular: boolean;
  buttonLabel: string;
  features: string[];
  disabled?: boolean;
  billing: Billing;
  onClick: (plan: string, billing: Billing) => void;
  theme?: Theme;
}) {
  const { m, locale } = useMessages();
  const pricing = m.companyLanding.pricing;
  const isEnglish = locale === "en";
  const isDark = theme === "dark";

  return (
    <div
      className={[
        "relative w-full rounded-xl md:rounded-3xl overflow-hidden shadow-md",
        "bg-white/[0.05] border border-white/5",
        "px-5 md:px-7 pt-4 md:pt-6 pb-4 md:pb-20",
        isPrimary ? "bg-white/[0.1]" : "",
      ].join(" ")}
    >
      <div className="flex flex-col items-start justify-start">
        <div className="text-[24px] md:text-[28px] font-medium tracking-tight">
          {name}
        </div>
        <div className={`mt-0 text-left w-full text-sm ${isDark ? "text-white/55" : "text-beige900/55"} leading-6 min-h-6`}>
          {tagline}
        </div>

        <div className="mt-4 md:mt-6">
          {price === null ? (
            <div className="flex items-end gap-2">
              <div className="text-[24px] md:text-[32px] font-semibold tracking-tight leading-none">
                {pricing.contactLabel}
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <div className="text-[24px] md:text-[32px] font-medium tracking-tight leading-none">
                {formatPrice(isEnglish, price)}
              </div>
              <div className={`text-base md:text-lg ${isDark ? "text-white/60" : "text-beige900/65"} pb-1`}>
                {priceUnit}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 md:mt-6 w-full">
          <button
            type="button"
            onClick={() => onClick(name, billing)}
            disabled={disabled}
            className={[
              "w-full rounded-full py-2.5 md:py-3 text-sm md:text-sm font-normal transition-colors",
              isPrimary
                ? isDark
                  ? "bg-accenta1 text-black hover:opacity-95"
                  : "bg-beige900 text-beige100 hover:opacity-95"
                : isDark
                  ? "bg-white/10 text-accenta1 border border-white/0 hover:bg-accenta1/10"
                  : "bg-beige500/55 text-beige900 border border-beige900/8 hover:bg-beige500/70",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {buttonLabel}
          </button>
        </div>

        <div className={`mt-7 md:mt-8 h-px w-full ${isDark ? "bg-white/10" : "bg-beige900/10"}`} />

        <ul className="mt-6 md:mt-7 flex flex-col gap-4">
          {features.map((f, idx) => (
            <li key={idx} className="flex items-start gap-3 text-sm md:text-sm">
              {f.endsWith("및:") || f.endsWith(":") ? (
                <>
                  <span className={`mt-[6px] w-2 h-2 rounded-full ${isDark ? "bg-white/25" : "bg-beige900/25"}`} />
                  <span
                    className={`${isDark ? "text-white/80" : "text-beige900/80"} font-medium`}
                    dangerouslySetInnerHTML={{ __html: f }}
                  />
                </>
              ) : (
                <>
                  <Check className={`w-4 h-4 mt-0.5 ${isDark ? "text-accenta1" : "text-accentBronze"}`} />
                  <span
                    className={`${isDark ? "text-white/70" : "text-beige900/70"} text-left`}
                    dangerouslySetInnerHTML={{ __html: f }}
                  ></span>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
