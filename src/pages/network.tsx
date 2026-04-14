import Reveal from "@/components/landing/Animation/Reveal";
import StaggerText from "@/components/landing/Animation/StaggerText";
import { showToast } from "@/components/toast/toast";
import { useCountryLang } from "@/hooks/useCountryLang";
import { useIsMobile } from "@/hooks/useIsMobile";
import { supabase } from "@/lib/supabase";
import {
  TALENT_NETWORK_ABTEST_TYPE_KEY,
  TALENT_NETWORK_LAST_VISIT_AT_KEY,
  TALENT_NETWORK_LOCAL_ID_KEY,
  createTalentNetworkLocalId,
  resolveTalentNetworkAssignmentType,
  usesTalentNetworkBExperience,
  type TalentNetworkAssignmentType,
  TALENT_NETWORK_ABTEST_TYPE_B,
} from "@/lib/talentNetwork";
import {
  captureTalentNetworkReferralVisit,
  copyTextToClipboard,
  createTalentNetworkReferralLink,
  isTalentNetworkReferralSource,
  readTalentNetworkStoredReferral,
  TALENT_NETWORK_REFERRAL_QUERY_KEY,
  TALENT_NETWORK_REFERRAL_SOURCE_LANDING_FOOTER,
  writeTalentNetworkStoredReferral,
} from "@/lib/talentNetworkReferral";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Onboarding2Content } from "./onboarding2";
import { logger } from "@/utils/logger";

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
    id: "aie",
    title: "AI Engineer",
    role: "AI Systems & Product",
    company: "Multiple High-Growth AI Teams",
    summary: "Full-time or Part-time",
    intro:
      "Harper works with a group of <i>high-growth AI teams (from fast-scaling startups to global tech companies)</i> building real-world AI products.",
    about:
      "You will design and ship AI systems that deliver real impact. This includes building agentic workflows, integrating LLMs into products, and ensuring AI features are reliable, measurable, and used in production. You will work across engineering, product, and business contexts to turn ambiguous problems into software.",
    requirements:
      "Strong engineering fundamentals with experience shipping products, familiarity with LLMs or AI tooling, and the ability to translate real-world problems into working systems. Experience in product thinking, data, or system design is a plus.",
    engagement: "Full-time<br />Part-time (4~12 hours/week)<br />Intern",
    compensation: "Average salary : $ 120k+",
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
    id: "aiml-engineer-researcher",
    title: "AI/ML Engineer & Researcher",
    role: "AI/ML Engineer (Model Training/Inference & Pipeline)",
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
    id: "swe",
    title: "Software Engineer",
    role: "Software Engineer",
    company: "10+ Elite Teams",
    summary: "Full-time or Part-time",
    intro:
      "Harper is partnered with 10+ <i>Elite Startups (from stealth to unicorn startups)</i>.",
    about:
      "We are looking for engineers who love building and shipping real products.<br/>Whether you work on backend, frontend, infra, or data systems, this is a place for developers who want to solve meaningful problems and see their work used in production.",
    requirements:
      "Strong engineering fundamentals and experience building and shipping software. Ability to write clean, reliable code and work across systems. Experience with modern development tools and frameworks is a plus, but more importantly, you have a builder mindset and enjoy turning ideas into working products.",
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
    question: "등록하면 어떻게 되는건가요?",
    answer:
      "뛰어난 스포츠 선수에게는 전담 에이전트가 있는 것처럼, Harper는 AI/ML 인재분들을 위한 AI-native 에이전트입니다. <br/>등록하신다면 Harper와 협업하는 회사들중 적합한 역할을 매칭하고, 인재 분께 먼저 회사와 역할에 대한 자세한 설명과 함께 연결의사를 묻습니다. 동의하신다면, 회사와 연결시켜 드립니다.<br/><br/>이 때 Harper는 직접 나눈 대화, 회사의 모든 내부 정보, 인재 분의 커리어, 활동(논문, Github, 블로그, 이력서 등)을 기반으로 모든 요소를 고려해서 매칭하기 때문에 일반 헤드헌터보다 6배 높은 수락율을 보이고 있습니다.<br/><br/>만약 선호하거나 원하시는 기회가 있으시다면 알려주세요. 그럼 Harper가 최대한 선호하실만한 기회를 적극적으로 찾고, 먼저 회사와 연결된 뒤 기회를 얻으실 수 있게 도와드립니다.",
    // "뛰어난 스포츠 선수에게는 전담 에이전트가 있는 것처럼, Harper는 AI/ML 인재분들을 위한 AI-native 에이전트입니다. <br/>인재의 입장에서 최대한 많은 기회를 받으실 수 있게 올려주실 정보들을 바탕으로 추가적인 기회들을 찾고있어요.<br/><br/>만약 선호하거나 원하시는 기회가 있으시다면 알려주세요. 그럼 Harper가 최대한 선호하실만한 기회를 적극적으로 찾고, 회사와 연결된 뒤 기회를 얻으실 수 있게 도와드립니다.",
    // "Harper는 인재 분들을 위한 AI native 헤드헌터입니다. 만약 선호하거나 원하시는 기회가 있으시다면 알려주세요. 그럼 Harper가 최대한 선호하실만한 기회를 적극적으로 찾고, 회사와 연결된 뒤 기회를 얻으실 수 있게 도와드립니다.",
  },
  {
    question: "일반적인 채용공고나 헤드헌터와 어떻게 다른가요?",
    answer: `<div className="w-[90%] md:w-[60%] text-center mt-32 mb-4">
              <div>
                ※ Harper는 최고의 인재와 회사 네트워크를 관리합니다.
                인재분들에게는 선호하실만한 모든 커리어 기회를 찾아 알려드리고,
                수락하신다면 해당 회사의 담당자와 직접 연결해드립니다. (모든
                정보는 추천을 수락하시기 전까지 어떤 회사에도 공개되지
                않습니다.)
              </div>
              <div>
                <br />
                특히 국내/해외의 AI 스타트업들과 주로 협업하고 있고 글로벌
                유니콘이나 아시아 리더십 포지션 등, 평소 외부에 잘 공개되지 않는
                희귀한 탑티어 포지션들도 독점적으로 발굴해 핏을 찾아드리고
                있습니다.
              </div>
              <div>
                <br />
                Most Exciting Tech companies / 경쟁력 있는 회사들을 모시고 있고,
                풀은 갈수록 커지고 있습니다.
                <br />
                바로 연결이 되지는 않을 수 있지만, 적절한 기회를 찾아서
                연결드리겠습니다.
              </div>
              <div>
                <br />
              정규직 합류뿐만 아니라, 현업을 유지하며 주당 4~12시간 내외로 핵심 프로젝트에 기여하는 'Fractional(파트타임)' 형태의 협업 기회도 Harper 네트워크 안에서 활발하게 연결됩니다.</div>
            </div>`,
    //             `<div><span class='font-semibold text-beige900 font-inter'>Focused Expertise:</span> 저희는 오직 AI/ML 분야에만 집중합니다. 모델 트레이닝, LLM 인프라, NPU 설계 등 기술적 난도가 높은 직무의 맥락을 정확히 이해하고, 정확한 기회만 연결합니다.</div>
    // <div class="mt-2"><span class='font-semibold text-beige900 font-inter'>Exclusive Partnership:</span> 모든 회사의 공고를 제안하지 않습니다. 실리콘밸리 Tier 1 VC의 투자를 받았거나 기술적 파괴력이 입증된 소수의 팀들과만 긴밀하게 협업하며, 시장에 공개되지 않은 핵심 포지션(Stealth Roles)을 우선적으로 매칭합니다.</div>
    // <div class="mt-2"><span class='font-semibold text-beige900 font-inter'>Streamlined Process:</span> 불필요한 단계를 생략합니다. Harper의 추천은 파트너사의 창업자 또는 기술 리드에게 직접 전달되어, 가장 효율적이고 전문적인 논의가 이루어질 수 있도록 지원합니다.</div>
    // <div class="mt-2"><span class='font-semibold text-beige900 font-inter'>Engagement Flexibility:</span> 정규직 합류뿐만 아니라, 현업을 유지하며 주당 4~12시간 내외로 핵심 프로젝트에 기여하는 'Fractional(파트타임)' 형태의 협업 기회도 Harper 네트워크 안에서 활발하게 연결됩니다.</div>
    // `
  },
  {
    question: "당장 이직 생각이 없어도 등록해둘 수 있을까요?",
    answer: `네. 하퍼는 정규직 채용 외에도 <span class='font-semibold text-beige900 font-inter'>파트타임, 인턴, 자문</span> 등 지원자님에게 도움이 될 수 있는 다양한 형태의 기회를 함께 연결합니다.<br /><br />
아래의 사항들 중 하나에 해당되신다면 등록해두시는걸 추천드립니다.<br /><br />
- 내가 잘 모르는 회사라도 그 회사의 좋은점/안좋은 점이 뭔지 나에게 구체적으로 설명해주면 좋겠다.<br />
- 내 역량을 어떤 회사가 필요로 하는지 알고 싶다.<br />
- 지금은 이직 생각이 없지만 좋은 기회를 받아보고 싶다.<br />
- 내 GitHub / 논문 / 실제 작업을 누군가 제대로 읽고 알맞은 제안을 해주면 좋겠다.
`,
  },
] as const;

