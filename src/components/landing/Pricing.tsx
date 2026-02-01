"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { BaseSectionLayout } from "@/components/landing/GridSectionLayout";
import Head1 from "@/components/landing/Head1";
import Animate from "@/components/landing/Animate";

type Billing = "monthly" | "yearly";

function formatKRW(n: number) {
    // 149000 -> "149,000"
    return n.toLocaleString("ko-KR");
}

function calcDiscountedMonthly(monthly: number, discountRate: number) {
    // 20% off => * 0.8
    return Math.round(monthly * (1 - discountRate));
}

export default function PricingSection({ onClick }: { onClick: (plan: string) => void }) {
    const [billing, setBilling] = useState<Billing>("monthly");

    const DISCOUNT = 0.2;

    const plans = useMemo(() => {
        const proMonthly = 149_000;
        const maxMonthly = 279_000;

        const proShown =
            billing === "monthly"
                ? proMonthly
                : calcDiscountedMonthly(proMonthly, DISCOUNT);

        const maxShown =
            billing === "monthly"
                ? maxMonthly
                : calcDiscountedMonthly(maxMonthly, DISCOUNT);

        return [
            {
                key: "pro",
                name: "Pro",
                tagline: "소수 정예 팀이 지금 필요한 1~2명을 찾는 데 최적화",
                price: proShown,
                priceUnit: "원/월",
                buttonLabel: "문의하기",
                isPrimary: false,
                isMostPopular: false,
                features: ["월 150 Credits<br />(10명 검색당 1 credit)", "AI 스마트 서치", "정보 수집 및 인재 분석<br />(후보자 1명에 대한 딥리서치)", "무제한 채팅"],
            },
            {
                key: "max",
                name: "Max",
                tagline: "공격적인 소싱과 빠른 조직 확장이 필요한 플랜",
                price: maxShown,
                priceUnit: "원/월",
                buttonLabel: "문의하기",
                isPrimary: true,
                isMostPopular: true,
                features: [
                    "Pro의 모든 기능 포함, 및:",
                    "월 350 Credits",
                    "동시 검색 기능",
                    "AI 소싱 에이전트",
                ],
            },
            {
                key: "enterprise",
                name: "Enterprise",
                tagline: "무제한 데이터 접근 권한과 커스텀 연동을 위한 전용 플랜",
                price: null as number | null,
                priceUnit: "",
                buttonLabel: "문의하기",
                isPrimary: false,
                isMostPopular: false,
                features: [
                    "Max의 모든 기능 포함, 및:",
                    "Credits 무제한",
                    "온보딩 및 교육 지원",
                    "팀 협업 및 관리 시트",
                    "전담 고객 지원",
                ],
            },
        ];
    }, [billing]);

    return (
        <section id="pricing" className="w-full bg-black text-white">
            <Animate>
                <BaseSectionLayout>
                    <div className="w-full flex flex-col items-center justify-center text-center px-4 md:px-0">
                        {/* <Head1 className="text-white">Pricing</Head1> */}
                        <div className="mt-4 md:mt-6 text-[24px] md:text-[40px] font-semibold tracking-tight">
                            팀의 성장에 맞는 합리적인 플랜
                        </div>
                        <div className="mt-3 text-sm md:text-base text-white/60 font-light">
                            비즈니스 성장에 필요한 모든 기능을 제공합니다.
                        </div>

                        <div className="mt-8 md:mt-10">
                            <BillingToggle billing={billing} setBilling={setBilling} />
                            {/* <div className="mt-3 text-xs text-white/45">
                                연간 결제 시 <span className="text-white/70">20% 할인</span>{" "}
                                적용된 월 환산 가격입니다.
                            </div> */}
                        </div>

                        <div className="mt-12 md:mt-16 w-full max-w-[1200px]">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                                {plans.map((p) => (
                                    <PlanCard
                                        key={p.key}
                                        name={p.name}
                                        tagline={p.tagline}
                                        price={p.price}
                                        priceUnit={p.priceUnit}
                                        isPrimary={p.isPrimary}
                                        isMostPopular={p.isMostPopular}
                                        buttonLabel={p.buttonLabel}
                                        features={p.features}
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

function BillingToggle({
    billing,
    setBilling,
}: {
    billing: Billing;
    setBilling: (b: Billing) => void;
}) {
    const isYearly = billing === "yearly";

    return (
        <div className="relative inline-flex items-center">
            <div className="relative flex items-center bg-white/10 border border-white/10 rounded-full p-1 backdrop-blur">
                <button
                    type="button"
                    onClick={() => setBilling("monthly")}
                    className={`relative z-10 px-6 md:px-7 py-2.5 rounded-full text-sm md:text-sm transition-colors ${!isYearly ? "text-black" : "text-white/70 hover:text-white"
                        }`}
                >
                    월간 결제
                </button>
                <button
                    type="button"
                    onClick={() => setBilling("yearly")}
                    className={`relative z-10 px-6 md:px-7 py-2.5 rounded-full text-sm md:text-sm transition-colors ${isYearly ? "text-black" : "text-white/70 hover:text-white"
                        }`}
                >
                    연간 결제
                </button>

                {/* sliding pill */}
                <motion.div
                    className="absolute top-1 bottom-1 w-[50%] rounded-full bg-white"
                    initial={false}
                    animate={{ x: isYearly ? "100%" : "0%" }}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
            </div>

            {/* discount badge */}
            <div className="absolute -right-6 -top-3 md:-right-8 md:-top-3">
                <div className="px-3 py-1 rounded-full text-[11px] md:text-xs font-semibold bg-accenta1 text-black shadow-sm">
                    20% 할인
                </div>
            </div>
        </div>
    );
}

function PlanCard({
    name,
    tagline,
    price,
    priceUnit,
    isPrimary,
    isMostPopular,
    buttonLabel,
    features,
    onClick,
}: {
    name: string;
    tagline: string;
    price: number | null;
    priceUnit: string;
    isPrimary: boolean;
    isMostPopular: boolean;
    buttonLabel: string;
    features: string[];
    onClick: (plan: string) => void;
}) {
    return (
        <div
            className={[
                "relative w-full rounded-[28px] md:rounded-[32px] overflow-hidden",
                "bg-white/[0.06] border border-white/10",
                "px-5 md:px-7 pt-4 md:pt-6 pb-4 md:pb-6",
                isPrimary ? "bg-white/[0.08]" : "",
            ].join(" ")}
        >
            {/* {isMostPopular && (
                <div className="absolute top-0 right-0">
                    <div className="px-4 py-1.5 rounded-full text-[11px] md:text-xs font-medium font-hedvig bg-accenta1 text-black">
                        MOST POPULAR
                    </div>
                </div>
            )} */}

            <div className="flex flex-col items-start justify-start">
                <div className="text-[28px] md:text-[30px] font-semibold tracking-tight">
                    {name}
                </div>
                <div className="mt-2 text-left w-full text-sm text-white/55 leading-6 h-8">{tagline}</div>

                <div className="mt-7 md:mt-8">
                    {price === null ? (
                        <div className="text-[28px] md:text-[36px] font-semibold tracking-tight">
                            별도 문의
                        </div>
                    ) : (
                        <div className="flex items-end gap-2">
                            <div className="text-[28px] md:text-[36px] font-semibold tracking-tight leading-none">
                                {formatKRW(price)}
                            </div>
                            <div className="text-base md:text-lg text-white/60 pb-1">
                                {priceUnit}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-7 md:mt-8 w-full">
                    <button
                        type="button"
                        onClick={() => onClick(name)}
                        className={[
                            "w-full rounded-full py-2.5 md:py-3 text-sm md:text-base font-medium transition-colors",
                            isPrimary
                                ? "bg-accenta1 text-black hover:opacity-95"
                                : "bg-transparent text-accenta1 border border-accenta1/80 hover:bg-accenta1/10",
                        ].join(" ")}
                    >
                        {buttonLabel}
                    </button>
                </div>

                <div className="mt-7 md:mt-8 h-px w-full bg-white/10" />

                <ul className="mt-6 md:mt-7 flex flex-col gap-3">
                    {features.map((f, idx) => (
                        <li key={idx} className="flex items-start gap-3 text-sm md:text-sm">
                            {f.endsWith("및:") || f.endsWith(":") ? (
                                <>
                                    <span className="mt-[6px] w-2 h-2 rounded-full bg-white/25" />
                                    <span className="text-white/80 font-medium" dangerouslySetInnerHTML={{ __html: f }} />
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4 mt-0.5 text-accenta1" />
                                    <span className="text-white/70 text-left" dangerouslySetInnerHTML={{ __html: f }}></span>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
