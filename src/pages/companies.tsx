"use client";

import { BaseSectionLayout } from "@/components/landing/GridSectionLayout";
import {
  Menu,
} from "lucide-react";
import router from "next/router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { showToast } from "@/components/toast/toast";
import { DropdownMenu } from "@/components/ui/menu";
import { v4 } from "uuid";
import { useIsMobile } from "@/hooks/useIsMobile";
import Head1 from "@/components/landing/Head1";
import Animate from "@/components/landing/Animate";
import RotatingOrbTiles, { OrbitIconsSmall } from "@/components/landing/Orbit";
import { QuestionAnswer } from ".";
import { FallingTagsSmall } from "@/components/landing/FallingTagsSmall";
import PricingSection from "@/components/landing/Pricing";
import { logger } from "@/utils/logger";
import { supabase } from "@/lib/supabase";
import LoginModal from "@/components/Modal/LoginModal";
import RotatingWord from "@/components/landing/RotatingWord";

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

  const isMobile = useIsMobile();

  const whySectionRef = useRef<HTMLDivElement>(null);
  const priceSectionRef = useRef<HTMLDivElement>(null);
  const faqSectionRef = useRef<HTMLDivElement>(null);

  const addLog = async (type: string) => {
    const body = {
      local_id: landingId,
      type: type,
      is_mobile: isMobile,
    };
    await supabase.from("landing_logs").insert(body);
  };

  useEffect(() => {
    const localId = localStorage.getItem("harper_landing_id");
    if (!localId) {
      const newId = v4();
      localStorage.setItem("harper_landing_id", newId);
      setLandingId(newId);

      const body = {
        local_id: landingId,
        type: "enter_landing",
        is_mobile: isMobile,
      };
      supabase.from("landing_logs").insert(body);
    } else {
      setLandingId(localId as string);
    }
  }, []);

  useEffect(() => {
    const abtest = localStorage.getItem("harper_abtest");
    if (abtest) {
      setAbtest(parseInt(abtest));
    } else {
      let newAbtest = Math.random();

      if (newAbtest < 0.5) {
        newAbtest = 0;
      } else {
        newAbtest = 1;
      }
      setAbtest(newAbtest);

      localStorage.setItem("harper_abtest", newAbtest.toString());
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;

      if (!isBelow && currentY > window.innerHeight - 100) {
        setIsBelow(true);
      }

      if (isBelow && currentY <= window.innerHeight - 100) {
        setIsBelow(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isBelow]);

  const upScroll = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const downScroll = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight - 1400,
      behavior: "smooth",
    });
  };

  const handleContactUs = async () => {
    await navigator.clipboard.writeText("chris@asksonus.com");
    showToast({
      message: "Email copied to clipboard",
      variant: "white",
    });
  };


  const login = async () => {
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;

    logger.log("redirectTo : ", redirectTo);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo,
      },
    });
    logger.log(data);

    if (error) throw error;
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
        // return data;
      }

      return null;
    } catch (error) {
      return null;
    }
  };

  const NavItem = ({ label, onClick }: { label: string, onClick: () => void }) => {
    return (
      <div
        className="cursor-pointer hover:opacity-95 px-5 py-2 hover:bg-white/5 rounded-full transition-colors duration-200"
        onClick={onClick}
      >
        {label}
      </div>
    );
  };

  return (
    <main className={`min-h-screen font-inter text-white bg-black`}>
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
            <NavItem label="소개" onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); }} />
            <NavItem label="작동 방식" onClick={() => { window.scrollTo({ top: whySectionRef.current?.offsetTop, behavior: "smooth" }); }} />
            <NavItem label="가격 정책" onClick={() => { window.scrollTo({ top: priceSectionRef.current?.offsetTop, behavior: "smooth" }); }} />
            <NavItem label="FAQ" onClick={() => { window.scrollTo({ top: faqSectionRef.current?.offsetTop, behavior: "smooth" }); }} />
          </nav>
          <div className="hidden md:flex w-[10%] md:w-[15%] items-center justify-end">
            <button
              onClick={() => {
                addLog("click_nav_start")
                setIsOpenLoginModal(true)
              }}
              className="font-medium text-xs cursor-pointer py-3.5 px-6 bg-accenta1 text-black rounded-full"
            >
              시작하기
            </button>
          </div>
          <div className="block md:hidden">
            <DropdownMenu
              buttonLabel={<Menu className="w-4 h-4" />}
              items={[
                {
                  label: "Join Waitlist",
                  onClick: upScroll,
                },
                {
                  label: "For companies",
                  onClick: () => router.push("companies"),
                },
                { label: "Referral", onClick: () => router.push("referral") },
              ]}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-col items-center justify-center px-0 md:px-20 w-full bg-black text-white h-[90vh]">
        <div className="flex flex-col items-center justify-start md:justify-center pt-32 md:pt-0 w-full h-full text-center px-4">
          <div className="mb-4 flex flex-row items-center justify-center pl-[2px] py-[2px] pr-[12px] bg-white/80 text-black gap-2 rounded-full">
            <div className="w-[24px] h-[24px] bg-black rounded-full flex items-center justify-center">
              <Image src="/svgs/logo.svg" alt="logo" width={12} height={12} />
            </div>
            <div className="text-[12px] font-normal">
              Hiring Intelligence
            </div>
          </div>
          <div className="md:text-[56px] text-[40px] font-semibold leading-snug mt-2">
            Don{"'"}t Buy <RotatingWord /><br />
            Pay for Intelligence.
          </div>
          <div className="text-sm md:text-base text-hgray700 font-light mt-6">
            단순한 검색을 넘어, 인재를 이해하는 지능을 경험하세요.
          </div>
          <div
            onClick={() => {
              addLog("click_hero_start")
              setIsOpenLoginModal(true)
            }}
            className="px-10 py-3 bg-accenta1 text-black rounded-full font-medium text-base cursor-pointer mt-12">시작하기</div>
        </div>
      </div>
      <div className="mb-20 flex flex-col items-center justify-center">
        <div className="w-90% max-w-[960px] bg-gradpastel2 overflow-hidden rounded-[30px] pt-8 flex flex-col items-center justify-center">
          <video src="/videos/usemain.mp4" autoPlay loop muted playsInline className="w-[90%] h-full object-cover rounded-t-[30px] translate-y-[40px] shadow-lg" />
        </div>
      </div>
      <Animate>
        <BaseSectionLayout>
          <div className="gap-2 w-full flex flex-col items-center justify-center text-center py-8 md:py-10 px-0">
            <Head1>Harper is for you.</Head1>
            <h2 className="text-[22px] md:text-3xl text-white font-normal mt-10">
              최고의 인재는
              <br />
              일반 채용 시장에 공개되지 않습니다.
            </h2>
            <p className="text-base font-hedvig font-light md:text-lg mt-6 text-hgray700">
              채용은 회사의 미래를 결정하는 가장 중요한 의사결정입니다.
              <br />
              하퍼는 24시간 일하고, 10배 더 빠른 AI Recruiter입니다.
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
            <Head1 className="text-white">Why harper?</Head1>
          </Animate>
          <Animate>
            <div className="flex flex-col md:flex-row mt-12 gap-8">
              <WhyImageSection
                title="Beyond Keywords"
                desc="단순한 키워드 검색을 넘어, <br />인재와 맥락을 이해하고 찾아주는 지능을 경험하세요"
                imageSrc="/images/feat1.png"
              />
              <WhyImageSection
                title="Focus on Value"
                desc="불필요한 정보를 걸러내는 시간은 <br/>저희에게 맡기세요. 꼭 필요한<br />인재만 보여드립니다."
                imageSrc="/images/feat4.png"
              />
              <WhyImageSection
                title="Intelligence on Top of Data"
                desc="정적인 정보 제공을 넘어 흩어진 정보를 하나로 모아 의사결정을 돕습니다"
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
          <div className="flex flex-col items-start gap-4 bg-white/20 rounded-2xl px-6 md:px-[30px] py-6 md:py-8 w-[90%] max-w-[600px]">
            <div className="text-[15px] md:text-base text-left leading-[30px] font-normal text-hgray700">
              하퍼는 단순한 검색 필터 서비스가 아닙니다.<br />AI Agent가 수많은 웹 정보, 글, 기록을 종합해
              이력서에 없는 맥락까지 읽고, 사람처럼 추론하고 판단하며
              조직이 원하는 인재를 직접 탐색할 수 있게 합니다.
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
                <div className="text-sm">Chris & Daniel</div>
                <div className="text-hgray700 text-xs">Co-founder</div>
              </div>
            </div>
          </div>
        </BaseSectionLayout>
      </Animate>
      <div ref={priceSectionRef} />
      <div className="h-28 md:h-40" />
      <PricingSection onClick={(plan: string) => {
        addLog("click_pricing_" + plan)
        setIsOpenLoginModal(true)
      }} />
      <div ref={faqSectionRef} />
      <div className="h-28 md:h-40" />
      <Animate>
        <BaseSectionLayout>
          <div className="flex flex-col items-center justify-center w-full pt-4">
            <div className="w-full flex flex-col items-center justify-center pb-2">
              <div className="text-[28px] md:text-4xl font-garamond font-medium">
                Questions & Answers
              </div>
              <div className="flex flex-col items-start justify-start text-white/70 font-light w-full mt-12 px-4 md:px-0">
                <QuestionAnswer
                  question="지금 바로 가입해서 사용할 수 없나요? (초대 코드는 어떻게 받나요?)"
                  answer="현재 Harper는 데이터 품질과 AI 리소스 최적화를 위해 엄선된 소수의 테크 기업을 대상으로 Private Beta를 운영 중입니다. 올해 2분기(Q2) 정식 출시를 목표로 하고 있으며, 대기명단에 등록해 주시면 온보딩을 통해 초대 코드를 발송해 드립니다."
                />
                <QuestionAnswer
                  question="AI가 분석한 데이터를 신뢰할 수 있나요?"
                  answer="네, 신뢰할 수 있습니다. Harper의 AI는 추측하지 않고 증명합니다. LinkedIn, Google Scholar, GitHub, 블로그등 웹상에 실존하는 '검증 가능한 데이터'만을 기반으로 분석하기 때문입니다. 또한, AI가 도출한 모든 인사이트에는 원본 출처가 함께 제공되므로 직접 팩트 체크가 가능합니다."
                />
                <QuestionAnswer
                  question="'키워드 검색'과 Harper의 '시맨틱 서치'는 무엇이 다른가요?"
                  answer="'Python 개발자'를 검색하는 것과, '대규모 트래픽 처리를 경험해 본 Python 백엔드 리드'를 찾는 것은 다릅니다. Harper는 단순 키워드 매칭이 아니라, 채용 담당자가 말하는 맥락과 의도를 이해하여 기술적 난제를 해결할 수 있는 최적의 후보자를 찾아냅니다."
                />
                <QuestionAnswer
                  question="어떤 직군의 인재를 찾을 수 있나요?"
                  answer="Harper의 AI 엔진은 AI 리서처(AI Researcher)와 머신러닝 엔지니어(ML Engineer) 같은 고난이도 테크 인재 발굴에 가장 특화되어 있습니다.
