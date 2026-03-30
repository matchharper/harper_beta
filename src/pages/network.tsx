import Reveal from "@/components/landing/Animation/Reveal";
import StaggerText from "@/components/landing/Animation/StaggerText";
import { showToast } from "@/components/toast/toast";
import { useCountryLang } from "@/hooks/useCountryLang";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  TALENT_NETWORK_LAST_VISIT_AT_KEY,
  TALENT_NETWORK_LOCAL_ID_KEY,
  TALENT_NETWORK_LOG_ABTEST_TYPE,
  createTalentNetworkLocalId,
} from "@/lib/talentNetwork";
import { supabase } from "@/lib/supabase";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Onboarding2Content } from "./onboarding2";

type CompanyRequest = {
  id: string;
  title: string;
  role: string;
  company: string;
  summary: string;
  intro: string;
  about: string;
  requirements?: string;
  engagement?: string;
  compensation: string;
  whoThisIsFor?: string[];
};

const companyRequests: CompanyRequest[] = [
  {
    id: "cto",
    title: "Chief Technology Officer",
    role: "Chief Technology Officer",
    company: "Global AI Unicorn (Series B)",
    summary: "Full-Time",
    intro:
      "Harper is exclusively partnered with a <i>Global AI Unicorn (Series B)</i> expanding into Korea.",
    about:
      "We are looking for an entrepreneurial engineering leader to build and scale the Korean technical team from 0 to 1. You will define the technical roadmap, set a high-performance culture, and work directly with global headquarters to localize AI solutions.",
    requirements:
      "Deep expertise in AI/ML stacks, large-scale systems, and proven leadership in high-growth environments.",
    engagement: "Full-time",
    compensation: "Worldwide competitive salary + Equity",
  },
  {
    id: "fde",
    title: "Forward Deployed Engineer (FDE)",
    role: "Forward Deployed Engineer",
    company: "Global AI Unicorn (Series B)",
    summary: "Full-Time",
    intro: "Harper is partnered with a <i>Global AI Unicorn (Series B)</i>.",
    about:
      "As an FDE, you are the bridge between cutting-edge AI models and real-world business problems. You will work directly with enterprise clients to architect, deploy, and optimize AI agents and solutions on the front lines.",
    requirements:
      "Strong coding skills in Python, experience with LLM integration, and a knack for solving complex client-facing technical challenges.",
    engagement: "Full-time",
    compensation: "Worldwide competitive salary + Equity",
  },
  {
    id: "deployment-strategist",
    title: "Deployment Strategist",
    role: "Deployment Strategist",
    company: "Confidential AI Unicorn (Series B)",
    summary: "Full-Time",
    intro:
      "Harper is partnered with a <i>Confidential Global AI Unicorn (Series B)</i>.",
    about:
      "You will own the business impact of AI deployments. Working alongside FDEs, you will design the rollout strategy, manage enterprise stakeholders, and ensure our AI solutions deliver measurable ROI for clients.",
    requirements:
      "Exceptional strategic thinking, background in tech consulting, PM, or operational leadership, and strong business acumen.",
    engagement: "Full-time",
    compensation: "Worldwide competitive salary + Equity",
  },
  {
    id: "aiml-engineer-researcher",
    title: "AI/ML Engineer & Researcher",
    role: "AI/ML Engineer (Model Training/Inference & Agents)",
    company: "Multiple Elite Teams (Stealth to Unicorns)",
    summary: "Flexible",
    intro:
      "Harper is sourcing for multiple <i>Elite AI/ML Teams (from stealth startups to unicorns)</i>.",
    about:
      "We have immediate matching opportunities for engineers building the next generation of autonomous agents, machine learning pipeline and foundation models.",
    requirements:
      "Hands-on experience with model training, inference optimization, or building agentic workflows.",
    engagement:
      "Highly Flexible.<br />Full-time OR Fractional/Part-time (4~12 hours/week) available.<br />현업을 유지하며 임팩트 있는 프로젝트에만 참여하는 것도 가능합니다.",
    compensation: "Top 1% Industry Compensation",
  },
  {
    id: "ethernet-firmware-engineer",
    title: "Ethernet Firmware Engineer",
    role: "Ethernet Firmware Engineer",
    company: "Confidential AI Semiconductor Unicorn",
    summary: "Full-Time",
    intro:
      "Harper is exclusively partnered with Korea's <i>#1 AI Semiconductor Unicorn</i>.",
    about:
      "You will own the evaluation and development of the Ethernet control subsystem firmware for next-generation NPUs. Your work in optimizing RoCE (RDMA) functionality and Layer 2/3 protocols will directly dictate the interconnect performance of our AI accelerators.",
    requirements:
      "Minimum 5 years in next-generation Ethernet firmware development.<br />Deep expertise in L2/L3 protocols, TCP/IP, and silicon validation.",
    engagement: "Full-time",
    compensation: "Top 1% Industry Compensation + Equity",
  },
  {
    id: "communication-library-engineer",
    title: "Communication Library Engineer",
    role: "Collective Communication Library Engineer",
    company: "Confidential AI Semiconductor Unicorn",
    summary: "Full-Time",
    intro:
      "Harper is exclusively partnered with Korea's <i>#1 AI Semiconductor Unicorn</i>.",
    about:
      "You will design and implement the core components of a completely new collective communication library tailored for unique NPU architectures. Your mission is to push the physical limits of hardware by optimizing algorithms (All-Reduce, All-Gather) across complex Network-on-Chip (NoC) topologies.",
    requirements:
      "Master's or Ph.D. in CS/HPC.<br />5+ years in high-performance systems software (C/C++).<br />Deep understanding of parallel runtimes (NCCL, MPI) and RDMA/RoCE.",
    engagement: "Full-time",
    compensation: "Top 1% Industry Compensation + Equity",
  },
  {
    id: "engineer-ai-native",
    title: "Engineer (AI-native)",
    role: "Engineer (AI-native)",
    company: "10+ Elite Teams",
    summary: "Full-time or Part-time",
    intro:
      "Harper is partnered with 10+ <i>Elite Startups (from stealth to unicorn startups)</i>.",
    about:
      "We are looking for engineers who deeply leverage AI tools to build faster.<br/>If you want to join a tech startup where your technical skills can truly be put to use, regardless of your main tech stack, apply here.",
    requirements:
      "Hands-on experience using LLMs or AI tools in real workflows (coding, automation, product features), along with strong engineering fundamentals and a strong builder mindset.",
    engagement:
      "Highly Flexible.<br />Full-time OR Fractional/Part-time (4~12 hours/week) available.<br />현업을 유지하며 임팩트 있는 프로젝트에만 참여하는 것도 가능합니다.",
    compensation: "Top 1% Industry Compensation + Equity",
  },
  {
    id: "robotics-hw-engineer",
    title: "Robotics & H/W Engineer",
    role: "Robotics & H/W Engineer",
    company: "Multiple Global Teams",
    summary: "Flexible",
    intro:
      "Harper is sourcing for a select group of <i>teams building intelligent systems in the physical world from</i> robotics to AI-integrated hardware.",
    about:
      "You will work at the intersection of AI and the real world, building systems that perceive, decide, and act. This includes integrating models with sensors, control systems, and hardware to create real-world intelligence.",
    engagement:
      "Highly Flexible.<br />Full-time OR Fractional/Part-time (4~12 hours/week) available.<br />현업을 유지하며 임팩트 있는 프로젝트에만 참여하는 것도 가능합니다.",
    compensation: "Top 1% Industry Compensation",
    whoThisIsFor: [
      "Engineers who want to move beyond screens and build real-world systems",
      "People interested in autonomy, robotics, or embodied AI",
      "Builders who enjoy working across software and hardware boundaries",
    ],
  },
];

