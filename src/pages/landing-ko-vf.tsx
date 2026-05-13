import Reveal from "@/components/landing/Animation/Reveal";
import { useIsMobile } from "@/hooks/useIsMobile";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Clock, Loader, Lock } from "lucide-react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";

const MOBILE_HEADER_SCROLL_DELTA_THRESHOLD = 8;
const REPORT_ITEM_COUNT = 9;
const CAREER_START_HREF =
  "/career_login?next=%2Fcareer%2Fonboarding&source=landing-ko-vf";

const schoolLogos = [
  { src: "/images/logos/sn.png", name: "서울대학교" },
  { src: "/images/logos/kaist.png", name: "KAIST" },
  { src: "/images/logos/stanford.png", name: "Stanford" },
] as const;

const partnerLogos = [
  { key: "a16z2", src: "/svgs/a16z2.svg", width: 100, height: 56 },
  { key: "yc", src: "/svgs/yc.svg", width: 128, height: 26 },
  { key: "wonderful", src: "/images/wonderful.png", width: 154, height: 55 },
  { key: "mistral", src: "/images/mistral.png", width: 142, height: 40 },
  { key: "cohere", src: "/svgs/cohere.svg", width: 124, height: 21 },
] as const;

const chatMessages = [
  {
    step: 2,
    role: "user",
    text: "나 미국 가고 싶은데, 샌프란이나 뉴욕에 AI 스타트업 중에 한국인 비자 스폰서 해주는 곳 있어? 탑 티어 투자 받고, 연봉은 $250K 이상이면 좋을 것 같아.",
  },
  {
    step: 4,
    role: "ai",
    text: "네, 충분히 가능해요. H-1B·O-1 스폰서 이력이 있는 곳 위주로 볼게요. 혹시 지금 비자 상태는 어떻게 되시고, 회사 규모는 어느 정도가 좋으실까요?",
  },
  {
    step: 5,
    role: "user",
    text: "지금은 한국에서 일하고 있어서 비자 없어. 이미 어느 정도 규모 있는 곳이면 좋겠어. Series C 이상으로.",
  },
  {
    step: 7,
    role: "ai",
    text: "확인했어요. 조건에 딱 맞는 풀타임 2곳이에요. 그리고 Chris가 흥미 있을 것 같은 자리 두 개 더, 미국 팀과의 어드바이저리와 계약직 기회예요. 이 두 개는 비자가 필요 없어요.",
  },
  {
    step: 10,
    role: "ai",
    text: "여기 공고들 모두 바로 연결 가능해요. Anthropic CEO한테 바로 연결해드릴까요?",
  },
  {
    step: 12,
    role: "ai",
    text: "아 그리고 혹시, Chris 경력에 맞는 1시간 $500 전문가 단기 자문 건도 하나 있는데 관심 있으세요? 본업 유지하면서 부담 없이 해볼 수 있어요.",
  },
] as const;

const matches = [
  {
    company: "Anthropic",
    type: "풀타임",
    role: "시니어 ML 엔지니어 · SF + 리모트",
    fit: "96% 적합",
    mark: "A",
  },
  {
    company: "Perplexity",
    type: "풀타임",
    role: "AI 검색 인프라 · 샌프란시스코",
    fit: "93% 적합",
    mark: "P",
  },
  {
    company: "Cursor",
    type: "어드바이저리",
    role: "추론 인프라 어드바이저 · 월 약 10시간 · 리모트",
    fit: "91% 적합",
    mark: "C",
  },
  {
    company: "Runway",
    type: "파트타임",
    role: "계약직 ML 엔지니어 · 주 약 20시간 · 리모트",
    fit: "87% 적합",
    mark: "R",
  },
] as const;

const fundingBars = [
  { label: "Series A", value: "$124M", height: "8%", current: false },
  { label: "Series B", value: "$580M", height: "14%", current: false },
  { label: "Amazon", value: "$8B", height: "34%", current: false },
  { label: "Series F", value: "$13B", height: "60%", current: false },
  { label: "Series G", value: "$30B", height: "100%", current: true },
] as const;

const workflowCards = [
  {
    number: "1.",
    title: "대화로 나를 소개",
    body: "전화나 채팅으로 Harper에게 커리어 이야기와 비자, 연봉, 팀 규모 같은 조건을 편하게 들려주세요. 이력서를 다시 쓸 필요 없어요.",
    visual: "conversation",
  },
  {
    number: "2.",
    title: "완벽한 기회만 전달",
    body: "매일 20만+ 글로벌 포지션을 스캔해서, 회원님의 기준을 통과한 풀타임, 파트타임, 단기 자문만 정리해서 보내드려요.",
    visual: "jobs",
  },
  {
    number: "3.",
    title: "Founder · Hiring Manager와 직접 연결",
    body: "수락만 해주세요. Harper가 hiring manager 또는 창업자와 직접 미팅을 세팅하고, 그 자리에서 회원님이 빛날 수 있도록 준비까지 도와드려요.",
    visual: "intro",
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
        서류를 고치는 대신 agent에게 최근의 성과를 편하게 들려주세요. 대화로
        실시간 업데이트되는 프로필이, 가만히 있어도 <em>가장 최신의 나</em>에게
        맞는 기회를 가져옵니다.
      </>
    ),
  },
  {
    number: "iii.",
    title: "노이즈는 제로, 통제권은 탤런트에게.",
    body: (
      <>
        영혼 없는 제안과 스팸 DM에 에너지 뺏기지 마세요. 탤런트의 기준을
        통과하지 못한 연락은 Harper가 먼저 차단합니다. <em>철저한 익명</em>{" "}
        속에서 기회를 검토하고, 탤런트가 승인한 곳과만 안전하게 대화를
        시작하세요.
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
      "이력서를 3년째 업데이트하지 않았어요. 그런데 Harper는 그냥 알더라고요. 3주 뒤엔 지금의 공동창업자와 커피를 마시고 있었어요.",
    initial: "J",
    name: "Jiwon K.",
    role: "ML 리서처 → 창립 AI 엔지니어",
    status: "",
  },
  {
    quote:
      "제 전문성이 이런 식으로도 쓰일 수 있다는 걸 몰랐어요. 본업은 그대로 유지하고 있는데, Harper가 어드바이저리 두 건을 연결해줬어요.",
    initial: "D",
    name: "Daniel R.",
    role: "스태프 엔지니어, 인프라",
    status: "어드바이저리 2건 진행 중",
  },
  {
    quote:
      "Anthropic 면접 준비하는 동안 Harper가 조용히 $500짜리 전문가 콜 세 건도 잡아줬어요. 다 합쳐서 두 시간. 그 사이 파이프라인도 계속 돌고 있었죠.",
    initial: "M",
    name: "Minji L.",
    role: "응용 사이언티스트, NLP",
    status: "면접 진행 중 · 전문가 콜 3건 라이브",
  },
] as const;

