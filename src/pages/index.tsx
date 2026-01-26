"use client";

import { BaseSectionLayout } from "@/components/landing/GridSectionLayout";
import {
  ArrowRight,
  Building,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Menu,
} from "lucide-react";
import router from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { showToast } from "@/components/toast/toast";
import { supabase } from "@/lib/supabase";
import {
  WaitlistExtraInfo,
  WaitlistExtraInfoModal,
} from "@/components/Modal/WaitlistInfoModal";
import { useCountdown } from "@/hooks/useCountDown";
import { DropdownMenu } from "@/components/ui/menu";
import VCLogos from "@/components/landing/VCLogos";
import { v4 } from "uuid";
import { useIsMobile } from "@/hooks/useIsMobile";
import Head1 from "@/components/landing/Head1";
import VCLogosWidth from "@/components/landing/VCLogosWidth";
import Animate from "@/components/landing/Animate";
import RotatingOrbTiles from "@/components/landing/Orbit";
import { FallingTags } from "@/components/landing/FallingTags";

export const isValidEmail = (email: string): boolean => {
  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
};

const CandidatePage = () => {
  const [email, setEmail] = useState("");
  const [isBelow, setIsBelow] = useState(false);
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [abtest, setAbtest] = useState(-1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [landingId, setLandingId] = useState("");

  const isMobile = useIsMobile();

  useEffect(() => {
    const localId = localStorage.getItem("harper_landing_id");
    if (!localId) {
      const newId = v4();
      localStorage.setItem("harper_landing_id", newId);
      setLandingId(newId);

      const body = {
        local_id: landingId,
        action: "enter",
        abtest: "2025_12_" + abtest.toString(),
        is_mobile: isMobile,
      };
      // supabase.from("landing_logs").insert(body);
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

  const joinWaitlist = async () => {
    setUploading(true);
    if (!isValidEmail(email)) {
      showToast({
        message: "Please enter a valid email",
        variant: "white",
      });
      setUploading(false);
      return;
    }

    const body = {
      email: email,
      local_id: landingId,
      type: 0,
      abtest: "2025_12_" + abtest.toString(),
      is_mobile: isMobile,
    };
    await supabase.from("harper_waitlist").insert(body);

    setIsOpenModal(true);
    setUploading(false);
    setIsSubmitted(true);
  };

  const handleSubmit = async (data: WaitlistExtraInfo) => {
    const body = {
      email: email,
      type: 0,
      role: data.currentRole,
      expect: data.interests,
      links: data.profileUrl,
      abtest: "2025_12_" + abtest.toString(),
      is_mobile: isMobile,
    };
    await supabase.from("harper_waitlist").upsert(body);

    showToast({
      message: "등록이 완료되었습니다. 감사합니다.",
      variant: "white",
    });
  };

  const date = new Date();
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const remain = useCountdown("2025-12-19T00:00:00");

  return (
    <main className={`min-h-screen font-inter text-white bg-black`}>
      <WaitlistExtraInfoModal
        isOpen={isOpenModal}
        onClose={() => setIsOpenModal(false)}
        onSubmit={handleSubmit}
      />
      <header className="fixed top-0 left-0 z-20 w-full flex items-center justify-between px-0 lg:px-4 h-14 md:h-20 text-sm text-white transition-all duration-300">
        <div className="flex items-center justify-between w-full px-4 md:px-8 h-full">
          <div className="text-[26px] font-garamond font-semibold w-[40%] md:w-[15%]">
            Harper
          </div>
          <nav className="hidden font-normal text-white bg-[#444444aa] backdrop-blur rounded-full md:flex items-center justify-center gap-4 text-xs sm:text-sm px-4 py-2">
            <div
              className="cursor-pointer hover:opacity-95 px-4 py-2 hover:bg-white/5 rounded-full transition-colors duration-200"
              onClick={() => {
                router.push("companies");
              }}
            >
              For companies
            </div>
            <div
              onClick={downScroll}
              className="cursor-pointer hover:opacity-95 px-4 py-2 hover:bg-white/5 rounded-full transition-colors duration-200"
            >
              FAQ
            </div>
          </nav>
          <div className="hidden md:flex w-[10%] md:w-[15%] items-center justify-end">
            <button
              onClick={upScroll}
              className="font-medium text-xs cursor-pointer py-3.5 px-6 bg-accenta1 text-black rounded-full"
            >
              Join Waitlist
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

      <div className="flex flex-col items-center justify-center px-0 md:px-20 w-full bg-black text-white h-screen">
        <div className="flex flex-col items-center justify-start md:justify-center pt-40 md:pt-0 w-full h-full text-center px-4">
          {/* <div className="mb-4 flex flex-row items-center justify-center pl-[2px] py-[2px] pr-[12px] bg-white/50 text-black gap-1.5 rounded-full">
            <div className="w-[24px] h-[24px] bg-black rounded-full flex items-center justify-center">
              <Building className="w-[14px] text-white" />
            </div>
            <div className="text-[12px] font-normal">
              현재 미국의 회사들과의 연결에 집중하고 있습니다.
            </div>
          </div> */}
          <div className="md:text-[44px] text-[28px] font-normal leading-snug mt-2">
            세계 최고 <span className="hidden md:inline">AI/ML</span> 엔지니어의
            <br /> 다음 커리어가 시작되는 곳
          </div>
          <div className="text-sm md:text-base text-hgray700 font-light mt-6">
            {/* 하퍼만의 노하우로 완벽에 가까운 포지션을 연결해드립니다. */}
            풀타임, 리모트, 파트타임, 인턴 등 글로벌 테크 스타트업으로부터 먼저
            커리어 기회를 제안 받으세요.
          </div>
          <JoinWaitlistButton
            isSubmitted={isSubmitted}
            email={email}
            setEmail={setEmail}
            joinWaitlist={joinWaitlist}
          />

          <div className="flex items-center flex-row gap-2 mt-16">
            <div className="relative items-baseline gap-1 text-hgray700 font-normal flex">
              <div>500+ in the waitlist </div>
            </div>
            <div className="flex -space-x-2">
              <div className="h-7 w-7 rounded-full border border-white/30">
                <Image
                  src="/images/person1.png"
                  alt="person1"
                  className="rounded-full"
                  width={28}
                  height={28}
                />
              </div>
              <div className="h-7 w-7 rounded-full border border-white/30 bg-white/40">
                <Image
                  src="/images/person2.png"
                  alt="person2"
                  className="rounded-full"
                  width={28}
                  height={28}
                />
              </div>
              <div className="h-7 w-7 rounded-full border border-white/30 bg-white/40">
                <Image
                  src="/images/person3.png"
                  alt="person3"
                  className="rounded-full"
                  width={28}
                  height={28}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Animate>
        <BaseSectionLayout>
          <div className="gap-2 w-full flex flex-col items-center justify-center text-center py-6 md:py-10 px-0">
            <Head1>Harper is for you.</Head1>
            <h2 className="text-[22px] md:text-3xl text-white font-normal mt-10">
              숨겨진 최고의 기회는
              <br />
              일반 채용 시장에 공개되지 않습니다.
            </h2>
            <p className="text-base font-light md:text-lg mt-6 text-hgray700">
              {/* 하퍼는 최고의 회사와 인재에 집중하고 있습니다. */}
              {/* 하퍼는 오직 글로벌 AI 리더십의 중심의 */}
              하퍼는 현재 해외 회사들과의 연결에 집중하고 있습니다.
              <br />
              오직 하퍼에서만, 미국의 팀에게서 이직 제안을 받을 수 있습니다.
              {/* 가장 영향력 있는 기회만을 선별하여 연결합니다. */}
            </p>
          </div>
        </BaseSectionLayout>
        <VCLogosWidth />
      </Animate>
      <div className="h-48" />
      <Animate>
        <BaseSectionLayout>
          <Animate>
            <Head1 className="text-white">Why harper?</Head1>
          </Animate>
          <Animate>
            <div className="flex flex-col md:flex-row mt-12 gap-16">
              <WhyImageSection
                title="하퍼와의 단 한 번의 대화로,<br />무한한 기회를 얻으세요"
                desc="서류 지원과 인터뷰를 공고마다 반복할 필요가 없습니다.<br />단 한 번의 대화만으로 등록한 뒤 정규직·파트타임·프리랜서 등 개인에게 최적화된 모든 커리어 기회를 제안받으세요."
                imageSrc="/images/feat1.png"
              />
              <WhyImageSection
                title="기존에 볼 수 없었던<br />지원자에 대한 깊은 이해"
                desc="블로그, GitHub, 작성한 논문 등 모든 비정형 정보를 종합적으로 분석하여 기존의 이력서에는 담기지 않았던 디테일한 정보까지 프로필에 담아냅니다. 데이터에 기반해 지원자의 선호와 숨겨진 역량까지 정확히 파악하고, 완벽에 가까운 포지션만을 선별하여 제안합니다."
                imageSrc="/images/why2.png"
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
            <div className="text-[15px] md:text-base text-left leading-[26px] font-normal text-hgray700">
              하퍼는 올라왔다 사라지는 공고들, 반복적인 지원 및 1차 인터뷰,
              그리고 지원자의 역량과 역량과 니즈를 제대로 이해하지 못한 채
              이루어지는 리크루터의 제안들.
              <br /> 이러한 비효율적인 채용 프로세스를 AI로 개선하고자 합니다.
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
                  question="누가 제 프로필을 볼 수 있나요?"
                  answer="하퍼의 엄격한 심사 기준을 통과한 검증된 기업만 프로필을 열람할 수 있습니다. 특히, 지원자의 현재 소속된 회사는 IP/도메인 차단 시스템을 통해 철저히 비공개 처리되어 익명성을 완벽하게 보장합니다."
                />
                <QuestionAnswer
                  question="당장 구직/이직 의사가 없더라도 등록해둘 수 있나요?"
                  answer="네 가능합니다. 하퍼는 정규직 채용 외에도 파트타임, 프리랜싱, 자문 등 지원자님의 커리어에 도움이 될 수 있는 다양한 형태의 기회를 함께 연결합니다. 현재 이직 의사나 정규직 여부와 관계없이, 시장 최고 수준의 제안을 받아보시고, 커리어를 확장할 수 있는 새로운 가능성을 편하게 탐색하세요."
                />
                <QuestionAnswer
                  question="어떤 회사들에게서 제안이 오나요?"
                  answer="글로벌 성장 잠재력을 갖춘 딥테크(Deep Tech) 및 AI 분야의 혁신적인 테크 기업들입니다. 하퍼는 AI 매칭 시스템을 통해 지원자분들의 역량과 니즈에 부합하는 포지션을 직접 찾아 해당 기업에 가입을 요청합니다. 이처럼 맞춤형 매칭을 통해 모든 지원자분들이 최소 한 번 이상의 퀄리티 높은 제안을 반드시 받으실 수 있도록 보장합니다."
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
              <Head1 className="text-3xl md:text-[42px]">
                Get Opportunities.
              </Head1>
              <div className="text-lg font-light text-white/90 mt-8 leading-7">
                하퍼는 구직 서비스가 아닙니다.
                <br />
                커리어의 옵션을 늘리는 인프라입니다.
                {/* <br />
                우선 기회를 받아보고 결정하세요. */}
              </div>
              <div>
                <JoinWaitlistButton
                  isSubmitted={isSubmitted}
                  email={email}
                  setEmail={setEmail}
                  joinWaitlist={joinWaitlist}
                />
                <div className="text-sm md:text-base font-light text-white/80 mt-2 leading-7">
                  서비스 런칭까지{" "}
                  <span className="text-white font-normal">{remain}</span>{" "}
                  남았습니다.
                  <br />
                  {/* 메일을 남겨주시면 출시와 함께 가장 먼저 안내드릴게요. */}
                </div>
              </div>
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

const JoinWaitlistButton = ({
  isSubmitted,
  email,
  setEmail,
  joinWaitlist,
}: {
  isSubmitted: boolean;
  email: string;
  setEmail: (email: string) => void;
  joinWaitlist: () => void;
}) => {
  return (
    <>
      {isSubmitted ? (
        <div className="relative mt-16">
          <div
            className={`py-5 px-8 font-light text-sm border text-white bg-white/10 border-white/15 hover:border-white/30 focus:ring-white/50 rounded-lg transition-all duration-300 focus:outline-none focus:ring-1`}
          >
            감사합니다! 곧 연락드리겠습니다.
          </div>
        </div>
      ) : (
        <div className="relative mt-16">
          <input
            type="email"
            className="py-5 px-6 font-light text-sm sm:text-sm border text-white
                  bg-white/20 border-[rgba(255,255,255,0.04)] rounded-full min-w-[320px] sm:min-w-[380px]
                  transition-all duration-300 hover:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/50"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Example@gmail.com"
          />
          <div
            onClick={joinWaitlist}
            className="absolute flex flex-row items-center justify-center gap-1 font-medium
                  group cursor-pointer right-1.5 top-1/2 -translate-y-1/2 text-[14px]
                  bg-accenta1 text-black px-4 md:px-5 py-4 rounded-full transition-all duration-300"
          >
            <span>Join waitlist</span>
            <ArrowRight
              size={18}
              strokeWidth={2.2}
              className="text-black group-hover:w-[14px] w-0 transition-all duration-300"
            />
          </div>
        </div>
      )}
    </>
  );
};

function QuestionAnswer({
  question,
  answer,
  index = 1,
}: {
  question: string;
  answer: string;
  index?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`border-b border-white/20 w-full px-1 md:px-[30px] py-6 md:py-[32px] gap-4 ${
        index === 3 ? "border-b-0" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between md:justify-start text-left"
      >
        <span
          className={`text-base transition-colors hover:text-white ${
            open ? "text-white" : "text-hgray700"
          }`}
        >
          {question}
        </span>

        <span
          className={`ml-6 inline-flex h-6 w-6 items-center justify-center transition-transform duration-300 ${
            open ? "rotate-180" : "rotate-0"
          }`}
        >
          <ChevronDown size={16} strokeWidth={1.5} className="text-hgray700" />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 pb-2 pr-10 text-sm leading-6 text-white/70 text-left">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
            title="간단한 가입 만으로,<br />역량 심층 분석 프로필 생성"
            desc="간단히 가입하고, 기존 이력서와 공개 활동 데이터(블로그, 포트폴리오 등)를 통합하세요. 하퍼가 이를 다각도로 분석하여, 이력서에 담기지 않은 당신의 잠재력과 선호도까지 담아내는 프로필을 완성하고 보호합니다."
            imageSrc="orbit"
          />
        </Animate>
        <Animate>
          <ImageSection
            title="단 하나의 프로필로<br />숨겨진 모든 기회를 선점"
            desc="완성된 심층 프로필을 기반으로, 하퍼가 정규직, 파트타임을 가리지 않고 커리어 성장에 딱 맞는 좋은 기회를 쉬지 않고 상시로 선별하여 연결해 드립니다.<br />하퍼는 지원자님만을 위한 24/7 AI recruiter입니다."
            imageSrc="/images/feat3.png"
            padding
          />
        </Animate>
        <Animate>
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
        </Animate>
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
      className={`flex flex-col md:flex-row justify-center items-center w-full max-w-full md:gap-[60px] gap-6 mb-8 md:mt-0 ${
        opposite ? "flex-col md:flex-row-reverse" : ""
      } px-5 md:px-0`}
    >
      <div className="h-[26vw] min-h-[250px] md:min-h-[380px] w-full flex relative overflow-hidden justify-end items-end rounded-3xl bg-white/10 md:bg-white/5">
        {imageSrc === "orbit" ? (
          <RotatingOrbTiles />
        ) : (
          <>
            {padding ? (
              <Image
                src={imageSrc}
                alt={title}
                width={480}
                height={320}
                className="object-cover w-[90%]"
              />
            ) : (
              <Image src={imageSrc} alt={title} fill className="object-cover" />
            )}
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
  return (
    <div className="flex flex-col w-full items-center justify-center md:items-start md:justify-start max-w-full gap-8 px-5 md:px-0">
      <div className="h-[240px] md:h-[380px] relative w-full flex justify-center items-center rounded-2xl bg-gradpastel2">
        {imageSrc === "/images/feat1.png" ? (
          <div className="mr-8 w-full">
            <FallingTags theme="white" startDelay={800} />
          </div>
        ) : (
          <Image
            src={imageSrc}
            alt={title}
            width={400}
            height={320}
            className="max-w-[80%]"
          />
        )}
      </div>
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