const faqs = [
  {
    question: "등록해도 연락을 받는건 소수인가요?",
    answer:
      "뛰어난 스포츠 선수에게는 전담 에이전트가 있는 것처럼, Harper는 AI/ML 인재분들을 위한 AI-native 에이전트입니다. <br/><br/>만약 선호하거나 원하시는 기회가 있으시다면 알려주세요. 그럼 Harper가 최대한 선호하실만한 기회를 적극적으로 찾고, 회사와 연결된 뒤 기회를 얻으실 수 있게 도와드립니다.",
    // "Harper는 인재 분들을 위한 AI native 헤드헌터입니다. 만약 선호하거나 원하시는 기회가 있으시다면 알려주세요. 그럼 Harper가 최대한 선호하실만한 기회를 적극적으로 찾고, 회사와 연결된 뒤 기회를 얻으실 수 있게 도와드립니다.",
  },
  {
    question: "일반적인 채용공고나 헤드헌터와 어떻게 다른가요?",
    answer: `<div><span class='font-semibold text-beige900 font-inter'>Focused Expertise:</span> 저희는 오직 AI/ML 분야에만 집중합니다. 모델 트레이닝, LLM 인프라, NPU 설계 등 기술적 난도가 높은 직무의 맥락을 정확히 이해하고, 정확한 기회만 연결합니다.</div>
<div class="mt-2"><span class='font-semibold text-beige900 font-inter'>Exclusive Partnership:</span> 모든 회사의 공고를 제안하지 않습니다. 실리콘밸리 Tier 1 VC의 투자를 받았거나 기술적 파괴력이 입증된 소수의 팀들과만 긴밀하게 협업하며, 시장에 공개되지 않은 핵심 포지션(Stealth Roles)을 우선적으로 매칭합니다.</div>
<div class="mt-2"><span class='font-semibold text-beige900 font-inter'>Streamlined Process:</span> 불필요한 단계를 생략합니다. Harper의 추천은 파트너사의 창업자 또는 기술 리드에게 직접 전달되어, 가장 효율적이고 전문적인 논의가 이루어질 수 있도록 지원합니다.</div>
<div class="mt-2"><span class='font-semibold text-beige900 font-inter'>Engagement Flexibility:</span> 정규직 합류뿐만 아니라, 현업을 유지하며 주당 4~12시간 내외로 핵심 프로젝트에 기여하는 'Fractional(파트타임)' 형태의 협업 기회도 Harper 네트워크 안에서 활발하게 연결됩니다.</div>
`,
  },
  {
    question: "당장 이직 생각이 없어도 등록해둘 수 있을까요?",
    answer: `네. 하퍼는 정규직 채용 외에도 <span class='font-semibold text-beige900 font-inter'>파트타임, 프리랜싱, 자문</span> 등 지원자님에게 도움이 될 수 있는 다양한 형태의 기회를 함께 연결합니다.<br />
또한 <span class='font-semibold text-beige900 font-inter'>Passive</span>한 상태임을 알려주시면 모호한 기회들은 건너뛰고, 알려주신 내용들을 바탕으로 명확하게 선호하실만한 기회의 경우에만 연락드립니다.<br /><br />
하퍼는 <span class='font-semibold text-beige900 font-inter'>해외의 유니콘 스타트업</span>부터 <span class='font-semibold text-beige900 font-inter'>국내의 소수 정예 스타트업</span>까지 다양한 회사들과 협업하며, 특히 시장에 공개되지 않은 특별한 포지션들을 제공하고 있습니다.
`,
  },
] as const;