type LandingButtonProps = {
  href?: string;
  label: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
  showArrow?: boolean;
  className?: string;
};

function LandingButton({
  href,
  label,
  size = "md",
  variant = "primary",
  showArrow = true,
  className = "",
}: LandingButtonProps) {
  const isSmall = size === "sm";
  const isPrimary = variant === "primary";
  const classNames = `group relative inline-flex items-center justify-center overflow-hidden font-geist font-medium transition-shadow duration-300 ${
    isPrimary
      ? "rounded-[12px] bg-beige900 text-beige100 shadow-lg hover:shadow-xl"
      : "rounded-[12px] bg-beige500/70 text-beige900 shadow-inner"
  } ${
    isSmall
      ? isPrimary
        ? "h-[44px] px-5 text-[14px]"
        : "h-[42px] px-4 text-[15px]"
      : "h-[50px] px-5 text-base"
  } ${className}`;

  const content = (
    <>
      {!isPrimary && (
        <span className="absolute inset-0 bg-beige50/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      )}
      <span className="relative flex h-full items-start overflow-hidden">
        <span
          className="flex flex-col transition-transform duration-500 group-hover:-translate-y-1/2"
          style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          <span
            className={`flex items-center leading-none ${
              isSmall ? (isPrimary ? "h-[44px]" : "h-[42px]") : "h-[50px]"
            }`}
          >
            {label}
          </span>
          <span
            className={`flex items-center leading-none ${
              isSmall ? (isPrimary ? "h-[44px]" : "h-[42px]") : "h-[50px]"
            }`}
          >
            {label}
          </span>
        </span>
      </span>
      {showArrow && (
        <ArrowUpRight className="relative ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-[2px] group-hover:translate-y-[-2px]" />
      )}
    </>
  );

  if (href) {
    return (
      <motion.a
        href={href}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.985 }}
        className={classNames}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      className={classNames}
    >
      {content}
    </motion.button>
  );
}

function AppBar() {
  const isMobile = useIsMobile();
  const [isMobileHeaderVisible, setIsMobileHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (!isMobile) {
      setIsMobileHeaderVisible(true);
      return;
    }

    lastScrollYRef.current = window.scrollY;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollYRef.current;

      if (currentY <= 12) {
        setIsMobileHeaderVisible(true);
        lastScrollYRef.current = currentY;
        return;
      }

      if (Math.abs(delta) < MOBILE_HEADER_SCROLL_DELTA_THRESHOLD) return;

      setIsMobileHeaderVisible(delta <= 0);
      lastScrollYRef.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isMobile]);

  return (
    <motion.nav
      initial={false}
      animate={{
        y: isMobile && !isMobileHeaderVisible ? -88 : 0,
      }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 border-b border-beige900/10 bg-beige200/95 backdrop-blur-lg"
    >
      <div className="mx-auto flex h-[64px] max-w-[1160px] items-center justify-between px-4">
        <a href="#top" className="font-halant text-[28px] text-beige900">
          Harper
        </a>
        <LandingButton
          href={CAREER_START_HREF}
          label="Join"
          size="sm"
          variant="secondary"
          showArrow={false}
          className="inline-flex"
        />
      </div>
    </motion.nav>
  );
}

function SocialProofSection() {
  return (
    <section
      aria-label="Harper social proof"
      className="px-4 py-4 text-center md:px-10 md:py-8"
    >
      <Reveal once delay={0.06}>
        <div className="flex flex-col items-center justify-center gap-3 text-[15px] font-normal tracking-[-0.03em] text-beige900/75 sm:flex-row md:text-base">
          <div>150+ engineers and researchers From</div>
          <div className="flex -space-x-2">
            {schoolLogos.map((school) => (
              <div
                key={school.name}
                className="h-9 w-9 overflow-hidden rounded-full border border-beige900/20 bg-beige500 md:h-10 md:w-10"
              >
                <Image
                  src={school.src}
                  alt={school.name}
                  width={42}
                  height={42}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal once delay={0.12} className="mx-auto mt-6 max-w-[900px]">
        <div className="text-base font-medium leading-[1.55] tracking-[-0.03em] text-beige900 md:text-lg">
          Partnering with{" "}
          <span className="text-beige900/50">Most Exciting Tech companies</span>{" "}
          funded by the world&apos;s elite.
        </div>
      </Reveal>
      <Reveal once delay={0.18} className="mx-auto mt-0 w-full max-w-[980px]">
        <div className="hidden items-center justify-center gap-14 md:flex">
          {partnerLogos.map((logo) => (
            <div
              key={logo.key}
              className="flex h-24 min-w-[120px] items-center justify-center"
            >
              <Image
                src={logo.src}
                alt={logo.key}
                width={logo.width}
                height={logo.height}
                className="object-contain opacity-90"
              />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 items-center justify-center gap-x-6 gap-y-7 md:hidden">
          {partnerLogos.map((logo) => (
            <div key={logo.key} className="flex items-center justify-center">
              <Image
                src={logo.src}
                alt={logo.key}
                width={Math.max(84, logo.width - 24)}
                height={Math.round(
                  (logo.height * Math.max(84, logo.width - 24)) / logo.width
                )}
                className="max-w-[38vw] object-contain opacity-90"
              />
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function TypingBubble({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="flex w-fit items-center gap-1 rounded-2xl rounded-bl px-3 py-2 bg-beige700/25"
        >
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -3, 0] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                delay: index * 0.14,
              }}
              className="h-1.5 w-1.5 rounded-full bg-beige100"
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function VoiceBar({ active, done }: { active: boolean; done: boolean }) {
  return (
    <motion.div
      animate={{
        opacity: active ? 1 : 0,
        y: active ? 0 : 8,
        scale: active ? 1 : 0.96,
      }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="ml-auto flex w-fit items-center gap-2 rounded-2xl rounded-br bg-beige700 px-3 py-2 text-beige50"
    >
      <div className="flex items-center gap-[3px]">
        {[12, 20, 14, 22, 10, 18].map((height, index) => (
          <motion.span
            key={`${height}-${index}`}
            animate={done ? { scaleY: 0.72 } : { scaleY: [0.6, 1, 0.6] }}
            transition={{
              duration: 0.9,
              repeat: done ? 0 : Infinity,
              delay: index * 0.1,
              ease: "easeInOut",
            }}
            className="w-[3px] origin-center rounded-full bg-beige50"
            style={{ height }}
          />
        ))}
      </div>
      <span className="text-[13px]">0:28</span>
    </motion.div>
  );
}

function CompanyMark({
  children,
  size = "sm",
}: {
  children: React.ReactNode;
  size?: "sm" | "lg";
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-lg bg-beige900 font-halant text-beige50 ring-1 ring-beige50/10 ${
        size === "lg" ? "h-[52px] w-[52px] text-[22px]" : "h-7 w-7 text-[13px]"
      }`}
    >
      {children}
    </div>
  );
}

function ChatMatchCard({
  match,
  visible,
  selected,
  refCallback,
}: {
  match: (typeof matches)[number];
  visible: boolean;
  selected: boolean;
  refCallback?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={refCallback}
      className={`flex cursor-pointer items-center gap-2.5 rounded-[11px] border p-2.5 transition duration-300 ${
        visible ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"
      } ${
        selected
          ? "border-beige700 bg-beige700/20"
          : "border-beige100/10 bg-beige100/5"
      }`}
    >
      <CompanyMark>{match.mark}</CompanyMark>
      <div className="min-w-0 flex-1">
        <div className="font-halant text-base leading-none text-beige50">
          <span className="mr-1.5 inline-flex rounded-full bg-beige50/10 px-2 py-0.5 font-geist text-[10px] text-beige200">
            {match.type}
          </span>
          {match.company}
        </div>
        <div className="mt-1 truncate text-[10.5px] text-beige200/60">
          {match.role}
        </div>
      </div>
      <div className="shrink-0 text-[13px] font-medium text-beige700">
        {match.fit}
      </div>
    </div>
  );
}

function ReportItem({
  index,
  visibleCount,
  children,
  className = "",
}: {
  index: number;
  visibleCount: number;
  children: React.ReactNode;
  className?: string;
}) {
  const isVisible = visibleCount > index;

  return (
    <div
      className={`transition duration-500 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-2.5 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function HarperReport({
  reportVisible,
  reportItemsVisible,
}: {
  reportVisible: boolean;
  reportItemsVisible: number;
}) {
  const chartVisible = reportItemsVisible > 1;
  const sparkVisible = reportItemsVisible > 2;

  return (
    <div
      className={`relative h-[520px] overflow-hidden rounded-2xl border border-beige900/10 bg-beige50 p-5 text-left shadow-xl transition duration-700 md:h-[820px] md:rounded-[22px] md:p-[30px] ${
        reportVisible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-b from-beige50/0 to-beige50" />

      <ReportItem index={0} visibleCount={reportItemsVisible}>
        <div className="flex items-start justify-between gap-4 border-b border-beige900/10 pb-4">
          <div className="flex items-center gap-3.5">
            <CompanyMark size="lg">A</CompanyMark>
            <div>
              <div className="font-halant text-[22px] leading-[1.15] text-beige900 md:text-2xl">
                <em className="text-beige700">Anthropic</em> — Harper 리포트
              </div>
              <div className="mt-1 text-[13px] text-beige900/55">
                2021년 설립 · 샌프란시스코 본사 · H-1B·O-1 스폰서
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded-full bg-beige900 px-3 py-1 text-[10.5px] font-medium text-beige50">
              Series G
            </span>
            <span className="text-[13px] text-beige900/45">4분 소요</span>
          </div>
        </div>
      </ReportItem>

      <ReportItem
        index={1}
        visibleCount={reportItemsVisible}
        className="grid grid-cols-2 gap-2 border-b border-beige900/10 py-4 md:grid-cols-4"
      >
        {[
          ["$30B", "최근 라운드 (2026.2)"],
          ["$380B", "기업가치"],
          ["2,500 +2.1×", "임직원 (YoY)"],
          ["$30B", "ARR · +1,400% YoY"],
        ].map(([value, label]) => (
          <div key={label} className="px-1">
            <div className="font-halant text-[26px] leading-none text-beige900">
              {value}
            </div>
            <div className="mt-1.5 text-[10.5px] leading-snug text-beige900/50">
              {label}
            </div>
          </div>
        ))}
      </ReportItem>

      <ReportItem
        index={2}
        visibleCount={reportItemsVisible}
        className="border-b border-beige900/10 py-4"
      >
        <div className="mb-3 flex items-baseline justify-between gap-3 text-[13px] text-beige900/50">
          <span>펀딩 히스토리</span>
          <span className="font-halant text-[13px] italic text-beige900/80">
            누적 $58B+ 투자 유치
          </span>
        </div>
        <div className="flex h-[92px] items-end gap-2">
          {fundingBars.map((bar) => (
            <div
              key={bar.label}
              className="flex h-full flex-1 flex-col justify-end gap-1.5"
            >
              <div className="flex h-[72px] items-end">
                <div
                  className={`w-full origin-bottom rounded-t ${
                    bar.current ? "bg-beige700" : "bg-beige500"
                  } transition-transform duration-1000`}
                  style={{
                    height: bar.height,
                    transform: chartVisible ? "scaleY(1)" : "scaleY(0)",
                  }}
                />
              </div>
              <div className="text-center text-[9.5px] leading-tight text-beige900/50">
                {bar.label}
                <br />
                <b className="font-medium text-beige900/80">{bar.value}</b>
              </div>
            </div>
          ))}
        </div>
      </ReportItem>

      <ReportItem
        index={3}
        visibleCount={reportItemsVisible}
        className="border-b border-beige900/10 py-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-halant text-[22px] leading-none text-beige900">
              2.1×
            </div>
            <div className="mt-1.5 text-[10.5px] text-beige900/50">
              헤드카운트 · 12개월
            </div>
          </div>
          <svg
            className="h-12 w-[180px] max-w-[55%]"
            viewBox="0 0 200 48"
            preserveAspectRatio="none"
          >
            <path
              d="M0,42 L22,40 L44,37 L66,33 L88,28 L110,24 L132,18 L154,13 L176,8 L200,4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-beige700 transition-[stroke-dashoffset] duration-1000"
              style={{
                strokeDasharray: 400,
                strokeDashoffset: sparkVisible ? 0 : 400,
              }}
            />
            <path
              d="M0,42 L22,40 L44,37 L66,33 L88,28 L110,24 L132,18 L154,13 L176,8 L200,4 L200,48 L0,48 Z"
              className="fill-beige700/10"
            />
            <circle
              cx="200"
              cy="4"
              r="3.5"
              className={`fill-beige700 transition-opacity duration-500 ${
                sparkVisible ? "opacity-100" : "opacity-0"
              }`}
            />
          </svg>
        </div>
      </ReportItem>

      <ReportSection
        index={4}
        visibleCount={reportItemsVisible}
        label="잘 맞는 이유"
      >
        <em className="font-halant text-[17px] text-beige900">
          시니어 ML 엔지니어 — Inference Infra 팀.
        </em>{" "}
        Claude 서빙 스택 전체를 주도하는 핵심 조직이에요. H-1B·O-1 스폰서 이력이
        탄탄하고, 한국 출신 엔지니어도 이미 여럿. $250K+ 베이스 + 에쿼티 구간에
        정확히 맞습니다.
      </ReportSection>

      <ReportSection
        index={5}
        visibleCount={reportItemsVisible}
        label="최근 주요 채용"
      >
        <div className="flex flex-col">
          {[
            ["Head of Inference", "ex-OpenAI · 26.3"],
            ["Principal Research Engineer", "ex-Google DeepMind · 26.2"],
            ["Staff ML Engineer", "ex-Meta FAIR · 25.12"],
          ].map(([name, previous]) => (
            <div
              key={name}
              className="grid grid-cols-[1fr_auto] gap-3 border-b border-dashed border-beige900/10 py-1.5 last:border-b-0"
            >
              <span className="font-medium text-beige900">{name}</span>
              <span className="text-[13px] italic text-beige900/45">
                {previous}
              </span>
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection index={6} visibleCount={reportItemsVisible} label="시그널">
        지난 2월{" "}
        <em className="font-halant text-[17px] text-beige900">Series G $30B</em>{" "}
        클로즈 직후, 현재 최대{" "}
        <em className="font-halant text-[17px] text-beige900">
          $800B 밸류에이션 오퍼
        </em>
        까지 거론되는 상황. 인프라 조직에서 시니어 두 자리가 추가로 열렸고, 아직
        링크드인에 올라오지 않은 조용한 자리예요.
      </ReportSection>

      <ReportSection
        index={7}
        visibleCount={reportItemsVisible}
        label="다음 단계"
      >
        <em className="font-halant text-[17px] text-beige900">소개 수락 →</em>{" "}
        Harper가 프로필을 전달하고 첫 미팅을 세팅해드려요. 수락 전까지는
        Anthropic 쪽에서 Chris가 누구인지 알 수 없어요.
      </ReportSection>

      <ReportItem
        index={8}
        visibleCount={reportItemsVisible}
        className="mt-3 rounded-xl border border-dashed border-beige700/30 bg-beige700/10 p-3 text-[12px] text-beige900/75"
      >
        <div className="mb-2 font-medium text-beige900/60">
          Anthropic에서 가능한 다른 기회 →
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-beige700/20 bg-beige100 px-3 py-1">
            유료 어드바이저리 · 월 약 3시간
          </span>
          <span className="rounded-full border border-beige700/20 bg-beige100 px-3 py-1">
            전문가 콜 · $500부터
          </span>
        </div>
      </ReportItem>
    </div>
  );
}

function ReportSection({
  index,
  visibleCount,
  label,
  children,
}: {
  index: number;
  visibleCount: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <ReportItem
      index={index}
      visibleCount={visibleCount}
      className="grid grid-cols-1 gap-2 border-b border-beige900/10 py-3 text-[13px] leading-[1.65] text-beige900/80 md:grid-cols-[120px_1fr] md:gap-4 md:text-sm"
    >
      <div className="pt-0.5 text-[13px] text-beige900/45">{label}</div>
      <div>{children}</div>
    </ReportItem>
  );
}

type CursorState = {
  active: boolean;
  clicking: boolean;
  x: number;
  y: number;
  immediate: boolean;
  rippleKey: number;
};

function DemoSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const phoneBodyRef = useRef<HTMLDivElement | null>(null);
  const firstMatchRef = useRef<HTMLDivElement | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState<number[]>([]);
  const [activeTyping, setActiveTyping] = useState<number | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceDone, setVoiceDone] = useState(false);
  const [matchesActive, setMatchesActive] = useState(false);
  const [visibleMatchCount, setVisibleMatchCount] = useState(0);
  const [selectedMatch, setSelectedMatch] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportItemsVisible, setReportItemsVisible] = useState(0);
  const [cursor, setCursor] = useState<CursorState>({
    active: false,
    clicking: false,
    x: -40,
    y: -40,
    immediate: true,
    rippleKey: 0,
  });

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setHasStarted(true);
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasStarted) return;

    let cancelled = false;
    const timers: number[] = [];

    const schedule = (delay: number, callback: () => void) => {
      const timer = window.setTimeout(() => {
        if (!cancelled) callback();
      }, delay);
      timers.push(timer);
    };

    const showStep = (step: number) => {
      setVisibleSteps((current) =>
        current.includes(step) ? current : [...current, step]
      );
    };

    const showTyping = (step: number) => {
      setActiveTyping(step);
      schedule(900, () => setActiveTyping(null));
    };

    const resetSequence = () => {
      setVisibleSteps([]);
      setActiveTyping(null);
      setVoiceActive(false);
      setVoiceDone(false);
      setMatchesActive(false);
      setVisibleMatchCount(0);
      setSelectedMatch(false);
      setReportVisible(false);
      setReportItemsVisible(0);
      setCursor((current) => ({
        ...current,
        active: false,
        clicking: false,
        x: -40,
        y: -40,
        immediate: true,
      }));
      if (phoneBodyRef.current) phoneBodyRef.current.scrollTop = 0;
    };

    const moveCursorToPhoneStart = () => {
      const phone = phoneRef.current;
      if (!phone) return;
      setCursor((current) => ({
        ...current,
        active: true,
        clicking: false,
        x: phone.clientWidth * 0.78,
        y: phone.clientHeight * 0.88,
        immediate: true,
      }));
      schedule(40, () =>
        setCursor((current) => ({ ...current, immediate: false }))
      );
    };

    const moveCursorToFirstMatch = () => {
      const phone = phoneRef.current;
      const target = firstMatchRef.current;
      if (!phone || !target) return;
      const phoneRect = phone.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setCursor((current) => ({
        ...current,
        active: true,
        clicking: false,
        x: targetRect.left - phoneRect.left + targetRect.width * 0.58,
        y: targetRect.top - phoneRect.top + targetRect.height * 0.55,
        immediate: false,
      }));
    };

    const clickCursor = () => {
      moveCursorToFirstMatch();
      setCursor((current) => ({
        ...current,
        active: true,
        clicking: true,
        rippleKey: current.rippleKey + 1,
      }));
      schedule(220, () =>
        setCursor((current) => ({ ...current, clicking: false }))
      );
    };

    const buildReport = () => {
      setSelectedMatch(true);
      setReportVisible(true);
      Array.from({ length: REPORT_ITEM_COUNT }).forEach((_, index) => {
        schedule(180 + index * 160, () => setReportItemsVisible(index + 1));
      });
    };

    const run = () => {
      resetSequence();
      schedule(0, () => {
        setVoiceActive(true);
        schedule(1100, () => setVoiceDone(true));
      });
      schedule(1300, () => showStep(2));
      schedule(2800, () => showTyping(3));
      schedule(3800, () => showStep(4));
      schedule(4800, () => showStep(5));
      schedule(6800, () => showTyping(6));
      schedule(7800, () => showStep(7));
      schedule(9200, () => {
        setMatchesActive(true);
        matches.forEach((_, index) => {
          schedule(250 + index * 180, () => setVisibleMatchCount(index + 1));
        });
      });
      schedule(10100, () => showTyping(9));
      schedule(10700, () => showStep(10));
      schedule(11700, moveCursorToPhoneStart);
      schedule(12050, moveCursorToFirstMatch);
      schedule(12520, clickCursor);
      schedule(12600, buildReport);
      schedule(13300, () =>
        setCursor((current) => ({ ...current, active: false }))
      );
      schedule(13700, () => showTyping(11));
      schedule(14600, () => showStep(12));
      schedule(15700, () => showStep(13));
      schedule(21500, run);
    };

    run();

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [hasStarted]);

  useEffect(() => {
    const body = phoneBodyRef.current;
    if (!body) return;
    body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
  }, [
    activeTyping,
    matchesActive,
    reportVisible,
    visibleMatchCount,
    visibleSteps,
    voiceActive,
    voiceDone,
  ]);

  const visibleStepSet = useMemo(() => new Set(visibleSteps), [visibleSteps]);

  return (
    <section
      id="demo"
      ref={sectionRef}
      className="bg-linear-to-b from-beige100 to-beige50 px-4 py-16 text-center md:px-10 md:py-24"
    >
      <Reveal once>
        {/* <div className="text-[13px] font-medium text-beige700">
          채팅과 음성으로 작동하는 프라이빗 인터페이스
        </div> */}
        <h2 className="mx-auto mt-4 max-w-[820px] font-halant font-medium text-[26px] leading-[1.3] text-beige900 md:text-[2.4rem]">
          “이런 포지션 찾아줘”
          <br />
          <span className="text-beige700">가벼운 대화</span> 한 번이면
          충분합니다.
        </h2>
        <p className="mx-auto mt-4 max-w-[720px] text-[15px] leading-[1.75] text-beige900/80">
          링크드인이나 채용 사이트를 뒤지며 비자 스폰서가 가능한 스타트업을
          일일이 리서치할 필요가 없습니다.
          <br />
          원하는 조건을 가볍게 이야기해 두기만 하면 Harper가 모든 기회를 스캔해
          풀타임, 파트타임, 어드바이저리, 단기 자문까지 찾아 알려드립니다.
        </p>
      </Reveal>

      <div className="mx-auto mt-12 grid max-w-[1180px] grid-cols-1 items-start gap-10 lg:grid-cols-[460px_1fr]">
        <Reveal once direction="left" className="min-w-0">
          <div className="text-left">
            <div className="mb-2 text-[13px] font-medium text-beige900/50">
              Harper와의 대화
            </div>
            <div
              ref={phoneRef}
              className="relative flex h-[520px] flex-col rounded-[28px] border-2 border-beige500 bg-beige900 p-3.5 text-left shadow-2xl md:h-[820px] md:rounded-[36px]"
            >
              <div className="flex items-center gap-2.5 border-b border-beige100/10 px-2 pb-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-beige700 font-halant text-lg italic text-beige50">
                  H
                </div>
                <div>
                  <div className="text-[13px] font-medium text-beige50">
                    Harper · 내 agent
                  </div>
                  <div className="flex items-center gap-1.5 text-[13px] text-beige700">
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="h-1.5 w-1.5 rounded-full bg-beige700"
                    />
                    듣는 중
                  </div>
                </div>
              </div>

              <div
                ref={phoneBodyRef}
                className="no-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto px-1 py-3"
              >
                <VoiceBar active={voiceActive} done={voiceDone} />
                {chatMessages.slice(0, 1).map((message) => (
                  <MessageBubble
                    key={message.step}
                    role={message.role}
                    text={message.text}
                    visible={visibleStepSet.has(message.step)}
                  />
                ))}
                <TypingBubble active={activeTyping === 3} />
                {chatMessages.slice(1, 3).map((message) => (
                  <MessageBubble
                    key={message.step}
                    role={message.role}
                    text={message.text}
                    visible={visibleStepSet.has(message.step)}
                  />
                ))}
                <TypingBubble active={activeTyping === 6} />
                {chatMessages.slice(3, 4).map((message) => (
                  <MessageBubble
                    key={message.step}
                    role={message.role}
                    text={message.text}
                    visible={visibleStepSet.has(message.step)}
                  />
                ))}

                <div
                  className={`flex flex-col gap-1.5 rounded-2xl rounded-bl border border-beige100/10 bg-beige100/5 p-2.5 transition ${
                    matchesActive ? "opacity-100" : "hidden opacity-0"
                  }`}
                >
                  <div className="mb-0.5 text-[10px] font-medium text-beige700">
                    내 숏리스트 · Harper가 가져왔어요
                  </div>
                  {matches.map((match, index) => (
                    <ChatMatchCard
                      key={match.company}
                      match={match}
                      visible={visibleMatchCount > index}
                      selected={index === 0 && selectedMatch}
                      refCallback={
                        index === 0
                          ? (node) => {
                              firstMatchRef.current = node;
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>

                <TypingBubble active={activeTyping === 9} />
                {chatMessages.slice(4, 5).map((message) => (
                  <MessageBubble
                    key={message.step}
                    role={message.role}
                    text={message.text}
                    visible={visibleStepSet.has(message.step)}
                  />
                ))}
                <TypingBubble active={activeTyping === 11} />
                {chatMessages.slice(5).map((message) => (
                  <MessageBubble
                    key={message.step}
                    role={message.role}
                    text={message.text}
                    visible={visibleStepSet.has(message.step)}
                  />
                ))}
                <div
                  className={`flex max-w-[88%] items-center gap-2.5 rounded-[11px] rounded-bl border border-dashed border-beige700/30 bg-beige700/10 p-2.5 transition duration-300 ${
                    visibleStepSet.has(13)
                      ? "translate-y-0 opacity-100"
                      : "translate-y-2 opacity-0"
                  }`}
                >
                  <CompanyMark>☎</CompanyMark>
                  <div className="min-w-0 flex-1">
                    <div className="font-halant text-base leading-none text-beige50">
                      <span className="mr-1.5 inline-flex rounded-full bg-beige700/25 px-2 py-0.5 font-geist text-[10px] text-beige200">
                        전문가 콜
                      </span>
                      LLM 추론 인프라 자문
                    </div>
                    <div className="mt-1 truncate text-[10.5px] text-beige200/60">
                      Series C AI 스타트업 · 1시간 통화 · 이번 주 가능
                    </div>
                  </div>
                  <div className="text-[13px] font-medium text-beige700">
                    $500 / 1h
                  </div>
                </div>
              </div>

              <motion.div
                animate={{
                  opacity: cursor.active ? 1 : 0,
                  left: cursor.x,
                  top: cursor.y,
                  scale: cursor.clicking ? 0.82 : 1,
                }}
                transition={
                  cursor.immediate
                    ? { duration: 0 }
                    : { duration: 0.7, ease: [0.25, 0.8, 0.25, 1] }
                }
                className="pointer-events-none absolute z-10 h-7 w-[22px] -translate-x-1.5 -translate-y-1 drop-shadow-lg"
              >
                <svg viewBox="0 0 18 24" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M0 0 L0 20 L5.2 15 L8 22 L11 20.5 L8 13.5 L15 13.5 Z"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    className="text-beige50"
                  />
                </svg>
              </motion.div>
              <AnimatePresence>
                {cursor.rippleKey > 0 && cursor.clicking && (
                  <motion.div
                    key={cursor.rippleKey}
                    initial={{ opacity: 0.85, scale: 0.2 }}
                    animate={{ opacity: 0, scale: 2.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.65, ease: "easeOut" }}
                    className="pointer-events-none absolute z-9 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-beige700 bg-beige700/25"
                    style={{ left: cursor.x, top: cursor.y }}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
        </Reveal>

        <Reveal once direction="right" className="min-w-0">
          <div className="text-left lg:sticky lg:top-[96px]">
            <div
              className={`mb-2 text-[13px] font-medium text-beige900/50 transition ${
                reportVisible ? "opacity-100" : "opacity-60"
              }`}
            >
              나만의 기업 브리핑
            </div>
            <HarperReport
              reportVisible={reportVisible}
              reportItemsVisible={reportItemsVisible}
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function MessageBubble({
  role,
  text,
  visible,
}: {
  role: "user" | "ai";
  text: string;
  visible: boolean;
}) {
  const isUser = role === "user";

  return (
    <div
      className={`max-w-[86%] rounded-2xl px-[13px] py-2 text-[12.8px] leading-[1.45] transition duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      } ${
        isUser
          ? "ml-auto rounded-br bg-beige700 text-beige50"
          : "mr-auto rounded-bl bg-beige700/25 text-beige50"
      }`}
    >
      {text}
    </div>
  );
}

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
            "Cursor · 어드바이저리",
            "91% 적합",
            "추론 인프라 자문 · 월 약 10시간",
          ],
        ].map(([company, fit, body]) => (
          <div
            key={company}
            className="rounded-lg border border-beige900/10 bg-beige100 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-semibold text-beige900">
                {company}
              </span>
              <span className="font-halant text-[13px] italic text-beige700">
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
          className="flex items-start gap-2.5 rounded-xl border border-beige900/10 bg-beige100 px-3 py-2.5 shadow-[0_10px_24px_rgba(46,23,6,0.06)]"
        >
          <div
            aria-label="Gmail"
            className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-white bg-size-[24px_24px] bg-center bg-no-repeat shadow-[inset_0_0_0_1px_rgba(46,23,6,0.08)]"
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

export default function LandingKoVfPage() {
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
        className="min-h-screen overflow-x-clip break-keep bg-beige200 font-geist text-beige900 antialiased"
      >
        <AppBar />

        <main>
          <section className="flex flex-col items-center justify-center px-4 pb-14 pt-[112px] text-center md:px-10 md:pb-20 md:pt-[24vh]">
            <Reveal once delay={0.06}>
              <div className="text-[13px] font-medium text-beige900/50">
                탤런트만을 위해 설계된 AI 커리어 agent
              </div>
            </Reveal>
            <Reveal once delay={0.18} className="mt-6">
              <h1 className="mx-auto max-w-[980px] font-halant font-medium text-[34px] leading-[1.1] text-beige900 sm:text-[44px] md:text-[3rem]">
                <span className="block">나를 위한 완벽한 기회,</span>
                <span className="mt-1 block">
                  이제 <em className="text-beige700">Agent</em>가 찾아옵니다.
                </span>
              </h1>
            </Reveal>
            <Reveal once delay={0.32}>
              <p className="mx-auto mt-5 max-w-[620px] text-[15px] leading-[1.75] text-beige900/80 md:text-base">
                수많은 채용 공고와 무의미한 이직 제안 사이에서 시간을 낭비하지
                마세요.
                <br />
                당신의 기준과 야망을 이해하고, 가장 완벽한 기회만 선별해
                가져오는
                <br />
                나만의 전담 커리어 agent입니다.
              </p>
            </Reveal>
            <Reveal once delay={0.46} className="mt-8">
              <LandingButton href={CAREER_START_HREF} label="시작하기" />
              <div className="mt-4 flex flex-row gap-4 text-sm text-beige900/80">
                <div className="flex flex-row items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  <span>1시간 이내 첫 매칭</span>
                </div>
                <div className="flex flex-row items-center gap-2">
                  <Loader className="h-3.5 w-3.5" />
                  <span>Free</span>
                </div>
                <div className="flex flex-row items-center gap-2">
                  <Lock className="h-3.5 w-3.5" />
                  <span>익명 보장</span>
                </div>
              </div>
            </Reveal>
          </section>

          <SocialProofSection />

          <DemoSection />

          <section
            id="workflow"
            className="mx-auto max-w-[1240px] px-4 py-20 text-center md:px-10 md:py-32"
          >
            <Reveal once>
              <div className="mx-auto max-w-[860px]">
                <div className="text-[13px] font-medium text-beige700">
                  이렇게 작동합니다
                </div>
                <h2 className="mt-5 font-halant text-[28px] leading-[1.15] text-beige900 md:text-[44px]">
                  대화 한 번으로,{" "}
                  <em className="text-beige700">Founder에게 직접 소개</em>
                  까지.
                </h2>
                <p className="mx-auto mt-4 max-w-[680px] text-[15px] leading-[1.7] text-beige900/80">
                  채용 공고를 뒤지고, 지원하고, 또 기다리고. 반복되는 구직의
                  피로는 이제 끝. Harper가 하는 일은 딱 세 단계예요.
                </p>
              </div>
            </Reveal>

            <div className="mt-12 grid grid-cols-1 gap-5 text-left md:mt-16 lg:grid-cols-3">
              {workflowCards.map((card, index) => (
                <Reveal key={card.title} once delay={index * 0.08}>
                  <div className="flex h-full flex-col rounded-[22px] border border-beige900/10 bg-beige100/60 p-6 md:p-7">
                    <WorkflowVisual type={card.visual} />
                    <div className="mt-6 flex items-baseline gap-2.5">
                      <div className="font-halant text-xl italic leading-none text-beige700">
                        {card.number}
                      </div>
                      <h3 className="font-halant font-semibold text-[20px] leading-tight text-beige900">
                        {card.title}
                      </h3>
                    </div>
                    <p className="mt-3 text-sm leading-[1.7] text-beige900/80">
                      {card.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          <section className="mx-auto max-w-[1400px] border-t border-beige900/10 px-4 py-20 text-center md:px-10 md:py-32">
            <Reveal once>
              <div className="text-[13px] font-medium text-beige700">
                당신이 목표한 최고의 모습, 그곳을 향해 함께 뛰는 agent
              </div>
            </Reveal>
            <Reveal once delay={0.08}>
              <h2 className="mx-auto mt-7 font-halant text-[28px] leading-[1.18] text-beige900 md:text-[44px]">
                <span className="block">
                  최고의 선수들에겐 전담 agent가 있는데
                </span>
                <span className="mt-1 block">
                  <em className="text-beige700">나를 위한 agent</em>, 한 번쯤
                  상상해 보지 않으셨나요?
                </span>
                <span className="mt-1 block">그래서 저희가 만들었습니다.</span>
              </h2>
            </Reveal>
            <Reveal once delay={0.16}>
              <p className="mx-auto mt-10 max-w-[720px] text-[15px] leading-[1.85] text-beige900/80 md:text-[17px]">
                뛰어난 선수가 경기에만 집중하듯, 당신은 지금의 일과 성장에만
                집중하세요. 다음 무대를 찾고 조율하는 건 agent의 몫입니다.
                수수료를 위해 기업 편에 서는 리크루터와 달리, Harper는 철저히
                당신의 이익만을 대변합니다. 당신이 직접 허락하기 전까지 완벽한
                익명을 보장하며, 오직 당신이 설정한 까다로운 기준을 통과한
                기회들만 조용히 찾아옵니다.
              </p>
            </Reveal>
          </section>

          <section
            id="how"
            className="mx-auto max-w-[1200px] px-4 py-20 md:px-10 md:py-32"
          >
            <Reveal once>
              <div className="flex flex-col items-start gap-4 md:flex-row md:justify-between md:items-end">
                <h2 className="font-halant text-[28px] leading-[1.08] text-beige900 md:text-[44px]">
                  <em className="text-beige700">Harper</em>는,
                  <br />
                  이렇게 달라요.
                </h2>
                <p className="max-w-[460px] text-[15px] text-right leading-[1.75] text-beige900/80 md:text-base">
                  지금까지 받아오신 리크루터 연락, 채용 공고, LinkedIn DM과
                  Harper가 다른 네 가지 지점.
                </p>
              </div>
            </Reveal>

            <div className="mt-14 flex flex-col md:mt-20">
              {howRows.map((row, index) => (
                <Reveal key={row.number} once delay={index * 0.06}>
                  <div className="grid grid-cols-1 gap-3 border-t border-beige900/10 py-8 last:border-b md:grid-cols-[100px_1fr_1fr] md:gap-10 md:py-10">
                    <div className="font-halant text-[32px] italic leading-none text-beige700 md:text-5xl">
                      {row.number}
                    </div>
                    <h3 className="font-halant text-[22px] font-medium leading-[1.2] text-beige900 md:text-[30px]">
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
                <div className="text-[13px] font-medium text-beige700">
                  먼저 경험한 탤런트들의 이야기
                </div>
                <h2 className="mt-5 max-w-[860px] font-halant text-[28px] leading-[1.15] md:text-[44px]">
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
                      <div className="font-halant text-[21px] italic leading-[1.45]">
                        “{voice.quote}”
                      </div>
                      <div className="mt-7 flex items-center gap-3 border-t border-beige50/10 pt-5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-beige700 font-halant text-base italic text-beige50">
                          {voice.initial}
                        </div>
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
              <h2 className="mx-auto max-w-[1100px] font-halant text-[34px] leading-[1.08] text-beige900 md:text-[54px]">
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
              <LandingButton href={CAREER_START_HREF} label="지금 시작하기" />
            </Reveal>
            <Reveal once delay={0.22}>
              <div className="mt-5 text-[13px] text-beige900/45">
                로그인 후 바로 커리어 agent 설정을 시작합니다.
              </div>
            </Reveal>
          </section>
        </main>

        <footer className="border-t border-beige900/10 px-4 py-16 text-sm text-beige900/55 md:px-10">
          <div className="mx-auto flex max-w-[1160px] flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>© 2026 Harper — 오직 탤런트만을 위해 만들었습니다.</div>
            <div className="flex flex-wrap gap-5">
              <Link href="/" className="transition hover:text-beige900">
                채용 담당자이신가요? →
              </Link>
              <Link href="/privacy" className="transition hover:text-beige900">
                개인정보
              </Link>
              <Link href="/terms" className="transition hover:text-beige900">
                Linkedin
              </Link>
              <a
                href="mailto:hello@matchharper.com"
                className="transition hover:text-beige900"
              >
                문의
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
