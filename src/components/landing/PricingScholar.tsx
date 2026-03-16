"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { BaseSectionLayout } from "@/components/landing/GridSectionLayout";
import Animate from "@/components/landing/Animate";
import { useMessages } from "@/i18n/useMessage";
import Head1 from "./Head1";

type Billing = "monthly" | "yearly";

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

export default function PricingSection({
  onClick,
}: {
  onClick: (plan: string, billing: Billing) => void;
}) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const { m, locale } = useMessages();
  const pricing = m.companyLanding.pricing;

  const isEnglish = locale === "en";

  const plans = useMemo(() => {
    const proMonthlyUSD = 99;
    const maxMonthlyUSD = 199;
    const proYearlyUSD = 79;
    const maxYearlyUSD = 159;

    const proShown = billing === "monthly" ? proMonthlyUSD : proYearlyUSD;

    const maxShown = billing === "monthly" ? maxMonthlyUSD : maxYearlyUSD;

    return [
      {
        key: "pro",
        name: pricing.plans.pro.name,
        tagline: pricing.plans.pro.tagline,
        price: proShown,
        buttonLabel: "Start",
        isPrimary: false,
        features: [
          "150 searches / month",
          "AI analysis of paper + code quality",
        ],
      },
      {
        key: "max",
        name: pricing.plans.max.name,
        tagline: pricing.plans.max.tagline,
        price: maxShown,
        buttonLabel: "Start",
        isPrimary: true,
        features: [
          "Includes all Pro features:",
          "350 searches / month",
          "Parallel search",
        ],
      },
      {
        key: "enterprise",
        name: pricing.plans.enterprise.name,
        tagline: pricing.plans.enterprise.tagline,
        price: null as number | null,
        buttonLabel: "Start",
        isPrimary: false,
        features: [
          "Includes all Max features:",
          "Unlimited searches",
          "Customized Support",
        ],
      },
    ];
  }, [billing, isEnglish, pricing]);

  return (
    <section id="pricing" className="w-full bg-black text-white">
      <Animate>
        <BaseSectionLayout>
          <div className="w-full flex flex-col items-center justify-center text-center px-4 md:px-0">
            {/* <Head1 className="text-white">Pricing</Head1> */}
            <Head1 className="mt-4 md:mt-6 text-white">{pricing.title}</Head1>
            <div className="mt-3 text-sm md:text-base text-white/60 font-light">
              Perfect plan for your team.
            </div>

            <div className="mt-12 md:mt-16 w-full max-w-[1200px]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-4">
                {plans.map((p) => (
                  <PlanCard
                    key={p.key}
                    name={p.name}
                    tagline={p.tagline}
                    price={p.price}
                    isPrimary={p.isPrimary}
                    buttonLabel={p.buttonLabel}
                    features={Array.from(p.features)}
                    billing={billing}
                    onClick={onClick}
                  />
                ))}
              </div>
            </div>
          </div>
        </BaseSectionLayout>
      </Animate>
    </section>
  );
}

function PlanCard({
  name,
  tagline,
  price,
  isPrimary,
  buttonLabel,
  features,
  onClick,
  billing,
}: {
  name: string;
  tagline: string;
  price: number | null;
  isPrimary: boolean;
  buttonLabel: string;
  features: string[];
  billing: Billing;
  onClick: (plan: string, billing: Billing) => void;
}) {
  const { m, locale } = useMessages();
  const pricing = m.companyLanding.pricing;
  const isEnglish = locale === "en";

  return (
    <div
      className={[
        "relative w-full rounded-xl md:rounded-xl overflow-hidden",
        "bg-white/[0.06] border border-white/10",
        "px-5 md:px-7 pt-4 md:pt-6 pb-4 md:pb-20",
        isPrimary ? "bg-white/[0.08]" : "",
      ].join(" ")}
    >
      <div className="flex flex-col items-start justify-start">
        <div className="text-[24px] md:text-[28px] font-medium tracking-tight">
          {name}
        </div>
        {/* <div className="mt-0 text-left w-full text-sm text-white/55 leading-6 min-h-6">
          {tagline}
        </div> */}

        <div className="mt-4 md:mt-6">
          {price === null ? (
            <div className="flex items-end gap-2">
              <div className="text-[24px] md:text-[32px] font-semibold tracking-tight leading-none">
                Contact us
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <div className="text-[20px] md:text-[28px] font-medium tracking-tight leading-none">
                {formatPrice(isEnglish, price)}
              </div>
              <div className="flex justify-end items-end text-base md:text-lg text-white/60 pb-0">
                $/ month
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 md:mt-6 w-full">
          <button
            type="button"
            onClick={() => onClick(name, billing)}
            className={[
              "w-full rounded-full py-2.5 md:py-3 text-sm md:text-sm font-normal transition-colors",
              isPrimary
                ? "bg-accenta1 text-black hover:opacity-95"
                : "bg-white/10 text-accenta1 border border-white/0 hover:bg-accenta1/10",
            ].join(" ")}
          >
            {buttonLabel}
          </button>
        </div>

        <div className="mt-7 md:mt-8 h-px w-full bg-white/10" />

        <ul className="mt-6 md:mt-7 flex flex-col gap-4">
          {features.map((f, idx) => (
            <li key={idx} className="flex items-start gap-3 text-sm md:text-sm">
              {f.endsWith("및:") || f.endsWith(":") ? (
                <>
                  <span className="mt-[6px] w-2 h-2 rounded-full bg-white/25" />
                  <span
                    className="text-white/80 font-medium"
                    dangerouslySetInnerHTML={{ __html: f }}
                  />
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mt-0.5 text-accenta1" />
                  <span
                    className="text-white/70 text-left"
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