const sectionTagClassName =
  "inline-flex items-center rounded-lg bg-beige500/80 px-4 py-2 font-geist text-[15px] font-medium tracking-[-0.03em] text-beige900/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl";

const titleTextClassName =
  "font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.95] tracking-[-0.08em]";

const MOBILE_POSITION_PAGE_SIZE = 4;
const SHARE_REQUEST_QUERY_KEY = "recommended";
const SECTION_VIEW_INTERSECTION_THRESHOLD = 0.35;
const SECTION_VIEW_LOG_COOLDOWN_MS = 15000;
const SESSION_RESET_WINDOW_MS = 30 * 60 * 1000;

type NetworkSectionKey =
  | "hero"
  | "social_proof"
  | "opportunities"
  | "faq"
  | "footer";

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

const SectionTag = ({ children }: { children: React.ReactNode }) => (
  <div className={sectionTagClassName}>{children}</div>
);

const schoolLogos = [
  {
    src: "/images/logos/sn.png",
    name: "서울대학교",
  },
  {
    src: "/images/logos/kaist.png",
    name: "KAIST",
  },
  {
    src: "/images/logos/stanford.png",
    name: "Stanford",
  },
];

const NetworkButton = ({
  label,
  size = "md",
  variant = "primary",
  showArrow = true,
  onClick,
  className = "",
}: {
  label: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
  showArrow?: boolean;
  onClick?: () => void;
  className?: string;
}) => {
  const isSmall = size === "sm";
  const isPrimary = variant === "primary";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      className={`group relative inline-flex items-center justify-center overflow-hidden font-geist font-medium tracking-[-0.03em] transition-shadow duration-300 ${
        isPrimary
          ? "rounded-[12px] bg-beige900 text-beige100 shadow-[0_10px_20px_rgba(46,23,6,0.08)] hover:shadow-[0_18px_40px_rgba(46,23,6,0.18)]"
          : "rounded-[12px] bg-beige500/70 text-beige900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
      } ${
        isSmall
          ? isPrimary
            ? "h-[44px] px-5 text-[14px]"
            : "h-[42px] px-4 text-[15px]"
          : "h-[50px] px-5 text-base"
      } ${className}`}
    >
      {!isPrimary && (
        <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
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
        <ArrowUpRight className="relative ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" />
      )}
    </motion.button>
  );
};

