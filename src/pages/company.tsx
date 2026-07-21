import Head from "next/head";
import Link from "next/link";
import Reveal from "@/components/landing/Animation/Reveal";
import StaggerText from "@/components/landing/Animation/StaggerText";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangleIcon,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  CheckCircle2,
  CircleHelp,
  Github,
  HelpCircle,
  Lightbulb,
  LucideLink,
  SearchCheck,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/toast/toast";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import Image from "next/image";
import { useRouter } from "next/router";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEventHandler,
} from "react";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import Face from "@/components/common/Face";
import { MessagesProvider, type Locale } from "@/i18n/useMessage";
import { resolveOfficialJobsLocaleFromRequest } from "@/lib/officialJobs/copy";
import type { GetServerSideProps } from "next";

const fontMain =
  "text-[22px] font-normal leading-[1.5] text-neutral-900 md:text-[28px]";
const fontBig =
  "text-[20px] font-normal leading-[1.4] text-neutral-900 md:text-[26px]";
const fontMedium =
  "text-[15px] font-light leading-[1.4] text-neutral-900 md:text-[17px]";
const fontSmall =
  "text-[14px] font-light leading-[1.25] text-neutral-800 md:text-[15px]";

const CONTACT_SALES_SECTION_ID = "company-contact";
const CONTACT_SALES_HREF = `#${CONTACT_SALES_SECTION_ID}`;
const COMPANY_PAGE_URLS = {
  canonicalUrl: "https://matchharper.com/company",
  imageUrl: "https://matchharper.com/images/logos/thumbnail.png",
} as const;

