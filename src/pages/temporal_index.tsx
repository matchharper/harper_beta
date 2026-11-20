import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useState } from "react";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import {
  ClosingSection,
  type ClosingVariant,
} from "@/components/landing/temporal/ClosingSection";
import { FeatureSections } from "@/components/landing/temporal/FeatureSections";
import { HeroSection } from "@/components/landing/temporal/HeroSection";
import { IntroStatement } from "@/components/landing/temporal/IntroStatement";
import { ProductDemoSection } from "@/components/landing/temporal/ProductDemo";
import { SocialProofSection } from "@/components/landing/temporal/SocialProofSection";
import { TemporalAppBar } from "@/components/landing/temporal/TemporalAppBar";
import { TrustSection } from "@/components/landing/temporal/TrustSection";
import { VoicesSection } from "@/components/landing/temporal/VoicesSection";
import { TEMPORAL_KEYFRAMES, tw } from "@/components/landing/temporal/tw";
import { useCareerLandingStart } from "@/hooks/useCareerLandingStart";
import { resolveLocaleFromLanguage } from "@/i18n/localeResolution";
import { MessagesProvider, type Locale } from "@/i18n/useMessage";
import { getCompanyLocalePath } from "@/lib/companyLandingSeo";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/store/useAuthStore";

type TemporalLandingProps = {
  locale: Locale;
  closing: ClosingVariant;
};

const CLOSING_VARIANTS: ClosingVariant[] = ["a", "c", "d"];

function readLanguage(value: string | undefined) {
  const primary = value?.split(",")[0]?.split(";")[0]?.trim() ?? "";
  return (primary.replace(/_/g, "-").split("-")[0] ?? "").toLowerCase();
}

export const getServerSideProps: GetServerSideProps<
  TemporalLandingProps
> = async ({ query, req }) => {
  const queryLang = typeof query.lang === "string" ? query.lang : undefined;
  const cookieLang = req.cookies.NEXT_LOCALE;
  const locale: Locale =
    queryLang === "ko" || queryLang === "en"
      ? queryLang
      : cookieLang === "ko" || cookieLang === "en"
        ? cookieLang
        : resolveLocaleFromLanguage(
            readLanguage(
              Array.isArray(req.headers["accept-language"])
                ? req.headers["accept-language"][0]
                : req.headers["accept-language"]
            )
          );
  const closingQuery = typeof query.closing === "string" ? query.closing : "a";
  const closing = CLOSING_VARIANTS.includes(closingQuery as ClosingVariant)
    ? (closingQuery as ClosingVariant)
    : "a";
  return { props: { locale, closing } };
};

export default function TemporalLandingPage({
  locale,
  closing,
}: TemporalLandingProps) {
  // 페이지 제목·설명. 화면 문구는 각 섹션 컴포넌트에서 c("한글", "English")로 적는다.
  const c = (ko: string, en: string) => (locale === "en" ? en : ko);
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [closingVariant, setClosingVariant] = useState<ClosingVariant>(closing);
  const { addLandingLog, careerStartHref, handleCareerStartClick } =
    useCareerLandingStart();

  const changeClosing = (variant: ClosingVariant) => {
    setClosingVariant(variant);
    void router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, closing: variant },
      },
      undefined,
      { shallow: true, scroll: false }
    );
  };

  return (
    <MessagesProvider locale={locale}>
      <Head>
        <title>
          {c(
            "Harper(하퍼) - 커리어 고민부터 지원까지, 대신 해 주는 AI 에이전트",
            "Harper - The AI agent that runs your job search"
          )}
        </title>
        <meta
          name="description"
          content={c(
            "원하는 방향을 한 번 말하면 Harper가 맞는 기회를 찾아 살펴보고 대신 지원해요. 공고가 없는 회사엔 먼저 연락하고, 면접 준비까지 함께해요.",
            "Tell Harper what you want once. It finds the right roles, researches them and applies for you. No opening posted? It reaches the founder, then helps you prep for interviews."
          )}
        />
        <meta name="robots" content="noindex,nofollow" />
        <link rel="icon" href="/images/logo.ico" />
      </Head>
      <style jsx global>{`
        html,
        body {
          background: #f3f5f7;
        }
        nextjs-portal {
          display: none !important;
        }
      `}</style>
      <style>{TEMPORAL_KEYFRAMES}</style>

      <div className={cn("career-landing-preview", tw.page)}>
        <TemporalAppBar
          companiesHref={getCompanyLocalePath(locale)}
          startHref={careerStartHref}
          onStartClick={handleCareerStartClick}
          signedIn={Boolean(user)}
        />
        <main>
          <HeroSection
            startHref={careerStartHref}
            onStartClick={handleCareerStartClick}
          />
          <SocialProofSection locale={locale} />
          <ProductDemoSection />
          {/* <IntroStatement /> */}
          <FeatureSections />
          <TrustSection />
          <VoicesSection />
          <ClosingSection
            variant={closingVariant}
            onVariantChange={changeClosing}
            startHref={careerStartHref}
            onStartClick={handleCareerStartClick}
          />
        </main>
        <CareerLandingFooter
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
          locale={locale}
          onLocaleChange={(next) => {
            void router.push({
              pathname: router.pathname,
              query: { ...router.query, lang: next },
            });
          }}
        />
      </div>
    </MessagesProvider>
  );
}
