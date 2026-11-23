import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useRef, useState } from "react";
import type React from "react";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import CareerLandingEmailCaptureForm from "@/components/landing/career/CareerLandingEmailCaptureForm";
import { ClosingSection } from "@/components/landing/temporal/ClosingSection";
import { FeatureSections } from "@/components/landing/temporal/FeatureSections";
import { GoogleStartAction } from "@/components/landing/temporal/GoogleStart";
import { HeroSection } from "@/components/landing/temporal/HeroSection";
import { ProductDemoSection } from "@/components/landing/temporal/ProductDemo";
import { SocialProofSection } from "@/components/landing/temporal/SocialProofSection";
import { TemporalAppBar } from "@/components/landing/temporal/TemporalAppBar";
import { TrustSection } from "@/components/landing/temporal/TrustSection";
import { VoicesSection } from "@/components/landing/temporal/VoicesSection";
import { TEMPORAL_KEYFRAMES, tw } from "@/components/landing/temporal/tw";
import { useLandingStatsExperiment } from "@/hooks/useLandingStatsExperiment";
import { assignLandingStatsVariant } from "@/lib/landingStatsExperiment.server";
import type { LandingStatsVariant } from "@/lib/landingStatsExperiment";
import { useCareerLandingStart } from "@/hooks/useCareerLandingStart";
import {
  isCareerEmailFirstVariant,
  useCareerSignupFlowExperiment,
} from "@/hooks/useCareerSignupFlowExperiment";
import { cn } from "@/lib/cn";
import { MessagesProvider, type Locale } from "@/i18n/useMessage";
import { resolveLocaleFromLanguage } from "@/i18n/localeResolution";
import {
  CAREER_LANDING_HERO_COPY_ABTEST_COOKIE,
  resolveCareerLandingHeroCopyAbtestType,
  usesCareerLandingHeroCopyB,
  type CareerLandingHeroCopyAbtestType,
} from "@/lib/career/utm";
import { CAREER_EMAIL_ONBOARDING_VARIANT } from "@/lib/careerEmailOnboarding/constants";
import { getCompanyLocalePath } from "@/lib/companyLandingSeo";
import { TALENT_NETWORK_REFERRAL_SOURCE_LANDING_PAGE } from "@/lib/talentNetworkReferral";
import { useAuthStore } from "@/store/useAuthStore";
import { useTalentNetworkReferralCapture } from "@/hooks/useTalentNetworkReferralCapture";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

/*
 * 후보자 랜딩. 화면은 `src/components/landing/temporal/`의 섹션을 쓰고(시안: /temporal_index),
 * 검색 노출(메타·hreflang·구조화 데이터)과 유입·실험 기록은 이 파일에서 그대로 관리한다.
 */

const SITE_URL = getConfiguredPublicSiteUrl();
const LANDING_HOME_URL = `${SITE_URL}/`;
const LANDING_OG_IMAGE_URL = `${SITE_URL}/images/logos/thumbnail.png`;
const LANDING_LOGO_URL = `${SITE_URL}/images/logo.png`;
const LINKEDIN_COMPANY_URL = "https://www.linkedin.com/company/matchharper/";
const LANDING_LOCALE_PATHS: Record<Locale, string> = {
  en: "/en",
  ko: "/ko",
};

function buildSiteUrl(path: string) {
  if (path === "/") return LANDING_HOME_URL;
  return `${SITE_URL}${path}`;
}

function getLandingLocaleUrl(locale: Locale) {
  return buildSiteUrl(LANDING_LOCALE_PATHS[locale]);
}

function getLandingLanguage(locale: Locale) {
  return locale === "ko" ? "ko-KR" : "en-US";
}

function getLandingOgLocale(locale: Locale) {
  return locale === "ko" ? "ko_KR" : "en_US";
}

/** 검색 결과·공유 카드에 쓰는 제목과 설명. 화면 문구는 각 섹션 컴포넌트에 있다. */
const LANDING_META = {
  ko: {
    title: "Harper(하퍼) - 나만의 AI 커리어 에이전트",
    description:
      "Harper(하퍼)는 AI 커리어 에이전트입니다. 원하는 방향을 한 번 말하면 맞는 기회를 찾아 대신 지원하고, 채용 공고가 없는 회사는 대표에게 메일을 보냅니다. 회원님이 승인하기 전에는 아무것도 보내지 않습니다.",
  },
  en: {
    title: "Harper - Your AI Career Agent",
    description:
      "Harper is an AI career agent. Say what you want once: it finds roles, applies for you, and emails founders when there’s no posting. Nothing is sent without your approval.",
  },
} satisfies Record<Locale, { title: string; description: string }>;

