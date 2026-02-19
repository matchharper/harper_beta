"use client";

import { BaseSectionLayout } from "@/components/landing/GridSectionLayout";
import { Menu } from "lucide-react";
import router from "next/router";
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { showToast } from "@/components/toast/toast";
import { DropdownMenu } from "@/components/ui/menu";
import { v4 } from "uuid";
import { useIsMobile } from "@/hooks/useIsMobile";
import Head1 from "@/components/landing/Head1";
import Animate from "@/components/landing/Animate";
import { OrbitIconsSmall } from "@/components/landing/Orbit";
import { FallingTagsSmall } from "@/components/landing/FallingTagsSmall";
import QuestionAnswer from "@/components/landing/Questions";
import PricingSection from "@/components/landing/Pricing";
import { logger } from "@/utils/logger";
import { supabase } from "@/lib/supabase";
import LoginModal from "@/components/Modal/LoginModal";
import RowImageSection from "@/components/landing/RowImageSection";
import GradientBackground from "@/components/landing/GradientBackground";
import { useMessages } from "@/i18n/useMessage";
import RotatingText from "@/components/RotatingText";
import DarkVeil from "@/components/Darkveli";
import { useCountryLang } from "@/hooks/useCountryLang";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import GaPageView from "@/components/ga";

export const isValidEmail = (email: string): boolean => {
  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
};

