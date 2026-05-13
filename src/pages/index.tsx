import Reveal from "@/components/landing/Animation/Reveal";
import CareerAppBar from "@/components/landing/career/CareerAppBar";
import CareerHeroSection from "@/components/landing/career/CareerHeroSection";
import LandingButton from "@/components/landing/career/CareerLandingButton";
import SocialProofSection from "@/components/landing/career/SocialProofSection";
import { useAuthStore } from "@/store/useAuthStore";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { User2 } from "lucide-react";
import { motion } from "framer-motion";
import DemoSection from "@/components/landing/career/DemoSection";

const CAREER_START_HREF =
  "/career_login?next=%2Fcareer%2Fonboarding&source=network";
const CAREER_AUTHENTICATED_START_HREF = "/career";
const CAREER_ONBOARDING_HREF = "/career/onboarding";

const workflowCards = [
  {
    number: "1.",
    title: "대화로 나를 소개",
    body: "전화나 채팅으로 Harper에게 커리어 이야기와 비자, 연봉, 팀 규모 같은 조건을 편하게 들려주세요. 이력서를 다시 쓸 필요 없어요.",
    visual: "conversation",
  },
  {
    number: "2.",
    title: "Harper가 중간에서 연결 및 제안",
    body: "Harper에게 인재 채용을 요청한 회사들 중, 회원님이 좋아하실 기회를 제안해드립니다.",
    visual: "jobs",
  },
  {
    number: "3.",
    title: "수락시 Founder · Hiring Manager와 직접 연결",
    body: "수락만 해주세요. Harper가 hiring manager 또는 창업자와 직접 미팅을 세팅하고, 그 자리에서 회원님이 빛날 수 있도록 준비까지 도와드려요.",
    visual: "intro",
  },
] as const;

const matchFlowCards = [
  {
    eyebrow: "회원님에게",
    title: "기회를 먼저 추천합니다.",
    body: "회원님의 기준을 통과한 회사와 기회만 Harper가 먼저 브리핑합니다. 관심 있다고 답한 기회만 founder 소개로 이어져요.",
    visual: "candidate-first",
  },
  {
    eyebrow: "Open to matches",
    title: "회사에게 먼저 회원님을 제안합니다.",
    body: "양측 모두 좋아할 것이라는 확신이 들 때, 익명 요약 프로필을 먼저 회사에게 제안합니다. 회사가 확인 후 회원님에게 먼저 연결 요청이 오게됩니다.",
    visual: "company-first",
  },
] as const;

const howRows = [
  {
    number: "i.",
    title: "회사가 아니라, 탤런트가 중심.",
    body: (
      <>
        시장에 깔린 뻔한 선택지들에 나를 맞추지 마세요. 최고의 기회는 소리 없이
        움직입니다. Harper는 <em>탤런트의 가치</em>를 가장 먼저 정의하고, 그
        가치가 빛날 최적의 순간을 포착해 연결합니다.
      </>
    ),
  },
  {
    number: "ii.",
    title: "이력서의 시대는 끝났습니다.",
    body: (
      <>
        종이 한 장으로는 탤런트의 역량 5%도 채 담아낼 수 없기 때문입니다. 매번
        서류를 고치는 대신 Harper에게 최근의 성과를 편하게 들려주세요. 대화로
        실시간 업데이트되는 프로필이, 가만히 있어도 <em>가장 최신의 나</em>에게
        맞는 기회를 가져옵니다.
      </>
    ),
  },
  {
    number: "iii.",
    title: "항상 조용히 기회를 찾습니다.",
    body: (
      <>
        좋은 기회는 내가 이직을 결심한 순간에 맞춰 열리지 않습니다. 당신이
        지금의 일에 몰입하는 동안에도 Harper는 뒤에서 조용히 시장을 살피고,{" "}
        <em>기준에 맞는 기회</em>가 나타나는 순간만 골라 가져옵니다.
      </>
    ),
  },
  {
    number: "iv.",
    title: "커리어의 지평을 넓히는 기회.",
    body: (
      <>
        정규직이라는 틀을 넘어, 탤런트의 전문성이 필요한 모든 곳을 연결합니다.
        본업을 유지하면서도 가치를 증명할 수 있는 단기 기술 자문부터
        어드바이저리까지, 당신의 역량이 빛날 <em>모든 가능성</em>을 제공합니다.
      </>
    ),
  },
] as const;

