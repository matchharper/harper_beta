import Reveal from "@/components/landing/Animation/Reveal";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import TalentSocialProof from "@/components/landing/career/TalentSocialProof";
import { useCareerLandingStart } from "@/hooks/useCareerLandingStart";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";

import {
  ArrowRight,
  AudioLines,
  BriefcaseBusiness,
  Captions,
  ChevronsRight,
  FileX2,
  Globe2,
  Heart,
  HeartHandshake,
  MessagesSquare,
  Mic,
  Scan,
  User2,
  UserRoundCheck,
} from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type React from "react";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import GmailPhoneMockup from "@/components/landing/career/GmailMockup";
import { cx } from "@/components/ops/theme";
import { cn } from "@/lib/cn";
import { CareerBadge } from "@/components/ui/career";

const text = {
  h1: "text-[36px] font-medium leading-[1.08] text-neutral-950 md:text-[48px]",
  h2: "text-[24px] font-medium leading-[1.22] text-neutral-950 md:text-[28px]",
  h3: "text-[20px] font-normal leading-[1.45] text-neutral-950 md:text-[24px]",
  lg: "text-[16px] font-normal leading-[1.45] text-neutral-950 md:text-[18px]",
  p: "text-sm font-normal leading-[1.45] text-neutral-950/90 md:text-base",
  sm: "text-[13px] font-normal leading-[1.45] text-neutral-950/90 md:text-sm",
};

const ui = {
  pageX: "px-4 md:px-10",
  shell: "mx-auto w-full max-w-[1080px]",
  sectionY: "py-20 md:py-32",
  btn: "inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 text-[14px] font-medium shadow-sm transition-colors",
  btnPrimary: "border-black bg-black text-white hover:bg-neutral-800",
  btnSecondary:
    "border-black/10 bg-white text-neutral-950 hover:bg-neutral-100",
};

const voices = [
  {
    quote:
      "한국에서는 이런 글로벌 기회가 있다는 것조차 몰랐어요. 그런데 Harper에게 CTO를 직접 연결받았고, 이제 곧 합류할 예정이에요.",
    initial: "",
    name: "익명 요청",
    company: "Wonderful (Series B)",
    role: "Founding Forward Deployed Engineer",
  },
  {
    quote:
      "제 전문성이 이런 식으로도 쓰일 수 있다는 걸 몰랐어요. 본업은 그대로 유지하고 있는데, Harper가 파트타임 두 건을 연결해줬어요.",
    initial: "/images/person3.png",
    name: "Soyeon L.",
    company: "High-Growth AI Team",
    role: "Staff Engineer, Infrastructure",
  },
  {
    quote:
      "이미 한번 대화한 사람을 소개받으니 Harper의 추천은 인터뷰까지는 바로 진행했어요. 진짜 헤드헌터와 대화하는 줄 알았습니다.",
    initial: "P",
    name: "Patrick",
    company: "YC-backed Startup",
    role: "Founding Engineer",
  },
] as const;

const opportunities = [
  {
    name: "Forward Deployed Engineer",
    description:
      "Series B Enterprise AI (Seoul / APAC) | Full-Time • Significant Equity",
  },
  {
    name: "Software Engineer, AI Agents",
    description: "YC-Backed Stealth Startup (SF) | 10-15 hrs/wk • $150-$200/hr",
  },
  {
    name: "Machine Learning Engineer",
    description: "$50M Funded Frontier AI Lab | Full-Time • $250K - $350K",
  },
  {
    name: "Member of Technical Staff",
    description: "Global ML Platform | Advisory Board • Flexible Retainer",
  },
  {
    name: "Founding AI Product Engineer",
    description:
      "Seed-stage Agentic AI Startup | Full-Time • Remote-first • Early Equity",
  },
] as const;

const howTopRows = [
  {
    icon: Globe2,
    title: "글로벌 회사에 집중하고 있습니다.",
    body: (
      <>
        Harper는 현재 글로벌 회사와 주로 협업하고 있습니다.
        <br />
        생각하지 못한 최고의 기회를 받으실 수 있게 합니다.
      </>
    ),
  },

  {
    icon: Scan,
    title: "항상 조용히 기회를 찾습니다.",
    body: (
      <>
        좋은 기회는 내가 이직을 결심한 순간에 맞춰 열리지 않습니다. 당신이 일에
        몰입하는 동안에도 Harper는 뒤에서 조용히 60만+개의 국내외 기회를 살피고,
        기준에 맞는 기회만 골라 가져옵니다.
      </>
    ),
  },
];
const howRows = [
  {
    icon: ChevronsRight,
    title: "끊임없는 최적화.",
    body: (
      <>
        Harper와 대화하고 추천된 기회에 대해 피드백을 줄수록 Harper는 당신의
        선호를 이해하고 점점 더 알맞은 기회들을 찾아옵니다.
      </>
    ),
  },
  {
    icon: MessagesSquare,
    title: "복잡하고 어려운 모든 과정을 대신합니다.",
    body: (
      <>
        회사에 대해 궁금한 정보를 대신 질문하고, 답변을 정리해 전달합니다. 조건
        조율부터 회사 조사까지 모든 과정을 도와드립니다.
      </>
    ),
  },
  {
    icon: BriefcaseBusiness,
    title: "모든 계약 형태 지원.",
    body: (
      <>
        정규직 뿐만 아니라 파트타임 혹은 자문 등 모든 기회를 찾아서 연결합니다.
      </>
    ),
  },
] as const;