const COMPANY_PAGE_COPY = {
  ko: {
    meta: {
      title: "Harper for Companies | Top talent를 연결하는 AI 리크루팅 파트너",
      description:
        "Harper는 후보자와 직접 대화해 연봉 범위, 이동 의향, 관심도까지 확인하고 회사가 바로 인터뷰할 수 있는 Top talent만 선별해 연결합니다.",
      ogLocale: "ko_KR",
      language: "ko-KR",
    },
    hero: {
      title: ["우리 팀에 적합한 인재를", "자연스러운 소개로 연결해드립니다."],
      description: [
        "Harper는 인재들과 회사와 직접 대화하며 그들의 맥락을 이해하고,",
        "적합한 연결을 찾고, 자연스럽게 이어주는 AI Agent입니다.",
      ],
      cta: "미팅 신청하기",
    },
    socialProof: {
      talentTitle: "이 곳의 인재들이 신뢰합니다.",
      companyTitle: "최고의 팀들과 함께하고 있습니다.",
      testimonial:
        "Harper는 최고의 채용파트너입니다. 까다로운 조건을 붙였지만 모든 조건을 만족하는 사람을 한달만에 20명을 연결받았고, 채용까지 바로 이어졌습니다.",
    },
    chat: {
      request: "AI infra를 리드할 senior backend engineer가 필요합니다.",
      prompt: "좋습니다. 팀 상황과 꼭 맞아야 하는 조건을 알려주세요.",
      criteria:
        "LLM serving, Python/Rust, 한국/APAC 확장에 관심 있는 분이면 좋겠습니다.",
      answer:
        "정리했습니다. Harper가 연봉 범위, 이동 의향, AI 제품 관심도까지 확인한 후보자만 추려 소개드릴게요.",
      notificationTitle: "OO님을 연결해드립니다.",
      notificationBody: "미팅 날짜를 잡아보세요.",
    },
    candidateProfile: {
      summary:
        "ex-NVIDIA, ex-Coupang 출신으로 LLM serving과 distributed systems를 실제 운영 규모에서 설계해온 엔지니어입니다.",
      recommendationLabel: "추천 이유",
      recommendation: [
        "현재 이직을 적극적으로 진행하고 있지는 않지만, AI 제품을 직접 소유하고 작은 팀에서 영향력을 넓힐 수 있는 역할에는 열려 있습니다. Harper와의 대화에서 해당 포지션에 구체적인 관심을 표시했습니다.",
        "Kakao에서 Attention Cache 최적화를 통해 월 GPU 비용 28% 절감 경험이 있고, 팀장으로 리딩 경험이 있습니다. 지난번에 핏이 맞다고 이야기하셨던 OOO님과 비슷한 경험을 가지고 있습니다.",
        "Harper와의 대화 및 Github 확인 결과 최근까지 사이드 프로젝트로 본인 만의 제품을 만들고 유저를 모아본 경험이 있습니다.",
      ],
      requirements: [
        {
          status: "positive",
          title: "요구사항 1 충족",
          description:
            "Nvidia에서 Rust 기반 LLM serving pipeline을 설계하고 운영한 경험이 있습니다. (1년 6개월)",
        },
        {
          status: "positive",
          title: "요구사항 2 충족",
          description:
            "Optimization팀에서 최근 8개월간 팀장으로 재직 중입니다.",
        },
        {
          status: "info",
          title: "요구사항 3 확인 필요",
          description:
            "인터뷰 시점으로부터 4주 안에 합류가 가능한지에 대해서는 직접 확인이 필요합니다.",
        },
      ],
      confirmedLabel: "Harper가 직접 확인한 정보",
      confirmedItems: [
        "희망 연봉이 제시한 연봉 범위에 충족됩니다.",
        "기술적 토론이 가능한 수준의 영어 회화 실력을 가지고 있습니다.",
      ],
      scheduleInterview: "인터뷰 일정 잡기",
    },
    agents: {
      title: "Harper의 방식",
      requestCard: {
        title: "원하는 인재에 대해 자세히 알려주세요.",
        description:
          "역할명보다 팀 상황, 기술적 요구사항, 충족되어야 하는 내부적 기준을 전부 알려주세요. Harper가 후보자와 직접 대화해 정보를 얻고, 메일로 소개합니다.",
      },
      verifiedCard: {
        title: "이미 대화하고 검증한 인재만 연결합니다.",
        description:
          "Harper는 후보자와 직접 대화해 외부에서 알 수 없는 맥락을 파악하고 이를 기반으로 연결합니다. 바로 미팅을 잡을 수 있는 상태로 연결해드립니다.",
      },
    },
    closing: [
      "Harper는 24/7 일하는 AI 에이전트입니다.",
      "가장 채용하기 어려운 역할도, 일주일 안에 적합한 사람을 연결합니다.",
      "역할을 설명하면 Harper는 팀에게 맞는 사람이 누구인지 정의하고, 직접 대화한 인재들 중 그 기준에 맞는 사람을 찾아냅니다.",
      "회사를 대신해 기회를 소개하고 설득한 뒤, 실제로 관심을 보인 후보자만 인터뷰로 연결합니다.",
      "좋은 사람들의 목록이 아니라, 지금 바로 채용 대화를 시작할 수 있는 사람을 연결합니다.",
    ],
    contact: {
      title: "지금 필요한 Top talent를 함께 찾아보세요.",
      description:
        "Harper는 후보자와 직접 대화해 연봉 범위, 이동 의향, 관심도처럼 프로필만으로 알 수 없는 정보를 확인합니다. 그래서 회사는 많은 이력서를 검토하는 대신, 바로 인터뷰할 만한 소수의 후보자만 받을 수 있습니다.",
      talentLink: "For Talents",
      help: "궁금한 점이 있으신가요?",
      formTitle: "신청하기",
      email: "이메일*",
      name: "이름*",
      organization: "회사 또는 팀명*",
      organizationPlaceholder: "회사 또는 팀명",
      purpose: "채용 목표*",
      purposePlaceholder:
        "예: 한국/APAC 확장을 리드할 senior backend engineer를 찾고 있습니다.",
      submit: "신청하기",
      submitting: "신청 중...",
      submittedTitle: "신청이 접수되었습니다.",
      submittedBody: [
        "남겨주신 내용을 확인한 뒤, 최대한 빠른 시일에 연락드리겠습니다.",
        "감사합니다.",
      ],
      confirm: "확인",
      share: "공유하기",
      toast: {
        copied: "링크가 복사되었습니다.",
        copyFailed: "링크 복사에 실패했습니다.",
        emailRequired: "이메일을 입력해주세요.",
        emailInvalid: "유효한 이메일 주소를 입력해주세요.",
        companyEmailRequired: "회사 이메일을 입력해주세요.",
        nameRequired: "이름을 입력해주세요.",
        organizationRequired: "회사 또는 팀명을 입력해주세요.",
        purposeRequired: "채용 목표를 입력해주세요.",
        submitFailed: "미팅 신청 제출에 실패했습니다.",
      },
    },
  },
  en: {
    meta: {
      title: "Harper for Companies | An AI Recruiting Partner for Top Talent",
      description:
        "Harper speaks directly with candidates to confirm compensation expectations, relocation preferences, and genuine interest, then introduces only top talent your team is ready to interview.",
      ogLocale: "en_US",
      language: "en-US",
    },
    hero: {
      title: ["Warm intros to candidates", " who already fit."],
      description: [
        "Harper speaks directly with talent and companies to understand the context on both sides, finds the right match, and brings everyone together as your AI agent.",
      ],
      cta: "Request a meeting",
    },
    socialProof: {
      talentTitle: "Trusted by talent from",
      companyTitle: "Working with exceptional teams",
      testimonial:
        "Harper is the best recruiting partner we have worked with. We had a demanding set of requirements, and within a month Harper introduced us to 20 people who met every one of them—leading directly to a hire.",
    },
    chat: {
      request: "We need a senior backend engineer to lead AI infrastructure.",
      prompt: "Great. Tell me about the team and your must-have criteria.",
      criteria:
        "Someone experienced with LLM serving and Python/Rust who is excited about expanding across Korea and APAC.",
      answer:
        "Got it. I’ll introduce only candidates whose compensation range, relocation preferences, and interest in AI products Harper has personally confirmed.",
      notificationTitle: "Meet your candidate",
      notificationBody: "Choose a time to meet.",
    },
    candidateProfile: {
      summary:
        "An ex-NVIDIA and ex-Coupang engineer who has designed LLM serving and distributed systems at production scale.",
      recommendationLabel: "Why we recommend Alex",
      recommendation: [
        "Alex is not actively searching, but is open to a role with ownership of an AI product and broader impact on a small team. In a conversation with Harper, Alex expressed specific interest in this opportunity.",
        "At Kakao, Alex reduced monthly GPU costs by 28% through Attention Cache optimization and has experience leading a team. The background is similar to the candidate you previously identified as a strong fit.",
        "Harper's conversation and GitHub review also confirmed recent experience building a side project from scratch and attracting real users.",
      ],
      requirements: [
        {
          status: "positive",
          title: "Requirement 1 met",
          description:
            "Designed and operated a Rust-based LLM serving pipeline at NVIDIA. (1 year, 6 months)",
        },
        {
          status: "positive",
          title: "Requirement 2 met",
          description:
            "Has led the Optimization team for the past eight months.",
        },
        {
          status: "info",
          title: "Requirement 3 needs confirmation",
          description:
            "Availability to join within four weeks of the interview still needs to be confirmed directly.",
        },
      ],
      confirmedLabel: "Details confirmed directly by Harper",
      confirmedItems: [
        "Compensation expectations are within the proposed range.",
        "English fluency is sufficient for technical discussions.",
      ],
      scheduleInterview: "Schedule an interview",
    },
    agents: {
      title: "How Harper works",
      requestCard: {
        title: "Tell us what the right person looks like.",
        description:
          "Go beyond the job title: share your team context, technical bar, and non-negotiables. Harper speaks directly with candidates and introduces them over Slack or email only when the fit is clear.",
      },
      verifiedCard: {
        title: "Meet only talent we have spoken with and vetted.",
        description:
          "Harper speaks directly with candidates to confirm your requirements, their interest, compensation expectations, and relocation preferences—so you can decide whether to interview as soon as an introduction arrives.",
      },
    },
    closing: [
      "Even for the hardest roles to fill, Harper gives you someone worth meeting within a week.",
      "Describe the role, and Harper defines who will thrive on your team—then finds that person among talent we have already spoken with.",
      "We present your opportunity, answer questions, and build genuine interest before introducing only the candidates who want to interview.",
      "You do not get another list of names. You meet people who are ready to start a hiring conversation now.",
    ],
    contact: {
      title: "Let's find the top talent your team needs now.",
      description:
        "Harper speaks directly with candidates to uncover what a profile cannot show—compensation expectations, relocation preferences, and genuine interest. Instead of reviewing a pile of resumes, your team receives a small group of candidates who are truly worth interviewing.",
      talentLink: "For Talents",
      help: "Have a question?",
      formTitle: "Request a meeting",
      email: "Email*",
      name: "Name*",
      organization: "Company or team*",
      organizationPlaceholder: "Company or team",
      purpose: "Hiring goal*",
      purposePlaceholder:
        "e.g. We are looking for a senior backend engineer to lead our Korea/APAC expansion.",
      submit: "Submit request",
      submitting: "Submitting...",
      submittedTitle: "Your request has been received.",
      submittedBody: [
        "We’ll review what you shared and get back to you as soon as possible.",
        "Thank you.",
      ],
      confirm: "Done",
      share: "Share",
      toast: {
        copied: "Link copied.",
        copyFailed: "Could not copy the link.",
        emailRequired: "Please enter your email.",
        emailInvalid: "Please enter a valid email address.",
        companyEmailRequired: "Please use your company email.",
        nameRequired: "Please enter your name.",
        organizationRequired: "Please enter your company or team.",
        purposeRequired: "Please describe your hiring goal.",
        submitFailed: "We could not submit your meeting request.",
      },
    },
  },
} as const;