const CandidatePage = () => {
  const [isBelow, setIsBelow] = useState(false);
  const [abtest, setAbtest] = useState(-1);
  const [landingId, setLandingId] = useState("");
  const [isOpenLoginModal, setIsOpenLoginModal] = useState(false);
  const [isTeamEmail, setIsTeamEmail] = useState(false);
  const [isTeamEmailChecked, setIsTeamEmailChecked] = useState(false);
  const { m, locale } = useMessages();
  const { companyUser } = useCompanyUserStore();
  const countryLang = useCountryLang();

  const isMobile = useIsMobile();
  const interactiveRef = useRef<HTMLDivElement>(null);

  const whySectionRef = useRef<HTMLDivElement>(null);
  const priceSectionRef = useRef<HTMLDivElement>(null);
  const faqSectionRef = useRef<HTMLDivElement>(null);
  const hasLoggedFirstScrollRef = useRef(false);

  const addLog = async (type: string) => {
    // if (!isTeamEmailChecked || isTeamEmail || !landingId) return;
    const body = {
      local_id: landingId,
      type: type,
      is_mobile: isMobile,
      country_lang: countryLang,
    };
    await supabase.from("landing_logs").insert(body);
  };

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

  const initLog = async () => {
    const newId = v4();
    localStorage.setItem("harper_landing_id_0209", newId);
    localStorage.setItem("harper_landing_last_visit_at", Date.now().toString());
    setLandingId(newId);

    const body = {
      local_id: newId,
      type: "new_visit",
      is_mobile: isMobile,
      country_lang: countryLang,
    };
    await supabase.from("landing_logs").insert(body);
  };

  useEffect(() => {
    if (!isTeamEmailChecked) return;
    const localId = localStorage.getItem("harper_landing_id_0209");
    if (!localId) {
      initLog();
    } else {
      logger.log("\n\n 호출 👻 localId : ", localId);
      setLandingId(localId as string);
    }
  }, [isTeamEmailChecked, isTeamEmail]);

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
  }, [landingId]);

  // useEffect(() => {
  //   const abtest = localStorage.getItem("harper_abtest");
  //   if (abtest) {
  //     setAbtest(parseInt(abtest));
  //   } else {
  //     let newAbtest = Math.random();

  //     if (newAbtest < 0.5) {
  //       newAbtest = 0;
  //     } else {
  //       newAbtest = 1;
  //     }
  //     setAbtest(newAbtest);

  //     localStorage.setItem("harper_abtest", newAbtest.toString());
  //   }
  // }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;

      if (!hasLoggedFirstScrollRef.current && currentY > 0 && landingId) {
        hasLoggedFirstScrollRef.current = true;
        addLog("first_scroll_down");
      }

      if (!isBelow && currentY > window.innerHeight - 100) {
        setIsBelow(true);
      }

      if (isBelow && currentY <= window.innerHeight - 100) {
        setIsBelow(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isBelow, landingId]);

  const upScroll = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleContactUs = async () => {
    await navigator.clipboard.writeText("chris@asksonus.com");
    showToast({
      message: m.help.emailCopied,
      variant: "white",
    });
  };

  const setLocaleCookie = (next: "ko" | "en") => {
    if (typeof document === "undefined") return;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`;
    window.location.reload();
  };

  const login = async () => {
    addLog("click_login_google");
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auths/callback?lid=${localStorage.getItem("harper_landing_id_0209") ?? ""}&cl=${encodeURIComponent(countryLang)}`
        : undefined;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo,
      },
    });

    if (error) throw error;
    if (data?.url && typeof window !== "undefined") {
      window.location.assign(data.url);
    }
    return data;
  };

  const customLogin = async (email: string, password: string) => {
    logger.log("customLogin : ", email, password);
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      logger.log("성공 ", data);

      if (data.user?.user_metadata.email_verified) {
        setIsOpenLoginModal(false);
        router.push("/invitation");
      }

      return null;
    } catch (error) {
      return null;
    }
  };

  const NavItem = ({
    label,
    onClick,
  }: {
    label: string;
    onClick: () => void;
  }) => {
    return (
      <div
        className="cursor-pointer hover:opacity-95 px-5 py-2 hover:bg-white/5 rounded-full transition-colors duration-200"
        onClick={onClick}
      >
        {label}
      </div>
    );
  };

  const StartButton = ({
    type,
    size = "md",
  }: {
    type: string;
    size?: "md" | "sm";
  }) => {
    const sizeClass = {
      md: "py-4 px-8 mt-12 text-base",
      sm: "py-3 px-6 text-xs",
    }[size];

    return (
      <div
        onClick={() => {
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
        }}
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
        {m.companyLanding.startButton}
      </div>
    );
  };

  return (
    <main className={`min-h-screen font-inter text-white bg-black w-screen`}>
      <LoginModal
        open={isOpenLoginModal}
        onClose={() => setIsOpenLoginModal(false)}
        onGoogle={login}
        onConfirm={customLogin}
      />
      <header className="fixed top-0 left-0 z-20 w-full flex items-center justify-between px-0 lg:px-4 h-14 md:h-20 text-sm text-white transition-all duration-300">
        <div className="flex items-center justify-between w-full px-4 md:px-8 h-full">
          <div className="text-[26px] font-garamond font-semibold w-[40%] md:w-[15%]">
            Harper
          </div>
          <nav className="hidden font-normal text-white bg-[#444444aa] backdrop-blur rounded-full md:flex items-center justify-center gap-2 text-xs sm:text-sm px-4 py-2">
            <NavItem
              label={m.companyLanding.nav.intro}
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
            <NavItem
              label={m.companyLanding.nav.howItWorks}
              onClick={() => {
                window.scrollTo({
                  top: whySectionRef.current?.offsetTop,
                  behavior: "smooth",
                });
              }}
            />
            <NavItem
              label={m.companyLanding.nav.pricing}
              onClick={() => {
                window.scrollTo({
                  top: priceSectionRef.current?.offsetTop,
                  behavior: "smooth",
                });
              }}
            />
            <NavItem
              label={m.companyLanding.nav.faq}
              onClick={() => {
                window.scrollTo({
                  top: faqSectionRef.current?.offsetTop,
                  behavior: "smooth",
                });
              }}
            />
          </nav>
          <div className="hidden md:flex w-[10%] md:w-[15%] items-center justify-end">
            <StartButton type="click_nav_start" size="sm" />
          </div>
          <div className="block md:hidden">
            <DropdownMenu
              buttonLabel={<Menu className="w-4 h-4" />}
              items={[
                {
                  label: m.companyLanding.nav.intro,
                  onClick: () =>
                    window.scrollTo({ top: 0, behavior: "smooth" }),
                },
                {
                  label: m.companyLanding.nav.howItWorks,
                  onClick: () =>
                    window.scrollTo({
                      top: whySectionRef.current?.offsetTop,
                      behavior: "smooth",
                    }),
                },
                {
                  label: m.companyLanding.nav.pricing,
                  onClick: () =>
                    window.scrollTo({
                      top: priceSectionRef.current?.offsetTop,
                      behavior: "smooth",
                    }),
                },
                {
                  label: m.companyLanding.nav.faq,
                  onClick: () =>
                    window.scrollTo({
                      top: faqSectionRef.current?.offsetTop,
                      behavior: "smooth",
                    }),
                },
              ]}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-col items-center justify-center px-0 md:px-20 w-full bg-black text-white h-[86vh] md:h-[90vh]">
        <div className="absolute top-0 left-0 w-full h-[90%] opacity-40">
          <DarkVeil
            hueShift={189}
            noiseIntensity={0}
            scanlineIntensity={0}
            speed={1.2}
            scanlineFrequency={0}
            warpAmount={0}
          />
        </div>
        <div className="z-10 flex flex-col items-center justify-start md:justify-center pt-32 md:pt-0 w-full h-full text-center px-4">
          {/* <div className="mb-4 flex flex-row items-center justify-center pl-[2px] py-[2px] pr-[12px] text-white bg-[#444444aa] backdrop-blur gap-2 rounded-full">
            <div className="w-[24px] h-[24px] bg-black rounded-full flex items-center justify-center">
              <Image src="/svgs/logo.svg" alt="logo" width={12} height={12} />
            </div>
            <div className="text-[12px] font-normal">
              {m.companyLanding.hero.badge}
            </div>
          </div> */}
          <div className="md:text-[56px] text-[32px] font-semibold leading-snug mt-2 flex flex-col items-center justify-center gap-2">
            <div>{m.companyLanding.hero.titleLine1} Data.</div>
            <div className="flex flex-row items-center justify-center gap-4">
              {m.companyLanding.hero.titleLine2Prefix}{" "}
              <RotatingText
                texts={["Intelligence", "Decision", "Knowledge", "Insight"]}
                mainClassName="lg:px-4 md:px-3 px-2 font-hedvig bg-accenta1 text-black overflow-hidden py-0 sm:py-0 md:py-0 justify-center rounded-lg inline-block"
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
          <div className="text-sm md:text-base text-hgray700 font-light mt-6">
            <span
              dangerouslySetInnerHTML={{
                __html: m.companyLanding.hero.subtitle,
              }}
            />
          </div>
          <StartButton type="click_hero_start" />
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
            <Head1>{m.companyLanding.section1.title}</Head1>
            <h2 className="text-[22px] md:text-3xl text-white font-normal mt-10">
              {m.companyLanding.section1.headlineLine1}
              <br />
              {m.companyLanding.section1.headlineLine2}
            </h2>
            <p className="text-base font-hedvig font-light md:text-lg mt-6 px-2 text-hgray700">
              {m.companyLanding.section1.bodyLine1}
              <br />
              {m.companyLanding.section1.bodyLine2}
            </p>
          </div>
        </BaseSectionLayout>
        {/* <VCLogosWidth /> */}
      </Animate>
      <div ref={whySectionRef} />
      <div className="h-48" />
      <Animate>
        <BaseSectionLayout>
          <Animate>
            <Head1 className="text-white">{m.companyLanding.why.title}</Head1>
          </Animate>
          <Animate>
            <div className="flex flex-col md:flex-row mt-12 gap-8">
              <WhyImageSection
                title={m.companyLanding.why.cards[0].title}
                desc={m.companyLanding.why.cards[0].desc}
                imageSrc="/images/feat1.png"
              />
              <WhyImageSection
                title={m.companyLanding.why.cards[1].title}
                desc={m.companyLanding.why.cards[1].desc}
                imageSrc="/images/feat4.png"
              />
              <WhyImageSection
                title={m.companyLanding.why.cards[2].title}
                desc={m.companyLanding.why.cards[2].desc}
                imageSrc="orbit"
              />
            </div>
          </Animate>
        </BaseSectionLayout>
      </Animate>
      <div className="h-48" />
      <FeatureSection />
      <div className="h-28 md:h-48" />
      <Animate>
        <BaseSectionLayout>
          <div className="w-[90%] max-w-[600px] flex flex-col">
            {/* <div className="font-hedvig mb-2 text-xl text-accenta1 w-full text-center">
              Why choose us
            </div> */}
            <div className="flex flex-col items-start gap-4 bg-white/20 rounded-2xl px-6 md:px-[30px] py-6 md:py-8">
              <div className="text-[15px] md:text-base text-left leading-[30px] font-normal text-hgray700">
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
      <div ref={priceSectionRef} />
      <div className="h-28 md:h-40" />
      <PricingSection
        onClick={(plan: string, _billing: "monthly" | "yearly") => {
          addLog("click_pricing_" + plan);
          setIsOpenLoginModal(true);
        }}
      />
      <div ref={faqSectionRef} />
      <div className="h-28 md:h-40" />
      <Animate>
        <BaseSectionLayout>
          <div className="flex flex-col items-center justify-center w-full pt-4">
            <div className="w-full flex flex-col items-center justify-center pb-2">
              <div className="text-[28px] md:text-4xl font-garamond font-medium">
                {m.companyLanding.faq.title}
              </div>
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
      <div className="h-4 md:h-40" />
      <Animate duration={0.8}>
        <div className="relative bg-black w-screen py-10">
          <GradientBackground interactiveRef={interactiveRef} />
          <div className="absolute top-0 left-0 w-full h-[50%] bg-gradient-to-t from-transparent to-black" />
          <div className="flex flex-col items-center justify-center w-full lg:w-[94%] py-40 text-white z-40">
            <Head1 className="text-xl md:text-[32px] z-40">
              {m.companyLanding.closing.title}
            </Head1>
            <div className="text-3xl md:text-5xl text-center font-medium text-white/90 mt-8 md:leading-normal z-40">
              {m.companyLanding.closing.headlineLine1}
              <div className="md:h-1 h-1" />
              {m.companyLanding.closing.headlineLine2}
            </div>
            <StartButton type="click_footer_start" />
          </div>
        </div>
      </Animate>
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between border-t border-white/20 py-10 md:py-8 w-[100%] md:w-[94%] mx-auto px-4 md:px-0 gap-6 md:gap-0">
        <div className="flex flex-row items-end justify-start gap-8 md:gap-10">
          <div className="text-3xl font-semibold font-garamond">Harper</div>
          <div className="text-xs md:text-sm font-extralight">
            © Harper. <span className="ml-4">2026</span>
          </div>
        </div>
        <div className="flex flex-row items-center gap-4">
          <div className="flex items-center gap-2 text-xs md:text-sm font-extralight text-white/80">
            <button
              type="button"
              onClick={() => setLocaleCookie("ko")}
              className={`hover:text-white/90 transition ${locale === "ko" ? "text-white" : ""}`}
            >
              한국어
            </button>
            <span className="text-white/40">|</span>
            <button
              type="button"
              onClick={() => setLocaleCookie("en")}
              className={`hover:text-white/90 transition ${locale === "en" ? "text-white" : ""}`}
            >
              English
            </button>
          </div>
          <div
            onClick={handleContactUs}
            className="text-xs md:text-sm font-extralight cursor-pointer hover:text-white/90 text-white/80"
          >
            {m.companyLanding.footer.contact}
          </div>
        </div>
      </div>
    </main>
  );
};

export default CandidatePage;

const FeatureSection = () => {
  const { m } = useMessages();

  return (
    <BaseSectionLayout>
      <Animate>
        <Head1 className="text-white">{m.companyLanding.feature.title}</Head1>
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
        {/* <Animate>
          <ImageSection
            title={
              isMobile
                ? "빠르게 성장하는 글로벌 <br/>스타트업으로부터의 제안"
                : "한국에서, 해외 스타트업<br />오퍼를 받는 가장 빠른 방법"
              // : "빠르게 성장하는<br />글로벌 스타트업으로부터의 제안"
            }
            desc="하퍼에서는 현재 일본, 미국 등 해외의 스타트업들도 한국의 인재를 찾고 있습니다.<br />최고 퀄리티의 제안을 받고 세계로 진출하세요."
            imageSrc="/images/why1.png"
            opposite
          />
        </Animate> */}
      </div>
    </BaseSectionLayout>
  );
};

const WhyImageSection = ({
  title,
  desc,
  imageSrc,
}: {
  title: string;
  desc: string;
  imageSrc: string;
}) => {
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
        <div
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
};