/** 메인 문구 실험(`heroCopyAbtestType`) B의 본문. A는 메인 섹션의 기본 문구를 쓴다. */
const HERO_BODY_VARIANT_B: Record<Locale, readonly string[]> = {
  ko: [
    "Harper가 다음 커리어로 적합한 역할을 찾고,",
    "최종적으로 합류하기까지 필요한 모든 과정을 도와드립니다.",
  ],
  en: [
    "Harper finds the right role for your next move,",
    "and helps with every step it takes to land it.",
  ],
};

export type LandingKoVfPageProps = {
  heroCopyAbtestType: CareerLandingHeroCopyAbtestType;
  landingStatsVariant: LandingStatsVariant;
  locale: Locale;
  routeLocale: Locale | null;
};

type RequestHeaders = Record<string, string | string[] | undefined>;
type RequestCookies = Partial<Record<string, string>>;

function readHeader(headers: RequestHeaders, name: string) {
  const value = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeLocale(value: unknown): Locale | null {
  return value === "ko" || value === "en" ? value : null;
}

function getLocaleLanguageFromAcceptLanguage(acceptLanguage: string) {
  const primaryLocale =
    acceptLanguage.split(",")[0]?.split(";")[0]?.trim() ?? "";
  const [rawLanguage] = primaryLocale.replace(/_/g, "-").split("-");
  return (rawLanguage ?? "").toLowerCase();
}

function resolveLandingLocale(
  headers: RequestHeaders,
  cookies: RequestCookies
): Locale {
  const cookieLocale = normalizeLocale(cookies.NEXT_LOCALE);
  if (cookieLocale) return cookieLocale;

  const language = getLocaleLanguageFromAcceptLanguage(
    readHeader(headers, "accept-language")
  );
  return resolveLocaleFromLanguage(language);
}

function buildHeroCopyAbtestCookie(value: CareerLandingHeroCopyAbtestType) {
  return [
    `${CAREER_LANDING_HERO_COPY_ABTEST_COOKIE}=${value}`,
    "Path=/",
    "Max-Age=31536000",
    "SameSite=Lax",
  ].join("; ");
}

export function getLandingPageServerSideProps(
  routeLocale: Locale | null = null
): GetServerSideProps<LandingKoVfPageProps> {
  return async ({ req, res, query }) => {
    const heroCopyAbtestType = resolveCareerLandingHeroCopyAbtestType(
      req.cookies[CAREER_LANDING_HERO_COPY_ABTEST_COOKIE]
    );
    res.setHeader("Set-Cookie", buildHeroCopyAbtestCookie(heroCopyAbtestType));
    const landingStatsVariant = assignLandingStatsVariant({ req, res, query });

    return {
      props: {
        heroCopyAbtestType,
        landingStatsVariant,
        locale: routeLocale ?? resolveLandingLocale(req.headers, req.cookies),
        routeLocale,
      },
    };
  };
}

export const getServerSideProps: GetServerSideProps<LandingKoVfPageProps> =
  getLandingPageServerSideProps();

function buildLandingStructuredData(args: {
  canonicalUrl: string;
  description: string;
  language: string;
  title: string;
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Harper",
        alternateName: "하퍼",
        url: LANDING_HOME_URL,
        logo: {
          "@type": "ImageObject",
          url: LANDING_LOGO_URL,
          width: 138,
          height: 153,
        },
        sameAs: [LINKEDIN_COMPANY_URL],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Harper",
        alternateName: ["하퍼", "matchharper.com"],
        url: LANDING_HOME_URL,
        inLanguage: args.language,
        publisher: {
          "@id": `${SITE_URL}/#organization`,
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${args.canonicalUrl}#software-application`,
        name: "Harper",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: args.canonicalUrl,
        image: LANDING_OG_IMAGE_URL,
        inLanguage: args.language,
        description: args.description,
        publisher: {
          "@id": `${SITE_URL}/#organization`,
        },
      },
      {
        "@type": "WebPage",
        "@id": `${args.canonicalUrl}#webpage`,
        name: args.title,
        url: args.canonicalUrl,
        description: args.description,
        inLanguage: args.language,
        isPartOf: {
          "@id": `${SITE_URL}/#website`,
        },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: LANDING_OG_IMAGE_URL,
          width: 2906,
          height: 1898,
        },
      },
    ],
  };
}