type CompanyPageCopy = (typeof COMPANY_PAGE_COPY)[Locale];

function buildCompanyPageStructuredData(copy: CompanyPageCopy) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: "Harper for Companies",
    url: COMPANY_PAGE_URLS.canonicalUrl,
    image: COMPANY_PAGE_URLS.imageUrl,
    description: copy.meta.description,
    serviceType: "AI recruiting and candidate sourcing",
    areaServed: ["KR", "US", "APAC"],
    provider: {
      "@type": "Organization",
      name: "Harper",
      url: "https://matchharper.com/",
    },
  };
}

const initialContactSalesForm = {
  name: "",
  email: "",
  organization: "",
  purpose: "",
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "naver.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.kr",
  "icloud.com",
  "me.com",
  "mac.com",
  "daum.net",
  "hanmail.net",
  "kakao.com",
  "nate.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "mail.com",
]);

const isPersonalEmailDomain = (value: string) => {
  const [, domain = ""] = value.trim().toLowerCase().split("@");
  return PERSONAL_EMAIL_DOMAINS.has(domain.replace(/\.$/, ""));
};

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

const inputClass =
  "mt-2 h-[43px] w-full rounded-[3px] border border-[#cfcac0] bg-[#fbfaf7] px-3 text-[15px] font-light text-neutral-primary outline-none transition-colors placeholder:text-neutral-muted focus:border-neutral-950";

const textareaClass =
  "mt-2 min-h-[76px] w-full resize-none rounded-[3px] border border-[#cfcac0] bg-[#fbfaf7] px-3 py-3 text-[15px] font-light leading-[1.4] text-neutral-primary outline-none transition-colors placeholder:text-neutral-muted focus:border-neutral-950";

const labelClass = "block text-[13px] font-normal text-neutral-primary";

const YONSEI_LOGO_SRC =
  "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/8FCgNqlkK-QnA_6-52ZbfFJ_Wz_Gsm9zkPybokRMl8R0H4ZgUL0wu1lggVUIHhEwIxGXPOYR9gw9RDFxiW46Eg.svg";

type SocialProofLogo = {
  src: string;
  name: string;
  width: number;
  hideOnMobile?: boolean;
};

const logos: readonly SocialProofLogo[] = [
  { src: "/images/logos/sn.png", name: "SNU", width: 44 },
  { src: YONSEI_LOGO_SRC, name: "Yonsei University", width: 62 },
  { src: "/images/logos/kai.png", name: "KAIST", width: 68 },
  { src: "/images/logos/cmu.png", name: "CMU", width: 62 },
  { src: "/images/logos/stanfordtext.png", name: "Stanford", width: 84 },
  { src: "/images/logos/harvard.svg", name: "Harvard", width: 80 },
  {
    src: "/images/logos/torontotext.png",
    name: "University of Toronto",
    width: 124,
  },
  { src: "/images/logos/toss.png", name: "Toss", width: 64 },
  { src: "/images/logos/kakao.svg", name: "Kakao", width: 58 },
  { src: "/svgs/cohere.svg", name: "Cohere", width: 78, hideOnMobile: true },
  { src: "/images/logos/amazon.svg", name: "Amazon", width: 60 },
  { src: "/images/logos/naver.svg", name: "Naver", width: 60 },
  { src: "/images/logos/moloco.png", name: "Moloco", width: 90 },
  { src: "/images/logos/nvidia.svg", name: "NVIDIA", width: 82 },
  { src: "/images/logos/microsoft.svg", name: "Microsoft", width: 76 },
  { src: "/images/logos/samsung.svg", name: "Samsung", width: 104 },
] as const;