function DesktopWindowMockup() {
  return (
    <div className="absolute left-[7.2%] top-[8.5%] w-[80.5%] overflow-hidden rounded-[16px] bg-neutral-50 text-neutral-950 ring-1 ring-black/15 md:left-[8.4%] md:top-[8.6%] md:w-[78%]">
      <div className="grid h-9 grid-cols-[64px_1fr_76px] items-center bg-neutral-100 px-3 text-[11px] text-neutral-500 ring-1 ring-black/[0.06] sm:grid-cols-[110px_1fr_110px] sm:px-4 sm:text-[13px]">
        <div className="flex gap-2">
          <span className="h-2 w-2 rounded-full bg-neutral-300 sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 rounded-full bg-neutral-300 sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 rounded-full bg-neutral-300 sm:h-2.5 sm:w-2.5" />
        </div>
        <div className="whitespace-nowrap text-xs text-center font-normal text-neutral-600">
          Desktop
        </div>
        <div />
      </div>

      <div className="relative aspect-[1512/827] overflow-hidden bg-neutral-50">
        <Image
          src="/images/career_screen.png"
          alt="Harper desktop app screenshot"
          fill
          priority
          sizes="(min-width: 1280px) 980px, (min-width: 768px) 78vw, 81vw"
          className="object-contain object-top"
        />
      </div>
    </div>
  );
}

function HeroScreenshot() {
  return (
    <div className="relative mx-auto mt-12 h-[420px] w-full max-w-[1240px] overflow-hidden rounded-[18px] bg-neutral-200 ring-1 ring-black/[0.06] md:mt-14 md:h-[670px]">
      <Image
        src="/images/orangesky2.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1280px) 1240px, 100vw"
        className="object-cover opacity-[0.45] brightness-[1.12] contrast-[0.82] saturate-[0.52]"
      />
      <div className="absolute inset-0 bg-neutral-200/40" />
      <DesktopWindowMockup />
      <GmailPhoneMockup />
    </div>
  );
}

function ProductFlowPanel() {
  const chatRows = [
    {
      by: "candidate",
      text: "현재보다 보상이 좋은 글로벌 회사에서의 기회라면 관심있어요.",
    },
    {
      by: "harper",
      text: "알겠습니다. 몇가지 후보들이 있어요. 혹시 SF로 이동하실 의향도 있으신가요?",
    },
    {
      by: "candidate",
      text: "네. 서울이랑 SF 정도가 좋아요.",
    },
    {
      by: "harper",
      text: "좋아요. 일반 HR 프로세스는 건너뛰고, 바로 팀 리드와 연결해드릴게요. 방금 APAC지역 VP에게 직접 intro email을 보냈어요. 메일함 확인해보세요.",
    },
  ] as const;

  const cc =
    "flex items-center justify-center rounded-full border border-black/20 px-3 py-2.5";

  return (
    <div className="mt-11 space-y-10 md:mt-[52px] md:space-y-16">
      <div className="grid items-center gap-7 md:grid-cols-[1fr_1fr] md:gap-14">
        <ProductFlowText
          className="order-2 md:order-1"
          title="대화로 현재 상황에 대해 말해주세요."
          body="짧은 통화로 선호하는 역할, 보상, 지역, 비자, 팀 분위기처럼 실제로 선택에 영향을 주는 기준에 대해 알려주세요."
        />
        <div className="order-1 md:order-2">
          <ConversationVisual chatRows={chatRows} controlClassName={cc} />
        </div>
      </div>

      <div className="grid items-center gap-7 md:grid-cols-[1fr_1fr] md:gap-14">
        <RoleBriefingVisual />
        <ProductFlowText
          className="md:order-2"
          title="하퍼가 추천하는 기회를 확인하세요."
          body="Harper는 정말 좋다고 생각되는 기회만 소수로 선별하여 전달합니다. 하퍼가 연결 가능한 내부 기회부터, 직접 지원 가능한 오픈 포지션까지 있습니다."
        />
      </div>

      <div className="grid items-center gap-7 md:grid-cols-[1fr_1fr] md:gap-14">
        <ProductFlowText
          className="order-2 md:order-1"
          title="수락하면 연결이 진행됩니다."
          body="내부 기회에 관심 있다고 답하면 연결이 진행됩니다. 지원 과정 없이, 바로 담당자와 만남이 이루어집니다. 하퍼는 높은 기준을 만족한 경우에만 연결을 시도하기 때문에, 먼저 제안한 기회는 수락시 100% 연결됩니다."
        />
        <div className="order-1 md:order-2">
          <GmailNotificationVisual />
        </div>
      </div>
    </div>
  );
}

