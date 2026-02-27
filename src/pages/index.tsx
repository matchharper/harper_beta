"use client";

import { BaseSectionLayout } from "@/components/landing/GridSectionLayout";
import router from "next/router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useIsMobile } from "@/hooks/useIsMobile";
import Head1 from "@/components/landing/Head1";
import Animate from "@/components/landing/Animate";
import { OrbitIconsSmall } from "@/components/landing/Orbit";
import { FallingTagsSmall } from "@/components/landing/FallingTagsSmall";
import QuestionAnswer from "@/components/landing/Questions";
import { logger } from "@/utils/logger";
import { supabase } from "@/lib/supabase";
import RowImageSection from "@/components/landing/RowImageSection";
import GradientBackground from "@/components/landing/GradientBackground";
import { useMessages } from "@/i18n/useMessage";
import RotatingText from "@/components/RotatingText";
import { useCountryLang } from "@/hooks/useCountryLang";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import Footer from "@/components/landing/Footer";
import LandingHeader from "@/components/landing/LandingHeader";
import Head from "next/head";
import Link from "next/link";

export const isValidEmail = (email: string): boolean => {
  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
};

type SectionKey = "why" | "examples" | "pricing" | "faq" | "last";
type CompanyAbtestType = "company_copy_b_v1";

const SECTION_VIEW_INTERSECTION_THRESHOLD = 0.35;
const SECTION_VIEW_LOG_COOLDOWN_MS = 15000;
const COMPANY_ABTEST_TYPE: CompanyAbtestType = "company_copy_b_v1";
const LANDING_CANONICAL_URL = "https://matchharper.com/";
const LANDING_OG_IMAGE_URL = "https://matchharper.com/images/usemain.png";

const stripHtmlTags = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const LoginModal = dynamic(() => import("@/components/Modal/LoginModal"));
const PricingSection = dynamic(() => import("@/components/landing/Pricing"));
const Examples = dynamic(() => import("@/components/landing/Examples"));

export const HERO_DOT_BACKGROUND_STYLE = {
  opacity: 0.45,
  backgroundImage:
    "radial-gradient(rgba(255,255,255,0.2) 0.9px, transparent 0.9px)",
  backgroundSize: "20px 20px",
};

const createLandingId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

type StartButtonProps = {
  type: string;
  label: string;
  onClickStart: (type: string) => void;
  size?: "md" | "sm";
};

const StartButton = React.memo(function StartButton({
  type,
  label,
  onClickStart,
  size = "md",
}: StartButtonProps) {
  const sizeClass =
    size === "sm" ? "py-3 px-6 text-xs" : "py-4 px-8 mt-12 text-base";

  return (
    <div
      onClick={() => onClickStart(type)}
      className={`
      group relative
      font-medium
      cursor-pointer
      rounded-full
      bg-accenta1 text-black
      z-10

      ring-1 ring-white/10
      shadow-[0_12px_40px_rgba(180,255,120,0.25)]

      transition-all duration-200
      hover:shadow-[0_18px_60px_rgba(180,255,120,0.35)]
      hover:-translate-y-[1px]
      active:translate-y-[0px]
      active:shadow-[0_8px_20px_rgba(180,255,120,0.2)]
      ${sizeClass}`}
    >
      {label}
    </div>
  );
});

