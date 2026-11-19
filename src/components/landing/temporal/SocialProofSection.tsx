import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { CountUpNumber } from "@/components/common/TextAnimations";
import type { Locale } from "@/i18n/useMessage";
import {
  COMPANY_LANDING_STATS_CACHE_SECONDS,
  type CompanyLandingStats,
} from "@/lib/companyLandingStats";
import { cn } from "@/lib/cn";
import { SectionReveal, useC } from "./primitives";
import { tw } from "./tw";

type Logo = { src: string; name: string; width: number };

const KO_LOGOS: Logo[] = [
  { src: "/images/logos/sn.png", name: "SNU", width: 32 },
  { src: "/images/logos/kai.png", name: "KAIST", width: 40 },
  { src: "/images/logos/cmu.png", name: "CMU", width: 54 },
  { src: "/images/logos/stan.png", name: "Stanford", width: 46 },
  { src: "/images/logos/toss.png", name: "Toss", width: 70 },
  { src: "/svgs/cohere.svg", name: "Cohere", width: 80 },
  { src: "/images/logos/amazon.svg", name: "Amazon", width: 70 },
  { src: "/images/logos/naver.svg", name: "Naver", width: 66 },
  { src: "/images/logos/moloco.png", name: "Moloco", width: 86 },
];

const EN_LOGOS: Logo[] = [
  { src: "/images/logos/cmu.png", name: "CMU", width: 54 },
  { src: "/images/logos/stan.png", name: "Stanford", width: 44 },
  { src: "/images/logos/harvard.svg", name: "Harvard", width: 70 },
  { src: "/svgs/cohere.svg", name: "Cohere", width: 80 },
  { src: "/images/logos/nvidia.svg", name: "NVIDIA", width: 80 },
  { src: "/images/logos/microsoft.svg", name: "Microsoft", width: 76 },
  { src: "/images/logos/amazon.svg", name: "Amazon", width: 64 },
];

/** 신뢰 지표 문구. 한국어·영어를 `c("한글", "English")`로 나란히 적는다. */
function useProofCopy() {
  const c = useC();
  return {
    title: c(
      "이런 곳에서 일한 분들이 Harper와 다음 커리어를 준비하고 있어요",
      "Trusted by people from"
    ),
    stats: [
      {
        key: "talent",
        label: c("Harper와 함께하는 인재", "People working with Harper"),
        unit: c("명", ""),
      },
      {
        key: "messages",
        label: c("한 명과 주고받은 평균 메시지", "Average messages per person"),
        unit: c("개", ""),
      },
      {
        key: "assessed",
        label: c("검토한 기회의 수", "Opportunities assessed"),
        unit: c("건", ""),
      },
    ],
  };
}

export function SocialProofSection({
  locale,
  showStats = true,
}: {
  locale: Locale;
  /** 지표 노출 실험(`landingStatsVariant`)의 B에서만 지표를 보여 준다. */
  showStats?: boolean;
}) {
  const copy = useProofCopy();
  const { data: stats } = useQuery<CompanyLandingStats>({
    queryKey: ["company-landing-stats", "daily-snapshot-v1"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/company/landing-stats", { signal });
      if (!response.ok) throw new Error("Could not load statistics");
      return response.json();
    },
    staleTime: COMPANY_LANDING_STATS_CACHE_SECONDS * 1000,
    retry: 1,
  });
  const values: Record<string, number | null | undefined> = {
    talent: stats?.talentCount,
    messages: stats?.averageConversationMessages,
    assessed: stats?.assessedPairCount,
  };
  const logos = locale === "ko" ? KO_LOGOS : EN_LOGOS;

  return (
    <section className="relative pb-24 pt-16 md:pb-32 md:pt-20">
      <div className={tw.shell}>
        <SectionReveal>
          <h2 className="text-center text-[13.5px] font-medium text-(--tl-ink-2)">
            {copy.title}
          </h2>
          <ul className="mx-auto mt-7 flex max-w-[1100px] flex-wrap items-center justify-center gap-x-10 gap-y-6 md:gap-x-12">
            {logos.map((logo) => (
              <li
                key={logo.name}
                className="relative h-7 opacity-50 grayscale"
                style={{ width: logo.width }}
              >
                <Image
                  src={logo.src}
                  alt={logo.name}
                  fill
                  sizes={`${logo.width * 2}px`}
                  className="object-contain"
                />
              </li>
            ))}
          </ul>
        </SectionReveal>

        {showStats ? (
          <SectionReveal className="mt-16 md:mt-20">
            <dl className="mx-auto grid max-w-[980px] grid-cols-1 sm:grid-cols-3">
              {copy.stats.map((stat, index) => {
                const value = values[stat.key];
                return (
                  <div
                    key={stat.key}
                    className={cn(
                      "flex flex-col items-center px-6 py-6 text-center sm:py-2",
                      index > 0 &&
                        "border-t border-(--tl-hair) sm:border-l sm:border-t-0"
                    )}
                  >
                    <dt className="order-2 mt-3 text-[13.5px] text-(--tl-ink-2)">
                      {stat.label}
                    </dt>
                    <dd className={cn(tw.statValue, "order-1")}>
                      {value == null ? (
                        <span className="text-(--tl-ink-3)">—</span>
                      ) : (
                        <>
                          <CountUpNumber value={value} locale={locale} />
                          {stat.unit ? (
                            <span className={tw.statUnit}>{stat.unit}</span>
                          ) : null}
                        </>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </SectionReveal>
        ) : null}
      </div>
    </section>
  );
}
