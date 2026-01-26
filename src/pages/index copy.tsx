"use client";

import GridSectionLayout from "@/components/landing/GridSectionLayout";
import { ArrowRight, ChevronRight, LoaderCircle } from "lucide-react";
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
      top: document.documentElement.scrollHeight,
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

  const borderSoft = useMemo(
    () => (abtest === 1 ? "border-beige200" : "border-xgray300"),
    [abtest]
  );
  const bgSoft = useMemo(
    () => (abtest === 1 ? "bg-beige100" : "bg-white"),
    [abtest]
  );

  return (
    <main className={`min-h-screen font-inter ${bgSoft}`}>
      <WaitlistExtraInfoModal
        isOpen={isOpenModal}
        onClose={() => setIsOpenModal(false)}
        onSubmit={handleSubmit}
      />
      <header
        className={`fixed top-0 left-0 z-20 w-full flex items-center border-b justify-between px-0 lg:px-20 h-12 md:h-14 text-sm
          ${
            isBelow
              ? `border-b-xlightgray text-black backdrop-blur ${bgSoft}/80`
              : `${
                  abtest === 1
                    ? "border-b-beige200 text-black bg-beige100"
                    : "border-b-white  text-white bg-black"
                }`
          } transition-all duration-300
          `}
      >
        <div
          className={`flex items-center justify-between w-full px-4 md:px-8 border-0 sm:border-x ${
            abtest === 1
              ? borderSoft
              : isBelow
              ? "border-black"
              : "border-white"
          } h-full`}
        >
          <div
            className={`text-xl font-garamond w-[40%] md:w-[15%] ${
              isBelow
                ? "font-bold text-xdarknavy"
                : `${
                    abtest === 1
                      ? "text-black font-bold"
                      : "text-white font-light"
                  }`
            }`}
          >
            harper
          </div>
          <nav className="hidden font-normal text-xgray600 md:flex items-center justify-center gap-8 text-xs sm:text-sm w-[40%]">
            <div
              className="cursor-pointer opacity-80 hover:opacity-95"
              onClick={() => {
                const body = {
                  local_id: landingId,
                  action: "click_company",
                  abtest: "2025_12_" + abtest.toString(),
                  is_mobile: isMobile,
                };
                // supabase.from("landing_logs").insert(body);
                router.push("companies");
              }}
            >
              For companies
            </div>
            <div
              onClick={downScroll}
              className="cursor-pointer opacity-80 hover:opacity-95"
            >
              FAQ
            </div>
          </nav>
          <div className="hidden md:flex w-[10%] md:w-[15%] items-center justify-end">
            <button
              onClick={upScroll}
              className="font-normal cursor-pointer py-2 px-4"
            >
              Join Waitlist
            </button>
          </div>
          <div className="block md:hidden">
            <DropdownMenu
              buttonLabel="Menu"
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

      <div
        className={`flex flex-col items-center justify-center px-0 md:px-20 w-full ${
          abtest === 1 ? "bg-beige100 text-black" : "bg-black text-white"
        } h-screen`}
      >
        <div
          className={`flex flex-col items-center justify-center border-0 sm:border-x ${
            borderSoft === "border-xgray300" ? "border-white" : borderSoft
          } w-full h-full text-center px-4`}
        >
          {/* <div className="mb-4 flex flex-row items-center justify-center pl-[2px] py-[2px] pr-[12px] bg-white text-black gap-1.5 rounded-full">
            <div className="w-[24px] h-[24px] bg-black rounded-full flex items-center justify-center">
              <Building className="w-[14px] text-white" />
            </div>
            <div className="text-[12px] font-normal">
              팀의 50% 이상이 미국에 오피스를 두고 있습니다.
            </div>
          </div> */}
          <div className="text-xl md:text-4xl sm:text-3xl font-medium leading-normal">
            세계 최고 AI/ML 엔지니어의
            <br /> 다음 커리어가 시작되는 곳
          </div>
          <div
            className={`text-sm md:text-lg font-light mt-8 ${
              abtest === 1 ? "text-black" : "text-white"
            }`}
          >
            {/* AI 리크루터 하퍼와의 단 한 번의 AI 통화로 지원자의 360도 프로필을 완성합니다. 글로벌 AI 스타트업의 최적의 기회를 하퍼가 상시로 연결해 드립니다. */}
            글로벌 역량을 펼쳐 AI의 미래를 주도하세요.{" "}
            <br className="hidden md:block" />
            하퍼가 세계적인 리더십과 함께한 최적의 커리어 기회를 쉬지 않고 찾아
            연결해 드립니다.
            {/* 이력서를 업로드하고, AI Recruiter와 통화하세요.
            <br /> 그 다음부터는 Harper가 최적의 팀에게서 먼저 제안받으실 수
            있게 합니다. */}
          </div>
          {isSubmitted ? (
            <div className="relative mt-24">
              <div
                className={`py-5 px-8 font-light text-sm border ${
                  abtest === 1
                    ? "text-black bg-xlightgray hover:border-black/20 focus:ring-black/50"
                    : "text-white bg-white/10 border-white/15 hover:border-white/30 focus:ring-white/50"
                } rounded-lg transition-all duration-300 focus:outline-none focus:ring-1`}
              >
                감사합니다! 곧 연락드리겠습니다.
              </div>
            </div>
          ) : (
            <div className="relative mt-24">
              <input
                type="email"
                className={`min-w-[310px] py-3 px-5 font-light text-sm border ${
                  abtest === 1
                    ? "text-black bg-xlightgray hover:border-black/20 focus:ring-black/50"
                    : "text-white bg-white/10 border-white/15 hover:border-white/30 focus:ring-white/50"
                } rounded-full transition-all duration-300 focus:outline-none focus:ring-1`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Example@gmail.com"
              />
              <div
                onClick={joinWaitlist}
                className={`absolute flex flex-row items-center justify-center gap-1 group cursor-pointer right-1 top-1/2 -translate-y-1/2 text-[13px] px-4 py-2.5 rounded-full transition-all duration-300 ${
                  abtest === 1 ? "bg-black text-white" : "bg-white text-black"
                }`}
              >
                {uploading ? (
                  <div className="flex flex-row items-center justify-center gap-1">
                    <LoaderCircle className="w-4 h-4 animate-spin text-black" />
                  </div>
                ) : (
                  <>
                    <span>Join waitlist</span>
                    <ArrowRight
                      size={16}
                      strokeWidth={2.2}
                      className="text-black group-hover:w-[12px] w-0 transition-all duration-300"
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <GridSectionLayout borderSoft={borderSoft}>
        <div
          className={`${
            abtest === 1 ? "bg-beige200" : "bg-xlightgray"
          } gap-2 w-full text-left py-6 md:py-10 px-6`}
        >
          <h2 className="text-base font-medium text-neutral-900 md:text-lg">
            {/* 하퍼는 최고의 회사와 인재에 집중하고 있습니다. */}
            하퍼는 오직 글로벌 AI 리더십의 중심에서 탄생하고 검증된, 가장 영향력
            있는 기회만을 선별하여 연결합니다.
          </h2>
          <p className="text-sm text-xgray700 mt-2 md:mt-1">
            숨겨진 최고의 기회는 일반적인 채용 시장에 공개되지 않습니다.하퍼에서
            누구보다 먼저 핵심 포지션 합류 기회를 선점하세요.
          </p>
        </div>
      </GridSectionLayout>
      <GridSectionLayout borderSoft={borderSoft}>
        <div className="flex flex-col w-full">
          <VCLogos borderSoft={borderSoft} />

          <div
            className={`flex flex-col md:flex-row items-center justify-between gap-2 font-light border-t ${borderSoft} px-7 py-12`}
          >
            <div className="flex items-center flex-row gap-2">
              <div className="relative items-baseline gap-1 text-black font-normal flex">
                <div>500+ in the waitlist </div>
              </div>
              <div className="flex -space-x-2">
                <div className="h-7 w-7 rounded-full border border-xgray300">
                  <Image
                    src="/images/person1.png"
                    alt="person1"
                    className="rounded-full"
                    width={28}
                    height={28}
                  />
                </div>
                {/* <div className="h-7 w-7 rounded-full border border-xgray300">
                  <div className="h-full w-full flex items-center text-xs justify-center text-white rounded-full bg-blue-500">
                    <span>H</span>
                  </div>
                </div> */}
                <div className="h-7 w-7 rounded-full border border-xgray300 bg-neutral-300">
                  <Image
                    src="/images/person2.png"
                    alt="person2"
                    className="rounded-full"
                    width={28}
                    height={28}
                  />
                </div>
                <div className="h-7 w-7 rounded-full border border-xgray300 bg-neutral-300">
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
            {/* <div className="text-xgray700 mt-2">~ {formattedDate}</div> */}

            <div className="flex flex-col mt-4 md:mt-0 items-center md:items-end gap-1 text-sm">
              <div className="text-xgray700/90">
                현재 등록된 비율 :{" "}
                <span>
                  Engineer 42% / Researcher 33% / Backend 15% / 기타 10%
                </span>
              </div>
              <div className="text-black">~ {formattedDate}</div>
            </div>
          </div>
        </div>
      </GridSectionLayout>

      <GridSectionLayout borderSoft={borderSoft}>
        <div
          className={`flex h-5 ${
            borderSoft === "border-xgray300" ? "bg-black" : "bg-beige200"
          } w-full`}
        ></div>
      </GridSectionLayout>
      <FeatureSection borderSoft={borderSoft} />
      <GridSectionLayout borderSoft={borderSoft}>
        <div className="py-6 text-lg font-light italic">Why harper?</div>
      </GridSectionLayout>
      <GridSectionLayout borderSoft={borderSoft}>
        <div className="flex flex-col md:flex-row items-stretch">
          <WhyImageSection
            title="한 번의 인터뷰, 무한한 기회."
            desc="서류 지원과 인터뷰를 공고마다 반복할 필요가 없습니다. 하퍼와의 단 한 번의 대화로 정규직·파트타임·프리랜서 등 모든 종류의 커리어를 동시에 탐색하고 제안받을 수 있습니다."
            imageSrc="/images/why1.png"
            index={0}
            borderSoft={borderSoft}
          />
          <WhyImageSection
            title="이전에는 불가능했던, 지원자에 대한 깊이 있는 이해."
            desc="하퍼는 대화를 통해 지원자의 상황을 이해하고 블로그, GitHub, 작성한 논문 등 비정형 정보까지 종합적으로 분석하여 기존 이력서에서는 알 수 없었던 심층 프로파일링을 완성합니다. 데이터에 기반해 지원자의 선호와 숨겨진 역량까지 정확히 파악하고, 완벽에 가까운 포지션만을 선별하여 제안합니다."
            imageSrc="/images/why2.png"
            index={1}
            borderSoft={borderSoft}
          />
        </div>
      </GridSectionLayout>
      <GridSectionLayout borderSoft={borderSoft}>
        <div className="flex flex-col items-start w-full gap-4 pt-12 pb-20 px-8">
          <div className="text-base font-medium italic">Our Values</div>
          <div className="text-sm text-left leading-6 font-normal text-xgray600">
            하퍼는 올라왔다 사라지는 공고들, 반복적인 지원 및 1차 인터뷰, <br />
            그리고 지원자의 역량과 역량과 니즈를 제대로 이해하지 못한 채
            이루어지는 리크루터의 제안들... 이러한 비효율적인 채용 프로세스를
            AI로 개선하고자 합니다. <br />
            한번의 등록만으로, 모든 AI/ML Engineer들이 최고의 팀에서 일할 수
            있게 되기를 희망합니다.
            <br />
            <br />
            Co-founder Chris & Daniel
          </div>
        </div>
      </GridSectionLayout>
      <GridSectionLayout borderSoft={borderSoft}>
        <div className="w-full flex flex-col items-center justify-center bg-black">
          <div className="flex flex-col items-center justify-center w-full lg:w-[94%] border-b border-xgray700 py-48 text-white">
            <div className="text-4xl sm:text-5xl font-light font-hedvig">
              Get Opportunities.
            </div>
            <div className="text-sm sm:text-base font-light text-white/80 mt-10 leading-6">
              서비스는 아직 오픈 준비 중입니다.
              <br />
              런칭까지 <span className="text-white font-normal">
                {remain}
              </span>{" "}
              남았습니다.
              <br />
              <br />
              메일을 남겨주시면 출시와 함께 가장 먼저 안내드릴게요.
            </div>

            {isSubmitted ? (
              <div className="relative mt-16">
                <div
                  className={`py-5 px-8 font-light text-sm border ${
                    abtest === 1
                      ? "text-black bg-xlightgray hover:border-black/20 focus:ring-black/50"
                      : "text-white bg-white/10 border-white/15 hover:border-white/30 focus:ring-white/50"
                  } rounded-lg transition-all duration-300 focus:outline-none focus:ring-1`}
                >
                  감사합니다! 곧 연락드리겠습니다.
                </div>
              </div>
            ) : (
              <div className="relative mt-16">
                <input
                  type="email"
                  className="py-3 px-5 font-light text-xs sm:text-sm border text-white bg-white/10 border-[rgba(255,255,255,0.16)] rounded-full min-w-[260px] sm:min-w-[300px] transition-all duration-300 hover:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/50"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Example@gmail.com"
                />
                <div
                  onClick={joinWaitlist}
                  className="absolute flex flex-row items-center justify-center gap-1 group cursor-pointer right-0.5 sm:right-1 top-1/2 -translate-y-1/2 text-[13px] bg-white text-black px-4 py-2.5 rounded-full transition-all duration-300"
                >
                  <span>
                    Join<span className="hidden sm:inline"> waitlist</span>
                  </span>
                  <ArrowRight
                    size={16}
                    strokeWidth={2.2}
                    className="text-black group-hover:w-[12px] w-0 transition-all duration-300"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col items-center justify-center w-full pt-10">
            <div className="w-full flex flex-col items-center justify-center pb-10">
              <div className="text-lg font-light text-white/80">
                Questions & Answers
              </div>
              <div className="flex flex-col sm:flex-row items-start justify-start text-white/70 font-thin w-[80%] mt-8">
                <QuestionAnswer
                  question="누가 제 프로필을 볼 수 있나요"
                  answer="하퍼의 엄격한 심사 기준을 통과한 검증된 기업만 프로필을 열람할 수 있습니다. 특히, 지원자의 현재 소속된 회사는 IP/도메인 차단 시스템을 통해 철저히 비공개 처리되어 익명성을 완벽하게 보장합니다."
                />
                <QuestionAnswer
                  question="당장 구직/이직 의사가 없더라도 등록해둘 수 있나요?"
                  answer="네 가능합니다. 하퍼는 정규직 채용 외에도 파트타임, 프리랜싱, 자문 등 지원자님의 커리어에 도움이 될 수 있는 다양한 형태의 기회를 함께 연결합니다. 현재 이직 의사나 정규직 여부와 관계없이, 시장 최고 수준의 제안을 받아보시고, 커리어를 확장할 수 있는 새로운 가능성을 편하게 탐색하세요."
                />
                <QuestionAnswer
                  question="어떤 회사들에게서 제안이 오나요?"
                  answer="글로벌 성장 잠재력을 갖춘 딥테크(Deep Tech) 및 AI 분야의 혁신적인 테크 기업들입니다. 하퍼는 AI 매칭 시스템을 통해 지원자분들의 역량과 니즈에 부합하는 포지션을 직접 찾아 해당 기업에 가입을 요청합니다. 이처럼 맞춤형 매칭을 통해 모든 지원자분들이 최소 한 번 이상의 퀄리티 높은 제안을 반드시 받으실 수 있도록 보장합니다."
                />
              </div>
            </div>
            <div className="flex flex-row items-center justify-between w-full px-4 py-4 text-white/60">
              <div className="font-garamond text-lg">harper</div>
              <div
                onClick={handleContactUs}
                className="text-xs sm:text-sm font-thin cursor-pointer hover:text-white/75"
              >
                contact us
              </div>
            </div>
          </div>
        </div>
      </GridSectionLayout>
    </main>
  );
};

export default CandidatePage;

const QuestionAnswer = ({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start justify-start w-full sm:w-[33%] mb-4 min-h-[30px] sm:min-h-[200px] px-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`cursor-pointer flex w-full transition-all duration-500 items-center text-left focus:outline-none ${
          open ? "text-white" : "text-white/70"
        }`}
      >
        <span
          className={`mr-1 text-sm transition-all duration-500 ${
            open ? "transform rotate-90" : ""
          }`}
        >
          <ChevronRight size={18} strokeWidth={1} />
        </span>
        <span className="text-sm font-thin"> {question}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden text-left"
          >
            <div className="pt-2 text-sm leading-5 text-white/60">{answer}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FeatureSection = ({ borderSoft }: { borderSoft: string }) => {
  return (
    <GridSectionLayout borderSoft={borderSoft}>
      <div
        className={`flex flex-row items-center justify-center w-full border-b ${borderSoft} md:border-b-0`}
      >
        <div
          className={`h-28 flex items-center justify-center w-full sm:w-[34%] text-lg italic font-light md:border-x ${borderSoft}`}
        >
          How it works
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch w-full">
        <ImageSection
          title="1. 커리어 역량 심층 분석 프로필을 만드세요."
          desc="간단히 가입하고, 기존 이력서와 공개 활동 데이터(블로그, 포트폴리오 등)를 통합하세요. 하퍼가 이를 다각도로 분석하여, 이력서에 담지 못한 당신의 고유한 잠재력과 선호도까지 담아내는 전방위 프로필을 완성하고 보호합니다."
          imageSrc="/images/feat4.png"
          index={0}
          borderSoft={borderSoft}
        />
        {/* <ImageSection
          title="2. AI 리크루터 하퍼와의 대화."
          desc="다음 커리어 목표를 설정하고, 찾고 있는 기회에 대해 AI 리크루터 하퍼에게 자세히 알려주세요. 모든 정보는 철저히 보호됩니다."
          imageSrc="/images/feat1.png"
          index={1}
          borderSoft={borderSoft}
        /> */}
        <ImageSection
          title="2. 단 한 번의 프로필로 무한한 커리어 기회를 선점하세요."
          desc="완성된 심층 프로필을 기반으로, 하퍼가 정규직, 파트타임을 가리지 않고 커리어 성장에 딱 맞는 좋은 기회를 쉬지 않고 상시로 선별하여 연결해 드립니다."
          imageSrc="/images/feat3.png"
          index={2}
          borderSoft={borderSoft}
        />
      </div>
    </GridSectionLayout>
  );
};

const ImageSection = ({
  title,
  desc,
  imageSrc,
  index,
  borderSoft,
}: {
  title: string;
  desc: string;
  imageSrc: string;
  index: number;
  borderSoft: string;
}) => {
  return (
    <div
      className={`flex flex-1 w-full max-w-full flex-col ${borderSoft} ${
        index !== 0 ? "border-b sm:border-b-0 sm:border-l" : "sm:border-l-0"
      } ${index === 1 ? "sm:max-w-[50%]" : "sm:max-w-[50%]"}`}
    >
      <div
        className={`h-[24vw] min-h-[220px] w-full overflow-hidden flex justify-center items-center border-y ${borderSoft}`}
      >
        <Image
          src={imageSrc}
          alt={title}
          width={600}
          height={400}
          className="object-center max-w-none h-auto md:h-full w-full md:w-auto"
        />
      </div>
      <div className="flex flex-col items-start justify-start w-full px-7 gap-3 py-6 pb-14 text-left">
        <div className="text-md font-normal">{title}</div>
        <div className="text-sm leading-6 font-light text-xgray700">{desc}</div>
      </div>
    </div>
  );
};

const WhyImageSection = ({
  title,
  desc,
  imageSrc,
  index,
  borderSoft,
}: {
  title: string;
  desc: string;
  imageSrc: string;
  index: number;
  borderSoft: string;
}) => {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-between ${borderSoft} max-w-full ${
        index !== 1 ? "border-r" : "border-r-0"
      }`}
    >
      <div className="flex flex-col items-start justify-start w-full px-7 gap-3 py-8 pb-14 text-left">
        <div className="text-base sm:text-lg font-normal">{title}</div>
        <div className="text-sm leading-6 font-light text-xgray700">{desc}</div>
      </div>
      <div
        className={`h-[280px] md:h-[460px] relative w-full overflow-hidden flex justify-center items-center border-y ${borderSoft}`}
      >
        <Image
          src={imageSrc}
          alt={title}
          fill
          // style={{ width: "100%", height: "auto" }}
          className="object-cover"
        />
      </div>
    </div>
  );
};