const voices = [
  {
    quote:
      "한국에서는 이런 글로벌 기회가 있다는 것조차 몰랐어요. 그런데 Harper에게 CTO를 직접 연결받았고, 이제 곧 합류할 예정이에요.",
    initial: "",
    name: "익명 요청",
    role: "ML Engineer → AI Engineer at SF Startup",
    status: "",
  },
  {
    quote:
      "제 전문성이 이런 식으로도 쓰일 수 있다는 걸 몰랐어요. 본업은 그대로 유지하고 있는데, Harper가 파트타임 두 건을 연결해줬어요.",
    initial: "/images/person3.png",
    name: "Soyeon L.",
    role: "스태프 엔지니어, 인프라",
    status: "파트타임 2건 진행",
  },
  {
    quote:
      "이미 한번 대화한 사람을 소개받으니 Harper의 추천은 인터뷰까지는 바로 진행했어요. 진짜 헤드헌터와 대화하는 줄 알았습니다.",
    initial: "P",
    name: "Patrick",
    role: "해외 유니콘 스타트업 채용담당자",
    status: "면접 진행 12건",
  },
] as const;

export const WavyTag = ({
  left,
  children,
  bright = false,
}: {
  left: string;
  children: React.ReactNode;
  bright?: boolean;
}) => {
  return (
    <div className="wavy-underline">
      <div className="text-[13px] flex flex-row gap-2 font-medium text-beige700">
        <span
          className={`text-sm ${bright ? "text-beige300" : "text-beige900/80"}`}
        >
          {left}
        </span>
        <span>{children}</span>
      </div>
    </div>
  );
};

const useCareerStartHref = () => {
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);
  const authLoading = useAuthStore((state) => state.loading);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setNeedsOnboarding(null);
      return;
    }

    const token = session?.access_token;
    if (!token) {
      setNeedsOnboarding(true);
      return;
    }

    let cancelled = false;

    const loadOnboardingStatus = async () => {
      setNeedsOnboarding(null);

      try {
        const response = await fetch("/api/talent/onboarding/status", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          needsOnboarding?: boolean;
        };

        if (cancelled) return;

        if (!response.ok) {
          setNeedsOnboarding(true);
          return;
        }

        setNeedsOnboarding(payload.needsOnboarding !== false);
      } catch {
        if (!cancelled) {
          setNeedsOnboarding(true);
        }
      }
    };

    void loadOnboardingStatus();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session?.access_token, user]);

  if (authLoading || !user) {
    return CAREER_START_HREF;
  }

  if (needsOnboarding !== false) {
    return CAREER_ONBOARDING_HREF;
  }

  return CAREER_AUTHENTICATED_START_HREF;
};