하지만 이에 국한되지 않고, 현재 PM(Product Manager) 및 PD(Product Designer) 등 테크 조직 내 핵심 직군에 대해서도 유의미한 검색과 프로파일링 기능을 이미 지원하고 있습니다."
                  index={3}
                />
              </div>
            </div>
          </div>
        </BaseSectionLayout>
      </Animate>
      <div className="h-4 md:h-40" />
      <Animate duration={0.8}>
        <BaseSectionLayout>
          <div className="w-full flex flex-col items-center justify-center bg-black">
            <div className="flex flex-col items-center justify-center w-full lg:w-[94%] py-40 text-white">
              <Head1 className="text-xl md:text-[32px]">
                Meet your AI recruiter.
              </Head1>
              <div className="text-3xl md:text-5xl font-medium text-white/90 mt-8 md:leading-normal">
                Harper와 함께,
                <div className="md:h-2 h-1" />
                채용을 즐거운 발견으로.
                {/* <br />
                우선 기회를 받아보고 결정하세요. */}
              </div>
              <div
                onClick={() => {
                  addLog("click_footer_start")
                  setIsOpenLoginModal(true)
                }}
                className="px-10 py-3 bg-accenta1 text-black rounded-full font-medium text-base cursor-pointer mt-12">시작하기</div>
            </div>
          </div>
        </BaseSectionLayout>
      </Animate>
      <div className="flex flex-row items-end justify-between border-t border-white/20 py-10 md:py-8 w-[100%] md:w-[94%] mx-auto px-4 md:px-0">
        <div className="flex flex-row items-end justify-start gap-8 md:gap-10">
          <div className="text-3xl font-semibold font-garamond">Harper</div>
          <div className="text-xs md:text-sm font-extralight">
            © Harper. <span className="ml-4">2026</span>
          </div>
        </div>
        <div
          onClick={handleContactUs}
          className="text-xs md:text-sm font-extralight cursor-pointer hover:text-white/90 text-white/80"
        >
          Contact Us
        </div>
      </div>
    </main>
  );
};