const darkBtnClass =
  "bg-linear-to-b shadow-xs from-[#232323] to-[#101010] text-neutral-00 transition-colors hover:bg-black border border-black/40";

function PillLink({
  children,
  href = "#",
  onClick,
  variant = "light",
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  variant?: "dark" | "light";
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-full px-6 text-[15px] font-light",
        variant === "dark"
          ? darkBtnClass
          : "border border-neutral-1000-a10 bg-bg-floating text-neutral-primary shadow-sm transition-colors hover:bg-bg-weak"
      )}
    >
      {children}
    </Link>
  );
}

const Card = ({
  className,
  background,
  children,
  title,
  description,
}: {
  className?: string;
  background?: React.ReactNode;
  children: React.ReactNode;
  title: string;
  description: string;
}) => {
  return (
    <div
      className={cn(
        "relative min-h-[600px] flex flex-col overflow-hidden rounded-2xl bg-neutral-100 border border-neutral-1000-a05",
        className
      )}
    >
      {background && <div className="absolute inset-0">{background}</div>}
      <div className="relative z-10 h-[80%]">{children}</div>
      <div className="w-full p-6 flex flex-col items-start justify-center gap-4 mb-0 z-10">
        <div
          className={cn(
            fontSmall,
            background ? "text-neutral-00/85" : "text-neutral-muted"
          )}
        >
          {title}
        </div>
        <div className={cn(fontSmall, background && "text-neutral-00")}>
          {description}
        </div>
      </div>
    </div>
  );
};