function WorkflowVisual({
  type,
}: {
  type: (typeof workflowCards)[number]["visual"];
}) {
  if (type === "conversation") {
    return (
      <div className="flex h-[170px] flex-col justify-center gap-3 rounded-[14px] bg-beige50 p-4">
        <div className="w-fit max-w-[85%] rounded-2xl rounded-bl bg-beige900 px-3.5 py-2 text-[12.5px] leading-[1.45] text-beige50">
          “나랑 잘 맞는 포지션 있어?”
        </div>
        <div className="ml-auto w-fit max-w-[82%] rounded-2xl rounded-br bg-beige700 px-3.5 py-2 text-[12.5px] leading-[1.45] text-beige50">
          조건을 들려주시면 바로 찾아볼게요.
        </div>
      </div>
    );
  }

  if (type === "jobs") {
    return (
      <div className="flex h-[170px] flex-col justify-center gap-2 rounded-[14px] bg-beige50 p-4">
        {[
          [
            "Anthropic · 풀타임",
            "96% 적합",
            "시니어 ML 엔지니어 · H-1B 스폰서",
          ],
          [
            "Cursor · 단기 파트타임",
            "91% 적합",
            "데이터 보안 자문 · 월 약 10시간",
          ],
        ].map(([company, fit, body]) => (
          <div key={company} className="rounded-lg bg-beige100 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-semibold text-beige900">
                {company}
              </span>
              <span className="text-[12px] font-medium text-beige700">
                {fit}
              </span>
            </div>
            <div className="mt-1 text-[13px] leading-snug text-beige900/55">
              {body}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-[170px] flex-col justify-center gap-2 rounded-[14px] bg-beige50 p-3">
      {[
        [
          "Gmail",
          "Anthropic Hiring Manager와 커피챗",
          "Inference 팀 리더가 이번 주 30분을 비워뒀어요.",
          "방금",
        ],
        [
          "Gmail",
          "Cursor Founder와 1:1",
          "Michael이 금요일 오전 가능하다고 전해왔어요.",
          "4시간 전",
        ],
      ].map(([sender, title, body, time]) => (
        <div
          key={title}
          className="flex items-start gap-2.5 rounded-xl border border-beige900/10 bg-white px-3 py-2.5 shadow-[0_10px_24px_rgba(46,23,6,0.06)]"
        >
          <div
            aria-label="Gmail"
            className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-white bg-[length:24px_24px] bg-center bg-no-repeat shadow-[inset_0_0_0_1px_rgba(46,23,6,0.08)]"
            style={{ backgroundImage: "url('/svgs/gmail.svg')" }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-semibold text-beige900">
                {sender}
              </span>
              <span className="shrink-0 text-[10px] text-beige900/40">
                {time}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[13px] font-semibold text-beige900">
              {title}
            </div>
            <div className="mt-0.5 truncate text-[10.5px] text-beige900/55">
              {body}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BranchArrow({
  d,
  delay,
  opacity = 1,
  strokeWidth = 2.6,
}: {
  d: string;
  delay: number;
  opacity?: number;
  strokeWidth?: number;
}) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      variants={{
        hidden: { pathLength: 0, opacity: 0 },
        visible: {
          pathLength: 1,
          opacity,
          transition: {
            delay,
            duration: 0.95,
            ease: [0.22, 1, 0.36, 1],
          },
        },
      }}
    />
  );
}

function MatchFlowVisual({
  type,
}: {
  type: (typeof matchFlowCards)[number]["visual"];
}) {
  if (type === "candidate-first") {
    return (
      <div className="relative h-[280px] flex flex-col items-center justify-center overflow-hidden bg-beige50 p-4">
        <Image
          src="/images/feat33.png"
          alt="회사에게 먼저 회원님을 제안하는 Harper 화면"
          width={400}
          height={225}
          className="h-auto max-h-[190px] w-auto max-w-full object-contain"
        />
        <div className="mt-2 px-0.5 text-[12px] font-medium text-beige900/75">
          Harper에게 인재 추천을 요청한 회사가 있는데, Chris님이 좋아하실 것
          같아요. 한번 만나보시겠어요? 아니면 우선 팔로우만 할까요?
        </div>
      </div>
      // <div className="relative h-[280px] overflow-hidden rounded-[16px] bg-beige50 p-4">
      //   <div className="flex items-center justify-between gap-3">
      //     <span className="rounded-full border border-beige900/10 bg-white/70 px-3 py-1 text-[11px] font-medium text-beige900/60">
      //       회원 브리핑
      //     </span>
      //     <span className="font-instrument text-[13px] italic text-beige700">
      //       96% fit
      //     </span>
      //   </div>

      //   <motion.div
      //     initial={{ opacity: 0, y: 10, rotate: -0.7 }}
      //     whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      //     viewport={{ once: true, amount: 0.55 }}
      //     transition={{ delay: 0.2, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      //     className="mt-4 rounded-[14px] border border-beige900/10 bg-beige100 px-4 py-3.5 shadow-[0_12px_28px_rgba(46,23,6,0.06)]"
      //   >
      //     <div className="flex items-center gap-3">
      //       <CompanyMark>A</CompanyMark>
      //       <div className="min-w-0 flex-1">
      //         <div className="truncate font-instrument text-[17px] leading-none text-beige900">
      //           Anthropic
      //         </div>
      //         <div className="mt-1 truncate text-[11.5px] text-beige900/50">
      //           Inference Infra · founder intro 가능
      //         </div>
      //       </div>
      //     </div>
      //     <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-beige900/60">
      //       <span className="rounded-full border border-beige900/10 bg-white/55 px-2 py-1">
      //         H-1B 스폰서
      //       </span>
      //       <span className="rounded-full border border-beige900/10 bg-white/55 px-2 py-1">
      //         $250K+
      //       </span>
      //     </div>
      //   </motion.div>

      //   <motion.div
      //     initial={{ opacity: 0, y: 10 }}
      //     whileInView={{ opacity: 1, y: 0 }}
      //     viewport={{ once: true, amount: 0.55 }}
      //     transition={{ delay: 0.45, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      //     className="mt-3 flex gap-2"
      //   >
      //     <span className="rounded-full bg-beige900 px-3 py-1.5 text-[11.5px] font-medium text-beige50">
      //       관심 있음
      //     </span>
      //     <span className="rounded-full border border-beige900/10 bg-white/60 px-3 py-1.5 text-[11.5px] text-beige900/55">
      //       나중에 보기
      //     </span>
      //   </motion.div>
      // </div>
    );
  }

  return (
    <div className="relative h-[280px] overflow-hidden bg-beige50">
      <Image
        src="/images/feat3.png"
        alt="회사에게 먼저 회원님을 제안하는 Harper 화면"
        width={571}
        height={375}
        className="h-full w-full object-cover object-left-top"
      />
    </div>
  );
}

function DirectMatchBranch() {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.22 }}
      className="mx-auto mt-12 max-w-[980px] md:mt-0"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        className="md:hidden mx-auto inline-flex items-center gap-2 rounded-full border border-beige900/10 bg-beige50/80 px-4 py-2 text-[13px] font-medium text-beige900/70 shadow-[0_10px_30px_rgba(46,23,6,0.06)]"
      >
        <span className="h-2 w-2 rounded-full bg-beige700" />
        Harper가 중간에서 연결 및 제안
      </motion.div>

      <div className="relative mx-auto mt-2 h-[150px] max-w-[880px] text-beige700 md:h-[198px]">
        <motion.svg
          className="hidden h-full w-full overflow-visible md:block"
          viewBox="0 0 900 210"
          aria-hidden="true"
        >
          <BranchArrow d="M450 8 C451 32 447 56 450 82" delay={0.12} />
          <BranchArrow
            d="M450 82 C414 103 360 121 306 149 C254 176 218 191 198 204"
            delay={0.42}
          />
          <BranchArrow
            d="M450 82 C486 103 540 121 594 149 C646 176 682 191 702 204"
            delay={0.42}
          />
          <BranchArrow d="M198 204 C201 192 204 185 211 178" delay={1.05} />
          <BranchArrow d="M198 204 C210 201 217 198 226 192" delay={1.05} />
          <BranchArrow d="M702 204 C699 192 696 185 689 178" delay={1.05} />
          <BranchArrow d="M702 204 C690 201 683 198 674 192" delay={1.05} />
          <BranchArrow
            d="M454 86 C419 109 363 128 312 153 C260 178 224 194 204 207"
            delay={0.52}
            opacity={0.28}
            strokeWidth={1.2}
          />
          <BranchArrow
            d="M446 86 C481 109 537 128 588 153 C640 178 676 194 696 207"
            delay={0.52}
            opacity={0.28}
            strokeWidth={1.2}
          />
        </motion.svg>

        <motion.svg
          className="h-full w-full overflow-visible md:hidden"
          viewBox="0 0 360 170"
          aria-hidden="true"
        >
          <BranchArrow d="M180 4 C182 28 178 50 180 68" delay={0.12} />
          <BranchArrow
            d="M180 68 C151 91 123 105 102 125 C90 136 82 147 78 160"
            delay={0.42}
          />
          <BranchArrow
            d="M180 68 C209 91 237 105 258 125 C270 136 278 147 282 160"
            delay={0.42}
          />
          <BranchArrow d="M78 160 C82 151 86 146 93 141" delay={1.05} />
          <BranchArrow d="M78 160 C88 159 94 156 101 151" delay={1.05} />
          <BranchArrow d="M282 160 C278 151 274 146 267 141" delay={1.05} />
          <BranchArrow d="M282 160 C272 159 266 156 259 151" delay={1.05} />
        </motion.svg>
      </div>

      <div className="grid grid-cols-1 gap-5 text-left md:grid-cols-2">
        {matchFlowCards.map((card, index) => (
          <Reveal key={card.title} once delay={0.18 + index * 0.1}>
            <div className="flex h-full flex-col rounded-[22px] border border-beige900/10 bg-beige100/60 p-6 shadow-[0_18px_44px_rgba(46,23,6,0.05)] md:p-7">
              <MatchFlowVisual type={card.visual} />
              <div className="mt-6 text-[13px] font-medium text-beige700">
                {card.eyebrow}
              </div>
              <h3 className="mt-2 font-instrument text-[22px] font-semibold leading-[1.2] text-beige900 md:text-[26px]">
                {card.title}
              </h3>
              <p className="mt-3 text-sm leading-[1.75] text-beige900/75">
                {card.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </motion.div>
  );
}

export default function LandingKoVfPage() {
  const careerStartHref = useCareerStartHref();

  return (
    <>
      <Head>
        <title>Harper — 나를 위한 완벽한 기회, 이제 agent가 찾아옵니다.</title>
        <meta
          name="description"
          content="Harper는 오직 탤런트만을 위한 AI 커리어 agent입니다. 풀타임 정규직부터 어드바이저리, 전문가 콜까지 당신의 전문성에 맞는 모든 기회를 대화로 전달합니다."
        />
        <link rel="alternate" hrefLang="en" href="https://matchharper.com/" />
        <link rel="alternate" hrefLang="ko" href="https://matchharper.com/ko" />
        <link
          rel="alternate"
          hrefLang="x-default"
          href="https://matchharper.com/"
        />
        <link rel="icon" href="/images/logo.ico" />
      </Head>

      <div
        id="top"
        className="min-h-screen overflow-x-clip break-keep bg-beige200 font-sans text-beige900 antialiased"
      >
        <CareerAppBar careerStartHref={careerStartHref} />

        <main>
          <CareerHeroSection careerStartHref={careerStartHref} />

          <SocialProofSection />

          <DemoSection />

          <section
            id="workflow"
            className="mx-auto max-w-[1240px] px-4 py-20 text-center md:px-10 md:py-32"
          >
            <Reveal once>
              <div className="mx-auto max-w-[860px]">
                <WavyTag left="2.">직접 연결</WavyTag>
                <h2 className="mt-5 font-instrument text-[28px] leading-[1.15] text-beige900 md:text-[44px]">
                  Founder에게 회원님을{" "}
                  <span className="text-beige700">직접 소개</span>
                  합니다.
                </h2>
                <p className="mx-auto mt-4 max-w-[680px] text-[15px] leading-[1.7] text-beige900/80">
                  채용 공고를 뒤지고, 지원하고, 또 기다리고. 반복되는 구직의
                  피로는 이제 끝.
                  <br />
                  Harper는 좋은 인재를 찾는 회사들과 직접 이야기하며, 당신을
                  위한 헤드헌터처럼 일해요.
                </p>
              </div>
            </Reveal>

            <div className="mt-12 grid grid-cols-1 gap-5 text-left md:mt-16 lg:grid-cols-3">
              {workflowCards.map((card, index) => (
                <Reveal key={card.title} once delay={index * 0.08}>
                  <div className="flex h-full flex-col rounded-[22px] border border-beige900/10 bg-beige100/60 p-6 md:p-7">
                    <WorkflowVisual type={card.visual} />
                    <div className="font-instrument font-semibold leading-[1.25] mt-6 flex items-baseline gap-2">
                      <div className="text-beige700">{card.number}</div>
                      <h3 className="text-beige900">{card.title}</h3>
                    </div>
                    <p className="mt-3 text-sm leading-[1.7] text-beige900/80">
                      {card.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>

            <DirectMatchBranch />
          </section>

          <section className="mx-auto max-w-[1400px] border-t border-beige900/10 px-4 py-20 text-center md:px-10 md:py-32">
            <Reveal once>
              <WavyTag left="3.">
                당신이 목표한 최고의 모습, 그곳을 향해 함께 뛰는
              </WavyTag>
            </Reveal>
            <Reveal once delay={0.08}>
              <h2 className="mx-auto mt-5 font-instrument text-[28px] leading-[1.18] text-beige900 md:text-[44px]">
                <span className="block">
                  최고의 선수들에겐 전담 Agent가 있습니다.
                </span>
                <span className="mt-1 block">
                  <em className="text-beige700">나를 위한 Agent</em>, 한 번쯤
                  상상해 보지 않으셨나요?
                </span>
                <span className="mt-1 block">그래서 저희가 만들었습니다.</span>
              </h2>
            </Reveal>
            <Reveal once delay={0.16}>
              <p className="mx-auto mt-10 max-w-[720px] font-medium text-[15px] leading-[1.85] text-beige900/60 md:text-base">
                뛰어난 선수가 경기에만 집중하듯, 당신은{" "}
                <span className="text-beige900">지금의 일과 성장</span>
                에만 집중하세요. 다음 무대를 찾고 조율하는 건 Harper의 몫입니다.
                수수료를 위해 기업 편에 서는 리크루터와 달리, Harper는 철저히{" "}
                <span className="text-beige900">
                  당신의 이익만을 대변합니다.
                </span>
                <br />
                허락하기 전까지{" "}
                <span className="text-beige900">완벽한 익명</span>을 보장하며,
                오직 당신이 설정한 까다로운 기준을 통과한 기회들만{" "}
                <span className="text-beige900">조용히 찾아옵니다.</span>
              </p>
            </Reveal>
          </section>

          <section
            id="how"
            className="mx-auto max-w-[1200px] px-4 py-20 md:px-10 md:py-32"
          >
            <Reveal once>
              <div className="flex flex-col items-start gap-4 md:flex-row md:justify-between md:items-end">
                <h2 className="font-instrument text-[28px] leading-[1.08] text-beige900 md:text-[44px]">
                  <em className="text-beige700">Harper</em>는,
                  <br />
                  이렇게 달라요.
                </h2>
                <p className="max-w-[460px] text-left text-[15px] leading-[1.75] text-beige900/80 md:text-right md:text-base">
                  지금까지 받아오신 리크루터 연락, 채용 공고, LinkedIn DM과
                  Harper가 다른 네 가지 지점.
                </p>
              </div>
            </Reveal>

            <div className="mt-14 flex flex-col md:mt-20">
              {howRows.map((row, index) => (
                <Reveal key={row.number} once delay={index * 0.06}>
                  <div className="grid grid-cols-1 gap-3 border-t border-beige900/10 py-8 last:border-b md:grid-cols-[60px_1fr_1fr] md:gap-10 md:py-10">
                    <div className="font-instrument text-[32px] italic leading-none text-beige700 md:text-5xl">
                      {row.number}
                    </div>
                    <h3 className="font-instrument text-[22px] font-medium leading-[1.2] text-beige900 md:text-[30px]">
                      {row.title}
                    </h3>
                    <p className="text-[15px] leading-[1.75] text-beige900/80">
                      {row.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          <section
            id="voices"
            className="bg-beige900 px-4 py-20 text-beige50 md:px-10 md:py-32"
          >
            <div className="mx-auto max-w-[1200px]">
              <Reveal once>
                <WavyTag left="4." bright>
                  먼저 경험한 분들의 이야기
                </WavyTag>
                <h2 className="mt-5 max-w-[860px] font-instrument text-[28px] leading-[1.3] md:text-[44px]">
                  Harper를 먼저 만난 사람들은
                  <br />
                  구직 중이 아니었습니다.
                  <br />
                  <em className="text-beige700">기회가 먼저</em> 찾아왔죠.
                </h2>
              </Reveal>

              <div className="mt-14 grid grid-cols-1 gap-5 md:mt-16 lg:grid-cols-3">
                {voices.map((voice, index) => (
                  <Reveal key={voice.name} once delay={index * 0.08}>
                    <div className="h-full rounded-[18px] border border-beige50/10 bg-beige50/5 p-7">
                      <div className="font-instrument text-[21px] italic leading-[1.45]">
                        “{voice.quote}”
                      </div>
                      <div className="mt-7 flex items-start gap-3 border-t border-beige50/10 pt-5">
                        {voice.initial.includes("images") ? (
                          <Image
                            src={voice.initial}
                            alt={voice.name}
                            width={28}
                            height={28}
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex mt-1 h-7 w-7 items-center justify-center rounded-full bg-beige700 font-instrument text-base italic text-beige50">
                            <User2 className="w-5 h-5" strokeWidth={1.3} />
                          </div>
                        )}
                        <div>
                          <div className="text-[13px] font-medium">
                            {voice.name}
                          </div>
                          <div className="text-[13px] text-beige200/50">
                            {voice.role}
                          </div>
                          {voice.status && (
                            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-beige700">
                              <motion.span
                                animate={{
                                  opacity: [0.4, 1, 0.4],
                                  scale: [1, 1.15, 1],
                                }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="h-1.5 w-1.5 rounded-full bg-beige700"
                              />
                              {voice.status}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section
            id="cta"
            className="bg-beige200 px-4 py-24 text-center md:px-10 md:py-40"
          >
            <Reveal once>
              <h2 className="mx-auto max-w-[1100px] font-instrument text-[34px] leading-[1.08] text-beige900 md:text-[54px]">
                모두가 원했지만 누구도 가지지 못했던,
                <br />
                당신만을 위해 움직이는 <em className="text-beige700">agent</em>.
              </h2>
            </Reveal>
            <Reveal once delay={0.08}>
              <p className="mx-auto mt-6 max-w-[620px] text-[15px] leading-[1.75] text-beige900/80 md:text-lg">
                신청하고 기다릴 필요 없이 바로 시작하세요. 몇 분만 대화하면
                Harper가 회원님의 기준을 이해하고, 지금 맞는 기회를 조용히
                스캔하기 시작합니다.
              </p>
            </Reveal>
            <Reveal once delay={0.16} className="mt-10">
              <LandingButton href={careerStartHref} label="Talk to Harper" />
            </Reveal>
            <Reveal once delay={0.22}>
              <div className="mt-5 text-[13px] text-beige900/45">
                로그인 후 바로 커리어 agent 설정을 시작합니다.
              </div>
            </Reveal>
          </section>

          <Footer />
        </main>
      </div>
    </>
  );
}

const labelStyle =
  "transition text-[14px] text-beige900/45 hover:text-beige900/85 font-medium cursor-pointer duration-300";

const blockStyle = "flex flex-col items-start justify-start md:min-w-[140px]";

const Footer = () => {
  const careerStartHref = useCareerStartHref();
  const openCrispChat = () => {
    if (typeof window === "undefined") return;

    const crispWindow = window as Window & {
      $crisp?: Array<unknown[]>;
    };
    const hasCrispLoader = Boolean(document.getElementById("crisp-loader"));

    if (!crispWindow.$crisp && !hasCrispLoader) {
      window.location.href = "mailto:hello@matchharper.com";
      return;
    }

    crispWindow.$crisp = crispWindow.$crisp ?? [];
    crispWindow.$crisp.push(["do", "chat:show"]);
    crispWindow.$crisp.push(["do", "chat:open"]);
  };

  return (
    <footer className="border-t border-beige900/10 bg-beige500/35 px-4 py-14 text-[12px] text-beige900 md:px-10 md:py-16">
      <div className="mx-auto max-w-[1160px]">
        <div className="flex flex-row items-start justify-between gap-10 border-b border-beige900/10 pb-10">
          <div className="max-w-[360px]">
            <Image
              src="/svgs/logov2.svg"
              alt="Harper"
              width={78}
              height={34}
              className="h-auto w-[78px]"
            />
            <p className="font-halant mt-5 text-base font-medium leading-[1.65] text-beige900/70">
              Get <span className="text-beige900">introduced</span> to your{" "}
              <span className="text-beige900">dream role</span>.
              <br />
              With <span className="text-beige900">Harper</span>.
            </p>
            {/* <a
              href="mailto:hello@matchharper.com"
              className="mt-6 inline-flex items-center gap-2 rounded-[10px] border border-beige900/10 bg-beige50/65 px-3.5 py-2 text-[13px] font-medium text-beige900 transition hover:border-beige900/25 hover:bg-beige50"
            >
              hello@matchharper.com
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.8} />
            </a> */}
          </div>

          <div className="flex flex-row items-start justify-end gap-12">
            <div className={blockStyle}>
              <div className="w-full font-medium uppercase text-beige900">
                For Talent
              </div>
              <div className="mt-4 flex flex-col gap-3 text-[14px] text-beige900/68">
                <Link href={careerStartHref} className={labelStyle}>
                  시작하기
                </Link>
                <a href="#workflow" className={labelStyle}>
                  How it works
                </a>
                <a href="#voices" className={labelStyle}>
                  Success stories
                </a>
              </div>
            </div>

            <div className={blockStyle}>
              <div className="w-full font-medium uppercase text-beige900">
                For Companies
              </div>
              <div className="mt-4 flex flex-col gap-3 text-[14px] text-beige900/68">
                <Link href="/company" className={labelStyle}>
                  Harper for Companies
                </Link>
                <a
                  href="https://calendly.com/chris-matchharper/30min"
                  className={labelStyle}
                >
                  Schedule a call
                </a>
              </div>
            </div>

            <div className={blockStyle}>
              <div className="w-full font-medium uppercase text-beige900">
                Company
              </div>
              <div className="mt-4 flex flex-col gap-3 text-[14px] text-beige900/68">
                <Link href="/blog" className={labelStyle}>
                  Blog
                </Link>
                <a
                  href="https://www.linkedin.com/company/matchharper/"
                  target="_blank"
                  rel="noreferrer"
                  className={labelStyle}
                >
                  LinkedIn
                </a>
                <button
                  type="button"
                  onClick={openCrispChat}
                  className={`${labelStyle} text-left`}
                >
                  문의하기
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 text-[12.5px] text-beige900/45 md:flex-row md:items-center md:justify-between">
          <div>© 2026 Harper. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
};