function ProductFlowText({
  title,
  body,
  className = "",
}: {
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className="max-w-[420px] text-[20px] font-medium leading-[1.18] text-neutral-950 md:text-[24px]">
        {title}
      </h3>
      <p className="mt-5 max-w-[480px] text-[14px] leading-[1.72] text-neutral-700 md:text-[15px]">
        {body}
      </p>
    </div>
  );
}

function ConversationVisual({
  chatRows,
  controlClassName,
}: {
  chatRows: readonly { by: string; text: string }[];
  controlClassName: string;
}) {
  return (
    <div className="relative min-h-[430px] overflow-hidden rounded-[18px] bg-neutral-950 p-6 text-white ring-1 ring-black/[0.04] md:min-h-[500px] md:p-8">
      <Image
        src="/images/green.jpg"
        alt=""
        fill
        sizes="(min-width: 768px) 54vw, 100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-neutral-950/38" />
      <div className="relative flex min-h-[382px] flex-col md:min-h-[452px]">
        <div className="mx-auto mt-auto w-full max-w-[344px] space-y-2.5 pb-6 text-[13px] leading-[1.55] md:pb-8">
          {chatRows.map((row, index) => {
            const isCandidate = row.by === "candidate";
            const isStreamingMessage =
              !isCandidate && index === chatRows.length - 1;

            return (
              <motion.div
                key={row.text}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.8 }}
                transition={{
                  duration: 0.38,
                  delay: index * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={`w-fit px-4 py-2.5 ${
                  isCandidate
                    ? "ml-auto max-w-[306px] rounded-[16px] bg-white/10 text-white ring-1 ring-white/54"
                    : "max-w-[306px] rounded-[16px] bg-white text-neutral-950"
                }`}
              >
                {isStreamingMessage ? (
                  <StreamingChatMessage text={row.text} delayMs={420} />
                ) : (
                  row.text
                )}
              </motion.div>
            );
          })}

          <div className="flex w-full items-center justify-center pt-16">
            <div className="flex w-fit flex-row gap-2 rounded-full bg-neutral-200/40 p-2 text-black ring-1 ring-white/5">
              <div className={cx(controlClassName, "bg-white text-black")}>
                <Mic strokeWidth={1.8} className="h-5 w-5" />
              </div>
              <div className={cx(controlClassName, "bg-white text-black")}>
                <Captions strokeWidth={1.8} className="h-5 w-5" />
              </div>
              <div
                className={cx(
                  controlClassName,
                  "flex flex-row items-center gap-2 border-black bg-black text-white"
                )}
              >
                <AudioLines strokeWidth={1.8} className="h-5 w-5" />
                중지하기
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StreamingChatMessage({
  text,
  delayMs = 0,
}: {
  text: string;
  delayMs?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const characters = Array.from(text);
  const characterCount = characters.length;
  const visibleText = characters.slice(0, visibleCount).join("");
  const isComplete = visibleCount >= characterCount;

  useEffect(() => {
    let timeoutId: number | undefined;
    let currentCount = 0;

    const typeNextCharacter = () => {
      currentCount += 1;
      setVisibleCount(currentCount);

      if (currentCount < characterCount) {
        timeoutId = window.setTimeout(typeNextCharacter, 42);
        return;
      }

      timeoutId = window.setTimeout(() => {
        currentCount = 0;
        setVisibleCount(0);
        timeoutId = window.setTimeout(typeNextCharacter, 360);
      }, 1400);
    };

    timeoutId = window.setTimeout(() => {
      typeNextCharacter();
    }, delayMs);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [characterCount, delayMs, text]);

  return (
    <span aria-label={text} className="whitespace-normal break-keep">
      {visibleText}
      {!isComplete ? (
        <span className="ml-[2px] inline-block h-[1em] w-[6px] translate-y-[2px] animate-pulse rounded-sm bg-neutral-950/70" />
      ) : null}
    </span>
  );
}

function RoleBriefingVisual() {
  const roleCards = [
    {
      logo: "/company-icons/anthropic.png",
      company: "Anthropic",
      role: "Forward Deployed Engineer",
      meta: "Seoul / Hybrid",
      salary: "$200K - $250K",
    },
    {
      logo: "/company-icons/cursor.png",
      company: "Cursor",
      role: "Applied AI Engineer",
      meta: "New York / Remote",
      salary: "$250K - $350K",
    },
  ] as const;

  return (
    <div className="rounded-[18px] min-h-[360px] flex items-center justify-center bg-neutral-100 p-4 ring-1 ring-black/[0.04] md:p-5">
      <div className="grid gap-2.5 w-full max-w-[400px]">
        {roleCards.map((card) => (
          <div
            key={card.role}
            className="relative rounded-[12px] bg-white px-4 py-5 ring ring-black/5"
          >
            <div className="absolute top-1 right-2">
              <CareerBadge
                size="small"
                color={card.company === "Anthropic" ? "primary" : "neutral"}
              >
                {card.company === "Anthropic" ? (
                  <span className="flex flex-row items-center gap-1">
                    <HeartHandshake className="h-3.5 w-3.5" />
                    하퍼의 연결
                  </span>
                ) : (
                  "오픈 포지션"
                )}
              </CareerBadge>
            </div>
            <div className="grid grid-cols-[38px_1fr_auto] items-start gap-3">
              <div className="relative h-9 w-9 overflow-hidden rounded-[9px] bg-white ring-1 ring-black/[0.06]">
                <Image
                  src={card.logo}
                  alt=""
                  width={48}
                  height={48}
                  className="object-contain p-1 rounded-lg"
                />
              </div>

              <div className="min-w-0">
                <h3 className="mt-0 truncate text-[15px] font-medium leading-[1.28] text-neutral-950 md:text-[16px]">
                  {card.role}
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-black/80 md:text-[13px]">
                  <span className="font-medium">{card.company}</span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-neutral-300" />
                  <span>{card.meta}</span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-neutral-300" />
                  <span>{card.salary}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GmailNotificationVisual() {
  const notifications = [
    {
      title: "Harper가 소개를 진행합니다",
      body: "Founder에게 호진님의 맥락과 추천 이유를 함께 전달했어요.",
      time: "방금",
    },
    {
      title: "미팅 시간이 도착했습니다",
      body: "금요일 오전 10시, Hiring Manager와 30분 미팅이 예정되어 있습니다.",
      time: "4시간 전",
    },
  ] as const;

  return (
    <div className="relative min-h-[410px] overflow-hidden rounded-[18px] bg-neutral-950 p-5 ring-1 ring-black/[0.04] md:min-h-[460px] md:p-8">
      <Image
        src="/images/sky1.jpg"
        alt=""
        fill
        sizes="(min-width: 768px) 54vw, 100vw"
        className="object-cover brightness-[0.78] contrast-[1.05] saturate-[0.6]"
      />
      <div className="absolute inset-0 bg-neutral-950/28" />

      <div className="relative flex min-h-[390px] items-center justify-center md:min-h-[436px]">
        <div className="w-full max-w-[430px] items-center justify-center flex flex-col">
          {notifications.map((item, index) => {
            const isFirstNotification = index === 0;

            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.8 }}
                transition={{
                  duration: 0.42,
                  delay: index * 0.1,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={cx(
                  "relative flex items-start gap-3 rounded-[18px] bg-white/10 text-white ring-1 ring-white/30 backdrop-blur-md px-4 py-3.5",
                  isFirstNotification
                    ? "z-10 w-[99%]"
                    : "z-20 mt-2 ml-auto w-full"
                )}
              >
                <div
                  aria-label="Gmail"
                  className="mt-0.5 h-9 w-9 shrink-0 rounded-[10px] bg-white bg-size-[26px_26px] bg-center bg-no-repeat ring-1 ring-black/[0.04]"
                  style={{ backgroundImage: "url('/svgs/gmail.svg')" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[13px] font-medium">
                      Harper
                    </span>
                    <span className="shrink-0 text-[11px] text-neutral-500">
                      {item.time}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[14px] font-medium">
                    {item.title}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-white/90">
                    {item.body}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OpportunityCard({
  item,
  careerStartHref,
  onCareerStartClick,
}: {
  item: (typeof opportunities)[number];
  careerStartHref: string;
  onCareerStartClick: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      href={careerStartHref}
      onClick={onCareerStartClick}
      data-opportunity-card={item.name}
      className="flex min-h-[178px] w-full flex-col rounded-3xl border border-black/5 bg-neutral-100 p-6 group"
    >
      <div className="text-base font-normal">{item.name}</div>
      <div className="mt-2 text-[14px] font-normal leading-6 text-black/50">
        {item.description}
      </div>
      <div className="mt-auto flex w-fit flex-row items-center gap-1 pt-8 text-sm text-xprimary transition-colors group-hover:text-neutral-950">
        소개받기 <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}

function OpportunityScroller({
  careerStartHref,
  onCareerStartClick,
}: {
  careerStartHref: string;
  onCareerStartClick: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [railOffset, setRailOffset] = useState(0);
  const { scrollYProgress } = useScroll({
    target: viewportRef,
    offset: ["start center", "end 20%"],
  });
  const railX = useTransform(scrollYProgress, [0, 1], [0, railOffset]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateRailOffset = () => {
      const width = viewport.getBoundingClientRect().width;
      setRailOffset(-(width * (2 / 3) + 8));
    };

    updateRailOffset();
    const resizeObserver = new ResizeObserver(updateRailOffset);
    resizeObserver.observe(viewport);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      data-opportunity-section
      className={`${ui.pageX} ${ui.sectionY} bg-white`}
    >
      <div className={ui.shell}>
        <SectionHeader
          title={<span className="block md:pl-6">하퍼로 연결되는 기회들</span>}
          body={
            <>
              <Link href="/jobs" className={cx(ui.btn, ui.btnSecondary)}>
                더 보기
              </Link>
            </>
          }
        />

        <div className="grid w-full grid-cols-1 items-start gap-3 md:hidden">
          {opportunities.map((item) => (
            <OpportunityCard
              key={item.name}
              item={item}
              careerStartHref={careerStartHref}
              onCareerStartClick={onCareerStartClick}
            />
          ))}
        </div>

        <div
          ref={viewportRef}
          className="hidden w-full overflow-hidden md:block"
        >
          <motion.div
            data-opportunity-rail
            style={{ x: railX }}
            className="grid w-full auto-cols-[calc((100%_-_24px)/3)] grid-flow-col items-stretch gap-3 will-change-transform"
          >
            {opportunities.map((item) => (
              <OpportunityCard
                key={item.name}
                item={item}
                careerStartHref={careerStartHref}
                onCareerStartClick={onCareerStartClick}
              />
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function AudiencePreviewCard() {
  const verticalWaves = Array.from({ length: 8 }, (_, index) => index);
  const horizontalWaves = Array.from({ length: 5 }, (_, index) => index);
  const verticalWavePath = (x: number) =>
    `M ${x} -24 C ${x + 34} -2 ${x + 34} 30 ${x} 48 C ${
      x - 34
    } 66 ${x - 34} 98 ${x} 116 C ${x + 34} 134 ${
      x + 34
    } 166 ${x} 184 C ${x - 34} 202 ${x - 34} 234 ${x} 252`;
  const verticalGridPath = (x: number) =>
    `M ${x} -24 C ${x} -2 ${x} 30 ${x} 48 C ${x} 66 ${x} 98 ${x} 116 C ${x} 134 ${x} 166 ${x} 184 C ${x} 202 ${x} 234 ${x} 252`;
  const horizontalWavePath = (y: number) =>
    `M -42 ${y} C 42 ${y - 18} 96 ${y + 18} 168 ${y} C 240 ${
      y - 18
    } 294 ${y + 18} 366 ${y} C 418 ${y - 13} 450 ${y - 2} 470 ${y + 8}`;
  const horizontalGridPath = (y: number) =>
    `M -42 ${y} C 42 ${y} 96 ${y} 168 ${y} C 240 ${y} 294 ${y} 366 ${y} C 418 ${y} 450 ${y} 470 ${y}`;

  return (
    <Link
      href="/about"
      className="group block overflow-hidden rounded-[18px] bg-white h-full ring-1 ring-black/[0.06] cursor-pointer hover:bg-neutral-100 transition-colors"
    >
      <div className="relative h-[170px] overflow-hidden bg-emerald-950 md:h-[80%]">
        <Image
          src="/images/orange.png"
          alt=""
          fill
          sizes="(min-width: 768px) 32vw, 100vw"
          className="object-cover brightness-[1.18] contrast-[0.88] saturate-[0.82]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_34%_18%,rgba(106,79,0,0.62),transparent_34%),linear-gradient(105deg,rgba(255,255,255,0.14),transparent_46%,rgba(0,92,72,0.18))]" />
        <svg
          aria-hidden="true"
          viewBox="0 0 420 220"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <g
            fill="none"
            stroke="rgba(255,255,255,0.62)"
            strokeLinecap="round"
            strokeWidth="1.1"
          >
            <g className="transition-opacity duration-500 ease-out group-hover:opacity-0">
              {verticalWaves.map((index) => {
                const x = -46 + index * 72;

                return (
                  <path
                    key={`vertical-wave-${index}`}
                    d={verticalWavePath(x)}
                  />
                );
              })}
              {horizontalWaves.map((index) => {
                const y = 26 + index * 46;

                return (
                  <path
                    key={`horizontal-wave-${index}`}
                    d={horizontalWavePath(y)}
                  />
                );
              })}
            </g>
            <g className="opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100">
              {verticalWaves.map((index) => {
                const x = -46 + index * 72;

                return (
                  <path
                    key={`vertical-grid-${index}`}
                    d={verticalGridPath(x)}
                    className="[stroke-dasharray:560] [stroke-dashoffset:560] transition-[stroke-dashoffset] duration-700 ease-out group-hover:[stroke-dashoffset:0]"
                    style={{ transitionDelay: `${index * 18}ms` }}
                  />
                );
              })}
              {horizontalWaves.map((index) => {
                const y = 26 + index * 46;

                return (
                  <path
                    key={`horizontal-grid-${index}`}
                    d={horizontalGridPath(y)}
                    className="[stroke-dasharray:560] [stroke-dashoffset:560] transition-[stroke-dashoffset] duration-700 ease-out group-hover:[stroke-dashoffset:0]"
                    style={{ transitionDelay: `${(index + 2) * 22}ms` }}
                  />
                );
              })}
            </g>
          </g>
        </svg>
      </div>
      <div className="flex flex-row gap-2 items-center justify-start px-3 py-3.5 text-[14px] font-normal leading-tight text-black md:px-5 md:py-5">
        <span>우리가 하퍼를 만든 이유</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}

function SectionHeader({
  title,
  body,
  isCenter = false,
}: {
  title: React.ReactNode;
  body?: React.ReactNode;
  isCenter?: boolean;
}) {
  return (
    <div
      className={`flex flex-col md:flex-row gap-5 md:gap-14 items-end w-full mb-10 md:mb-12 ${isCenter ? "justify-center text-center" : "justify-between"}`}
    >
      <h2 className={`${text.h2} w-full`}>{title}</h2>
      {body ? (
        <p
          className={`${text.p} w-full max-w-[560px] flex items-end justify-end md:mr-8 md:ml-auto`}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

export default function LandingKoVfPage() {
  const { careerStartHref, handleCareerStartClick } = useCareerLandingStart();

  return (
    <>
      <Head>
        <title>Harper - 좋은 기회를 대신 찾고 소개합니다.</title>
        <meta
          name="description"
          content="Harper는 엔지니어의 기준을 대화로 이해하고, 맞는 회사와 포지션만 선별해 브리핑한 뒤 관심 있는 기회만 직접 연결합니다."
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
      <style jsx global>{`
        nextjs-portal {
          display: none !important;
        }
      `}</style>

      <div
        id="top"
        className="min-h-screen overflow-x-clip break-keep bg-white font-sans text-neutral-950 antialiased"
      >
        <CareerAppBar
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
        />

        <main>
          <section className={`${ui.pageX} pt-32 md:pt-48`}>
            <div className={ui.shell}>
              <Reveal once blur={0} distance={20}>
                <div>
                  <div className="grid items-end gap-9 md:grid-cols-[0.96fr_1.04fr] md:gap-16">
                    <h1 className={text.h2}>
                      다음 기회를 찾고 연결해주는
                      <br />
                      커리어 에이전트, Harper
                    </h1>
                    <div className="max-w-[600px] md:ml-auto">
                      <p className="text-[15px] leading-[1.75] text-black/80 md:text-[16px]">
                        뛰어난 엔지니어를 위해 설계된 커리어 에이전트. Harper는
                        당신의 선호를 이해하고, 가장 잘 맞는 역할만 선별해
                        의사결정자와 바로 연결합니다.
                      </p>
                    </div>
                  </div>
                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <Link
                      href={careerStartHref}
                      onClick={handleCareerStartClick}
                      className={cx(ui.btn, ui.btnPrimary)}
                    >
                      Meet your Agent
                    </Link>
                    <a href="#workflow" className={cx(ui.btn, ui.btnSecondary)}>
                      제품 화면 보기
                    </a>
                  </div>
                </div>
              </Reveal>

              <Reveal once blur={0} distance={20} delay={0.08}>
                <HeroScreenshot />
              </Reveal>
            </div>
          </section>

          <TalentSocialProof />

          <section
            id="workflow"
            className={`${ui.pageX} ${ui.sectionY} bg-neutral-50`}
          >
            <div className={ui.shell}>
              <Reveal once blur={0} distance={20}>
                <SectionHeader
                  title={
                    <>
                      기준을 말하면
                      <br />
                      Harper가 기회를 정리합니다
                    </>
                  }
                  body={
                    <>
                      무작위 제안을 많이 던지는 방식이 아닙니다. 먼저 회원님의
                      기준을 확인하고, 확인할 가치가 있는 기회만 전달합니다.
                    </>
                  }
                />
              </Reveal>

              <Reveal once blur={0} distance={20} delay={0.08}>
                <ProductFlowPanel />
              </Reveal>
            </div>
          </section>

          <section id="how" className={`${ui.pageX} ${ui.sectionY}`}>
            <div className={ui.shell}>
              <Reveal once>
                <SectionHeader
                  title={
                    <>
                      <div className={`${text.h3}`}>
                        <div className="text-black/50 font-medium">
                          최고의 선수들에겐 전담 에이전트가 있습니다. 선수는
                          경기에만 집중하듯, 당신은{" "}
                          <span className="text-black">
                            지금의 일과 성장에만 집중
                          </span>
                          하세요. Harper가 대신해서{" "}
                          <span className="text-black">기회를 찾고 연결</span>
                          까지 해드릴게요.
                        </div>
                      </div>
                    </>
                  }
                  /* 지금까지 받아오신 리크루터 연락, 채용 공고, LinkedIn DM과{" "}
                      <br className="hidden md:block" />
                      Harper가 다른 네 가지 지점. */
                />
              </Reveal>

              <div className="grid md:grid-cols-2 gap-4">
                {howTopRows.map((row, index) => {
                  const Icon = row.icon;

                  return (
                    <Reveal key={row.title} once delay={index * 0.06}>
                      <div
                        className={cn(
                          "relative flex min-h-[248px] w-full flex-col justify-between overflow-hidden rounded-3xl border border-black/5 bg-neutral-100 p-6",
                          index === 0 && "bg-white"
                        )}
                      >
                        {index === 0 ? (
                          <>
                            <Image
                              src="/images/blue.png"
                              alt=""
                              fill
                              sizes="(min-width: 768px) 50vw, 100vw"
                              className="object-cover opacity-100"
                            />
                            <div className="absolute inset-0 bg-black/20" />
                          </>
                        ) : null}
                        <span className="relative z-10 inline-flex w-fit self-start rounded-xl border border-black/5 bg-white/10 p-3 backdrop-blur-[2px]">
                          <Icon
                            aria-hidden="true"
                            className={cn(
                              "h-4 w-4 md:h-5 md:w-5",
                              index === 0 ? "text-neutral-400/80" : "text-black"
                            )}
                            strokeWidth={1.8}
                          />
                        </span>
                        <div className="relative z-10">
                          <h3
                            className={cn(
                              `${text.sm} font-medium ${index === 0 ? "text-white/90" : "text-neutral-800/80"}`
                            )}
                          >
                            {row.title}
                          </h3>
                          <p
                            className={cn(
                              `${text.sm} mt-2 max-w-[460px] ${index === 0 ? "text-white/70" : "text-neutral-800/80"}`
                            )}
                          >
                            {row.body}
                          </p>
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
              </div>
              <div className="mt-4 grid md:grid-cols-3 gap-4">
                {howRows.map((row, index) => {
                  const Icon = row.icon;

                  return (
                    <Reveal key={row.title} once delay={index * 0.06}>
                      <div
                        className={`flex min-h-[158px] w-full flex-col rounded-3xl border border-black/5 bg-neutral-100 p-6`}
                      >
                        <div className="flex flex-row items-center justify-start gap-3">
                          <Icon
                            aria-hidden="true"
                            className="h-4 w-4 md:h-5 md:w-5"
                            strokeWidth={1.8}
                          />
                          <h3
                            className={cn(
                              `${text.sm} font-medium text-neutral-800/80`
                            )}
                          >
                            {row.title}
                          </h3>
                        </div>
                        <p className={`${text.sm} mt-4 max-w-[460px]`}>
                          {row.body}
                        </p>
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </section>

          <section
            id="voices"
            className={`${ui.pageX} ${ui.sectionY} bg-neutral-950 text-white`}
          >
            <div className={ui.shell}>
              <Reveal once>
                <SectionHeader
                  isCenter={true}
                  title={
                    <div className="text-white">
                      이미 최고의 인재들이 하퍼를 통해 연결되고 있습니다.
                    </div>
                  }
                />
              </Reveal>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {voices.map((voice, index) => (
                  <Reveal key={voice.name} once delay={index * 0.08}>
                    <div className="h-full md:mt-0 mt-6">
                      <div className="bg-neutral-800/50 text-[14px] text-white/80 font-sans leading-[1.5] px-8 h-[120px] md:h-[160px] font-medium flex items-center justify-center rounded-[8px]">
                        {voice.quote}
                      </div>
                      <div className="mt-0 flex items-start gap-3 pt-3 md:pt-5">
                        {voice.initial.includes("images") ? (
                          <Image
                            src={voice.initial}
                            alt={voice.name}
                            width={28}
                            height={28}
                            className="h-7 w-7 rounded-full object-cover mt-1"
                          />
                        ) : (
                          <div className="flex mt-1 h-9 w-9 items-center justify-center rounded-full bg-white/10 text-base italic">
                            <User2 className="w-5 h-5" strokeWidth={1.3} />
                          </div>
                        )}
                        <div>
                          <div className="text-[13px] md:text-[15px] font-normal">
                            {voice.name}{" "}
                            <span className="text-white/50">
                              to {voice.company}
                            </span>
                          </div>
                          <div className="text-[12px] md:text-[13px] text-white/50 flex flex-row gap-2 items-center">
                            {voice.role}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section
            id="voices"
            className={`${ui.pageX} pt-12 pb-20 md:pb-32 bg-neutral-950 text-white`}
          >
            <div className={ui.shell}>
              <Reveal once>
                <SectionHeader
                  isCenter={true}
                  title={
                    <div className="text-white text-2xl underline">
                      보안 및 개인정보
                    </div>
                  }
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
                  {[
                    {
                      title: "동의 전에는 회사에 전달되지 않습니다.",
                      body: "Harper와 나눈 대화, 선호 조건, 커리어 맥락은 사용자가 관심을 표시한 기회에 한해서만 필요한 범위로 전달됩니다. 회사가 임의로 내 프로필을 검색하거나 열람할 수 없습니다.",
                    },
                    {
                      title: "필요한 정보만 제한적으로 다룹니다.",
                      body: "기회 매칭과 소개 진행에 필요한 정보만 사용하며, 민감한 커리어 정보는 내부 접근을 제한해 관리합니다. 원하지 않는 정보는 언제든 업데이트하거나 삭제를 요청할 수 있습니다.",
                    },
                  ].map((item) => (
                    <div className="relative z-10" key={item.title}>
                      <div
                        className={cn(`${text.lg} text-neutral-50 font-medium`)}
                      >
                        {item.title}
                      </div>
                      <p className={cn(`${text.sm} mt-2 text-neutral-50/60`)}>
                        {item.body}
                      </p>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </section>

          <OpportunityScroller
            careerStartHref={careerStartHref}
            onCareerStartClick={handleCareerStartClick}
          />

          <div className={`${ui.pageX} ${ui.sectionY} bg-white`}>
            <div className={ui.shell}>
              <div className="grid w-full items-start gap-4 md:grid-cols-[1.3fr_0.7fr]">
                <div className="w-full flex flex-col md:justify-between min-h-[300px] bg-neutral-100 p-6 rounded-3xl">
                  <div className={`${text.h3}`}>하퍼는 누구를 위한 건가요?</div>
                  <div className="mt-6 grid w-full auto-rows-max grid-cols-1 gap-3 sm:grid-cols-2">
                    {[
                      {
                        id: "linkedin-open-to-work-primary",
                        label: "링크드인을 Open to work로 설정하고 싶은 사람",
                      },
                      {
                        id: "linkedin-open-to-work-secondary",
                        label: "이직에 열려있지만 현재 일에 집중하고 싶은 사람",
                      },
                      {
                        id: "global-stage-primary",
                        label: "글로벌 무대로 나가고 싶은 사람",
                      },
                      {
                        id: "global-stage-secondary",
                        label: "자신만을 위한 헤드헌터를 가지고 싶은 사람",
                      },
                    ].map((item) => (
                      <div
                        key={item.id}
                        className="flex w-full items-center rounded-full text-[13px] leading-snug md:text-sm"
                      >
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-full flex-1 h-full">
                  <AudiencePreviewCard />
                </div>
              </div>
            </div>
          </div>

          <section id="cta" className={`${ui.pageX} ${ui.sectionY}`}>
            <div className={ui.shell}>
              <Reveal once blur={0} distance={20}>
                <div className="flex flex-col gap-8 items-center justify-center text-center">
                  <h2 className={`${text.h2}`}>
                    당신만을 위한 커리어 에이전트
                    <br />
                    바로 시작하세요.
                  </h2>
                  <Link
                    href={careerStartHref}
                    onClick={handleCareerStartClick}
                    className={cx(ui.btn, ui.btnPrimary)}
                  >
                    Meet your Agent
                  </Link>
                </div>
              </Reveal>
            </div>
          </section>
        </main>

        <CareerLandingFooter
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
        />
      </div>
    </>
  );
}