const RequestCard = ({
  request,
  onClick,
  isHighlighted = false,
  containerRef,
}: {
  request: CompanyRequest;
  onClick: () => void;
  isHighlighted?: boolean;
  containerRef?: (node: HTMLDivElement | null) => void;
}) => {
  return (
    <div ref={containerRef} className={`h-full`}>
      <button
        type="button"
        onClick={onClick}
        className={`group relative flex h-full min-h-[140px] md:min-h-[148px] w-full flex-col justify-between rounded-md bg-beige100/80 p-4 md:p-5 text-left transition-all duration-200 outline ${
          isHighlighted
            ? "border border-beige900 outline-2 outline-beige900 shadow-[0_18px_40px_rgba(46,23,6,0.12)]"
            : "border border-beige900/10 outline-1 outline-beige900/0 hover:outline-beige900/90 hover:border-beige900/90"
        }`}
      >
        <div className="flex flex-col w-full">
          <div className="font-inter text-base font-medium leading-[0.96] tracking-[-0.04em] text-black">
            {request.title}
          </div>
          <div className="inline-flex w-fit mt-2 md:mt-3 text-base font-medium leading-[1.45] tracking-[-0.03em] text-beige900/80">
            <span>{request.company}</span>
          </div>
          <div className="absolute right-2 top-2 text-sm inline-flex font-normal items-center gap-1 tracking-[-0.03em] text-black/50 group-hover:text-beige900 transition-colors duration-200">
            <ArrowUpRight className="h-4 w-4 transition-all duration-300 group-hover:translate-x-[2px] group-hover:translate-y-[-2px]" />
          </div>
        </div>

        <div className="mt-0 text-sm flex flex-row items-center justify-between w-full">
          <div className="flex flex-row items-center justify-between w-full font-medium leading-[1.45] tracking-[-0.03em] text-black/70 gap-1">
            <div className="text-black/50">{request.summary}</div>
            <div>{request.compensation}</div>
          </div>
        </div>
      </button>

      {isHighlighted && (
        <p className="mt-2 px-1 text-[12px] font-medium leading-[1.4] tracking-[-0.03em] text-beige900/70">
          이 포지션에 추천받으셨습니다.
        </p>
      )}
    </div>
  );
};
const RequestDetailModal = ({
  request,
  onClose,
  onGetMatched,
  onShare,
  shareButtonLabel,
}: {
  request: CompanyRequest | null;
  onClose: () => void;
  onGetMatched: () => void;
  onShare: () => void;
  shareButtonLabel: string;
}) => {
  if (!request) return null;

  const Section = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <section className="space-y-2">
      <span className="py-1 px-2 rounded-lg bg-beige500 text-sm font-medium tracking-[-0.01em] text-beige900/90 ml-[-2px]">
        {label}
      </span>
      <div className="text-[15px] leading-[1.75] tracking-[-0.02em] text-beige900/82">
        {children}
      </div>
    </section>
  );

  function convertITagToSpan(input: string): string {
    return input
      .replace(/<i>/g, '<span class="text-beige900/50">')
      .replace(/<\/i>/g, "</span>");
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 md:p-6"
    >
      <motion.button
        type="button"
        aria-label="Close request details"
        onClick={onClose}
        className="absolute inset-0 bg-black/10 backdrop-blur-[2px]"
      />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.985 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex max-h-[calc(100vh-32px)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-beige900/8 bg-beige100 shadow-[0_20px_60px_rgba(37,20,6,0.14)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="overflow-y-auto px-6 py-6 md:px-7 md:py-7 relative">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-medium leading-[1.05] tracking-[-0.04em] text-beige900 md:text-xl">
                {request.title}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-beige900/55 transition hover:border-beige900/18 hover:bg-beige900/[0.03] hover:text-beige900/80"
              aria-label="Close request details"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p
            className="mt-4 text-base md:text-lg font-medium leading-[1.75] tracking-[-0.02em] text-beige900/90"
            dangerouslySetInnerHTML={{
              __html: convertITagToSpan(request.intro),
            }}
          />

          <div className="mt-8 space-y-5">
            {/* <Section label="Role">{request.role}</Section> */}
            <Section label="About the role">
              <div dangerouslySetInnerHTML={{ __html: request.about }} />
            </Section>

            {request.requirements && (
              <Section label="Key requirements">
                <div
                  dangerouslySetInnerHTML={{ __html: request.requirements }}
                />
              </Section>
            )}

            {request.whoThisIsFor && request.whoThisIsFor.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="text-[13px] font-medium tracking-[-0.01em] text-beige900/45">
                  Who this is for
                </h3>
                <div className="space-y-2">
                  {request.whoThisIsFor.map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-3 text-[15px] leading-[1.75] tracking-[-0.02em] text-beige900/80"
                    >
                      <span>- {item}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {request.engagement && (
              <Section label="Engagement">
                <div
                  dangerouslySetInnerHTML={{
                    __html: convertITagToSpan(request.engagement),
                  }}
                />
              </Section>
            )}

            <Section label="Compensation">{request.compensation}</Section>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <NetworkButton
              label="Get matched"
              showArrow={false}
              onClick={onGetMatched}
              className="h-11 w-full rounded-xl sm:flex-1"
            />
            <NetworkButton
              label={shareButtonLabel}
              variant="secondary"
              showArrow={false}
              onClick={onShare}
              className="h-11 w-full rounded-xl sm:ml-auto sm:w-auto"
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const valueCards1 = [
  {
    number: "01",
    title: "Apply Once",
    description:
      "서류 지원과 인터뷰를 회사마다 반복할 필요가 없습니다. 한번만 등록하세요. 매칭되는 회사가 어떤 회사인지, 조건이 어떻게 되는지도 저희가 설명해드립니다.",
  },
  {
    number: "02",
    title: "Private by Default",
    description:
      "당신의 정보는 기본적으로 공개되지 않습니다.<br/>매칭을 확인하고, 원할 때만 특정 회사에 공유됩니다.",
  },
  {
    number: "03",
    title: "Access Hidden Roles",
    description:
      "일반 채용시장에 공개되지 않은 포지션까지 연결됩니다.<br/>Stealth 스타트업부터 글로벌 유니콘까지, 직접 접근하기 어려운 기회들을 만날 수 있습니다.",
  },
];

const valueCards = [
  {
    number: "01",
    title: "Apply Once",
    description:
      "No need to repeat applications and interviews for every company.<br/>Sign up once, and we'll match you with the right opportunities—while clearly explaining each company and role.",
  },
  {
    number: "02",
    title: "Private by Default",
    description:
      "Your information is never shared by default.<br/>Only the opportunities you choose will see your profile.",
  },
  {
    number: "03",
    title: "Access Hidden Roles",
    description:
      "Get access to roles that aren't publicly listed.<br/>From stealth startups to global unicorns, discover opportunities you wouldn't find on your own.",
  },
];

const NetworkPage = () => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const countryLang = useCountryLang();
  const [landingId, setLandingId] = useState("");
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const [showPreloader, setShowPreloader] = useState(true);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [selectedOnboardingRole, setSelectedOnboardingRole] = useState<
    string | undefined
  >(undefined);
  const [mobilePositionPage, setMobilePositionPage] = useState(0);
  const [selectedRequest, setSelectedRequest] = useState<CompanyRequest | null>(
    null
  );
  const [highlightedRequestId, setHighlightedRequestId] = useState<
    string | null
  >(null);
  const [pendingScrollRequestId, setPendingScrollRequestId] = useState<
    string | null
  >(null);
  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null);
  const heroSectionRef = useRef<HTMLElement | null>(null);
  const socialProofSectionRef = useRef<HTMLElement | null>(null);
  const opportunitiesSectionRef = useRef<HTMLElement | null>(null);
  const faqSectionRef = useRef<HTMLElement | null>(null);
  const footerSectionRef = useRef<HTMLElement | null>(null);
  const requestCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasLoggedFirstScrollRef = useRef(false);
  const sectionLastLoggedAtRef = useRef<Record<NetworkSectionKey, number>>({
    hero: 0,
    social_proof: 0,
    opportunities: 0,
    faq: 0,
    footer: 0,
  });
  const totalMobilePositionPages = Math.ceil(
    companyRequests.length / MOBILE_POSITION_PAGE_SIZE
  );
  const mobileVisibleRequests = companyRequests.slice(
    mobilePositionPage * MOBILE_POSITION_PAGE_SIZE,
    (mobilePositionPage + 1) * MOBILE_POSITION_PAGE_SIZE
  );

  const insertLandingLog = useCallback(
    async (type: string, localId: string) => {
      try {
        await supabase.from("landing_logs").insert({
          local_id: localId,
          type,
          abtest_type: TALENT_NETWORK_LOG_ABTEST_TYPE,
          is_mobile: isMobile,
          country_lang: countryLang,
        });
      } catch (error) {
        console.error("talent network page log error:", error);
      }
    },
    [countryLang, isMobile]
  );

  const addLandingLog = useCallback(
    async (type: string) => {
      if (!landingId) return;
      await insertLandingLog(type, landingId);
    },
    [insertLandingLog, landingId]
  );

  const openOnboarding = useCallback(
    (type: string, role?: string) => {
      void addLandingLog(type);
      setSelectedOnboardingRole(role);
      setIsOnboardingOpen(true);
    },
    [addLandingLog]
  );

  const handleOpenRequest = useCallback(
    (request: CompanyRequest) => {
      void addLandingLog(`view_network_request_${request.id}`);
      setSelectedRequest(request);
    },
    [addLandingLog]
  );

  const handleFaqToggle = useCallback(
    (index: number, isOpen: boolean) => {
      if (!isOpen) {
        void addLandingLog(`click_network_faq_${index + 1}`);
      }

      setOpenFaqIndex(isOpen ? -1 : index);
    },
    [addLandingLog]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setShowPreloader(false);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const savedId = localStorage.getItem(TALENT_NETWORK_LOCAL_ID_KEY);
    if (savedId) {
      setLandingId(savedId);
      return;
    }

    const nextId = createTalentNetworkLocalId();
    const now = Date.now().toString();
    localStorage.setItem(TALENT_NETWORK_LOCAL_ID_KEY, nextId);
    localStorage.setItem(TALENT_NETWORK_LAST_VISIT_AT_KEY, now);
    setLandingId(nextId);
    void insertLandingLog("new_visit", nextId);
  }, [insertLandingLog]);

  useEffect(() => {
    if (!landingId) return;

    const now = Date.now();
    const lastVisitRaw = localStorage.getItem(TALENT_NETWORK_LAST_VISIT_AT_KEY);
    const lastVisitAt = lastVisitRaw ? Number(lastVisitRaw) : null;

    if (!lastVisitAt || now - lastVisitAt >= SESSION_RESET_WINDOW_MS) {
      void addLandingLog("new_session");
    }

    localStorage.setItem(TALENT_NETWORK_LAST_VISIT_AT_KEY, now.toString());
  }, [addLandingLog, landingId]);

  useEffect(() => {
    if (!landingId) return;

    const handleScroll = () => {
      if (hasLoggedFirstScrollRef.current || window.scrollY <= 0) return;

      hasLoggedFirstScrollRef.current = true;
      void addLandingLog("first_scroll_down");
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [addLandingLog, landingId]);

  useEffect(() => {
    if (!landingId || showPreloader) return;

    const sectionElements: Array<{
      key: NetworkSectionKey;
      element: HTMLElement | null;
    }> = [
      { key: "hero", element: heroSectionRef.current },
      { key: "social_proof", element: socialProofSectionRef.current },
      { key: "opportunities", element: opportunitiesSectionRef.current },
      { key: "faq", element: faqSectionRef.current },
      { key: "footer", element: footerSectionRef.current },
    ];

    const observedSections = sectionElements.filter(
      (
        section
      ): section is {
        key: NetworkSectionKey;
        element: HTMLElement;
      } => section.element !== null
    );

    if (observedSections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();

        entries.forEach((entry) => {
          const section = (entry.target as HTMLElement).dataset.section as
            | NetworkSectionKey
            | undefined;
          if (!section) return;

          const isVisible =
            entry.isIntersecting &&
            entry.intersectionRatio >= SECTION_VIEW_INTERSECTION_THRESHOLD;

          if (!isVisible) return;

          const lastLoggedAt = sectionLastLoggedAtRef.current[section] ?? 0;
          if (now - lastLoggedAt < SECTION_VIEW_LOG_COOLDOWN_MS) return;

          sectionLastLoggedAtRef.current[section] = now;
          void addLandingLog(`view_section_network_${section}`);
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
  }, [addLandingLog, landingId, showPreloader]);

  useEffect(() => {
    const isOverlayOpen = isOnboardingOpen || selectedRequest !== null;

    if (!isOverlayOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();

      if (isOnboardingOpen) {
        setIsOnboardingOpen(false);
        return;
      }

      setSelectedRequest(null);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOnboardingOpen, selectedRequest]);

  useEffect(() => {
    if (!copiedRequestId) return;

    const timeout = window.setTimeout(() => {
      setCopiedRequestId(null);
    }, 1400);

    return () => window.clearTimeout(timeout);
  }, [copiedRequestId]);

  useEffect(() => {
    if (!router.isReady) return;

    const sharedRequestIdParam = router.query[SHARE_REQUEST_QUERY_KEY];
    const sharedRequestId = Array.isArray(sharedRequestIdParam)
      ? sharedRequestIdParam[0]
      : sharedRequestIdParam;
    const targetIndex = companyRequests.findIndex(
      (request) => request.id === sharedRequestId
    );

    if (targetIndex === -1) {
      setHighlightedRequestId(null);
      setPendingScrollRequestId(null);
      return;
    }

    setHighlightedRequestId(companyRequests[targetIndex].id);
    setPendingScrollRequestId(companyRequests[targetIndex].id);
    setMobilePositionPage(Math.floor(targetIndex / MOBILE_POSITION_PAGE_SIZE));
  }, [router.isReady, router.query]);

  useEffect(() => {
    if (!pendingScrollRequestId || showPreloader) return;

    const targetIndex = companyRequests.findIndex(
      (request) => request.id === pendingScrollRequestId
    );

    if (targetIndex === -1) {
      setPendingScrollRequestId(null);
      return;
    }

    const targetMobilePage = Math.floor(
      targetIndex / MOBILE_POSITION_PAGE_SIZE
    );

    if (mobilePositionPage !== targetMobilePage) return;

    const timeout = window.setTimeout(() => {
      const mobileCard =
        requestCardRefs.current[`mobile-${pendingScrollRequestId}`];

      const desktopCard =
        requestCardRefs.current[`desktop-${pendingScrollRequestId}`];

      const targetCard =
        [mobileCard, desktopCard].find(
          (card) => card && card.offsetParent !== null
        ) ??
        mobileCard ??
        desktopCard ??
        opportunitiesSectionRef.current;

      if (targetCard) {
        const top =
          targetCard.getBoundingClientRect().top + window.scrollY - 196;

        window.scrollTo({
          top: Math.max(top, 0),
          behavior: "smooth",
        });
      }

      setPendingScrollRequestId(null);
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [mobilePositionPage, pendingScrollRequestId, showPreloader]);

  const handleShareRequest = async (request: CompanyRequest) => {
    void addLandingLog(`click_network_share_request_${request.id}`);

    try {
      const shareUrl = new URL(
        window.location.pathname,
        window.location.origin
      );
      shareUrl.searchParams.set(SHARE_REQUEST_QUERY_KEY, request.id);

      await copyToClipboard(shareUrl.toString());
      setCopiedRequestId(request.id);
      showToast({
        message: "공유 링크가 복사되었습니다.",
        variant: "white",
      });
    } catch (error) {
      console.error("Failed to copy request link", error);
      showToast({
        message: "링크 복사에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const Pill = ({ label }: { label: string }) => {
    return (
      <div className="inline-flex items-center gap-1 rounded-md bg-beige500 px-3 py-1 text-[13px] md:text-sm font-medium tracking-[-0.03em] text-beige900/90 transition-colors duration-200">
        {label}
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Harper Network</title>
        <meta
          name="description"
          content="Top AI teams reach out to you privately."
        />
      </Head>

      <div className="min-h-screen overflow-x-clip bg-beige100 font-geist text-beige900 antialiased">
        <AnimatePresence>
          {showPreloader && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{
                y: "-100%",
                transition: { duration: 0.9, ease: [0.76, 0, 0.24, 1] },
              }}
              className="fixed inset-0 z-[160] flex items-center justify-center bg-beige500"
            >
              <div className="font-halant text-5xl md:text-7xl tracking-[-0.08em] text-beige900">
                <StaggerText text="Harper" by="char" delay={0.08} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <nav className="fixed inset-x-0 top-0 z-50 bg-beige200 backdrop-blur-lg">
          <div className="mx-auto flex h-[64px] max-w-[1160px] items-center justify-between px-4">
            <a
              href="#top"
              className="font-halant text-[28px] tracking-[-0.06em] text-beige900"
            >
              Harper
            </a>
            <NetworkButton
              label="Join"
              size="sm"
              variant="secondary"
              showArrow={false}
              onClick={() => openOnboarding("click_network_join_nav")}
              className="inline-flex"
            />
          </div>
        </nav>

        <main
          id="top"
          className="mx-auto flex max-w-[1160px] flex-col px-4 pb-24 pt-[72px] md:pt-[96px] "
        >
          <section
            ref={heroSectionRef}
            data-section="hero"
            className="py-10 text-center"
          >
            <Reveal once delay={0.06} className="mx-auto mt-6 max-w-[900px]">
              <h2
                className={`${titleTextClassName} text-beige900 text-4xl md:text-5xl`}
              >
                {/* GET MATCHED TO TOP AI STARTUPS */}
                <span className="block">
                  <StaggerText text="Access the World's" />
                </span>
                <span className="block mt-3">
                  <StaggerText text="Most Elite AI Positions." delay={0.14} />
                </span>
              </h2>
            </Reveal>

            <Reveal once delay={0.18} className="mt-8">
              <div className="flex flex-col justify-center items-center text-lg tracking-[-0.03em] text-beige900/70">
                <div>
                  Direct backdoor to confidential AI unicorns backed by top-tier
                  Global VCs.
                </div>
                <div>Skip the HR screen and match directly with founders.</div>
              </div>

              <div className="mt-8 flex flex-row items-center justify-center gap-2 text-base tracking-[-0.03em] text-beige900/50 flex-wrap">
                <Pill label="Fractional (4~12 hrs/wk)" />
                <Pill label="Founding Member / CTO" />
                <Pill label="Technical Advisory" />
              </div>
            </Reveal>

            <Reveal once delay={0.24} className="mt-12">
              <NetworkButton
                label="Initiate Match"
                onClick={() =>
                  openOnboarding("click_network_initiate_match_hero")
                }
              />
            </Reveal>

            {/* <Reveal
              once
              delay={0.3}
              className="mt-2 inline-flex items-center gap-2 text-base tracking-[-0.03em] text-beige900/55"
            >
              <ShieldCheck className="h-5 w-5" />
              <span>Your info is private. Not shared without consent</span>
            </Reveal> */}
          </section>

          <section
            ref={socialProofSectionRef}
            data-section="social_proof"
            className="mt-2"
          >
            <Reveal
              once
              delay={0.08}
              className="text-center justify-center items-center mb-12"
            >
              <div className="flex flex-row items-center justify-center gap-2">
                <div className="relative items-baseline gap-1 font-normal flex">
                  <div>300+ engineers and researchers From </div>
                </div>
                <div className="flex -space-x-2">
                  {schoolLogos.map((school) => (
                    <div
                      key={school.name}
                      className="h-10 w-10 rounded-full bg-beige500 border border-beige900/20"
                    >
                      <Image
                        src={school.src}
                        alt={school.name}
                        className="rounded-full"
                        width={42}
                        height={42}
                      />
                    </div>
                  ))}
                </div>
              </div>
              {/* <p className="mt-3 text-[17px] leading-[1.55] tracking-[-0.03em] text-beige900/55">
                매칭을 위해 Active pool을 500명 이하로 관리 예정입니다.
              </p> */}
            </Reveal>

            <VCLogos />
          </section>

          <section
            id="opportunities"
            ref={opportunitiesSectionRef}
            data-section="opportunities"
            className="mt-32 scroll-mt-24"
          >
            <Reveal once>
              <div className="flex w-full items-center justify-between gap-4 text-beige900">
                <div className="font-medium text-left">
                  Opportunities in our network
                </div>
                <div className="flex items-center gap-2 md:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      void addLandingLog("click_network_positions_prev_page");
                      setMobilePositionPage((prev) => Math.max(prev - 1, 0));
                    }}
                    disabled={mobilePositionPage === 0}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-black/10 text-sm text-beige900 transition disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Show previous positions"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void addLandingLog("click_network_positions_next_page");
                      setMobilePositionPage((prev) =>
                        Math.min(prev + 1, totalMobilePositionPages - 1)
                      );
                    }}
                    disabled={
                      mobilePositionPage >= totalMobilePositionPages - 1
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-black/10 text-sm text-beige900 transition disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Show next positions"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Reveal>

            <div className="mt-4 grid w-full grid-cols-1 gap-4 md:hidden">
              {mobileVisibleRequests.map((request, index) => (
                <Reveal
                  key={`${request.id}-${mobilePositionPage}`}
                  once
                  delay={0.05 * index}
                  className={`h-full ${highlightedRequestId === request.id ? "pb-4" : ""}`}
                >
                  <RequestCard
                    request={request}
                    isHighlighted={highlightedRequestId === request.id}
                    containerRef={(node) => {
                      requestCardRefs.current[`mobile-${request.id}`] = node;
                    }}
                    onClick={() => handleOpenRequest(request)}
                  />
                </Reveal>
              ))}
            </div>

            <div className="mt-4 hidden w-full grid-cols-2 gap-4 md:grid lg:grid-cols-2">
              {companyRequests.map((request, index) => (
                <Reveal
                  key={request.id}
                  once
                  delay={0.05 * index}
                  className={`h-full ${highlightedRequestId === request.id ? "pb-4" : ""}`}
                >
                  <RequestCard
                    request={request}
                    isHighlighted={highlightedRequestId === request.id}
                    containerRef={(node) => {
                      requestCardRefs.current[`desktop-${request.id}`] = node;
                    }}
                    onClick={() => handleOpenRequest(request)}
                  />
                </Reveal>
              ))}
            </div>
          </section>

          <Reveal once className="text-center mt-24 md:mt-32">
            <SectionTag>Our value</SectionTag>

            <h2
              className={`mx-auto mt-8 max-w-[860px] font-halant text-3xl md:text-4xl leading-[0.98] tracking-[-0.08em] text-beige900`}
            >
              Highly Curated
            </h2>
            {/* <p className="mx-auto mt-6 max-w-[680px] text-[20px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[18px]">
              Tell us who you need. We find, shortlist, and deliver candidates
              you can review and interview right away.
            </p> */}

            <div className="mt-8 md:mt-16 flex flex-col md:flex-row gap-6 items-start justify-between">
              {valueCards.map((item, index) => (
                <Reveal
                  key={item.number}
                  once
                  direction="right"
                  delay={index * 0.08}
                  className="w-full"
                >
                  <div className="grid grid-cols-[42px_1fr] gap-4 text-left">
                    <div className="pt-1 font-geist text-2xl font-medium leading-none tracking-[-0.08em] text-beige900/60 max-[809px]:pt-2">
                      {item.number}
                    </div>
                    <div>
                      <div className="flex items-start gap-3 max-[809px]:flex-col-reverse max-[809px]:gap-2">
                        <h3 className="text-xl font-medium leading-[1.12] tracking-[-0.05em] text-beige900 max-[809px]:mt-2">
                          {item.title}
                        </h3>
                      </div>
                      <p
                        className="mt-2 text-base md:text-[18px] leading-[1.5] tracking-[-0.03em] text-beige900/50"
                        dangerouslySetInnerHTML={{ __html: item.description }}
                      />
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </Reveal>

          <section
            id="faq"
            ref={faqSectionRef}
            data-section="faq"
            className="py-24 mt-0 md:mt-8"
          >
            <Reveal once className="text-center">
              <SectionTag>FAQ</SectionTag>
            </Reveal>

            <div className="mx-auto mt-12 max-w-[860px] space-y-4 text-left">
              {faqs.map((faq, index) => {
                const isOpen = openFaqIndex === index;

                return (
                  <Reveal key={faq.question} once delay={index * 0.04}>
                    <motion.button
                      type="button"
                      onClick={() => handleFaqToggle(index, isOpen)}
                      aria-expanded={isOpen}
                      className="w-full rounded-[24px] bg-beige100 px-6 py-6 shadow-[0_14px_30px_rgba(66,38,10,0.06)]"
                    >
                      <div className="flex items-center justify-between gap-8">
                        <div className="text-left text-sm md:text-base font-medium leading-[1.24] tracking-[-0.04em] text-beige900">
                          {faq.question}
                        </div>
                        <motion.div
                          animate={{ rotate: isOpen ? 405 : 0 }}
                          transition={{
                            duration: 0.28,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          <Plus className="h-5 w-5 text-beige900/60" />
                        </motion.div>
                      </div>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0, marginTop: 0 }}
                            animate={{
                              height: "auto",
                              opacity: 1,
                              marginTop: 20,
                            }}
                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                            transition={{
                              duration: 0.35,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="overflow-hidden"
                          >
                            <p
                              className="w-full text-left text-sm md:text-[15px] leading-[1.6] tracking-[-0.01em] text-beige900/70"
                              dangerouslySetInnerHTML={{ __html: faq.answer }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </Reveal>
                );
              })}
            </div>
          </section>
        </main>
        <div ref={footerSectionRef as any} data-section="footer">
          <br />
          <br />
          <br />
          <br />
          <Reveal once delay={0.24} className="w-full">
            <div className="flex items-center justify-center w-full mt-20 mb-4">
              <Image
                src="/images/objects.png"
                alt="objects"
                width={256}
                height={256}
                className="w-44 sm:w-52 md:w-64"
              />
            </div>
          </Reveal>

          <footer className="border-t border-beige900/10 py-8">
            <div className="mx-auto flex max-w-[1160px] flex-col items-center justify-between gap-4 px-4 tracking-[-0.03em] text-beige900/60 md:flex-row">
              <div className="font-halant text-[28px] tracking-[-0.06em] text-beige900">
                Harper
              </div>
              <div className="flex items-center gap-4 text-base">
                <Link
                  href="/terms"
                  className="cursor-pointer transition hover:text-beige900"
                >
                  Terms
                </Link>
                <Link
                  href="/privacy"
                  className="cursor-pointer transition hover:text-beige900"
                >
                  Privacy
                </Link>
                <Link
                  href="https://www.linkedin.com/company/matchharper/"
                  className="cursor-pointer transition hover:text-beige900"
                >
                  LinkedIn
                </Link>
              </div>
            </div>
          </footer>
        </div>

        <AnimatePresence>
          {selectedRequest && (
            <RequestDetailModal
              request={selectedRequest}
              onClose={() => setSelectedRequest(null)}
              onShare={() => void handleShareRequest(selectedRequest)}
              shareButtonLabel={
                copiedRequestId === selectedRequest.id
                  ? "링크 복사됨"
                  : "공유하기"
              }
              onGetMatched={() => {
                setSelectedRequest(null);
                openOnboarding(
                  `click_network_get_matched_${selectedRequest.id}`,
                  selectedRequest.role
                );
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isOnboardingOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[140] overflow-y-auto bg-beige200"
            >
              <button
                type="button"
                onClick={() => setIsOnboardingOpen(false)}
                className="fixed right-4 top-4 z-[150] inline-flex h-10 w-10 items-center justify-center rounded-md text-beige900 transition hover:bg-beige900/10 md:right-8 md:top-6"
                aria-label="Close onboarding"
              >
                <X className="h-5 w-5" />
              </button>
              <Onboarding2Content
                selectedRole={selectedOnboardingRole}
                onDone={() => setIsOnboardingOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default NetworkPage;

const vcLogos = [
  { key: "a16z2", src: "/svgs/a16z2.svg", width: 100 },
  { key: "yc2", src: "/svgs/yc.svg", width: 152 },
  { key: "sequoia2", src: "/svgs/sequoia.svg", width: 146 },
  { key: "index2", src: "/svgs/index.svg", width: 136 },
  { key: "besemmer2", src: "/svgs/bessemer.svg", width: 118 },
];

function VCLogos() {
  const items = [...vcLogos];

  return (
    <div className="relative w-[90%] mx-auto overflow-hidden mt-24">
      <Reveal once delay={0.08} className="w-full text-center">
        <div className="w-full text-center text-beige900 text-lg leading-[1.55] tracking-[-0.03em] font-medium">
          Partnering with <span className="text-beige900/50">AI companies</span>
          <br className="block md:hidden" /> funded by the world&apos;s elite.
        </div>
      </Reveal>
      <Reveal once delay={0.14} className="w-full text-center">
        <div className="w-full flex-row items-center justify-center gap-16 hidden md:flex">
          {items.slice(0, 5).map((vc, i) => (
            <div
              key={`${vc.key}-${i}`}
              className="flex h-28 md:h-32 min-w-[140px] md:min-w-[140px] items-center justify-center"
            >
              <Image
                src={vc.src}
                alt={vc.key}
                width={vc.width}
                height={100}
                className="object-contain opacity-90"
                priority={i < vcLogos.length}
              />
            </div>
          ))}
        </div>
        <div className="md:hidden mt-10 grid grid-cols-2 grid-rows-3 w-full justify-center items-center gap-4 flex-wrap">
          {items.slice(0, 6).map((vc, i) => (
            <div
              key={`${vc.key}-${i}`}
              className="flex items-center justify-center"
            >
              <Image
                src={vc.src}
                alt={vc.key}
                width={vc.width - 20}
                height={100}
                className="object-contain max-w-[36vw] opacity-90"
                priority={i < vcLogos.length}
              />
            </div>
          ))}
        </div>
      </Reveal>

      <style jsx>{`
        /* Move by 50% because we duplicated the list (2x). */
        .marquee {
          animation: marquee 32s linear infinite;
          will-change: transform;
        }
        /* pause on hover */
        .group:hover .marquee {
          animation-play-state: paused;
        }
        @keyframes marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        /* respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .marquee {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