const valueCards = [
  {
    number: "01",
    title: "Apply Once",
    description:
      "No need to repeat applications and interviews for every company.<br/>Sign up once, and we'll match you with the right opportunities.<br />No mass emails.",
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

const sectionTagClassName =
  "inline-flex items-center rounded-lg bg-beige500/80 px-4 py-2 font-geist text-[15px] font-medium tracking-[-0.03em] text-beige900/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl";

const titleTextClassName =
  "font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.95] tracking-[-0.08em]";

const MOBILE_POSITION_PAGE_SIZE = 4;
const SHARE_REQUEST_QUERY_KEY = "recommended";
const TALENT_NETWORK_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const MOBILE_HEADER_SCROLL_DELTA_THRESHOLD = 8;
const SECTION_VIEW_INTERSECTION_THRESHOLD = 0.35;
const SECTION_VIEW_LOG_COOLDOWN_MS = 15000;

type NetworkSectionKey =
  | "hero"
  | "social_proof"
  | "opportunities"
  | "faq"
  | "footer";

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function getClientSearchParam(key: string) {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(key);
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
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

export const NetworkButton = ({
  label,
  size = "md",
  variant = "primary",
  showArrow = true,
  highlighted = false,
  disabled = false,
  onClick,
  className = "",
}: {
  label: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
  showArrow?: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) => {
  const isSmall = size === "sm";
  const isPrimary = variant === "primary";

  return (
    <motion.button
      type="button"
      disabled={disabled}
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
      } ${
        highlighted
          ? isPrimary
            ? "ring-4 ring-[#D9C1A0] ring-offset-2 ring-offset-beige200 shadow-[0_18px_44px_rgba(46,23,6,0.2)]"
            : "ring-2 ring-[#D9C1A0]/90 ring-offset-2 ring-offset-beige200"
          : ""
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
  highlightPrimaryCta = false,
}: {
  request: CompanyRequest | null;
  onClose: () => void;
  onGetMatched: () => void;
  onShare: () => void;
  shareButtonLabel: string;
  highlightPrimaryCta?: boolean;
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
              highlighted={highlightPrimaryCta}
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

const InquiryModal = ({
  email,
  content,
  isSubmitting,
  onClose,
  onSubmit,
  onEmailChange,
  onContentChange,
}: {
  email: string;
  content: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onEmailChange: (value: string) => void;
  onContentChange: (value: string) => void;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[145] flex items-center justify-center p-4 md:p-6"
    >
      <motion.button
        type="button"
        aria-label="문의 모달 닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/10 backdrop-blur-[2px]"
      />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.985 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[560px] rounded-2xl border border-beige900/8 bg-beige200 p-6 shadow-[0_20px_60px_rgba(37,20,6,0.14)] md:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-beige900/55 transition hover:bg-beige900/[0.03] hover:text-beige900/80 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="문의 모달 닫기"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="pr-8">
          <h2 className="text-xl font-medium tracking-[-0.04em] text-beige900">
            문의하기
          </h2>
          <p className="mt-2 text-sm leading-[1.7] tracking-[-0.02em] text-beige900/60">
            궁금한 점이나 원하는 기회가 있으면 남겨주세요. 확인 후
            연락드리겠습니다.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium tracking-[-0.02em] text-beige900/70">
              회신 받으실 이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="example@example.com"
              className="h-12 w-full rounded-xl border border-beige900/12 bg-white/70 px-4 text-[15px] text-beige900 outline-none transition focus:border-beige900/30 focus:ring-1 focus:ring-beige900/20 placeholder:text-beige900/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium tracking-[-0.02em] text-beige900/70">
              내용
            </label>
            <textarea
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
              rows={4}
              placeholder="문의하실 내용을 입력해 주세요."
              className="w-full rounded-xl border border-beige900/12 bg-white/70 px-4 py-3 text-[15px] leading-[1.6] text-beige900 outline-none transition focus:border-beige900/30 focus:ring-1 focus:ring-beige900/20 placeholder:text-beige900/30 resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-beige900/12 bg-white/60 px-4 text-sm font-medium text-beige900/80 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-beige900 px-4 text-sm font-medium text-beige100 transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                문의 접수 중...
              </>
            ) : (
              "문의하기"
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const ReferralShareModal = ({
  email,
  isSubmitting,
  onClose,
  onEmailChange,
  onSubmit,
}: {
  email: string;
  isSubmitting: boolean;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[146] flex items-center justify-center p-4"
    >
      <motion.button
        type="button"
        aria-label="공유 모달 닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/10 backdrop-blur-[2px]"
      />

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.985 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-[96%] max-w-[420px] rounded-2xl border border-beige900/8 bg-beige100 p-5 shadow-[0_20px_60px_rgba(37,20,6,0.14)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-beige900/55 transition hover:bg-beige900/[0.03] hover:text-beige900/80 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="공유 모달 닫기"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="pr-7">
          <h2 className="text-base font-medium tracking-[-0.03em] text-beige900">
            공유 링크 생성
          </h2>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-sm font-medium tracking-[-0.02em] text-beige900/70">
            이메일
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="example@example.com"
            className="h-11 w-full rounded-md border border-beige900/12 bg-white/75 px-4 text-[15px] text-beige900 outline-none transition focus:border-beige900/30 focus:ring-1 focus:ring-beige900/20 placeholder:text-beige900/30"
          />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-beige900/12 bg-white/60 px-4 text-sm font-medium text-beige900/80 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-beige900 px-4 text-sm font-medium text-beige100 transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                생성 중...
              </>
            ) : (
              "공유 링크 생성"
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const NetworkPage = () => {
  const router = useRouter();
  const isRouterReady = router.isReady;
  const routerAsPath = router.asPath;
  const routerQuery = router.query;
  const countryLang = useCountryLang();
  const isMobile = useIsMobile();
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const [showPreloader, setShowPreloader] = useState(true);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isMobileHeaderVisible, setIsMobileHeaderVisible] = useState(true);
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
  const [isInquiryOpen, setIsInquiryOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [inquiryEmail, setInquiryEmail] = useState("");
  const [inquiryContent, setInquiryContent] = useState("");
  const [isInquirySubmitting, setIsInquirySubmitting] = useState(false);
  const [isShareSubmitting, setIsShareSubmitting] = useState(false);
  const [landingId, setLandingId] = useState("");
  const [abtestType, setAbtestType] =
    useState<TalentNetworkAssignmentType | null>(null);
  const [hasReferralHighlight, setHasReferralHighlight] = useState(false);

  const heroSectionRef = useRef<HTMLElement | null>(null);
  const socialProofSectionRef = useRef<HTMLElement | null>(null);
  const opportunitiesSectionRef = useRef<HTMLElement | null>(null);
  const faqSectionRef = useRef<HTMLElement | null>(null);
  const footerSectionRef = useRef<HTMLDivElement | null>(null);
  const requestCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const processedReferralTokenRef = useRef<string | null>(null);
  const hasLoggedFirstScrollRef = useRef(false);
  const sectionLastLoggedAtRef = useRef<Record<NetworkSectionKey, number>>({
    hero: 0,
    social_proof: 0,
    opportunities: 0,
    faq: 0,
    footer: 0,
  });
  const lastScrollYRef = useRef(0);
  const totalMobilePositionPages = Math.ceil(
    companyRequests.length / MOBILE_POSITION_PAGE_SIZE
  );
  const mobileVisibleRequests = companyRequests.slice(
    mobilePositionPage * MOBILE_POSITION_PAGE_SIZE,
    (mobilePositionPage + 1) * MOBILE_POSITION_PAGE_SIZE
  );

  const addLandingLog = useCallback(
    async (
      type: string,
      overrides?: {
        localId?: string;
        abtestType?: string | null;
      }
    ) => {
      const resolvedLocalId = overrides?.localId || landingId;
      const resolvedAbtestType = overrides?.abtestType || abtestType;
      if (!resolvedLocalId || !resolvedAbtestType) return;

      try {
        await supabase.from("landing_logs").insert({
          local_id: resolvedLocalId,
          type,
          abtest_type: resolvedAbtestType,
          is_mobile: isMobile,
          country_lang: countryLang,
        });
      } catch (error) {
        console.error("talent network page landing log error:", error);
      }
    },
    [abtestType, countryLang, isMobile, landingId]
  );

  const openOnboarding = useCallback(
    (eventType: string, role?: string) => {
      void addLandingLog(eventType);
      setSelectedOnboardingRole(role);
      setIsOnboardingOpen(true);
    },
    [addLandingLog]
  );

  const openShareModal = useCallback(() => {
    void addLandingLog("talent_network_click_footer_share_open");
    setShareEmail("");
    setIsShareModalOpen(true);
  }, [addLandingLog]);

  const handleOpenRequest = useCallback(
    (request: CompanyRequest) => {
      void addLandingLog(`talent_network_click_request_card:${request.id}`);
      setSelectedRequest(request);
    },
    [addLandingLog]
  );

  const handleFaqToggle = useCallback(
    (index: number, isOpen: boolean) => {
      if (!isOpen) {
        void addLandingLog(`talent_network_click_faq:${index + 1}`);
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
    const resolvedLandingId = savedId || createTalentNetworkLocalId();
    if (!savedId) {
      localStorage.setItem(TALENT_NETWORK_LOCAL_ID_KEY, resolvedLandingId);
    }

    setLandingId(resolvedLandingId);

    const savedAbtestType = localStorage.getItem(
      TALENT_NETWORK_ABTEST_TYPE_KEY
    );
    const resolvedAbtestType =
      resolveTalentNetworkAssignmentType(savedAbtestType);

    if (savedAbtestType !== resolvedAbtestType) {
      localStorage.setItem(TALENT_NETWORK_ABTEST_TYPE_KEY, resolvedAbtestType);
    }

    setAbtestType(resolvedAbtestType);

    if (!savedId) {
      void addLandingLog("new_visit", {
        localId: resolvedLandingId,
        abtestType: resolvedAbtestType,
      });
      return;
    }

    if (savedAbtestType !== resolvedAbtestType) {
      localStorage.setItem(
        TALENT_NETWORK_LAST_VISIT_AT_KEY,
        String(Date.now())
      );
      void addLandingLog("new_session", {
        localId: resolvedLandingId,
        abtestType: resolvedAbtestType,
      });
    }
  }, [addLandingLog]);

  useEffect(() => {
    const queryReferral = routerQuery[TALENT_NETWORK_REFERRAL_QUERY_KEY];
    const queryToken = Array.isArray(queryReferral)
      ? queryReferral[0]
      : queryReferral;
    const urlToken = getClientSearchParam(TALENT_NETWORK_REFERRAL_QUERY_KEY);
    const storedReferral = readTalentNetworkStoredReferral();
    const activeReferralToken = urlToken || queryToken || storedReferral?.token;

    logger.log(
      "referralToken",
      activeReferralToken,
      "urlToken",
      urlToken,
      "queryToken",
      queryToken,
      queryReferral,
      Boolean(activeReferralToken)
    );

    setHasReferralHighlight(Boolean(activeReferralToken));
  }, [routerAsPath, routerQuery]);

  useEffect(() => {
    if (!landingId) return;

    const referralParam = routerQuery[TALENT_NETWORK_REFERRAL_QUERY_KEY];
    const queryToken = Array.isArray(referralParam)
      ? referralParam[0]
      : referralParam;
    const urlToken = getClientSearchParam(TALENT_NETWORK_REFERRAL_QUERY_KEY);
    const referralToken = urlToken || queryToken;

    if (!referralToken || processedReferralTokenRef.current === referralToken) {
      return;
    }

    processedReferralTokenRef.current = referralToken;

    const captureReferral = async () => {
      try {
        const result = await captureTalentNetworkReferralVisit({
          pagePath: window.location.pathname,
          token: referralToken,
          visitorLocalId: landingId,
        });

        if (
          !result.isSelfVisit &&
          result.sharerEmail &&
          isTalentNetworkReferralSource(result.source)
        ) {
          setHasReferralHighlight(true);
          writeTalentNetworkStoredReferral({
            capturedAt: new Date().toISOString(),
            sharerEmail: result.sharerEmail,
            sharerName: result.sharerName,
            source: result.source,
            token: referralToken,
          });
        }
      } catch (error) {
        processedReferralTokenRef.current = null;
        console.error("Failed to capture talent network referral", error);
      }
    };

    void captureReferral();
  }, [landingId, routerAsPath, routerQuery]);

  useEffect(() => {
    if (!landingId || !abtestType) return;

    const now = Date.now();
    const lastVisitRaw = localStorage.getItem(TALENT_NETWORK_LAST_VISIT_AT_KEY);
    const lastVisitAt = lastVisitRaw ? Number(lastVisitRaw) : null;

    if (
      !lastVisitAt ||
      Number.isNaN(lastVisitAt) ||
      now - lastVisitAt >= TALENT_NETWORK_SESSION_TIMEOUT_MS
    ) {
      void addLandingLog("new_session");
    }

    localStorage.setItem(TALENT_NETWORK_LAST_VISIT_AT_KEY, String(now));
  }, [abtestType, addLandingLog, landingId]);

  useEffect(() => {
    if (!landingId || !abtestType) return;

    const handleScroll = () => {
      if (hasLoggedFirstScrollRef.current || window.scrollY <= 0) return;

      hasLoggedFirstScrollRef.current = true;
      void addLandingLog("first_scroll_down");
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [abtestType, addLandingLog, landingId]);

  useEffect(() => {
    if (!landingId || !abtestType || showPreloader) return;

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
  }, [abtestType, addLandingLog, landingId, showPreloader]);

  const resetInquiryForm = React.useCallback(() => {
    setInquiryEmail("");
    setInquiryContent("");
  }, []);

  const closeInquiryModal = React.useCallback(() => {
    if (isInquirySubmitting) return;
    setIsInquiryOpen(false);
    resetInquiryForm();
  }, [isInquirySubmitting, resetInquiryForm]);

  useEffect(() => {
    const isOverlayOpen =
      isOnboardingOpen || selectedRequest !== null || isInquiryOpen;

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

      if (isInquiryOpen) {
        closeInquiryModal();
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
  }, [closeInquiryModal, isInquiryOpen, isOnboardingOpen, selectedRequest]);

  useEffect(() => {
    if (!copiedRequestId) return;

    const timeout = window.setTimeout(() => {
      setCopiedRequestId(null);
    }, 1400);

    return () => window.clearTimeout(timeout);
  }, [copiedRequestId]);

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

      if (Math.abs(delta) < MOBILE_HEADER_SCROLL_DELTA_THRESHOLD) {
        return;
      }

      if (delta > 0) {
        setIsMobileHeaderVisible(false);
      } else {
        setIsMobileHeaderVisible(true);
      }

      lastScrollYRef.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isMobile]);

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
    void addLandingLog(`talent_network_click_request_share:${request.id}`);
    try {
      const shareUrl = new URL(
        window.location.pathname,
        window.location.origin
      );
      shareUrl.searchParams.set(SHARE_REQUEST_QUERY_KEY, request.id);

      await copyTextToClipboard(shareUrl.toString());
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

  const handleCreateFooterShare = async () => {
    const trimmedEmail = shareEmail.trim().toLowerCase();
    if (isShareSubmitting) return;

    if (!trimmedEmail) {
      showToast({
        message: "이메일을 입력해 주세요.",
        variant: "white",
      });
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      showToast({
        message: "유효한 이메일을 입력해 주세요.",
        variant: "white",
      });
      return;
    }

    setIsShareSubmitting(true);

    try {
      const { url } = await createTalentNetworkReferralLink({
        email: trimmedEmail,
        pagePath: window.location.pathname,
        sharerLocalId: landingId || null,
        source: TALENT_NETWORK_REFERRAL_SOURCE_LANDING_FOOTER,
      });

      await copyTextToClipboard(url);
      void addLandingLog("talent_network_click_footer_share_copy");
      setIsShareModalOpen(false);
      setShareEmail("");
      showToast({
        message: "공유 링크가 복사되었습니다.",
        variant: "white",
      });
    } catch (error) {
      console.error("Failed to create footer share link", error);
      showToast({
        message: "공유 링크 생성에 실패했습니다.",
        variant: "error",
      });
    } finally {
      setIsShareSubmitting(false);
    }
  };

  const handleSubmitInquiry = async () => {
    const trimmedEmail = inquiryEmail.trim();
    const trimmedContent = inquiryContent.trim();

    if (isInquirySubmitting) return;

    if (!trimmedEmail) {
      showToast({
        message: "이메일을 입력해 주세요.",
        variant: "white",
      });
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      showToast({
        message: "올바른 이메일 형식으로 입력해 주세요.",
        variant: "white",
      });
      return;
    }

    if (!trimmedContent) {
      showToast({
        message: "문의 내용을 입력해 주세요.",
        variant: "white",
      });
      return;
    }

    setIsInquirySubmitting(true);
    void addLandingLog("talent_network_click_inquiry_submit");

    try {
      const response = await fetch("/api/feedback/network", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: trimmedEmail,
          content: trimmedContent,
          pagePath:
            typeof window !== "undefined"
              ? window.location.pathname
              : "/network",
        }),
      });

      const data = await response.json();

      if (!response.ok || data?.error) {
        throw new Error(data?.error ?? "문의 저장에 실패했습니다.");
      }

      setIsInquiryOpen(false);
      resetInquiryForm();
      showToast({
        message: "문의가 접수되었습니다.",
        variant: "white",
      });
    } catch (error) {
      console.error("network inquiry submit failed:", error);
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "문의 접수 중 오류가 발생했습니다.",
        variant: "error",
      });
    } finally {
      setIsInquirySubmitting(false);
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

        {/* <div className="fixed bottom-4 left-4 z-[170] rounded-xl border border-beige900/15 bg-beige200/95 p-3 shadow-[0_12px_30px_rgba(37,20,6,0.14)] backdrop-blur">
          <div className="text-[11px] font-medium tracking-[0.14em] text-beige900/45">
            AB Test Preview
          </div>
          <div className="mt-1 text-sm text-beige900/70">
            Current:{" "}
            <span className="font-semibold text-beige900">
              {abtestType === TALENT_NETWORK_ABTEST_TYPE_B ? "B" : "A"}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                handleVariantOverride(TALENT_NETWORK_ABTEST_TYPE_A)
              }
              className={`inline-flex h-9 min-w-[40px] items-center justify-center rounded-lg border px-3 text-sm font-medium transition ${
                abtestType === TALENT_NETWORK_ABTEST_TYPE_A
                  ? "border-beige900 bg-beige900 text-beige100"
                  : "border-beige900/15 bg-white/70 text-beige900/75 hover:bg-white"
              }`}
            >
              A
            </button>
            <button
              type="button"
              onClick={() =>
                handleVariantOverride(TALENT_NETWORK_ABTEST_TYPE_B)
              }
              className={`inline-flex h-9 min-w-[40px] items-center justify-center rounded-lg border px-3 text-sm font-medium transition ${
                abtestType === TALENT_NETWORK_ABTEST_TYPE_B
                  ? "border-beige900 bg-beige900 text-beige100"
                  : "border-beige900/15 bg-white/70 text-beige900/75 hover:bg-white"
              }`}
            >
              B
            </button>
          </div>
        </div> */}

        <motion.nav
          initial={false}
          animate={{
            y: isMobile && !isMobileHeaderVisible ? -88 : 0,
          }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 top-0 z-50 bg-beige200 backdrop-blur-lg"
        >
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
              onClick={() => openOnboarding("talent_network_click_nav_join")}
              className="inline-flex"
            />
          </div>
        </motion.nav>

        <main
          id="top"
          className="mx-auto flex max-w-[1160px] flex-col px-4 pb-24 pt-[72px] md:pt-[96px] "
        >
          <section
            ref={heroSectionRef}
            data-section="hero"
            className="pt-10 text-center"
          >
            <Reveal once delay={0.06} className="mx-auto mt-6 max-w-[900px]">
              <h2
                className={`${titleTextClassName} text-beige900 text-4xl md:text-5xl`}
              >
                {/* GET MATCHED TO TOP AI STARTUPS */}
                {abtestType === TALENT_NETWORK_ABTEST_TYPE_B ? (
                  <>
                    <span className="block">
                      <StaggerText text="Access the World's" />
                    </span>
                    <span className="block mt-3">
                      <StaggerText
                        text="Most Elite AI Positions."
                        delay={0.14}
                      />
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block">
                      <StaggerText text="We Handle Your Profile with Care." />
                    </span>
                    <span className="block md:hidden mt-3">
                      <StaggerText
                        text="You Get the Right Roles."
                        delay={0.14}
                      />
                    </span>
                    <span className="hidden md:block mt-3">
                      <StaggerText
                        text="You Get the Right Roles."
                        delay={0.14}
                      />
                    </span>
                  </>
                )}
              </h2>
            </Reveal>

            <Reveal once delay={0.18}>
              <div className="mt-8 flex flex-col justify-center items-center text-lg tracking-[-0.03em] text-beige900/70">
                {abtestType === TALENT_NETWORK_ABTEST_TYPE_B ? (
                  <>
                    <div>
                      Direct backdoor to confidential AI unicorns backed by
                      top-tier Global VCs.
                    </div>
                    <div>
                      Skip the HR screen and match directly with founders.
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      We handle your profile carefully and connect you to top
                      opportunities.
                    </div>
                    <div>
                      No spam, no public exposure, no irrelevant outreach.
                    </div>
                  </>
                )}
              </div>

              <div className="mt-8 flex flex-row items-center justify-center gap-2 text-base tracking-[-0.03em] text-beige900/50 flex-wrap">
                <Pill label="Part-time (4~12 hrs/wk)" />
                <Pill label="Founding Member / CTO" />
                <Pill label="Intern" />
              </div>
            </Reveal>

            <Reveal once delay={0.24} className="mt-12">
              <NetworkButton
                label={
                  abtestType === TALENT_NETWORK_ABTEST_TYPE_B
                    ? "Initiate Match"
                    : "Start with Harper"
                }
                highlighted={hasReferralHighlight}
                onClick={() =>
                  openOnboarding("talent_network_click_hero_initiate_match")
                }
              />
            </Reveal>
          </section>

          <section
            ref={socialProofSectionRef}
            data-section="social_proof"
            className="mt-2"
          >
            <Reveal
              once
              delay={0.08}
              className="text-center justify-center items-center mt-8 mb-12"
            >
              <div className="flex flex-row items-center justify-center gap-2">
                <div className="relative items-baseline gap-1 font-normal flex text-[15px] md:text-base">
                  <div>100+ engineers and researchers From </div>
                </div>
                <div className="flex -space-x-2">
                  {schoolLogos.map((school) => (
                    <div
                      key={school.name}
                      className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-beige500 border border-beige900/20"
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

            <VCLogos abtestType={abtestType} />
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
                      void addLandingLog(
                        "talent_network_click_mobile_positions_prev"
                      );
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
                      void addLandingLog(
                        "talent_network_click_mobile_positions_next"
                      );
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
                              className="w-full text-left text-sm md:text-[15px] leading-[1.6] tracking-[-0.01em] text-beige900/80"
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

            <Reveal once delay={0.18} className="mt-8 pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  void addLandingLog("talent_network_click_inquiry_open");
                  setIsInquiryOpen(true);
                }}
                className="text-sm font-medium tracking-[-0.03em] text-beige900/75 underline underline-offset-4 transition hover:text-beige900 md:text-base"
              >
                문의하기
              </button>
            </Reveal>
          </section>
        </main>
        <div ref={footerSectionRef} data-section="footer">
          <br />
          <br />
          <br />
          <br />
          <Reveal once delay={0.32} className="w-full">
            <div className="flex flex-col gap-8 items-center justify-center w-full mt-28 mb-20">
              <Image
                src="/images/objects.png"
                alt="objects"
                width={256}
                height={256}
                className="w-44 sm:w-52 md:w-64"
              />
              <div className="flex flex-col items-center gap-3">
                <NetworkButton
                  label={
                    abtestType === TALENT_NETWORK_ABTEST_TYPE_B
                      ? "Initiate Match"
                      : "Start with Harper"
                  }
                  highlighted={hasReferralHighlight}
                  onClick={() =>
                    openOnboarding("talent_network_click_last_initiate_match")
                  }
                />
                <div className="flex flex-col items-center gap-2 w-[360px]">
                  <NetworkButton
                    label="Harper 공유하기"
                    variant="secondary"
                    showArrow={false}
                    className="h-11 w-[180px]"
                    onClick={openShareModal}
                  />
                  <div className="whitespace-pre-wrap break-words px-1 py-0.5 leading-[1.2] w-full text-sm text-center rounded-sm mt-1 text-beige900/80">
                    링크를 공유받은 사람이 Harper를 통해 채용되면 감사의 의미로
                    양쪽에 300만원 상당의 허먼밀러 의자를 보내드립니다.
                  </div>
                </div>
              </div>
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
              highlightPrimaryCta={hasReferralHighlight}
              shareButtonLabel={
                copiedRequestId === selectedRequest.id
                  ? "링크 복사됨"
                  : "공유하기"
              }
              onGetMatched={() => {
                void addLandingLog(
                  `talent_network_click_request_get_matched:${selectedRequest.id}`
                );
                setSelectedRequest(null);
                openOnboarding(
                  `talent_network_click_request_modal_open_onboarding:${selectedRequest.id}`,
                  selectedRequest.role
                );
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isInquiryOpen && (
            <InquiryModal
              email={inquiryEmail}
              content={inquiryContent}
              isSubmitting={isInquirySubmitting}
              onClose={closeInquiryModal}
              onSubmit={() => void handleSubmitInquiry()}
              onEmailChange={setInquiryEmail}
              onContentChange={setInquiryContent}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isShareModalOpen && (
            <ReferralShareModal
              email={shareEmail}
              isSubmitting={isShareSubmitting}
              onClose={() => setIsShareModalOpen(false)}
              onEmailChange={setShareEmail}
              onSubmit={() => void handleCreateFooterShare()}
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
                onClick={() => {
                  void addLandingLog("talent_network_click_onboarding_close");
                  setIsOnboardingOpen(false);
                }}
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
  { key: "sequoia2", src: "/images/wonderful.png", width: 154 },
  { key: "mistral", src: "/images/mistral.png", width: 142 },
  { key: "cohere", src: "/svgs/cohere.svg", width: 124 },
];

function VCLogos({ abtestType }: { abtestType: string | null }) {
  const items = [...vcLogos];
  const showsBMessaging = usesTalentNetworkBExperience(abtestType);

  return (
    <div className="relative w-[90%] mx-auto overflow-hidden mt-16">
      <Reveal once delay={0.08} className="w-full text-center">
        <div className="w-full text-center text-beige900 text-base md:text-lg leading-[1.55] tracking-[-0.03em] font-medium">
          Partnering with{" "}
          <span className="text-beige900/50">Most Exciting Tech companies</span>{" "}
          funded by the world&apos;s elite.
        </div>
        <div className="w-full text-center text-beige900 text-base md:text-lg leading-[1.55] tracking-[-0.03em] font-medium mt-2">
          It&apos;s worth joining even if you&apos;re not actively looking.
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