const CandidatePage = () => {
  const abtestType = COMPANY_ABTEST_TYPE;
  const [landingId, setLandingId] = useState("");
  const [isOpenLoginModal, setIsOpenLoginModal] = useState(false);
  const [isTeamEmail, setIsTeamEmail] = useState(false);
  const [isTeamEmailChecked, setIsTeamEmailChecked] = useState(false);
  const { m, locale } = useMessages();
  const { companyUser } = useCompanyUserStore();
  const countryLang = useCountryLang();

  const isMobile = useIsMobile();
  const interactiveRef = useRef<HTMLDivElement>(null);

  const whyTrackRef = useRef<HTMLDivElement>(null);
  const lastTrackRef = useRef<HTMLDivElement>(null);
  const pricingTrackRef = useRef<HTMLDivElement>(null);
  const faqTrackRef = useRef<HTMLDivElement>(null);
  const examplesTrackRef = useRef<HTMLDivElement>(null);
  const hasLoggedFirstScrollRef = useRef(false);
  const sectionLastLoggedAtRef = useRef<Record<SectionKey, number>>({
    why: 0,
    examples: 0,
    pricing: 0,
    faq: 0,
    last: 0,
  });

  const addLog = useCallback(
    async (type: string) => {
      // if (!isTeamEmailChecked || isTeamEmail || !landingId) return;
      const body = {
        local_id: landingId,
        type: type,
        abtest_type: abtestType,
        is_mobile: isMobile,
        country_lang: countryLang,
      };
      await supabase.from("landing_logs").insert(body);
    },
    [abtestType, countryLang, isMobile, landingId]
  );

  useEffect(() => {
    const excludedEmails = new Set([
      "hongbeom.heo@gmail.com",
      // "khj605123@gmail.com",
    ]);

    const updateTeamEmail = (email?: string | null) => {
      setIsTeamEmail(email ? excludedEmails.has(email) : false);
      setIsTeamEmailChecked(true);
    };

    supabase.auth.getUser().then(({ data }) => {
      updateTeamEmail(data.user?.email);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        updateTeamEmail(session?.user?.email);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const initLog = useCallback(async () => {
    const newId = createLandingId();
    localStorage.setItem("harper_landing_id_0209", newId);
    localStorage.setItem("harper_landing_last_visit_at", Date.now().toString());
    setLandingId(newId);

    const body = {
      local_id: newId,
      type: "new_visit",
      abtest_type: abtestType,
      is_mobile: isMobile,
      country_lang: countryLang,
    };
    await supabase.from("landing_logs").insert(body);
  }, [abtestType, countryLang, isMobile]);

  useEffect(() => {
    if (!isTeamEmailChecked) return;
    const localId = localStorage.getItem("harper_landing_id_0209");
    if (!localId) {
      initLog();
    } else {
      logger.log("\n\n 호출 👻 localId : ", localId);
      setLandingId(localId as string);
    }
  }, [initLog, isTeamEmailChecked, isTeamEmail]);

  useEffect(() => {
    if (!landingId) return;
    const lastVisitRaw = localStorage.getItem("harper_landing_last_visit_at");
    const now = Date.now();
    const thirtyMinutesMs = 30 * 60 * 1000;
    const lastVisitAt = lastVisitRaw ? Number(lastVisitRaw) : null;

    if (!lastVisitAt || now - lastVisitAt >= thirtyMinutesMs) {
      addLog("new_session");
    }

    localStorage.setItem("harper_landing_last_visit_at", now.toString());
  }, [addLog, landingId]);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;

      if (!hasLoggedFirstScrollRef.current && currentY > 0 && landingId) {
        hasLoggedFirstScrollRef.current = true;
        addLog("first_scroll_down");
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [addLog, landingId]);

  useEffect(() => {
    if (!landingId) return;

    const sectionElements: Array<{
      key: SectionKey;
      element: HTMLDivElement | null;
    }> = [
      { key: "why", element: whyTrackRef.current },
      { key: "examples", element: examplesTrackRef.current },
      { key: "pricing", element: pricingTrackRef.current },
      { key: "faq", element: faqTrackRef.current },
      { key: "last", element: lastTrackRef.current },
    ];

    const observedSections = sectionElements.filter(
      (
        section
      ): section is {
        key: SectionKey;
        element: HTMLDivElement;
      } => section.element !== null
    );

    if (observedSections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();

        entries.forEach((entry) => {
          const section = (entry.target as HTMLDivElement).dataset.section as
            | SectionKey
            | undefined;
          if (!section) return;

          const isVisible =
            entry.isIntersecting &&
            entry.intersectionRatio >= SECTION_VIEW_INTERSECTION_THRESHOLD;

          if (!isVisible) return;

          const lastLoggedAt = sectionLastLoggedAtRef.current[section] ?? 0;
          if (now - lastLoggedAt < SECTION_VIEW_LOG_COOLDOWN_MS) return;

          sectionLastLoggedAtRef.current[section] = now;
          addLog(`view_section_${section}`);
        });
      },
      {
        root: null,
        threshold: [0, SECTION_VIEW_INTERSECTION_THRESHOLD, 0.7],
        rootMargin: "0px 0px -15% 0px",
      }
    );

    observedSections.forEach(({ element }) => observer.observe(element));
    return () => observer.disconnect();
  }, [addLog, landingId]);

  const login = useCallback(async () => {
    addLog("click_login_google");
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auths/callback?lid=${localStorage.getItem("harper_landing_id_0209") ?? ""}&cl=${encodeURIComponent(countryLang)}&ab=${encodeURIComponent(abtestType)}`
        : undefined;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) throw error;
    if (data?.url && typeof window !== "undefined") {
      window.location.assign(data.url);
    }
    return data;
  }, [abtestType, addLog, countryLang]);

  const customLogin = useCallback(
    async (email: string, password: string) => {
      logger.log("customLogin :", email);

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          return { message: error.message };
        }

        const user = data.user;
        if (!user) {
          return { message: m.auth.invalidAccount };
        }

        const isEmailConfirmed = Boolean(
          user.email_confirmed_at || user.user_metadata?.email_verified
        );
        if (!isEmailConfirmed) {
          return { message: m.auth.emailConfirmationSent };
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) {
          return {
            message: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.",
          };
        }

        const bootstrapRes = await fetch("/api/auth/bootstrap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!bootstrapRes.ok) {
          const bootstrapJson = await bootstrapRes.json().catch(() => ({}));
          return {
            message:
              bootstrapJson?.error ??
              "계정 초기화에 실패했습니다. 다시 시도해 주세요.",
          };
        }

        setIsOpenLoginModal(false);
        router.push("/invitation");
        return null;
      } catch (error) {
        if (error instanceof Error && error.message) {
          return { message: error.message };
        }
        return { message: m.auth.invalidAccount };
      }
    },
    [m.auth.emailConfirmationSent, m.auth.invalidAccount]
  );

  const copyVariant = useMemo(() => {
    const baseCopy = {
      startButton: m.companyLanding.startButton,
      whySubtitle: m.companyLanding.why.sub,
      heroSubtitle: m.companyLanding.hero.subtitle,
      section1HeadlineLine2: m.companyLanding.section1.headlineLine2,
      section1BodyLine2: m.companyLanding.section1.bodyLine2,
      closingHeadlineLine2: m.companyLanding.closing.headlineLine2,
      whyFirstCardDesc: m.companyLanding.why.cards[0].desc,
      whyThirdCardDesc: m.companyLanding.why.cards[2].desc,
      rotatingTexts: ["Intelligence", "Decision", "Knowledge", "Insight"],
    };

    if (locale === "ko") {
      return {
        ...baseCopy,
        startButton: "무료로 시작하기",
        whySubtitle:
          "Harper는 링크드인 세일즈 네비게이터보다 더 많은 소스와 입력을 바탕으로<br />적합도가 높은 후보만 찾아서 보여드립니다.",
        whyFirstCardDesc:
          "단순한 키워드 검색을 넘어, <br />역량과 맥락을 이해하고 찾아주는 지능을 경험하세요.",
        whyThirdCardDesc:
          "링크드인, github, 논문, 트위터, SNS, 블로그 등<br />흩어진 정보를 하나로 모아 분석하고<br />인사이트를 추출해 알려줍니다.",
        heroSubtitle:
          "어떤 조건이던 AI 검색 엔진이<br />원하는 프로필을 가진 사람을 즉시 찾아드려요.",
        section1BodyLine2: "Harper는 리크루팅의 미래를 새롭게 정의합니다.",
        closingHeadlineLine2: "사람을 찾는 방식을 바꾸세요.",
      };
    }

    return {
      ...baseCopy,
      startButton: "Try for Free",
      whySubtitle:
        "Harper analyzes more sources and richer signals than LinkedIn Sales Navigator<br />to surface only the most relevant, high-fit candidates.",
      whyFirstCardDesc:
        "Go beyond simple keyword search.<br />Experience intelligence that understands skills and real-world context.",
      whyThirdCardDesc:
        "LinkedIn, GitHub, papers, Twitter, blogs, and more —<br />Harper brings scattered information together,<br />analyzes it, and extracts actionable insights.",
      heroSubtitle:
        "No matter your criteria,<br />our AI search engine instantly finds the right profiles for you.",
      section1BodyLine2:
        "Not just search results — evidence-based hiring priorities you can act on.",
      closingHeadlineLine2: "Turn hiring into a joyful discovery.",
    };
  }, [locale, m]);

  const seoMeta = useMemo(() => {
    if (locale === "ko") {
      return {
        title: "Harper | 스타트업 채용을 위한 AI 리크루터",
        description:
          "Harper는 인터넷의 모든 정보를 사용하여 원하는 사람을 찾을 수 있게 도와주는 리크루팅을 위한 도구입니다.",
        ogLocale: "ko_KR",
        language: "ko-KR",
      };
    }

    return {
      title: "Harper | AI Recruiter for Startup Hiring",
      description:
        "Harper helps startup teams discover and prioritize high-fit candidates with AI-powered sourcing.",
      ogLocale: "en_US",
      language: "en-US",
    };
  }, [locale]);

  const softwareApplicationStructuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Harper",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: seoMeta.language,
      url: LANDING_CANONICAL_URL,
      image: LANDING_OG_IMAGE_URL,
      description: seoMeta.description,
    }),
    [seoMeta.description, seoMeta.language]
  );

  const faqStructuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: seoMeta.language,
      mainEntity: m.companyLanding.faq.items.map((item) => ({
        "@type": "Question",
        name: stripHtmlTags(item.question),
        acceptedAnswer: {
          "@type": "Answer",
          text: stripHtmlTags(item.answer),
        },
      })),
    }),
    [m.companyLanding.faq.items, seoMeta.language]
  );

  const clickStart = useCallback(
    (type: string) => {
      addLog(type);
      if (companyUser && companyUser.email) {
        if (companyUser.is_authenticated) {
          router.push("/my");
          return;
        }
        router.push("/invitation");
        return;
      }
      setIsOpenLoginModal(true);
    },
    [addLog, companyUser]
  );

  const handleCloseLoginModal = useCallback(() => {
    setIsOpenLoginModal(false);
  }, []);

  const handlePricingPlanClick = useCallback(
    (plan: string, _billing: "monthly" | "yearly") => {
      addLog("click_pricing_" + plan);
      setIsOpenLoginModal(true);
    },
    [addLog]
  );

  const handleHeaderStartClick = useCallback(() => {
    clickStart("click_nav_start");
  }, [clickStart]);

  return (
    <>
      <Head>
        <title>{seoMeta.title}</title>
        <meta name="description" content={seoMeta.description} />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <link rel="canonical" href={LANDING_CANONICAL_URL} />
        <link
          rel="alternate"
          hrefLang="x-default"
          href={LANDING_CANONICAL_URL}
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Harper" />
        <meta property="og:locale" content={seoMeta.ogLocale} />
        <meta property="og:title" content={seoMeta.title} />
        <meta property="og:description" content={seoMeta.description} />
        <meta property="og:url" content={LANDING_CANONICAL_URL} />
        <meta property="og:image" content={LANDING_OG_IMAGE_URL} />
        <meta property="og:image:alt" content={seoMeta.title} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoMeta.title} />
        <meta name="twitter:description" content={seoMeta.description} />
        <meta name="twitter:image" content={LANDING_OG_IMAGE_URL} />
        <script
          key="ld-software-app"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareApplicationStructuredData),
          }}
        />
        <script
          key="ld-faq"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqStructuredData),
          }}
        />
      </Head>

      <main className={`min-h-screen font-inter text-white bg-black w-screen`}>
        {isOpenLoginModal && (
          <LoginModal
            open={isOpenLoginModal}
            onClose={handleCloseLoginModal}
            onGoogle={login}
            onConfirm={customLogin}
          />
        )}
        <LandingHeader
          onStartClick={handleHeaderStartClick}
          startButtonLabel="시작하기"
        />
        <nav className="sr-only" aria-label="Landing section links">
          <a href="#intro">{m.companyLanding.nav.intro}</a>
          <a href="#how-it-works">{m.companyLanding.nav.howItWorks}</a>
          <Link href="/pricing">{m.companyLanding.nav.pricing}</Link>
          <a href="#faq">{m.companyLanding.nav.faq}</a>
        </nav>

        <div
          id="intro"
          className="flex flex-col items-center justify-center px-0 md:px-20 w-full bg-black text-white h-[86vh] md:h-[90vh]"
        >
          <div className="absolute top-0 left-0 w-full h-[90%]">
            {/* <InteractiveDotGridBackground /> */}
            <div
              className="pointer-events-none absolute inset-0"
              style={HERO_DOT_BACKGROUND_STYLE}
            />
          </div>
          <div className="z-10 flex flex-col items-center justify-start md:justify-center pt-32 md:pt-0 w-full h-full text-center px-4">
            <h1 className="sr-only">
              {`${m.companyLanding.hero.titleLine1} Data. ${m.companyLanding.hero.titleLine2Prefix} ${copyVariant.rotatingTexts[0]}.`}
            </h1>
            <div className="md:text-[52px] text-[32px] font-medium leading-tight mt-2 flex flex-col items-center justify-center gap-2">
              <div>{m.companyLanding.hero.titleLine1} Data.</div>
              <div className="flex flex-row items-center justify-center gap-4">
                {m.companyLanding.hero.titleLine2Prefix}{" "}
                <RotatingText
                  texts={copyVariant.rotatingTexts}
                  mainClassName="lg:px-3 md:px-2 px-1.5 rounded-sm font-hedvig bg-accenta1 text-black overflow-hidden py-0 sm:py-0 md:py-0 justify-center inline-block"
                  staggerFrom={"last"}
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "-120%" }}
                  staggerDuration={0.02}
                  splitLevelClassName="overflow-hidden pb-0.5 sm:pb-1 md:pb-1"
                  transition={{ type: "spring", damping: 30, stiffness: 400 }}
                  rotationInterval={2800}
                />
              </div>
              {/* <span className="font-hedvig text-accenta1 font-normal italic">
              {m.companyLanding.hero.titleLine2Highlight}
            </span> */}
            </div>
            <div className="text-base md:text-lg text-hgray700 font-light mt-6">
              <span
                dangerouslySetInnerHTML={{
                  __html: copyVariant.heroSubtitle,
                }}
              />
            </div>
            <StartButton
              type="click_hero_start"
              onClickStart={clickStart}
              label={copyVariant.startButton}
            />
          </div>
        </div>
        <div className="mb-20 mt-12 md:mt-0 flex flex-col items-center justify-center">
          <div className="w-[90%] max-w-[960px] bg-gradpastel2 overflow-hidden md:rounded-[30px] rounded-2xl pt-8 md:pt-0 flex flex-col items-center justify-center">
            <video
              src="/videos/usemain.mp4"
              poster="/images/usemain.png"
              autoPlay
              loop
              muted
              playsInline
              className="w-[90%] h-full object-cover  md:rounded-t-[30px] rounded-t-2xl md:translate-y-[40px] translate-y-0 shadow-lg"
            />
          </div>
        </div>
        <Animate>
          <BaseSectionLayout>
            <div className="gap-2 w-full flex flex-col items-center justify-center text-center py-8 md:py-10 px-0">
              <Head1 as="h2">{m.companyLanding.section1.title}</Head1>
              <h3 className="text-[22px] md:text-3xl text-white font-normal mt-10">
                {m.companyLanding.section1.headlineLine1}
                <br />
                {copyVariant.section1HeadlineLine2}
              </h3>
              <p className="text-base font-hedvig font-light md:text-lg mt-6 px-2 text-hgray700">
                {m.companyLanding.section1.bodyLine1}
                <br />
                {copyVariant.section1BodyLine2}
              </p>
            </div>
          </BaseSectionLayout>
          {/* <VCLogosWidth /> */}
        </Animate>
        <div id="how-it-works" />
        <div className="h-48" />
        <Animate>
          <BaseSectionLayout>
            <Animate>
              <Head1 as="h2" className="text-white text-center w-full">
                {m.companyLanding.why.title}
              </Head1>
              <div className="text-sm font-hedvig font-light md:text-lg mt-6 px-2 text-hgray700">
                <span
                  dangerouslySetInnerHTML={{
                    __html: copyVariant.whySubtitle,
                  }}
                />
              </div>
            </Animate>
            <Animate>
              <div ref={whyTrackRef} data-section="why">
                <div className="flex flex-col md:flex-row mt-12 gap-8">
                  <WhyImageSection
                    title={m.companyLanding.why.cards[0].title}
                    desc={copyVariant.whyFirstCardDesc}
                    imageSrc="/images/feat1.png"
                  />
                  <WhyImageSection
                    title={m.companyLanding.why.cards[1].title}
                    desc={m.companyLanding.why.cards[1].desc}
                    imageSrc="/images/feat4.png"
                  />
                  <WhyImageSection
                    title={m.companyLanding.why.cards[2].title}
                    desc={copyVariant.whyThirdCardDesc}
                    imageSrc="orbit"
                  />
                </div>
              </div>
            </Animate>
          </BaseSectionLayout>
        </Animate>
        <div className="h-48" />
        <FeatureSection />
        <div ref={examplesTrackRef} data-section="examples" />
        <div className="h-28 md:h-48" />
        <Examples onCtaClick={clickStart} />
        <div className="h-28 md:h-48" />
        <Animate>
          <BaseSectionLayout>
            <div className="w-[90%] max-w-[600px] flex flex-col">
              <div className="flex flex-col items-start gap-4 bg-white/20 rounded-2xl px-6 md:px-[30px] py-6 md:py-8">
                <div className="text-[13px] md:text-base text-left md:leading-[30px] leading-[26px] font-normal text-hgray700">
                  <span
                    dangerouslySetInnerHTML={{
                      __html: m.companyLanding.testimonial.body,
                    }}
                  />
                </div>
                <div className="flex flex-row items-center justify-start gap-4 mt-6">
                  <div>
                    <Image
                      src="/images/cofounder.png"
                      alt="person1"
                      width={60}
                      height={60}
                    />
                  </div>
                  <div className="flex flex-col items-start justify-start gap-1">
                    <div className="text-sm">
                      {m.companyLanding.testimonial.name}
                    </div>
                    <div className="text-hgray700 text-xs">
                      {m.companyLanding.testimonial.role}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </BaseSectionLayout>
        </Animate>
        <div id="pricing" />

        <div className="h-28 md:h-40" />
        <div ref={pricingTrackRef} data-section="pricing">
          <PricingSection onClick={handlePricingPlanClick} />
        </div>

        <div id="faq" />
        <div ref={faqTrackRef} data-section="faq">
          <div className="h-28 md:h-40" />
          <Animate>
            <BaseSectionLayout>
              <div className="flex flex-col items-center justify-center w-full pt-4">
                <div className="w-full flex flex-col items-center justify-center pb-2">
                  <Head1 className="text-white">
                    {m.companyLanding.faq.title}
                  </Head1>
                  <div className="flex flex-col items-start justify-start text-white/70 font-light w-full mt-12 px-4 md:px-0">
                    {m.companyLanding.faq.items.map((item, index) => (
                      <QuestionAnswer
                        key={item.question}
                        question={item.question}
                        answer={item.answer}
                        index={index}
                        onOpen={() => addLog(`click_faq_${index}`)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </BaseSectionLayout>
          </Animate>
        </div>
        <div className="h-4 md:h-40" />
        <Animate duration={0.8}>
          <div ref={lastTrackRef} data-section="last">
            <div className="relative bg-black w-screen py-10">
              <GradientBackground interactiveRef={interactiveRef} />
              <div className="absolute top-0 left-0 w-full h-[50%] bg-gradient-to-t from-transparent to-black" />
              <div className="flex flex-col items-center justify-center w-full lg:w-[94%] py-40 text-white z-40">
                <Head1 as="h2" className="text-xl md:text-[32px] z-40">
                  {m.companyLanding.closing.title}
                </Head1>
                <div className="text-2xl md:text-[40px] text-center font-medium text-white/90 mt-8 md:leading-normal z-40">
                  {m.companyLanding.closing.headlineLine1}
                  <div className="md:h-1 h-1" />
                  {copyVariant.closingHeadlineLine2}
                </div>
                <StartButton
                  type="click_footer_start"
                  onClickStart={clickStart}
                  label={copyVariant.startButton}
                />
              </div>
            </div>
          </div>
        </Animate>
        <Footer onClickStart={clickStart} />
      </main>
    </>
  );
};

export default CandidatePage;

const FeatureSection = React.memo(function FeatureSection() {
  const { m } = useMessages();

  return (
    <BaseSectionLayout>
      <Animate>
        <Head1 as="h2" className="text-white">
          {m.companyLanding.feature.title}
        </Head1>
      </Animate>
      <div className="flex flex-col w-full mt-12 gap-[30px]">
        <Animate>
          <RowImageSection
            opposite={true}
            label={m.companyLanding.feature.rows[0].label}
            title={m.companyLanding.feature.rows[0].title}
            desc={m.companyLanding.feature.rows[0].desc}
            imageSrc="/videos/use1.mp4"
          />
        </Animate>
        <Animate>
          <RowImageSection
            label={m.companyLanding.feature.rows[1].label}
            title={m.companyLanding.feature.rows[1].title}
            desc={m.companyLanding.feature.rows[1].desc}
            imageSrc="/videos/use2.mp4"
            padding
          />
        </Animate>
        <Animate>
          <RowImageSection
            opposite={true}
            label={m.companyLanding.feature.rows[2].label}
            title={m.companyLanding.feature.rows[2].title}
            desc={m.companyLanding.feature.rows[2].desc}
            imageSrc="/videos/use3.mp4"
            padding
          />
        </Animate>
      </div>
    </BaseSectionLayout>
  );
});

const WhyImageSection = React.memo(function WhyImageSection({
  title,
  desc,
  imageSrc,
}: {
  title: string;
  desc: string;
  imageSrc: string;
}) {
  const imgReturn = () => {
    if (imageSrc === "/images/feat1.png") {
      return (
        <div className="h-[200px] md:h-[280px] relative w-full flex justify-center items-center rounded-2xl bg-gradpastel2 overflow-hidden">
          <div className="mr-8 w-full">
            <FallingTagsSmall theme="white" startDelay={800} />
          </div>
        </div>
      );
    }

    if (imageSrc === "orbit") {
      return (
        <div className="h-[200px] md:h-[280px] relative w-full flex justify-center items-center rounded-2xl bg-gradpastel2 overflow-hidden">
          <OrbitIconsSmall />
        </div>
      );
    }
    return (
      <div className="h-[200px] md:h-[280px] relative w-full flex justify-end items-end rounded-2xl bg-gradpastel2 overflow-hidden">
        <Image
          src={imageSrc}
          alt={title}
          width={400}
          height={320}
          className="max-w-[90%]"
        />
      </div>
    );
  };
  return (
    <div className="flex flex-col w-full items-center justify-center md:items-start md:justify-start max-w-full gap-8 px-5 md:px-0">
      {imgReturn()}
      <div className="flex flex-col items-start justify-start w-full gap-4 text-left">
        <h3
          className="text-[26px] md:text-3xl font-normal leading-[2.2rem] md:leading-[2.5rem]"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <div
          className="text-sm md:text-base leading-6 font-light text-hgray700"
          dangerouslySetInnerHTML={{ __html: desc }}
        />
      </div>
    </div>
  );
});