export default function LandingKoVfPage({
  heroCopyAbtestType,
  landingStatsVariant,
  locale,
  routeLocale,
}: LandingKoVfPageProps) {
  const [landingLocale, setLandingLocale] = useState<Locale>(locale);
  const meta = LANDING_META[landingLocale];
  const router = useRouter();
  const canonicalUrl = routeLocale
    ? getLandingLocaleUrl(routeLocale)
    : LANDING_HOME_URL;
  const language = getLandingLanguage(landingLocale);
  const ogLocale = getLandingOgLocale(landingLocale);
  const alternateOgLocale = landingLocale === "ko" ? "en_US" : "ko_KR";
  const landingStructuredData = buildLandingStructuredData({
    canonicalUrl,
    description: meta.description,
    language,
    title: meta.title,
  });
  const heroBody = usesCareerLandingHeroCopyB(heroCopyAbtestType)
    ? HERO_BODY_VARIANT_B[landingLocale]
    : undefined;
  const signupFlowExperiment = useCareerSignupFlowExperiment();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const isEmailFirstTreatment =
    signupFlowExperiment.ready &&
    !authLoading &&
    !user &&
    isCareerEmailFirstVariant(signupFlowExperiment.variant);
  const {
    addLandingLog,
    careerStartHref,
    countryLang,
    handleCareerStartClick,
    isMobile,
    landingId,
    marketingSource,
  } = useCareerLandingStart({
    abtestType: signupFlowExperiment.abtestType,
    landingIdOverride: signupFlowExperiment.localId,
    trackingEnabled: signupFlowExperiment.ready,
  });
  useLandingStatsExperiment({
    variant: landingStatsVariant,
    localId: landingId,
    enabled: signupFlowExperiment.ready && !authLoading && !user,
    isMobile,
    countryLang,
  });
  const emailCaptureRef = useRef<HTMLDivElement | null>(null);
  useTalentNetworkReferralCapture(TALENT_NETWORK_REFERRAL_SOURCE_LANDING_PAGE);
  const emailCaptureHref = "#email-capture";
  const handleEmailCaptureFocus = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      emailCaptureRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      window.setTimeout(() => {
        emailCaptureRef.current
          ?.querySelector<HTMLInputElement>('input[type="email"]')
          ?.focus();
      }, 360);
    },
    []
  );
  const effectiveCareerStartHref = isEmailFirstTreatment
    ? emailCaptureHref
    : careerStartHref;
  const effectiveCareerStartClick = isEmailFirstTreatment
    ? handleEmailCaptureFocus
    : handleCareerStartClick;
  const handleLandingLocaleChange = (nextLocale: Locale) => {
    setLandingLocale(nextLocale);
    void router.push(LANDING_LOCALE_PATHS[nextLocale]);
  };

  return (
    <MessagesProvider locale={landingLocale}>
      <Head>
        <title>{meta.title}</title>
        <meta key="description" name="description" content={meta.description} />
        <meta
          key="robots"
          name="robots"
          content="index,follow,max-image-preview:large"
        />
        <link key="canonical" rel="canonical" href={canonicalUrl} />
        <link
          key="alternate-en"
          rel="alternate"
          hrefLang="en"
          href={getLandingLocaleUrl("en")}
        />
        <link
          key="alternate-ko"
          rel="alternate"
          hrefLang="ko"
          href={getLandingLocaleUrl("ko")}
        />
        <link
          key="alternate-x-default"
          rel="alternate"
          hrefLang="x-default"
          href={LANDING_HOME_URL}
        />
        <meta key="og:type" property="og:type" content="website" />
        <meta key="og:site_name" property="og:site_name" content="Harper" />
        <meta key="og:locale" property="og:locale" content={ogLocale} />
        <meta
          key="og:locale:alternate"
          property="og:locale:alternate"
          content={alternateOgLocale}
        />
        <meta key="og:title" property="og:title" content={meta.title} />
        <meta
          key="og:description"
          property="og:description"
          content={meta.description}
        />
        <meta key="og:url" property="og:url" content={canonicalUrl} />
        <meta
          key="og:image"
          property="og:image"
          content={LANDING_OG_IMAGE_URL}
        />
        <meta
          key="og:image:secure_url"
          property="og:image:secure_url"
          content={LANDING_OG_IMAGE_URL}
        />
        <meta key="og:image:alt" property="og:image:alt" content={meta.title} />
        <meta
          key="og:image:type"
          property="og:image:type"
          content="image/png"
        />
        <meta key="og:image:width" property="og:image:width" content="1360" />
        <meta key="og:image:height" property="og:image:height" content="944" />
        <meta
          key="twitter:card"
          name="twitter:card"
          content="summary_large_image"
        />
        <meta key="twitter:title" name="twitter:title" content={meta.title} />
        <meta
          key="twitter:description"
          name="twitter:description"
          content={meta.description}
        />
        <meta
          key="twitter:image"
          name="twitter:image"
          content={LANDING_OG_IMAGE_URL}
        />
        <meta
          key="twitter:image:alt"
          name="twitter:image:alt"
          content={meta.title}
        />
        <script
          key="ld-landing"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(landingStructuredData),
          }}
        />
        <link rel="icon" href="/images/logo.ico" />
      </Head>
      <style jsx global>{`
        html,
        body {
          overflow-x: clip !important;
          overflow-y: visible !important;
          position: relative;
          background: #f3f5f7;
        }

        nextjs-portal {
          display: none !important;
        }
      `}</style>
      <style>{TEMPORAL_KEYFRAMES}</style>

      <div className={cn("career-landing-preview", tw.page)}>
        <TemporalAppBar
          companiesHref={getCompanyLocalePath(landingLocale)}
          startHref={careerStartHref}
          onStartClick={handleCareerStartClick}
          signedIn={Boolean(user)}
        />

        <main>
          <HeroSection
            startHref={careerStartHref}
            onStartClick={handleCareerStartClick}
            body={heroBody}
            action={
              <div
                id="email-capture"
                ref={emailCaptureRef}
                className="flex w-full justify-center"
              >
                {isEmailFirstTreatment ? (
                  <CareerLandingEmailCaptureForm
                    abtestType={signupFlowExperiment.abtestType}
                    addLandingLog={addLandingLog}
                    countryLang={countryLang}
                    isMobile={isMobile}
                    localId={landingId}
                    locale={landingLocale}
                    pagePath={router.asPath || "/"}
                    source={marketingSource}
                    variant={CAREER_EMAIL_ONBOARDING_VARIANT}
                  />
                ) : (
                  <GoogleStartAction
                    startHref={careerStartHref}
                    onStartClick={handleCareerStartClick}
                  />
                )}
              </div>
            }
          />
          <SocialProofSection
            locale={landingLocale}
            showStats={landingStatsVariant === "B"}
          />
          <ProductDemoSection />
          <FeatureSections />
          <TrustSection />
          <VoicesSection />
          <ClosingSection
            variant="a"
            startHref={effectiveCareerStartHref}
            onStartClick={effectiveCareerStartClick}
            action={
              isEmailFirstTreatment ? (
                <CareerLandingEmailCaptureForm
                  abtestType={signupFlowExperiment.abtestType}
                  addLandingLog={addLandingLog}
                  countryLang={countryLang}
                  fieldClassName="bg-neutral-100"
                  isMobile={isMobile}
                  localId={landingId}
                  locale={landingLocale}
                  pagePath={router.asPath || "/"}
                  source={marketingSource}
                  variant={CAREER_EMAIL_ONBOARDING_VARIANT}
                />
              ) : undefined
            }
          />
        </main>

        <CareerLandingFooter
          careerStartHref={effectiveCareerStartHref}
          onCareerStartClick={effectiveCareerStartClick}
          locale={landingLocale}
          onLocaleChange={handleLandingLocaleChange}
        />
      </div>
    </MessagesProvider>
  );
}
