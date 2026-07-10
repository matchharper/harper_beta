import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Lock, Phone } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import Reveal from "../Animation/Reveal";
import Image from "next/image";

const REPORT_ITEM_COUNT = 9;

const matches = [
  {
    company: "Anthropic",
    type: "풀타임",
    role: "시니어 ML 엔지니어 · SF + 리모트",
    fit: "소개 가능",
    mark: "A",
    iconSrc: "/company-icons/anthropic.png",
  },
  {
    company: "Perplexity",
    type: "풀타임",
    role: "AI 검색 인프라 · 샌프란시스코",
    fit: "비자 이력",
    mark: "P",
    iconSrc: "/company-icons/perplexity.png",
  },
  {
    company: "Cursor",
    type: "어드바이저리",
    role: "추론 인프라 어드바이저 · 월 약 10시간 · 리모트",
    fit: "리모트",
    mark: "C",
    iconSrc: "/company-icons/cursor.png",
  },
  {
    company: "Runway",
    type: "파트타임",
    role: "계약직 ML 엔지니어 · 주 약 20시간 · 리모트",
    fit: "단기",
    mark: "R",
    iconSrc: "/company-icons/runway.png",
  },
] as const;

const fundingBars = [
  { label: "초기", value: "검증", height: "16%", current: false },
  { label: "B/C", value: "성장", height: "32%", current: false },
  { label: "전략", value: "파트너", height: "54%", current: false },
  { label: "후기", value: "대규모", height: "74%", current: false },
  { label: "현재", value: "확장", height: "100%", current: true },
] as const;

const chatMessages = [
  {
    step: 2,
    role: "user",
    text: "미국 쪽 AI 스타트업도 볼 수 있을까요? 샌프란이나 뉴욕, 비자 스폰서 이력 있고 Series C 이상이면 좋겠습니다. 총 보상은 대략 $250K 이상이면 보고 싶어요.",
  },
  {
    step: 4,
    role: "ai",
    text: "가능합니다. 지역, 비자, 단계, 보상 기준으로 먼저 추려볼게요. 팀은 빠르게 커지는 곳이 좋으세요, 아니면 이미 안정적인 곳이 좋으세요?",
  },
  {
    step: 5,
    role: "user",
    text: "이미 제품이 있고 팀도 어느 정도 큰 곳이면 좋겠어요. 리모트가 섞여 있으면 더 좋고요.",
  },
  {
    step: 7,
    role: "ai",
    text: "조건에 맞는 풀타임 2곳을 먼저 골랐습니다. 비자가 필요 없는 자문/계약 기회도 2건 같이 두었습니다.",
  },
  {
    step: 10,
    role: "ai",
    text: "Anthropic은 바로 소개 요청이 가능합니다. 브리핑을 먼저 열어볼까요?",
  },
  {
    step: 12,
    role: "ai",
    text: "추가로 1시간 자문 건이 하나 있습니다. 본업에 영향 없는 범위라 관심 있으면 따로 남겨둘게요.",
  },
] as const;

const finalDemoSteps = [...chatMessages.map((message) => message.step), 13];

const demoItemVisibleClassName = "translate-y-0 opacity-100";
const demoItemHiddenClassName = "translate-y-3 opacity-0";
const demoChatTextClassName = "text-xs md:text-[13px] leading-normal";
const demoIconButtonClassName =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full sm:h-8 sm:w-8";

const mobileDemoMessages = [
  {
    role: "user",
    text: "미국 AI 스타트업 중 비자 스폰서 있고 Series C 이상인 곳 볼 수 있을까요?",
  },
  {
    role: "ai",
    text: "가능합니다. 비자, 보상, 위치 기준으로 먼저 추려볼게요.",
  },
  {
    role: "user",
    text: "이미 제품이 있고 리모트가 섞여 있으면 더 좋고요.",
  },
] as const;