export default CandidatePage;

const FeatureSection = () => {
  const isMobile = useIsMobile();

  return (
    <BaseSectionLayout>
      <Animate>
        <Head1 className="text-white">How it works.</Head1>
      </Animate>
      <div className="flex flex-col w-full mt-12 gap-[30px]">
        <Animate>
          <ImageSection
            opposite={true}
            title="동료에게 설명하듯,<br />편안하게 말씀해 주세요."
            desc="정확한 직무명을 모르셔도 괜찮습니다.<br />원하시는 인재에 대해 풀어서 검색해 보세요."
            imageSrc="/videos/use1.mp4"
          />
        </Animate>
        <Animate>
          <ImageSection
            title="텍스트 뒤에 숨겨진,<br />진짜 이야기를 찾아냅니다"
            desc="어떤 관심사를 가지고 커리어를 쌓아왔는지, <br />
꾸준함과 열정은 어느 정도인지... <br />
이력서의 빈 공간을 채워주는 풍부한 배경 정보를 제공합니다. <br />
인터뷰 전에 이미 후보자와 깊은 대화를 나눈 듯한 경험을 드립니다"
            imageSrc="/videos/use2.mp4"
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

const ImageSection = ({
  title,
  desc,
  imageSrc,
  opposite = false,
  padding = false,
}: {
  title: string;
  desc: string;
  imageSrc: string;
  opposite?: boolean;
  padding?: boolean;
}) => {
  return (
    <div
      className={`flex flex-col md:flex-row justify-center items-center w-full max-w-full md:gap-[60px] gap-6 mb-8 md:mt-0 ${opposite ? "flex-col md:flex-row-reverse" : ""
        } px-5 md:px-0`}
    >
      <div className="h-[26vw] min-h-[250px] md:min-h-[380px] w-full flex relative overflow-hidden justify-end items-end rounded-3xl bg-white/10 md:bg-white/5">
        {imageSrc === "orbit" ? (
          <RotatingOrbTiles />
        ) : (
          <>
            <video
              src={imageSrc}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          </>
        )}
      </div>
      <div className="flex flex-col items-start justify-start w-full text-left gap-5">
        <div
          className="text-[26px] md:text-[32px] font-normal leading-[2.2rem] md:leading-[2.5rem]"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <div
          className="text-[15px] md:text-base leading-6 font-light text-hgray700"
          dangerouslySetInnerHTML={{ __html: desc }}
        />
      </div>
    </div>
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
      return <div className="h-[200px] md:h-[280px] relative w-full flex justify-center items-center rounded-2xl bg-gradpastel2 overflow-hidden">
        <div className="mr-8 w-full">
          <FallingTagsSmall theme="white" startDelay={800} />
        </div>
      </div>
    }

    if (imageSrc === "orbit") {
      return <div className="h-[200px] md:h-[280px] relative w-full flex justify-center items-center rounded-2xl bg-gradpastel2 overflow-hidden">
        <OrbitIconsSmall />
      </div>
    }
    return <div className="h-[200px] md:h-[280px] relative w-full flex justify-end items-end rounded-2xl bg-gradpastel2 overflow-hidden">
      <Image
        src={imageSrc}
        alt={title}
        width={400}
        height={320}
        className="max-w-[90%]"
      />
    </div>
  }
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