function TalentRequestChatMockup({ copy }: { copy: CompanyPageCopy["chat"] }) {
  const [isThinking, setIsThinking] = useState(true);
  const [visibleAnswer, setVisibleAnswer] = useState("");
  const [isGmailNotificationVisible, setIsGmailNotificationVisible] =
    useState(false);

  useEffect(() => {
    let phaseTimer: ReturnType<typeof setTimeout> | undefined;
    let typingTimer: ReturnType<typeof setInterval> | undefined;
    let notificationTimer: ReturnType<typeof setTimeout> | undefined;
    let isCancelled = false;
    const answerCharacters = Array.from(copy.answer);

    const runCycle = () => {
      if (isCancelled) return;

      setIsThinking(true);
      setVisibleAnswer("");
      setIsGmailNotificationVisible(false);

      phaseTimer = setTimeout(() => {
        if (isCancelled) return;

        setIsThinking(false);
        let characterIndex = 0;

        typingTimer = setInterval(() => {
          characterIndex += 1;
          setVisibleAnswer(answerCharacters.slice(0, characterIndex).join(""));

          if (characterIndex >= answerCharacters.length) {
            if (typingTimer) clearInterval(typingTimer);
            typingTimer = undefined;
            notificationTimer = setTimeout(() => {
              if (!isCancelled) setIsGmailNotificationVisible(true);
            }, 350);
            phaseTimer = setTimeout(runCycle, 6500);
          }
        }, 45);
      }, 2200);
    };

    runCycle();

    return () => {
      isCancelled = true;
      if (phaseTimer) clearTimeout(phaseTimer);
      if (typingTimer) clearInterval(typingTimer);
      if (notificationTimer) clearTimeout(notificationTimer);
    };
  }, [copy.answer]);

  return (
    <div className="relative z-10 h-full w-full overflow-hidden p-1 text-neutral-00">
      <div className="relative mx-auto mt-16 max-w-[310px] space-y-4 text-[13px] font-normal">
        <div className="ml-auto w-fit max-w-[88%] rounded-xl border border-white/45 px-4 py-2">
          {copy.request}
        </div>
        <div className="mr-auto w-fit max-w-[88%] rounded-2xl bg-bg-floating px-4 py-3 text-neutral-primary">
          {copy.prompt}
        </div>
        <div className="ml-auto w-fit max-w-[88%] rounded-xl border border-white/45 px-4 py-2">
          {copy.criteria}
        </div>
        <div
          className={cn(
            "harper-reply-bubble mr-auto bg-bg-floating px-4 py-3 text-neutral-primary",
            !isThinking && "harper-reply-bubble-answer"
          )}
        >
          {isThinking ? (
            <div className="harper-thinking flex items-center gap-1">
              <span>Thinking</span>
              <span className="inline-flex gap-0.5">
                <span className="harper-thinking-dot">.</span>
                <span className="harper-thinking-dot">.</span>
                <span className="harper-thinking-dot">.</span>
              </span>
            </div>
          ) : (
            <div className="harper-answer">{visibleAnswer}</div>
          )}
        </div>
        <div
          className={cn(
            "liquid-glass-notification -mt-2 flex w-full max-w-[286px] items-center gap-2.5 rounded-xl px-3 py-2.5 text-neutral-primary transition-all duration-500 will-change-transform",
            isGmailNotificationVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0"
          )}
        >
          <span className="liquid-glass-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Image
              src="/images/logos/gmail.svg"
              alt="Gmail"
              width={18}
              height={18}
              className="h-[18px] w-[18px] shrink-0"
            />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium leading-4">
              {copy.notificationTitle}
            </div>
            <div className="truncate text-[11px] font-light leading-4 text-neutral-800">
              {copy.notificationBody}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CandidateProfileMockup({
  copy,
}: {
  copy: CompanyPageCopy["candidateProfile"];
}) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute right-0 top-0 flex h-full w-[92%] -mt-4 flex-col justify-end overflow-hidden rounded-bl-xl bg-bg-floating px-4 pb-4 shadow-sm md:w-[86%] xl:px-5 xl:pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src="/images/person1.png"
            alt="Candidate profile"
            width={52}
            height={52}
            className="h-[52px] w-[52px] shrink-0 rounded-full object-cover"
          />
          <div className="min-w-0">
            <div className="mt-1 truncate text-[18px] font-normal leading-none text-neutral-primary">
              Alex Kim
            </div>
            <div className="mt-1 truncate text-[12px] font-light leading-4 text-neutral-muted">
              Senior AI Infrastructure Engineer
            </div>
          </div>
        </div>

        <p className="mt-3 text-[13px] md:text-[14px] font-light leading-[1.4] text-neutral-primary">
          {copy.summary}
        </p>

        <section className="mt-3">
          <div className="flex items-center gap-2 text-[12px] font-normal text-primary">
            {copy.recommendationLabel}
          </div>
          <p className="mt-1 text-[12px] w-[140%] font-light leading-[1.4] text-neutral-800">
            {copy.recommendation.map((paragraph, index) => (
              <span key={paragraph}>
                {index > 0 ? <br /> : null}
                {paragraph}
              </span>
            ))}
          </p>
        </section>

        <div className="mt-6 space-y-3">
          {copy.requirements.map((requirement) => {
            const isPositive = requirement.status === "positive";
            const Icon = isPositive ? Check : AlertTriangleIcon;

            return (
              <div key={requirement.title} className="flex items-start gap-2.5">
                <div className="min-w-0">
                  <div
                    className={cn(
                      "text-[12px] font-normal leading-4 flex items-center gap-1",
                      isPositive ? "text-positive" : "text-info"
                    )}
                  >
                    {requirement.title}
                    <span
                      className={cn(
                        "shrink-0 items-center justify-center rounded-full",
                        isPositive ? "text-positive" : "text-info"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] font-light leading-4 text-neutral-800">
                    {requirement.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <section className="mt-6">
          <div className="flex items-center gap-1 text-[12px] font-normal text-primary">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
            {copy.confirmedLabel}
          </div>
          <ul className="mt-2 space-y-1.5">
            {copy.confirmedItems.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-[11.5px] font-light leading-4 text-neutral-800"
              >
                <span>- {item}</span>
              </li>
            ))}
          </ul>
        </section>

        <button
          type="button"
          className="mt-4 text-primary hover:text-primary-dark transition-colors flex items-center gap-1 text-[13px] font-normal"
        >
          <span className="inline-flex items-center gap-2">
            {copy.scheduleInterview}
          </span>
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

function AgentsSection({ copy }: { copy: CompanyPageCopy }) {
  return (
    <Section bgColor="bg-neutral-00">
      <div className="mx-auto grid w-full gap-8 md:grid-cols-2">
        <h2 className={cn(fontBig, "max-w-[620px]")}>{copy.agents.title}</h2>
      </div>
      <div className="mx-auto mt-10 grid w-full gap-4 md:grid-cols-2">
        <Card
          title={copy.agents.requestCard.title}
          description={copy.agents.requestCard.description}
          background={
            <>
              <Image
                src="/images/bluesky.jpg"
                alt=""
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-neutral-950/10" />
            </>
          }
        >
          <TalentRequestChatMockup copy={copy.chat} />
        </Card>
        <Card
          title={copy.agents.verifiedCard.title}
          description={copy.agents.verifiedCard.description}
        >
          <CandidateProfileMockup copy={copy.candidateProfile} />
        </Card>
      </div>
    </Section>
  );
}

const Section = ({
  children,
  bgColor = "bg-neutral-100",
  className,
  id,
}: {
  children: React.ReactNode;
  bgColor?: string;
  className?: string;
  id?: string;
}) => {
  return (
    <div id={id} className={cn("w-full py-16 md:py-24", bgColor, className)}>
      <section className="mx-auto w-full max-w-[1244px] px-5 md:px-10">
        {children}
      </section>
    </div>
  );
};

const PillBtn = ({
  icon = null,
  text,
  onClick,
  variant = "light",
}: {
  icon?: React.ReactNode;
  text: string;
  onClick: () => void;
  variant?: "light" | "dark";
}) => {
  return (
    <div
      className={cn(
        variant === "light"
          ? "bg-neutral-00 text-neutral-primary border border-neutral-1000-a05 font-normal hover:bg-neutral-100"
          : "bg-neutral-950 text-neutral-00 border border-neutral-1000-a05 font-light hover:bg-neutral-900",
        "px-3 py-1.5 cursor-pointer rounded-full shadow-xs transition-colors text-[13px] inline-flex items-center gap-2"
      )}
      onClick={onClick}
    >
      {icon}
      {text}
    </div>
  );
};

function ContactSalesSection({ copy }: { copy: CompanyPageCopy["contact"] }) {
  const router = useRouter();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(initialContactSalesForm);
  const [hasCompanyEmailError, setHasCompanyEmailError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleShareClick = async () => {
    try {
      const didCopy = await copyTextToClipboard(COMPANY_PAGE_URLS.canonicalUrl);

      if (!didCopy) {
        throw new Error("Copy command failed");
      }

      showToast({
        message: copy.toast.copied,
        variant: "success",
      });
    } catch {
      showToast({
        message: copy.toast.copyFailed,
        variant: "error",
      });
    }
  };

  const updateForm = (
    field: keyof typeof initialContactSalesForm,
    value: string
  ) => {
    if (field === "email" && hasCompanyEmailError) {
      setHasCompanyEmailError(false);
    }

    setForm((current) => ({ ...current, [field]: value }));
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const email = form.email.trim();

    if (!email) {
      showToast({ message: copy.toast.emailRequired, variant: "white" });
      return;
    }

    if (!isValidEmail(email)) {
      showToast({
        message: copy.toast.emailInvalid,
        variant: "white",
      });
      return;
    }

    if (isPersonalEmailDomain(email)) {
      setHasCompanyEmailError(true);
      emailInputRef.current?.focus();
      showToast({
        message: copy.toast.companyEmailRequired,
        variant: "white",
      });
      return;
    }

    const purpose = form.purpose.trim();
    const payload = {
      name: form.name.trim(),
      email,
      organization: form.organization.trim(),
      purpose,
      pagePath:
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : router.asPath,
    };

    if (!payload.name) {
      showToast({ message: copy.toast.nameRequired, variant: "white" });
      return;
    }

    if (!payload.organization) {
      showToast({
        message: copy.toast.organizationRequired,
        variant: "white",
      });
      return;
    }

    if (!purpose) {
      showToast({ message: copy.toast.purposeRequired, variant: "white" });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/feedback/company-demo-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || data?.error) {
        throw new Error(data?.error ?? copy.toast.submitFailed);
      }

      setIsSubmitted(true);
      setForm(initialContactSalesForm);
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : copy.toast.submitFailed,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Section
      id={CONTACT_SALES_SECTION_ID}
      bgColor="bg-neutral-100"
      className="scroll-mt-[54px] pt-16 pb-[104px] md:pt-24 md:pb-[244px]"
    >
      <div className="grid w-full gap-8 lg:grid-cols-2 xl:gap-[30px]">
        <div>
          <h1 className={cn(fontMain, "max-w-[610px]")}>{copy.title}</h1>

          <div className="mt-5 flex min-h-[200px] max-w-[635px] flex-col justify-between rounded-lg border border-neutral-1000-a05 bg-[#fbfaf7] p-4 md:p-5">
            <p className="text-[15px] font-light leading-[1.55] text-neutral-primary">
              {copy.description}
            </p>

            <div className="flex items-center gap-2 flex-wrap mt-12 md:mt-0">
              <PillBtn
                icon={
                  <Image
                    src="/images/logos/linkedin.svg"
                    alt="Linkedin"
                    width={18}
                    height={18}
                  />
                }
                text="Harper"
                onClick={() => {
                  window.open(
                    "https://www.linkedin.com/company/matchharper/",
                    "_blank"
                  );
                }}
              />
              <PillBtn
                icon={<Face size={24} />}
                text={copy.talentLink}
                onClick={() => {
                  window.open("https://matchharper.com", "_blank");
                }}
              />
              <PillBtn
                icon={<HelpCircle className="h-4 w-4" strokeWidth={1.6} />}
                variant="dark"
                text={copy.help}
                onClick={() => {
                  openCustomCrispWidget();
                }}
              />
            </div>
          </div>
        </div>

        <aside className="self-start rounded-lg border border-[#e4e1d8] bg-[#f3f2ed] p-5">
          {isSubmitted ? (
            <div className="flex flex-col justify-between">
              <div>
                <h2 className={cn(fontMedium, "mt-2 flex items-center gap-2")}>
                  {copy.submittedTitle}
                </h2>
                <p
                  className={cn(
                    fontSmall,
                    "mt-2 mb-4 text-neutral-muted leading-6"
                  )}
                >
                  {copy.submittedBody[0]}
                  <br />
                  {copy.submittedBody[1]}
                </p>
                <div className="flex flex-row items-center justify-start gap-2">
                  <button
                    onClick={() => setIsSubmitted(false)}
                    className="text-primary text-sm px-2 py-2 rounded-md flex gap-2 flex-row items-center justify-center hover:bg-primary-faded"
                  >
                    {copy.confirm}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleShareClick}
                    className="text-neutral-primary text-sm px-2 py-2 rounded-md flex gap-2 flex-row items-center justify-center hover:bg-black/5"
                  >
                    <LucideLink className="h-4 w-4" />
                    {copy.share}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className={cn(fontBig, "max-w-[610px]")}>
                {copy.formTitle}
              </div>

              <form onSubmit={submitForm} className="mt-7 space-y-4">
                <label className={labelClass}>
                  {copy.email}
                  <input
                    ref={emailInputRef}
                    value={form.email}
                    onChange={(event) =>
                      updateForm("email", event.target.value)
                    }
                    className={cn(
                      inputClass,
                      hasCompanyEmailError
                        ? "border-red-400 focus:border-red-500"
                        : "border-neutral-950"
                    )}
                    placeholder="jane@matchharper.com"
                    type="email"
                    autoComplete="email"
                    aria-invalid={hasCompanyEmailError}
                    required
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className={labelClass}>
                    {copy.name}
                    <input
                      value={form.name}
                      onChange={(event) =>
                        updateForm("name", event.target.value)
                      }
                      className={inputClass}
                      autoComplete="name"
                      required
                    />
                  </label>

                  <label className={labelClass}>
                    {copy.organization}
                    <input
                      value={form.organization}
                      onChange={(event) =>
                        updateForm("organization", event.target.value)
                      }
                      className={inputClass}
                      placeholder={copy.organizationPlaceholder}
                      autoComplete="organization"
                      required
                    />
                  </label>
                </div>

                <label className={labelClass}>
                  {copy.purpose}
                  <textarea
                    value={form.purpose}
                    onChange={(event) =>
                      updateForm("purpose", event.target.value)
                    }
                    className={textareaClass}
                    placeholder={copy.purposePlaceholder}
                    required
                  />
                </label>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn(
                      fontSmall,
                      "inline-flex h-9 w-fit items-center justify-center gap-2 rounded-full px-5 transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      darkBtnClass
                    )}
                  >
                    {isSubmitting ? copy.submitting : copy.submit}
                    {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                  </button>
                </div>
              </form>
            </>
          )}
        </aside>
      </div>
    </Section>
  );
}

type TestCompanyPageProps = {
  locale: Locale;
};

export default function TestCompanyPage({ locale }: TestCompanyPageProps) {
  const [companyLocale, setCompanyLocale] = useState<Locale>(locale);
  const [showPreloader, setShowPreloader] = useState(true);
  const [socialProofAnimationReady, setSocialProofAnimationReady] =
    useState(false);
  const copy = COMPANY_PAGE_COPY[companyLocale];
  const structuredData = buildCompanyPageStructuredData(copy);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setShowPreloader(false);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, []);

  const scrollToContactSales = () => {
    document.getElementById(CONTACT_SALES_SECTION_ID)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleContactSalesAnchorClick: MouseEventHandler<HTMLAnchorElement> = (
    event
  ) => {
    event.preventDefault();
    scrollToContactSales();
  };

  const handleFooterScheduleClick: MouseEventHandler<HTMLButtonElement> = (
    event
  ) => {
    event.preventDefault();
    scrollToContactSales();
  };

  return (
    <MessagesProvider locale={companyLocale}>
      <>
        <Head>
          <title>{copy.meta.title}</title>
          <meta
            key="description"
            name="description"
            content={copy.meta.description}
          />
          <meta name="robots" content="index,follow,max-image-preview:large" />
          <meta name="application-name" content="Harper" />
          <meta name="author" content="Harper" />
          <meta key="theme-color" name="theme-color" content="#f7f6f1" />
          <link rel="canonical" href={COMPANY_PAGE_URLS.canonicalUrl} />
          <link
            rel="alternate"
            hrefLang={copy.meta.language}
            href={COMPANY_PAGE_URLS.canonicalUrl}
          />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Harper" />
          <meta property="og:locale" content={copy.meta.ogLocale} />
          <meta property="og:title" content={copy.meta.title} />
          <meta property="og:description" content={copy.meta.description} />
          <meta property="og:url" content={COMPANY_PAGE_URLS.canonicalUrl} />
          <meta property="og:image" content={COMPANY_PAGE_URLS.imageUrl} />
          <meta property="og:image:alt" content={copy.meta.title} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={copy.meta.title} />
          <meta name="twitter:description" content={copy.meta.description} />
          <meta name="twitter:image" content={COMPANY_PAGE_URLS.imageUrl} />
          <script
            key="ld-company-service"
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(structuredData),
            }}
          />
        </Head>
        <style jsx global>{`
          #crisp-chatbox,
          .crisp-client,
          div.fixed.bottom-4.right-4 {
            display: none !important;
          }

          .harper-reply-bubble {
            --reply-open-height: 128px;
            position: relative;
            display: block;
            width: 310px;
            max-width: 116px;
            max-height: 42px;
            min-height: 36px;
            overflow: hidden;
            border-radius: 12px;
            transition:
              max-width 700ms var(--ease-out-expo),
              max-height 700ms var(--ease-out-expo),
              border-radius 700ms var(--ease-out-expo);
          }

          .harper-reply-bubble-answer {
            max-width: 100%;
            max-height: var(--reply-open-height);
            border-radius: 16px;
          }

          .harper-thinking {
            position: absolute;
            left: 20px;
            top: 50%;
            transform: translateY(-50%);
            white-space: nowrap;
          }

          .harper-thinking-dot {
            display: inline-block;
            animation: harper-thinking-dot 0.72s ease-in-out infinite;
          }

          .harper-thinking-dot:nth-child(2) {
            animation-delay: 0.12s;
          }

          .harper-thinking-dot:nth-child(3) {
            animation-delay: 0.24s;
          }

          .harper-answer {
            width: 100%;
            min-height: 1.4em;
          }

          .liquid-glass-notification {
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.42);
            background: rgba(255, 255, 255, 0.52);
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
            -webkit-backdrop-filter: blur(12px) saturate(160%);
            backdrop-filter: blur(12px) saturate(160%);
          }

          .liquid-glass-icon {
            background: rgba(255, 255, 255, 0.78);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
          }

          @keyframes harper-thinking-dot {
            0%,
            100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-3px);
            }
          }

          @media (max-width: 767px) {
            .harper-reply-bubble {
              --reply-open-height: 150px;
            }
          }
        `}</style>
        <AnimatePresence
          onExitComplete={() => setSocialProofAnimationReady(true)}
        >
          {showPreloader && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{
                y: "-100%",
                transition: {
                  duration: 0.9,
                  ease: [0.76, 0, 0.24, 1],
                },
              }}
              className="fixed inset-0 z-120 flex items-center justify-center bg-bg-weak"
            >
              <div className="font-hedvig text-7xl tracking-[-0.08em] text-beige900">
                <StaggerText text="Harper" by="char" delay={0.08} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <main className="min-h-screen text-neutral-primary">
          <CareerAppBar
            careerStartHref={CONTACT_SALES_HREF}
            onCareerStartClick={handleContactSalesAnchorClick}
            showSectionLinks={false}
            audienceHref="/"
            locale={companyLocale}
          />
          <Section
            bgColor="bg-neutral-100"
            className="pb-14 pt-20 md:pb-20 md:pt-36"
          >
            <div className="grid gap-6 md:grid-cols-[0.95fr_1fr] md:items-end md:justify-between md:gap-10">
              <h1 className={cn(fontMain, "max-w-[620px] leading-[1.4]")}>
                {/* 채용 공고로는 닿기 어려운 */}
                {copy.hero.title.map((line, index) => (
                  <Fragment key={line}>
                    {index > 0 && <br />}
                    {line}
                  </Fragment>
                ))}
                {/* Top talent를 연결해드립니다. */}
              </h1>
              <p className={`max-w-[500px] ${fontMedium}`}>
                {copy.hero.description[0]}
                <br />
                {copy.hero.description[1]}
              </p>
            </div>
            <div className="mt-8 md:mt-6">
              <PillLink
                href={CONTACT_SALES_HREF}
                onClick={handleContactSalesAnchorClick}
                variant="dark"
              >
                {copy.hero.cta}&nbsp; <ArrowRight className="h-4 w-4" />
              </PillLink>
            </div>
          </Section>

          <Section className="pt-0 md:pt-0">
            <div className="grid gap-14 md:grid-cols-[0.6fr_0.4fr] md:gap-8">
              <div>
                <div className={cn(fontMedium, "text-neutral-muted")}>
                  {copy.socialProof.talentTitle}
                </div>
                <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4 md:mt-8">
                  {logos.map((logo, index) => (
                    <Reveal
                      key={logo.name}
                      enabled={socialProofAnimationReady}
                      delay={index * 0.025}
                      duration={0.36}
                      distance={14}
                      blur={7}
                      amount={0.1}
                      className={cn(
                        "h-[72px] md:h-24",
                        logo.hideOnMobile && "hidden md:block"
                      )}
                    >
                      <div className="group flex h-full items-center justify-center rounded-sm border border-neutral-200 bg-neutral-200/80 px-3 md:px-4">
                        <span
                          className="relative block h-7 max-w-full opacity-75 grayscale transition group-hover:opacity-100 group-hover:grayscale-0 md:h-8"
                          style={{ width: logo.width }}
                        >
                          <Image
                            src={logo.src}
                            alt={logo.name}
                            fill
                            sizes={`(min-width: 768px) ${logo.width}px, 96px`}
                            className="object-contain"
                          />
                        </span>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
              <div className="flex min-w-0 flex-col">
                <div className={cn(fontMedium, "text-neutral-muted")}>
                  {copy.socialProof.companyTitle}
                </div>
                <div className="mt-6 flex flex-1 flex-col md:mt-8">
                  <div className="flex w-full flex-col gap-2">
                    {[
                      { accent: "$2B", label: "AI-first Asia VC" },
                      { accent: "$2B", label: "Global Agentic Company" },
                      {
                        accent: "Sequoia-backed",
                        label: "Consumer AI Agent",
                      },
                    ].map((item, index) => (
                      <Reveal
                        key={item.label}
                        enabled={socialProofAnimationReady}
                        delay={index * 0.04}
                        duration={0.36}
                        distance={14}
                        blur={7}
                        amount={0.1}
                      >
                        <p className={fontMedium}>
                          <span className="text-primary">{item.accent}</span>{" "}
                          {item.label}
                        </p>
                      </Reveal>
                    ))}
                    <Reveal
                      enabled={socialProofAnimationReady}
                      delay={0.12}
                      duration={0.36}
                      distance={14}
                      blur={7}
                      amount={0.1}
                    >
                      <p className={cn(fontSmall, "text-neutral-muted")}>
                        + more
                      </p>
                    </Reveal>
                  </div>
                  <Reveal
                    enabled={socialProofAnimationReady}
                    delay={0.16}
                    duration={0.4}
                    distance={14}
                    blur={7}
                    amount={0.1}
                    className="mt-8 md:mt-auto"
                  >
                    <div className="flex min-h-[220px] w-full flex-col items-start justify-between rounded-sm border border-neutral-200 bg-neutral-200/80 p-5 md:min-h-[240px]">
                      <div className="text-[15px] font-light leading-[1.55] text-neutral-primary md:text-[16px]">
                        {'"'}
                        {copy.socialProof.testimonial}
                        {'"'}
                      </div>
                      <div className="mt-8 flex flex-row items-center gap-2">
                        <Image
                          src="/images/logos/wonderful.jpg"
                          alt="Wonderful"
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-full bg-neutral-00 object-contain p-2"
                        />
                        <div className="flex flex-col items-start gap-0 text-left">
                          <div className="w-full text-left text-[15px] font-light">
                            General Manager
                          </div>
                          <div className="text-[14px] font-light text-neutral-muted">
                            at $2B Agentic Company
                          </div>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                </div>
              </div>
            </div>
          </Section>
          <AgentsSection copy={copy} />

          <Section
            bgColor="bg-neutral-00"
            className="md:pt-8 pt-4 md:pb-48 pb-32"
          >
            <div className="flex flex-col gap-2 text-xl font-normal leading-[1.3]">
              {copy.closing.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </Section>

          <ContactSalesSection copy={copy.contact} />
        </main>
        <CareerLandingFooter
          careerStartHref={CONTACT_SALES_HREF}
          onCareerStartClick={handleContactSalesAnchorClick}
          onScheduleCallClick={handleFooterScheduleClick}
          locale={companyLocale}
          onLocaleChange={setCompanyLocale}
        />
      </>
    </MessagesProvider>
  );
}

export const getServerSideProps: GetServerSideProps<
  TestCompanyPageProps
> = async ({ req }) => ({
  props: {
    locale: resolveOfficialJobsLocaleFromRequest(req),
  },
});