type CursorState = {
  active: boolean;
  clicking: boolean;
  x: number;
  y: number;
  immediate: boolean;
  rippleKey: number;
};

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
      className={`relative h-[520px] overflow-hidden rounded-2xl bg-[#FFFCF6] p-5 text-left transition duration-700 md:h-[820px] md:p-[28px] ${
        reportVisible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-b from-[#FFFCF6]/0 to-[#FFFCF6]" />

      <ReportItem index={0} visibleCount={reportItemsVisible}>
        <div className="flex items-start justify-between gap-4 pb-4">
          <div className="flex items-center gap-3.5">
            <CompanyMark
              size="lg"
              iconSrc={matches[0].iconSrc}
              label={matches[0].company}
            >
              A
            </CompanyMark>
            <div>
              <div className="mt-1 text-[22px] font-semibold leading-[1.15] text-[#21170D] md:text-2xl">
                Anthropic<span> - Harper Report</span>
              </div>
              <div className="mt-1 text-[13px] leading-snug text-[#6B5A49]">
                후기 단계 AI 연구 기업 · 샌프란시스코 · 비자 스폰서 이력 확인
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="border-b border-[#5E746C]/30 px-0.5 pb-0.5 text-[10.5px] font-semibold text-[#41564F]">
              샘플 브리핑
            </span>
            <span className="text-[12px] text-[#7E715F]">검토 4분</span>
          </div>
        </div>
      </ReportItem>

      <ReportItem
        index={1}
        visibleCount={reportItemsVisible}
        className="grid grid-cols-2 border-b border-[#21170D]/10 py-4 md:grid-cols-4"
      >
        {[
          ["$30B", "최근 라운드 (2026.2)", ""],
          ["확인", "비자 이력", "H-1B/O-1"],
          ["$250K+", "보상 기준", "base + equity"],
          ["혼합", "근무 방식", "SF + remote"],
        ].map(([value, label, detail], index) => (
          <div
            key={label}
            className={`px-3 py-1 ${
              index > 0 ? "border-l border-[#21170D]/10" : ""
            }`}
          >
            <div className="text-[21px] font-semibold leading-none text-[#21170D]">
              {value}
            </div>
            <div className="mt-1.5 text-[11px] font-medium leading-snug text-[#6B5A49]">
              {label}
            </div>
            <div className="mt-0.5 text-[10px] leading-snug text-[#958775]">
              {detail}
            </div>
          </div>
        ))}
      </ReportItem>

      <ReportItem
        index={2}
        visibleCount={reportItemsVisible}
        className="border-b border-[#21170D]/10 py-4"
      >
        <div className="mb-3 flex items-baseline justify-between gap-3 text-[13px] text-[#6B5A49]">
          <span className="font-medium text-[#21170D]">성장 단계</span>
          <span className="text-[12px] text-[#7E715F]">
            공개 자료와 네트워크 신호를 분리해 확인
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
                    bar.current ? "bg-[#5E746C]" : "bg-[#DED2C2]"
                  } transition-transform duration-1000`}
                  style={{
                    height: bar.height,
                    transform: chartVisible ? "scaleY(1)" : "scaleY(0)",
                  }}
                />
              </div>
              <div className="text-center text-[9.5px] leading-tight text-[#7E715F]">
                {bar.label}
                <br />
                <b className="font-medium text-[#21170D]">{bar.value}</b>
              </div>
            </div>
          ))}
        </div>
      </ReportItem>

      <ReportItem
        index={3}
        visibleCount={reportItemsVisible}
        className="border-b border-[#21170D]/10 py-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[21px] font-semibold leading-none text-[#21170D]">
              2.1x
            </div>
            <div className="mt-1.5 text-[12px] text-[#7E715F]">
              1년 내 헤드카운트 변화
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
              className="text-[#5E746C] transition-[stroke-dashoffset] duration-1000"
              style={{
                strokeDasharray: 400,
                strokeDashoffset: sparkVisible ? 0 : 400,
              }}
            />
            <path
              d="M0,42 L22,40 L44,37 L66,33 L88,28 L110,24 L132,18 L154,13 L176,8 L200,4 L200,48 L0,48 Z"
              className="fill-[#5E746C]/10"
            />
            <circle
              cx="200"
              cy="4"
              r="3.5"
              className={`fill-[#5E746C] transition-opacity duration-500 ${
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
        <span className="font-semibold text-[#21170D]">
          Inference Infra 쪽 시니어 역할.
        </span>{" "}
        대규모 모델 서빙 경험이 바로 이어지고, 보상 범위와 비자 조건도 요청한
        기준 안에 들어옵니다.
      </ReportSection>

      <ReportSection
        index={5}
        visibleCount={reportItemsVisible}
        label="확인할 점"
      >
        <div className="flex flex-col">
          {[
            ["온사이트 비중", "팀별로 다를 수 있음"],
            ["비자 타임라인", "소개 전 재확인"],
            ["팀 배치", "Inference / Product Infra 후보"],
          ].map(([name, note]) => (
            <div
              key={name}
              className="grid grid-cols-[1fr_auto] gap-3 border-b border-dashed border-[#21170D]/10 py-1.5 last:border-b-0"
            >
              <span className="font-medium text-[#21170D]">{name}</span>
              <span className="text-[13px] text-[#7E715F]">{note}</span>
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection index={6} visibleCount={reportItemsVisible} label="시그널">
        인프라와 제품화 조직 채용이 이어지고 있습니다. 일부 포지션은 공개
        공고보다 소개 경로가 빠르기 때문에, 관심 있으면 먼저 프로필 요약만
        전달하는 편이 좋습니다.
      </ReportSection>

      <ReportSection
        index={7}
        visibleCount={reportItemsVisible}
        label="다음 단계"
      >
        브리핑을 저장하고 소개 요청 여부만 고르면 됩니다. 수락 전까지는
        Anthropic 쪽에 이름이나 상세 프로필을 전달하지 않습니다.
      </ReportSection>

      <ReportItem
        index={8}
        visibleCount={reportItemsVisible}
        className="mt-3 border-l-2 border-[#5E746C] bg-[#EEF4F0] p-3 text-[12px] text-[#4E5E57]"
      >
        <div className="mb-2 font-semibold text-[#40524B]">
          같이 볼 만한 기회
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="border-b border-[#5E746C]/25 px-0.5 py-1">
            유료 자문 · 월 3시간 내외
          </span>
          <span className="border-b border-[#5E746C]/25 px-0.5 py-1">
            전문가 콜 · 1시간
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
      className="grid grid-cols-1 gap-2 border-b border-[#21170D]/10 py-3 text-[13px] leading-[1.65] text-[#4F4337] md:grid-cols-[112px_1fr] md:gap-4 md:text-sm"
    >
      <div className="pt-0.5 text-[12px] font-semibold text-[#7E715F]">
        {label}
      </div>
      <div>{children}</div>
    </ReportItem>
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
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition duration-300",
        visible ? demoItemVisibleClassName : "-translate-x-2 opacity-0",
        selected
          ? "border-beige900/25 bg-white"
          : "border-beige900/10 bg-white/65"
      )}
    >
      <CompanyMark iconSrc={match.iconSrc} label={match.company}>
        {match.mark}
      </CompanyMark>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded-full bg-beige900/8 px-1.5 py-0.5 text-[10px] md:text-xs font-medium leading-none text-beige900/65">
            {match.type}
          </span>
          <span className="truncate text-xs font-semibold leading-5 text-beige900">
            {match.company}
          </span>
        </div>
        <div className="mt-0.5 truncate text-xs leading-4 text-beige900/50">
          {match.role}
        </div>
      </div>
      <div className="hidden shrink-0 text-xs font-semibold text-beige700 sm:block">
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

  if (!isUser) {
    return (
      <div
        className={cn(
          "mr-auto mb-2 flex max-w-[92%] items-start gap-2 transition duration-300 md:max-w-[88%]",
          visible ? demoItemVisibleClassName : demoItemHiddenClassName
        )}
      >
        <Image
          src="/svgs/harper-h-mark.svg"
          alt="Harper"
          width={18}
          height={18}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <p
          className={cn(
            demoChatTextClassName,
            "whitespace-pre-wrap font-medium text-beige900"
          )}
        >
          {text}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "ml-auto mb-1 max-w-[91%] rounded-xl bg-beige900 px-3 py-2 text-white transition duration-300 md:max-w-[86%]",
        demoChatTextClassName,
        visible ? demoItemVisibleClassName : demoItemHiddenClassName
      )}
    >
      {text}
    </div>
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
          className="flex w-fit items-center gap-1 rounded-lg bg-white/65 px-3 py-2 text-beige900/45"
        >
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                delay: index * 0.14,
              }}
              className="h-1 w-1 rounded-full bg-beige900/45"
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
      className="ml-auto flex w-fit items-center gap-2 rounded-xl rounded-br-sm bg-beige900 px-3 py-2 text-beige100"
    >
      <div className="flex items-center gap-[3px]">
        {[10, 18, 12, 20, 8, 16].map((height, index) => (
          <motion.span
            key={`${height}-${index}`}
            animate={done ? { scaleY: 0.72 } : { scaleY: [0.6, 1, 0.6] }}
            transition={{
              duration: 0.9,
              repeat: done ? 0 : Infinity,
              delay: index * 0.1,
              ease: "easeInOut",
            }}
            className="w-[2px] origin-center rounded-full bg-beige100/75"
            style={{ height }}
          />
        ))}
      </div>
      <span className="text-xs font-medium">음성 메모 · 1:28</span>
    </motion.div>
  );
}

function CompanyMark({
  children,
  size = "sm",
  iconSrc,
  label,
}: {
  children: React.ReactNode;
  size?: "sm" | "lg";
  iconSrc?: string;
  label?: string;
}) {
  if (iconSrc) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg border border-beige900/10 bg-white",
          size === "lg" ? "h-12 w-12" : "h-7 w-7"
        )}
      >
        <Image
          src={iconSrc}
          alt={label ?? ""}
          width={size === "lg" ? 32 : 20}
          height={size === "lg" ? 32 : 20}
          className={cn(
            "object-contain",
            size === "lg" ? "h-8 w-8" : "h-4 w-4"
          )}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border border-beige900/10 bg-beige900 font-semibold text-beige50",
        size === "lg" ? "h-12 w-12 text-xl" : "h-7 w-7 text-xs"
      )}
    >
      {children}
    </div>
  );
}

function MobileDemoConversation({ visible }: { visible: boolean }) {
  const visibleClassName = visible
    ? demoItemVisibleClassName
    : demoItemHiddenClassName;

  return (
    <>
      <VoiceBar active={visible} done={visible} />

      {mobileDemoMessages.map((message) => (
        <MessageBubble
          key={message.text}
          role={message.role}
          text={message.text}
          visible={visible}
        />
      ))}

      <div
        className={cn(
          "flex flex-col gap-1.5 rounded-xl border border-beige900/10 bg-white/55 px-2.5 py-2 transition duration-300",
          visibleClassName
        )}
      >
        <div className="flex items-center justify-between text-xs font-medium leading-none text-beige900/50">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-beige700" />
            검색 완료
          </span>
          <span>2개 추천</span>
        </div>
        {matches.slice(0, 2).map((match, index) => (
          <ChatMatchCard
            key={match.company}
            match={match}
            visible={visible}
            selected={index === 0}
          />
        ))}
      </div>

      <MessageBubble
        role="ai"
        text="Anthropic은 바로 소개 요청이 가능합니다. 원하시면 브리핑을 먼저 열어볼게요."
        visible={visible}
      />
    </>
  );
}

type DemoSectionProps = {
  disableInteractions?: boolean;
  header: React.ReactNode;
};

function DemoSection({
  disableInteractions = false,
  header,
}: DemoSectionProps) {
  const isMobile = useIsMobile();
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
  const [freezeFinalDemo, setFreezeFinalDemo] = useState(false);
  const [cursor, setCursor] = useState<CursorState>({
    active: false,
    clicking: false,
    x: -40,
    y: -40,
    immediate: true,
    rippleKey: 0,
  });

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const shouldFreezeFinal =
      searchParams.get("demo") === "final" ||
      searchParams.get("demoState") === "final";

    if (shouldFreezeFinal) {
      const frame = window.requestAnimationFrame(() => {
        setFreezeFinalDemo(true);
        setHasStarted(true);
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    if (freezeFinalDemo) return;

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
  }, [freezeFinalDemo]);

  useEffect(() => {
    if (!hasStarted) return;

    if (freezeFinalDemo) {
      const frame = window.requestAnimationFrame(() => {
        setVisibleSteps(finalDemoSteps);
        setActiveTyping(null);
        setVoiceActive(true);
        setVoiceDone(true);
        setMatchesActive(true);
        setVisibleMatchCount(matches.length);
        setSelectedMatch(true);
        setReportVisible(!isMobile);
        setReportItemsVisible(REPORT_ITEM_COUNT);
        setCursor((current) => ({
          ...current,
          active: false,
          clicking: false,
          x: -40,
          y: -40,
          immediate: true,
        }));

        if (phoneBodyRef.current) {
          phoneBodyRef.current.scrollTop = isMobile
            ? 0
            : phoneBodyRef.current.scrollHeight;
        }
      });

      return () => window.cancelAnimationFrame(frame);
    }

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
      if (isMobile) return;
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
  }, [freezeFinalDemo, hasStarted, isMobile]);

  useEffect(() => {
    const body = phoneBodyRef.current;
    if (!body) return;

    if (freezeFinalDemo && isMobile) {
      body.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
  }, [
    activeTyping,
    freezeFinalDemo,
    isMobile,
    matchesActive,
    reportVisible,
    visibleMatchCount,
    visibleSteps,
    voiceActive,
    voiceDone,
  ]);

  const visibleStepSet = useMemo(() => new Set(visibleSteps), [visibleSteps]);
  const blockPreviewInteraction = (
    event: React.SyntheticEvent<HTMLElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const blockPreviewKeyboardInteraction = (
    event: React.KeyboardEvent<HTMLElement>
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
  };
  const interactionGuardProps = disableInteractions
    ? {
        onClickCapture: blockPreviewInteraction,
        onDoubleClickCapture: blockPreviewInteraction,
        onSubmitCapture: blockPreviewInteraction,
        onKeyDownCapture: blockPreviewKeyboardInteraction,
      }
    : {};

  return (
    <section
      {...interactionGuardProps}
      id="demo"
      ref={sectionRef}
      className="bg-[#F4EFE7] px-4 py-14 text-center md:px-10 md:py-24"
    >
      {header}

      <Reveal once className="mx-auto mt-8 max-w-[1180px] md:mt-12">
        <div className="relative mx-auto lg:h-[820px]">
          <div
            className={cn(
              "relative z-20 mx-auto w-full max-w-md text-left transition-[left,transform] duration-700 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
              "sm:max-w-md md:max-w-md lg:absolute lg:top-0 lg:mx-0 lg:w-[400px] lg:max-w-none xl:w-[440px]",
              reportVisible
                ? "lg:left-0 lg:translate-x-0"
                : "lg:left-1/2 lg:-translate-x-1/2"
            )}
          >
            <div className="relative aspect-[434/842] w-full">
              <div
                ref={phoneRef}
                data-demo-phone
                className="absolute inset-x-[5%] bottom-[1%] top-[1%] z-10 flex flex-col overflow-hidden rounded-[2rem] bg-[#14100c] p-1.5 text-left text-xs sm:p-2"
              >
                <div className="flex items-center justify-between gap-3 rounded-t-3xl border-b border-beige900/10 bg-beige50 px-3 pb-2 pt-12 text-beige900 md:pt-14">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-beige500/70 md:h-9 md:w-9">
                      <Image
                        src="/svgs/harper-h-mark.svg"
                        alt="Harper"
                        width={23}
                        height={23}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold leading-5 text-beige900">
                        Harper
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs leading-none text-beige900/45">
                        <Lock className="h-3 w-3" strokeWidth={1.8} />
                        비공개 대화
                      </div>
                    </div>
                  </div>
                  <div className="rounded-full bg-beige900/6 px-2 py-1 text-xs font-medium leading-none text-beige900/55">
                    Career
                  </div>
                </div>

                <div
                  ref={phoneBodyRef}
                  className={cn(
                    "no-scrollbar flex flex-1 flex-col bg-beige100 px-3 py-3",
                    isMobile
                      ? "gap-2 overflow-hidden"
                      : "gap-2 overflow-y-auto md:gap-3"
                  )}
                >
                  {isMobile ? (
                    <MobileDemoConversation
                      visible={hasStarted || freezeFinalDemo}
                    />
                  ) : (
                    <>
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
                        className={cn(
                          "flex flex-col gap-2 rounded-xl border border-beige900/10 bg-white/45 px-2.5 py-2.5 transition",
                          matchesActive ? "opacity-100" : "hidden opacity-0"
                        )}
                      >
                        <div className="flex items-center justify-between text-xs font-medium leading-none text-beige900/50">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-beige700" />
                            검색 완료
                          </span>
                          <span>4개 추천</span>
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
                        className={cn(
                          "flex max-w-[92%] items-center gap-2.5 rounded-xl border border-beige900/10 bg-white/70 p-2.5 transition duration-300 md:max-w-[88%]",
                          visibleStepSet.has(13)
                            ? demoItemVisibleClassName
                            : "translate-y-2 opacity-0"
                        )}
                      >
                        <CompanyMark>C</CompanyMark>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold leading-5 text-beige900">
                            <span className="mr-1 inline-flex rounded-full bg-beige700/10 px-1.5 py-0.5 text-xs font-medium leading-none text-beige700">
                              전문가 콜
                            </span>
                            LLM 추론 인프라 자문
                          </div>
                          <div className="mt-0.5 truncate text-xs leading-4 text-beige900/50">
                            Series C AI 스타트업 · 1시간 · 이번 주 가능
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-beige700">
                          $500
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="rounded-b-3xl border-t border-beige900/10 bg-beige50 px-3 pb-4 pt-2 sm:pb-6">
                  <div className="rounded-2xl border border-beige900/20 bg-white">
                    <div className="flex min-h-11 items-center gap-1.5 px-3 py-2 sm:gap-2">
                      <div className="min-w-0 flex-1 truncate whitespace-nowrap text-xs leading-5 text-beige900/35">
                        <span className="sm:hidden">답변 입력</span>
                        <span className="hidden sm:inline">
                          새로운 조건이나 궁금한 점을 남겨주세요
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label="통화 모드"
                        className={cn(
                          demoIconButtonClassName,
                          "border border-black/15 bg-white/45 text-beige900"
                        )}
                      >
                        <Phone className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="메시지 보내기"
                        className={cn(
                          demoIconButtonClassName,
                          "border border-beige900 bg-beige900 text-beige50"
                        )}
                      >
                        <ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>
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
                      className="text-beige900"
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
                      className="pointer-events-none absolute z-[9] h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-beige900 bg-beige900/10"
                      style={{ left: cursor.x, top: cursor.y }}
                    />
                  )}
                </AnimatePresence>
              </div>
              <Image
                src="/svgs/phone.svg"
                alt=""
                fill
                aria-hidden="true"
                sizes="(min-width: 1280px) 400px, (min-width: 1024px) 380px, (min-width: 768px) 390px, 350px"
                className="pointer-events-none absolute inset-0 z-20 h-full w-full select-none object-contain mix-blend-multiply"
              />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {reportVisible && (
              <motion.div
                key="company-briefing"
                initial={{ opacity: 0, x: 92, y: 22, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 80, y: 16, scale: 0.98 }}
                transition={{ duration: 0.82, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-10 mx-auto mt-[-54px] hidden w-full max-w-[720px] text-left md:mt-[-72px] lg:absolute lg:right-0 lg:top-0 lg:mt-0 lg:block lg:w-[calc(100%-440px)] lg:max-w-none xl:w-[700px]"
              >
                <div className="mb-2 text-left text-[13px] font-medium text-[#6B5A49] lg:text-right">
                  기업 조사 및 브리핑
                </div>
                <HarperReport
                  reportVisible={reportVisible}
                  reportItemsVisible={reportItemsVisible}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Reveal>
    </section>
  );
}
export default React.memo(DemoSection);
