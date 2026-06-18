import Reveal from "@/components/landing/Animation/Reveal";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import TalentSocialProof from "@/components/landing/career/TalentSocialProof";
import { useCareerLandingStart } from "@/hooks/useCareerLandingStart";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";

import {
  ArrowRight,
  AudioLines,
  BriefcaseBusiness,
  Calendar,
  Captions,
  ChevronsRight,
  FileX2,
  Github,
  Globe2,
  GraduationCap,
  HeartHandshake,
  Linkedin,
  LockIcon,
  LockKeyhole,
  MessagesSquare,
  Mic,
  Scan,
  User2,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useSpring,
  useScroll,
  useTransform,
  type MotionStyle,
  type MotionValue,
} from "motion/react";
import { Fragment, useEffect, useRef, useState } from "react";
import type React from "react";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import GmailPhoneMockup from "@/components/landing/career/GmailMockup";
import CareerWorkspacePreview from "@/components/career/preview/CareerWorkspaceLandingMockup";
import { cx } from "@/components/ops/theme";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { MessagesProvider, type Locale } from "@/i18n/useMessage";
import Face from "@/components/common/Face";
import {
  CAREER_LANDING_HERO_COPY_ABTEST_COOKIE,
  resolveCareerLandingHeroCopyAbtestType,
  usesCareerLandingHeroCopyB,
  type CareerLandingHeroCopyAbtestType,
} from "@/lib/career/utm";

const text = {
  h1: "text-[30px] font-bold leading-[1.28] text-neutral-950 sm:text-[48px] md:text-[56px]",
  h2: "text-[28px] font-medium leading-[1.2] text-neutral-950 md:text-[36px]",
  h3: "text-[20px] font-normal leading-[1.45] text-neutral-950 md:text-[24px]",
  lg: "text-[16px] font-normal leading-[1.45] text-neutral-950 md:text-[18px]",
  p: "text-base font-normal leading-[1.45] text-neutral-950/90 md:text-base",
  sm: "text-sm font-normal leading-[1.45] text-neutral-950/90 md:text-[15px]",
};

const ui = {
  pageX: "px-4 md:px-10",
  shell: "mx-auto w-full max-w-[1080px]",
  sectionY: "py-20 md:py-32",
  btn: "inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 font-medium shadow-sm transition-colors",
  btnPrimary:
    "border-black bg-black text-white hover:bg-neutral-800 px-5 md:px-7 h-13 md:h-15 text-base md:text-lg font-medium",
  btnSecondary:
    "border-black/10 bg-white text-neutral-950 hover:bg-neutral-100",
};

type LandingCopy = {
  meta: {
    title: string;
    description: string;
  };
  appBar: {
    workflow: string;
    difference: string;
    voices: string;
    forCompanies: string;
    join: string;
  };
  footer: {
    start: string;
    howItWorks: string;
    successStories: string;
    forTalent: string;
    forCompanies: string;
    company: string;
    harperForCompanies: string;
    scheduleCall: string;
    blog: string;
    linkedin: string;
    contact: string;
  };
  socialProofTitle: string;
  hero: {
    title: readonly string[];
    body: readonly string[];
    cta: string;
    secondaryCta: string;
    desktopLabel: string;
    mailNotification: {
      title: string;
      body: string;
      time: string;
    };
  };
  workflow: {
    title: readonly string[];
    body: string;
    chatRows: readonly { by: "candidate" | "harper"; text: string }[];
    stopLabel: string;
    steps: readonly { title: string; body: string }[];
    profileCard: {
      name: string;
      role: string;
      skills: readonly string[];
      status: string;
    };
    connectionBadge: string;
    openPositionBadge: string;
    notifications: readonly { title: string; body: string; time: string }[];
  };
  how: {
    statement: {
      prefix: string;
      focus: string;
    };
    topRows: readonly { title: string; body: readonly string[] }[];
    rows: readonly { title: string; body: readonly string[] }[];
  };
  voices: {
    title: string;
    desc: string;
    items: readonly {
      quote: string;
      initial: string;
      name: string;
      company: string;
      role: string;
    }[];
  };
  security: {
    title: string;
    items: readonly { title: string; body: string }[];
  };
  opportunities: {
    title: string;
    desc: string;
    viewMore: string;
    cardCta: string;
    items: readonly { name: string; description: string }[];
  };
  audience: {
    title: string;
    aboutLabel: string;
    items: readonly { id: string; label: string }[];
  };
  cta: {
    title: readonly string[];
    desc?: string;
    button: string;
    note: string;
  };
};

const LANDING_COPY = {
  ko: {
    meta: {
      title: "Harper - Your Career Agent",
      description:
        "Harper는 엔지니어의 기준을 대화로 이해하고, 맞는 회사와 포지션만 선별해 브리핑한 뒤 관심 있는 기회만 직접 연결합니다.",
    },
    appBar: {
      workflow: "제품 화면",
      difference: "다른점",
      voices: "후기",
      forCompanies: "For Companies",
      join: "Join",
    },
    footer: {
      start: "시작하기",
      howItWorks: "How it works",
      successStories: "Success stories",
      forTalent: "For Talent",
      forCompanies: "For Companies",
      company: "Company",
      harperForCompanies: "Harper for Companies",
      scheduleCall: "Schedule a call",
      blog: "Blog",
      linkedin: "LinkedIn",
      contact: "문의하기",
    },
    socialProofTitle: "이곳의 인재들이 신뢰합니다.",
    hero: {
      title: ["당신을 위한", "커리어 에이전트, Harper"],
      body: [
        "다음 커리어는 Harper에게 맡기세요.",
        "한 번의 대화만으로 당신의 맥락을 이해하고, 가장 잘 맞는 기회를 선별해, 채용 담당자와 직접 연결합니다.",
        // "Harper가 다음 커리어로 적합한 역할을 찾고,",
        // "최종적으로 합류하기까지 필요한 모든 과정을 도와드립니다.",
      ],
      cta: "Meet your Agent",
      secondaryCta: "제품 화면 보기",
      desktopLabel: "Desktop",
      mailNotification: {
        title: "소개: Chris & Wonderful APAC VP",
        body: "안녕하세요, 메일로 두분을 연결드리게 되어서 기쁘네요. Chris는 현재 FDE로 SF에서 일하고 있고, 빠르게 성장하는 AI 스타트업에서의 기회를 찾고 있습니다.",
        time: "방금",
      },
    },
    workflow: {
      title: ["맥락을 파악하고,", "연결까지"],
      body: "한번의 대화로 시작하세요. 맥락과 선호를 파악하고 가장 적절한 기회만 찾아 전달합니다.",
      chatRows: [
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
      ],
      stopLabel: "중지하기",
      steps: [
        {
          title:
            "먼저 프로필을 동기화하면 Harper가 회원님의 맥락을 즉시 이해합니다.",
          body: "",
        },
        {
          title: "대화로 현재 상황에 대해 말해주세요.",
          body: "짧은 통화로 선호하는 역할, 보상, 지역, 비자, 팀 분위기처럼 실제로 선택에 영향을 주는 기준에 대해 알려주세요.",
        },
        {
          title: "Harper가 추천하는 기회를 확인하세요.",
          body: "Harper는 정말 좋다고 생각되는 기회만 소수로 선별하여 전달합니다. Harper가 연결 가능한 내부 기회부터, 직접 지원 가능한 오픈 포지션까지 있습니다.",
        },
        {
          title: "수락하면 연결이 진행됩니다.",
          body: "내부 기회에 관심 있다고 답하면 연결이 진행됩니다. 지원 과정 없이, 바로 담당자와 만남이 이루어집니다. Harper는 높은 기준을 만족한 경우에만 연결을 시도하기 때문에, 먼저 제안한 기회는 수락시 100% 연결됩니다.",
        },
      ],
      profileCard: {
        name: "Chris L.",
        role: "Forward Deployed Engineer · ex-Stripe",
        skills: ["AI Infra", "분산 시스템", "Go · Python"],
        status: "이력을 확인하는 중...",
      },
      connectionBadge: "Harper의 연결",
      openPositionBadge: "오픈 포지션",
      notifications: [
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
      ],
    },

    how: {
      statement: {
        prefix: "이제 커리어 기회는 Harper가 찾습니다.",
        focus: "제안을 확인하고, 승인만하세요.",
      },
      topRows: [
        {
          title: "100% Stealth",
          body: [
            "직접 연결을 수락한 회사 이외에는 아무도 회원님의 프로필을 알 수 없습니다. 리크루터 노출도 없이 모든 탐색은 비공개로 진행됩니다.",
          ],
        },
        {
          title: "채용 공고 너머의 기회들",
          body: [
            "최고의 기회는 절대 외부에 공개되지 않습니다. 비공개 창업자 네트워크 안에 숨겨진, 공개되지 않은 임팩트 있는 기회에 직접 접근할 수 있게 해드립니다.",
          ],
        },
      ],
      rows: [
        {
          title: "원하는 방식 무엇이든",
          body: [
            "풀타임 핵심 포지션부터 주 10시간 자문, 파트타임 프로젝트까지. 가능한 시간과 원하는 방식에 맞는 기회만 전달합니다.",
          ],
        },
        {
          title: "한 번만 말하면 됩니다",
          body: [
            "내 커리어와 선호는 한 번만 알려주세요. 반복되는 소개, 설명, 조율은 Harper가 대신합니다. 당신은 잘 맞는 제안만 확인하고 승인하면 됩니다.",
          ],
        },
        {
          title: "복잡하고 어려운 모든 과정을 대신합니다",
          body: [
            "조건 조율부터 회사 조사까지 모든 과정을 도와드립니다. 회사에 대해 궁금한 정보를 대신 질문하고, 답변을 전달합니다.",
          ],
        },
      ],
    },
    voices: {
      title: "이미 최고의 인재들이 Harper를 통해 연결되고 있습니다.",
      desc: "우리는 빠르게 성장하는 스타트업의 핵심 포지션에 최고의 인재를 연결합니다. Harper가 실제로 만들어낸 매칭 사례를 확인해보세요.",
      items: [
        {
          quote:
            "한국에서는 이런 글로벌 기회가 있다는 것조차 몰랐어요. 그런데 Harper에게 CTO를 직접 연결받았고, 이제 곧 합류할 예정이에요.",
          initial: "",
          name: "익명 요청",
          company: "Wonderful (2B+)",
          role: "Founding Forward Deployed Engineer",
        },
        {
          quote:
            "Harper가 먼저 가볍게 함께해볼 수 있는 fractional 역할로 두 명의 YC 창업자와 바로 연결해줬고, 자연스럽게 이직으로까지 이어졌습니다.",
          initial: "/images/person3.png",
          name: "Soyeon L.",
          company: "YC-backed Startup",
          role: "Founding Engineer",
        },
        {
          quote:
            "외부에 공개된 공고도 없고, 잘 모르던 스타트업이었는데 정말 뛰어난 사람들만 모인 팀을 소개해줘서 좋았어요.",
          initial: "P",
          name: "Patrick",
          company: "High-Growth AI Team",
          role: "Staff Engineer, Infrastructure",
        },
      ],
    },
    security: {
      title: "보안 및 개인정보",
      items: [
        {
          title: "동의 전에는 회사에 전달되지 않습니다.",
          body: "Harper와 나눈 대화, 선호 조건, 커리어 맥락은 사용자가 허락한 기회에 한해서만 필요한 범위로 전달됩니다. 회사가 임의로 내 프로필을 검색하거나 열람할 수 없습니다.",
        },
        {
          title: "필요한 정보만 제한적으로 다룹니다.",
          body: "기회 매칭과 소개 진행에 필요한 정보만 사용하며, 민감한 커리어 정보는 내부 접근을 제한해 관리합니다. 원하지 않는 정보는 언제든 업데이트하거나 삭제를 요청할 수 있습니다.",
        },
      ],
    },
    opportunities: {
      title: "Harper로 연결되는 기회들",
      desc: "시장에 공개되지 않았지만 Harper를 통해 추천되고 있는 기회들입니다.",
      viewMore: "더 보기",
      cardCta: "소개받기",
      items: [
        {
          name: "Forward Deployed Engineer",
          description:
            "Series B Enterprise AI (Seoul / APAC) | Full-Time • Significant Equity",
        },
        {
          name: "Software Engineer, AI Agents",
          description:
            "YC-Backed Stealth Startup (SF) | 10-15 hrs/wk • $150-$200/hr",
        },
        {
          name: "Machine Learning Engineer",
          description:
            "$50M Funded Frontier AI Lab | Full-Time • $250K - $350K",
        },
        {
          name: "Member of Technical Staff",
          description:
            "Global ML Platform | Advisory Board • Flexible Retainer",
        },
        {
          name: "Founding AI Product Engineer",
          description:
            "Seed-stage Agentic AI Startup | Full-Time • Remote-first • Early Equity",
        },
      ],
    },
    audience: {
      title: "Harper는 누구를 위한 건가요?",
      aboutLabel: "우리가 Harper를 만든 이유",
      items: [
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
      ],
    },
    cta: {
      title: ["새로운 팀에 합류할 준비가 되셨나요?"],
      // title: ["Ready to land your next role?"],
      desc: "Harper가 다음 커리어로 적합한 역할을 찾고,<br />최종 합류까지 필요한 모든 과정을 도와드립니다.",
      // desc: "An AI agent that finds your next job and helps you land it",
      button: "Meet Harper",
      note: "Takes less than 3 minutes to sync your context. 100% encrypted.",
    },
  },
  en: {
    meta: {
      title: "Harper - Your Career on Autopilot",
      description:
        "Assign your next move to a private Agent. With just one conversation, Harper remembers your context, curates the perfect roles, and connects you directly with decision-makers.",
    },
    appBar: {
      workflow: "Product",
      difference: "Why Harper",
      voices: "Stories",
      forCompanies: "For Companies",
      join: "Join",
    },
    footer: {
      start: "Meet your Agent",
      howItWorks: "How it works",
      successStories: "Success stories",
      forTalent: "For Talent",
      forCompanies: "For Companies",
      company: "Company",
      harperForCompanies: "Harper for Companies",
      scheduleCall: "Schedule a call",
      blog: "Blog",
      linkedin: "LinkedIn",
      contact: "Contact",
    },
    socialProofTitle: "Trusted by top engineers from",
    hero: {
      title: ["Your Career on", "Autopilot."],
      body: [
        "Assign your next move to a private Agent.",
        "With one conversation, Harper remembers your context, curates the perfect roles, and connects you directly with decision-makers.",
      ],
      cta: "Meet your Agent",
      secondaryCta: "View product",
      desktopLabel: "Desktop",
      mailNotification: {
        title: "Intro: Chris & VP of APAC, Wonderful",
        body: "I routed Chris directly to Wonderful's VP of APAC for the core architecture role in Singapore or Seoul.",
        time: "Now",
      },
    },
    workflow: {
      title: ["From context,", "to connection."],
      body: "Sync your context once, define your exact terms, then approve only the matches worth your attention.",
      chatRows: [
        {
          by: "harper",
          text: "Looking for a full-time lead role, or maybe something more flexible?",
        },
        {
          by: "candidate",
          text: "I'm open to both. A full-time lead role or a side advisory project.",
        },
        {
          by: "harper",
          text: "Got it. Scanning for both types in the private market now.",
        },
      ],
      stopLabel: "End",
      steps: [
        {
          title:
            "First, sync your profile so Harper instantly understands your context.",
          body: "",
        },
        {
          title:
            "Then, talk to Harper via a quick voice call-or text-to define your exact terms and engineering philosophy.",
          body: "",
        },
        {
          title:
            "Highly targeted, unlisted opportunities silently arrive in your secure workspace.",
          body: "",
        },
        {
          title:
            "Simply approve the match, and a direct sync with actual decision-makers is initialized.",
          body: "",
        },
      ],
      profileCard: {
        name: "Chris L.",
        role: "Forward Deployed Engineer · ex-Stripe",
        skills: ["AI Infra", "Distributed Systems", "Go · Python"],
        status: "Reading your engineering DNA...",
      },
      connectionBadge: "Harper intro",
      openPositionBadge: "Open role",
      notifications: [
        {
          title: "Connection Initiated",
          body: "Harper is currently initiating a private dialogue with the VP of APAC.",
          time: "4h ago",
        },
        {
          title: "Interview Confirmed",
          body: "A 30-min sync with the VP of APAC is scheduled for Friday at 10 AM.",
          time: "Just now",
        },
      ],
    },
    how: {
      statement: {
        prefix: "The end of the job search. ",
        focus: "We search, you approve.",
      },
      topRows: [
        {
          title: "100% Stealth",
          body: [
            "Your current employer and specified domains are automatically hard-blocked.",
            "With zero public profiles and no recruiters involved, your exploration stays invisible.",
          ],
        },
        {
          title: "Beyond Job Boards",
          body: [
            "The most critical roles are never posted publicly.",
            "Harper gives you direct access to unlisted, high-impact opportunities inside private founder networks.",
          ],
        },
      ],
      rows: [
        {
          title: "Work on Your Schedule",
          body: [
            "Whether you want a full-time core shift, a 10-hour fractional advisory slot, or a part-time project, Harper routes only what matches your availability.",
          ],
        },
        {
          title: "Zero Repetition",
          body: [
            "Sync your context exactly once. Harper handles the repetitive pitching while you review targeted pings and approve the ones you like.",
          ],
        },
        {
          title: "Decision-Maker Access",
          body: [
            "Once you approve a match, Harper starts the private dialogue with the people who can actually make the decision.",
          ],
        },
      ],
    },
    voices: {
      title:
        "Roles that match your availability.<br />Full-time, Fractional, or Advisory",
      desc: "We place top talent in critical roles at the fastest-growing startups. Take a look at the actual matches we’ve made.",
      items: [
        {
          quote:
            "There was no local HR pipeline. Harper synced my context directly with global leadership, securing my position as their very first engineering hire in the region.",
          initial: "KH",
          name: "KH",
          company: "Wonderful (2B+)",
          role: "Founding Forward Deployed Engineer",
        },
        {
          quote:
            "They didn't even have a public job posting. Harper connected me with two YC founders for a fractional role to test the waters, which organically scaled into a full-time position.",
          initial: "/images/person3.png",
          name: "Brandon K.",
          company: "YC-Backed Stealth Startup",
          role: "Senior Backend Architect",
        },
        {
          quote:
            "I wasn't actively looking to leave my current role. Harper mapped my specific inference optimization research to a highly targeted advisory position that perfectly fits my schedule.",
          initial: "E",
          name: "Elena R.",
          company: "Tier-1 Foundation Model Lab",
          role: "Member of Technical Staff (U of Toronto NLP Researcher)",
        },
      ],
    },
    security: {
      title: "Security and privacy",
      items: [
        {
          title: "Private until you approve.",
          body: "Your profile, preferences, and career context are never pushed to companies before you approve a specific match.",
        },
        {
          title: "No public signal, no recruiter blast.",
          body: "Harper works as a private agent, not a public profile. Your current employer and blocked domains stay excluded from every search.",
        },
      ],
    },
    opportunities: {
      title: "The Hidden Market, Live",
      desc: "See the exact roles our Agents are matching right now. No public links.",
      viewMore: "View more",
      cardCta: "Connect via Agent",
      items: [
        {
          name: "Founding Forward Deployed Engineer",
          description:
            "Series B Enterprise AI (Seoul / APAC) | Full-Time • Significant Equity",
        },
        {
          name: "Software Engineer, AI Agents",
          description:
            "YC-Backed Stealth Startup (SF) | 10-15 hrs/wk • $150-$200/hr",
        },
        {
          name: "Machine Learning Engineer",
          description:
            "$50M Funded Frontier AI Lab | Full-Time • $250K - $350K",
        },
        {
          name: "Member of Technical Staff",
          description:
            "Global ML Platform | Advisory Board • Flexible Retainer",
        },
        {
          name: "Founding AI Product Engineer",
          description:
            "Seed-stage Agentic AI Startup | Full-Time • Remote-first • Early Equity",
        },
      ],
    },
    audience: {
      title: "Built for talents.",
      aboutLabel: "Why we built Harper",
      items: [
        {
          id: "linkedin-open-to-work-primary",
          label: "For those who want a private career agent",
        },
        {
          id: "linkedin-open-to-work-secondary",
          label:
            "For top talent open to a move, but focused on their current work",
        },
        {
          id: "global-stage-primary",
          label:
            "People open to new opportunities, but not ready to turn on LinkedIn's 'Open to Work'",
        },
        {
          id: "global-stage-secondary",
          label:
            "For candidates who want direct access to private founder networks",
        },
      ],
    },
    cta: {
      title: ["Put your career", "on Autopilot."],
      desc: "Harper finds your next job and helps you land it",
      button: "Meet your Agent",
      note: "Takes less than 3 minutes to sync your context. 100% encrypted.",
    },
  },
} satisfies Record<Locale, LandingCopy>;

const HERO_BODY_VARIANT_B: Record<Locale, readonly string[]> = {
  ko: [
    "Harper가 다음 커리어로 적합한 역할을 찾고,",
    "최종적으로 합류하기까지 필요한 모든 과정을 도와드립니다.",
  ],
  en: [
    "Harper finds the right role for your next move,",
    "and helps with every step it takes to land it.",
  ],
};

const howTopIcons = [LockIcon, Scan] as const;
const howIcons = [Calendar, MessagesSquare, ChevronsRight] as const;
const securityIcons = [FileX2, LockKeyhole] as const;

function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={`${line}-${index}`}>
          {index > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </>
  );
}

function DesktopWindowMockup({
  label,
  onGmailMockupVisibleChange,
}: {
  label: string;
  onGmailMockupVisibleChange?: (visible: boolean) => void;
}) {
  return (
    <div className="pointer-events-auto absolute isolate w-[min(80vw,280px)] overflow-hidden rounded-[16px] bg-neutral-50 text-neutral-950 ring-1 ring-black/15 [clip-path:inset(0_round_16px)] md:pointer-events-none md:w-[94%] md:translate-x-0 md:rounded-[16px] md:[clip-path:inset(0_round_16px)]">
      <div className="hidden h-9 grid-cols-[64px_1fr_76px] items-center bg-neutral-100 px-3 text-[11px] text-neutral-500 ring-1 ring-black/[0.06] md:grid sm:grid-cols-[110px_1fr_110px] sm:px-4 sm:text-[13px]">
        <div className="flex gap-2">
          <span className="h-2 w-2 rounded-full bg-neutral-300 sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 rounded-full bg-neutral-300 sm:h-2.5 sm:w-2.5" />
          <span className="h-2 w-2 rounded-full bg-neutral-300 sm:h-2.5 sm:w-2.5" />
        </div>
        <div className="whitespace-nowrap text-xs text-center font-normal text-neutral-600">
          {label}
        </div>
        <div />
      </div>

      <div className="relative aspect-[390/700] overflow-hidden rounded-[28px] bg-neutral-50 [clip-path:inset(0_round_28px)] md:aspect-[1512/827] md:rounded-none md:[clip-path:none]">
        <div className="absolute inset-0">
          <CareerWorkspacePreview
            embedded
            autoPlayConversation
            disableInteractions
            initialTab="chat"
            onGmailMockupVisibleChange={onGmailMockupVisibleChange}
            viewport="auto"
          />
        </div>
      </div>
    </div>
  );
}

function HeroMailNotification({
  item,
}: {
  item: LandingCopy["hero"]["mailNotification"];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -84, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -74, scale: 0.98 }}
      transition={{
        duration: 0.52,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="relative flex w-full items-start gap-3 rounded-[18px] bg-neutral-0/88 px-3 py-3 text-neutral-950 shadow-[0_18px_46px_rgba(0,0,0,0.22)] ring-1 ring-white/30 backdrop-blur-md"
    >
      <div
        aria-label="Gmail"
        className="mt-0.5 h-9 w-9 shrink-0 rounded-[10px] bg-white bg-size-[26px_26px] bg-center bg-no-repeat ring-1 ring-black/[0.04]"
        style={{ backgroundImage: "url('/svgs/gmail.svg')" }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[13px] font-medium">Harper</span>
          <span className="shrink-0 text-[11px] text-black/55">
            {item.time}
          </span>
        </div>
        <div className="mt-0.5 truncate text-sm font-medium">{item.title}</div>
        <div className="mt-0.5 line-clamp-2 text-[13px] leading-[1.45] text-black/90">
          {item.body}
        </div>
      </div>
    </motion.div>
  );
}

function HeroScreenshot({
  desktopLabel,
  mailNotification,
}: {
  desktopLabel: string;
  mailNotification: LandingCopy["hero"]["mailNotification"];
}) {
  const [showGmailMockup, setShowGmailMockup] = useState(false);

  return (
    <div className="relative flex items-center justify-center mx-auto mt-6 md:mt-12 h-[520px] w-full max-w-[1240px] overflow-hidden rounded-[18px] bg-neutral-200 ring-1 ring-black/[0.06] md:mt-14 md:h-[670px]">
      <Image
        src="/images/orangesky2.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1280px) 1240px, 100vw"
        className="object-cover opacity-[0.45] brightness-[1.12] contrast-[0.82] saturate-[0.52]"
      />
      <div className="absolute inset-0 bg-neutral-200/40" />
      <div className="pointer-events-none absolute inset-x-4 top-4 z-30 md:hidden">
        <AnimatePresence initial={false}>
          {showGmailMockup ? (
            <HeroMailNotification
              key="hero-mobile-mail-notification"
              item={mailNotification}
            />
          ) : null}
        </AnimatePresence>
      </div>
      <DesktopWindowMockup
        label={desktopLabel}
        onGmailMockupVisibleChange={setShowGmailMockup}
      />
      <GmailPhoneMockup
        className={cn(
          "pointer-events-none transition-[opacity,transform,filter] duration-700 ease-out will-change-transform",
          showGmailMockup
            ? "translate-y-0 scale-100 opacity-100 blur-0"
            : "pointer-events-none translate-y-8 scale-[0.96] opacity-0 blur-[2px]"
        )}
      />
    </div>
  );
}

const PRODUCT_FLOW_PER_STEP = 1.2;
const PRODUCT_FLOW_HOLD = 0.12;
const PRODUCT_FLOW_VISUAL_HEIGHT = 390;
const PRODUCT_FLOW_STEP_GAP = 120;
const PRODUCT_FLOW_STEP_PITCH =
  PRODUCT_FLOW_VISUAL_HEIGHT + PRODUCT_FLOW_STEP_GAP;
const PRODUCT_FLOW_IMAGE_HOLD = 1.5;
const PRODUCT_FLOW_SCALE_AMOUNT = 0.08;
const PRODUCT_FLOW_STICKY_TOP = "clamp(104px, 12vh, 132px)";

function smootherstep(value: number) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function heldSmootherstep(value: number) {
  return Math.pow(
    smootherstep(Math.max(0, Math.min(1, value))),
    PRODUCT_FLOW_IMAGE_HOLD
  );
}

function ProductFlowPanel({ copy }: { copy: LandingCopy["workflow"] }) {
  const controlClassName =
    "flex items-center justify-center rounded-full border border-black/20 px-3 py-2.5";
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: scrollRef,
    offset: ["start 6%", "end 94%"],
  });
  const scrubbedProgress = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 24,
    mass: 0.55,
    restDelta: 0.0001,
  });
  const steps = [
    {
      title: copy.steps[0].title,
      body: copy.steps[0].body,
      visual: "profile",
      mobileLayout: "visual-first",
    },
    {
      title: copy.steps[1].title,
      body: copy.steps[1].body,
      visual: "conversation",
      mobileLayout: "visual-first",
    },
    {
      title: copy.steps[2].title,
      body: copy.steps[2].body,
      visual: "roles",
      mobileLayout: "visual-first",
    },
    {
      title: copy.steps[3].title,
      body: copy.steps[3].body,
      visual: "notifications",
      mobileLayout: "visual-first",
    },
  ] as const;
  const stageProgress = useTransform(scrubbedProgress, (value) => {
    if (steps.length <= 1) return 0;

    return Math.min(
      steps.length - 1,
      (value / (1 - PRODUCT_FLOW_HOLD)) * (steps.length - 1)
    );
  });
  const desktopTrackHeight = `${Math.round(
    (((steps.length - 1) * PRODUCT_FLOW_PER_STEP) / (1 - PRODUCT_FLOW_HOLD)) *
      100 +
      100
  )}vh`;

  return (
    <div className="mt-11 md:mt-0">
      <div className="space-y-10 md:hidden">
        {steps.map((step) => (
          <ProductFlowMobileStep
            key={step.visual}
            step={step}
            copy={copy}
            controlClassName={controlClassName}
          />
        ))}
      </div>

      <div
        ref={scrollRef}
        data-product-flow-desktop
        className="relative hidden md:block"
        style={{ minHeight: desktopTrackHeight }}
      >
        <div
          className="sticky h-[min(84vh,740px)]"
          style={{ top: PRODUCT_FLOW_STICKY_TOP }}
        >
          <ProductFlowDesktopHeader copy={copy} />

          <div className="mt-[60px] grid grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] items-start gap-16 lg:gap-[4.5rem]">
            <div className="relative min-h-[390px]">
              {steps.map((step, index) => (
                <ProductFlowDesktopTextLayer
                  key={step.visual}
                  index={index}
                  progress={stageProgress}
                  step={step}
                />
              ))}
            </div>

            <div
              data-product-flow-sticky-visual
              className="relative h-[390px] overflow-hidden rounded-[18px] bg-[#F2F0EC] shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_8px_30px_rgba(0,0,0,0.05)]"
            >
              {steps.map((step, index) => (
                <ProductFlowDesktopVisualLayer
                  key={step.visual}
                  index={index}
                  progress={stageProgress}
                >
                  {(foregroundStyle) => (
                    <ProductFlowStepVisual
                      className="h-full min-h-0 rounded-none ring-0 md:min-h-0"
                      copy={copy}
                      controlClassName={controlClassName}
                      foregroundStyle={foregroundStyle}
                      step={step}
                    />
                  )}
                </ProductFlowDesktopVisualLayer>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type ProductFlowStep = {
  body: string;
  mobileLayout: "text-first" | "visual-first";
  title: string;
  visual: "profile" | "conversation" | "roles" | "notifications";
};

function ProductFlowDesktopHeader({ copy }: { copy: LandingCopy["workflow"] }) {
  return (
    <div className="grid w-full grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] items-end gap-16 lg:gap-[4.5rem]">
      <h2 className="w-full text-[48px] font-bold leading-[1.22] text-neutral-950">
        {copy.title[0]}
        <br />
        {copy.title[1]}
      </h2>
      <p className={`${text.p} w-full max-w-[320px] justify-self-end pr-8`}>
        {copy.body}
      </p>
    </div>
  );
}

function ProductFlowMobileStep({
  step,
  copy,
  controlClassName,
}: {
  step: ProductFlowStep;
  copy: LandingCopy["workflow"];
  controlClassName: string;
}) {
  const visual = (
    <ProductFlowStepVisual
      copy={copy}
      controlClassName={controlClassName}
      step={step}
    />
  );
  const stepText = <ProductFlowText body={step.body} title={step.title} />;

  return (
    <div className="grid items-center gap-7">
      {step.mobileLayout === "text-first" ? (
        <>
          {stepText}
          {visual}
        </>
      ) : (
        <>
          {visual}
          {stepText}
        </>
      )}
    </div>
  );
}

function ProductFlowDesktopTextLayer({
  index,
  progress,
  step,
}: {
  index: number;
  progress: MotionValue<number>;
  step: ProductFlowStep;
}) {
  const y = useTransform(
    progress,
    (position) => (index - position) * PRODUCT_FLOW_STEP_PITCH
  );
  const opacity = useTransform(progress, (position) => {
    const rel = index - position;

    if (rel <= 0) return Math.max(0, 1 + rel * 1.8);

    return Math.max(0, 1 - rel * 0.78);
  });

  return (
    <motion.div
      data-product-flow-step={step.visual}
      className="pointer-events-none absolute left-0 top-0 w-full will-change-transform"
      style={{ opacity, y }}
    >
      <ProductFlowText body={step.body} title={step.title} />
    </motion.div>
  );
}

function ProductFlowDesktopVisualLayer({
  children,
  index,
  progress,
}: {
  children: (foregroundStyle: MotionStyle) => React.ReactNode;
  index: number;
  progress: MotionValue<number>;
}) {
  const opacity = useTransform(progress, (position) => {
    const rel = Math.min(1, Math.abs(index - position));

    return 1 - heldSmootherstep(rel);
  });
  const foregroundScale = useTransform(progress, (position) => {
    const rel = Math.min(1, Math.abs(index - position));

    return 1 - heldSmootherstep(rel) * PRODUCT_FLOW_SCALE_AMOUNT;
  });
  const foregroundStyle: MotionStyle = {
    scale: foregroundScale,
    transformOrigin: "50% 50%",
  };

  return (
    <motion.div
      aria-hidden="true"
      data-product-flow-visual={index}
      className="pointer-events-none absolute inset-0"
      style={{ opacity }}
    >
      {children(foregroundStyle)}
    </motion.div>
  );
}

function ProductFlowStepVisual({
  className,
  copy,
  controlClassName,
  foregroundStyle,
  step,
}: {
  className?: string;
  copy: LandingCopy["workflow"];
  controlClassName: string;
  foregroundStyle?: MotionStyle;
  step: ProductFlowStep;
}) {
  if (step.visual === "profile") {
    return (
      <ProfileSyncVisual
        className={className}
        foregroundStyle={foregroundStyle}
        profile={copy.profileCard}
      />
    );
  }

  if (step.visual === "conversation") {
    return (
      <ConversationVisual
        chatRows={copy.chatRows}
        className={className}
        controlClassName={controlClassName}
        foregroundStyle={foregroundStyle}
        stopLabel={copy.stopLabel}
      />
    );
  }

  if (step.visual === "roles") {
    return (
      <RoleBriefingVisual
        className={className}
        connectionBadge={copy.connectionBadge}
        foregroundStyle={foregroundStyle}
        openPositionBadge={copy.openPositionBadge}
      />
    );
  }

  return (
    <GmailNotificationVisual
      className={className}
      foregroundStyle={foregroundStyle}
      notifications={copy.notifications}
    />
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
      <h3 className="max-w-[480px] text-[20px] font-medium leading-[1.18] text-neutral-950 md:text-[32px]">
        {title}
      </h3>
      {body ? <p className={`mt-5 max-w-[480px] ${text.sm}`}>{body}</p> : null}
    </div>
  );
}

function ProfileSyncVisual({
  className,
  foregroundStyle,
  profile,
}: {
  className?: string;
  foregroundStyle?: MotionStyle;
  profile: LandingCopy["workflow"]["profileCard"];
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[430px] items-center justify-center overflow-hidden rounded-[18px] bg-[#F2F0EC] p-5 ring-1 ring-black/[0.04] md:min-h-[500px] md:p-8",
        className
      )}
    >
      <motion.div
        data-product-flow-visual-fg
        className="relative mx-auto flex h-full min-h-0 w-full items-center justify-center"
        style={foregroundStyle}
      >
        <div className="relative w-[380px] max-w-[86%] md:scale-[0.86]">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.7 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-[18px] bg-white shadow-[0_14px_40px_rgba(40,30,20,0.10),0_0_0_1px_rgba(0,0,0,0.05)]"
          >
            <div className="relative h-[70px] bg-[#C9956C]">
              <div className="absolute left-[22px] top-[38px] flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white bg-[#ECE5DB] text-[#A0917E]">
                <User2 className="h-8 w-8" strokeWidth={1.8} />
              </div>
            </div>

            <div className="px-[22px] pb-[18px] pt-[46px]">
              <div className="text-[17px] font-semibold leading-tight tracking-normal text-[#1F1C1A]">
                {profile.name}
              </div>
              <div className="mt-1 text-[13px] leading-snug text-[#857B6E]">
                {profile.role}
              </div>
              <div className="mt-3.5 flex flex-wrap gap-[7px]">
                {profile.skills.map((skill, index) => (
                  <span
                    key={skill}
                    className={cn(
                      "whitespace-nowrap rounded-full px-3 py-[5px] text-[12.5px] font-medium",
                      index === 0
                        ? "bg-[#14110F] text-white"
                        : "border border-black/10 bg-white text-[#3A342D]"
                    )}
                  >
                    {skill}
                  </span>
                ))}
              </div>
              <div className="mt-[18px] flex items-center gap-2 border-t border-black/[0.07] pt-3.5 text-[13px] font-medium text-[#4D3820]">
                <Scan className="h-3 w-3" strokeWidth={1.8} />
                {profile.status}
              </div>
            </div>
          </motion.div>

          {[
            {
              label: "LinkedIn",
              className: "right-[-20px] top-11",
              icon: Linkedin,
            },
            {
              label: "GitHub",
              className: "left-[-26px] top-[calc(30%_-_27px)]",
              icon: Github,
            },
            {
              label: "X",
              className: "bottom-[-16px] right-[-8px]",
              icon: GraduationCap,
            },
          ].map(({ className: badgeClassName, icon: Icon, label }, index) => (
            <motion.span
              key={label}
              aria-label={label}
              initial={{ opacity: 0, scale: 0.84 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{
                duration: 0.42,
                delay: 0.12 + index * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={cn(
                "absolute z-10 flex h-[54px] w-[54px] items-center justify-center rounded-2xl bg-white text-[#1F1C1A] shadow-[0_10px_26px_rgba(40,30,20,0.16),0_0_0_1px_rgba(0,0,0,0.04)]",
                badgeClassName
              )}
            >
              <Icon className="h-[27px] w-[27px]" strokeWidth={1.8} />
            </motion.span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function ConversationVisual({
  chatRows,
  className,
  controlClassName,
  foregroundStyle,
  stopLabel,
}: {
  chatRows: readonly { by: string; text: string }[];
  className?: string;
  controlClassName: string;
  foregroundStyle?: MotionStyle;
  stopLabel: string;
}) {
  return (
    <div
      className={cn(
        "relative min-h-[430px] overflow-hidden rounded-[18px] bg-neutral-950 p-6 text-white ring-1 ring-black/[0.04] md:min-h-[500px]",
        className
      )}
    >
      <Image
        src="/images/green.jpg"
        alt=""
        fill
        sizes="(min-width: 768px) 54vw, 100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-neutral-950/38" />
      <motion.div
        data-product-flow-visual-fg
        className="relative flex h-full min-h-0 flex-col items-center justify-center"
        style={foregroundStyle}
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[344px] origin-center flex-col justify-between text-[13px] md:text-[14px] leading-[1.55]  h-[360px]! md:h-[407px]! md:shrink-0 md:scale-[0.84]">
          <div className="space-y-2.5">
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
          </div>

          <div className="flex w-full items-center justify-center pt-5">
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
                {stopLabel}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
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

function RoleBriefingVisual({
  className,
  connectionBadge,
  foregroundStyle,
  openPositionBadge,
}: {
  className?: string;
  connectionBadge: string;
  foregroundStyle?: MotionStyle;
  openPositionBadge: string;
}) {
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
    <div
      className={cn(
        "rounded-[18px] min-h-[360px] flex items-center justify-center bg-neutral-100 p-4 ring-1 ring-black/[0.04] md:p-5",
        className
      )}
    >
      <motion.div
        data-product-flow-visual-fg
        className="grid w-full max-w-[400px] gap-2.5"
        style={foregroundStyle}
      >
        {roleCards.map((card) => (
          <div
            key={card.role}
            className="relative rounded-[12px] bg-white px-4 py-5 ring ring-black/5"
          >
            <div className="absolute top-1 right-2">
              <Badge
                size="small"
                color={card.company === "Anthropic" ? "primary" : "neutral"}
              >
                {card.company === "Anthropic" ? (
                  <span className="flex flex-row items-center gap-1">
                    <HeartHandshake className="h-3.5 w-3.5" />
                    {connectionBadge}
                  </span>
                ) : (
                  openPositionBadge
                )}
              </Badge>
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
      </motion.div>
    </div>
  );
}

function GmailNotificationVisual({
  className,
  foregroundStyle,
  notifications,
}: {
  className?: string;
  foregroundStyle?: MotionStyle;
  notifications: LandingCopy["workflow"]["notifications"];
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center min-h-[410px] overflow-hidden rounded-[18px] bg-neutral-950 p-5 ring-1 ring-black/[0.04] md:min-h-[460px] md:p-8",
        className
      )}
    >
      <Image
        src="/images/sky1.jpg"
        alt=""
        fill
        sizes="(min-width: 768px) 54vw, 100vw"
        className="object-cover brightness-[0.78] contrast-[1.05] saturate-[0.6]"
      />
      <div className="absolute inset-0 bg-neutral-950/28" />

      <motion.div
        data-product-flow-visual-fg
        className="relative flex h-full min-h-0 items-center justify-center"
        style={foregroundStyle}
      >
        <div className="flex w-full max-w-[430px] flex-col items-center justify-center md:scale-[0.88]">
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
                  <div className="mt-0.5 truncate text-sm md:text-[16px] font-medium">
                    {item.title}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[13px] md:text-[14px] leading-[1.45] text-white/90">
                    {item.body}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

function OpportunityCard({
  item,
  careerStartHref,
  onCareerStartClick,
  ctaLabel,
  isDuplicate = false,
}: {
  item: LandingCopy["opportunities"]["items"][number];
  careerStartHref: string;
  onCareerStartClick: React.MouseEventHandler<HTMLAnchorElement>;
  ctaLabel: string;
  isDuplicate?: boolean;
}) {
  return (
    <Link
      href={careerStartHref}
      onClick={onCareerStartClick}
      data-opportunity-card={item.name}
      aria-hidden={isDuplicate || undefined}
      tabIndex={isDuplicate ? -1 : undefined}
      className="flex min-h-[178px] w-full flex-col rounded-3xl border border-black/5 bg-white p-6 group"
    >
      <div className="text-[15px] md:text-base font-normal">{item.name}</div>
      <div className="mt-2 text-[13px] md:text-[14px] font-normal leading-6 text-black/50">
        {item.description}
      </div>
      <div className="mt-auto flex w-fit flex-row items-center gap-1 pt-8 text-sm text-primary transition-colors group-hover:text-neutral-950">
        {ctaLabel} <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}

function OpportunityScroller({
  copy,
  careerStartHref,
  onCareerStartClick,
}: {
  copy: LandingCopy["opportunities"];
  careerStartHref: string;
  onCareerStartClick: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <div
      data-opportunity-section
      className={`${ui.pageX} ${ui.sectionY} bg-neutral-100`}
    >
      <div className={ui.shell}>
        <SectionHeader
          title={<span className="block md:pl-6">{copy.title}</span>}
          desc={<span className="block md:pl-6">{copy.desc}</span>}
          body={
            <>
              {/* <Link href="/jobs" className={cx(ui.btn, ui.btnSecondary)}>
                {copy.viewMore}
              </Link> */}
            </>
          }
        />

        <div className="grid w-full grid-cols-1 items-start gap-3 md:hidden">
          {copy.items.map((item) => (
            <OpportunityCard
              key={item.name}
              item={item}
              careerStartHref={careerStartHref}
              onCareerStartClick={onCareerStartClick}
              ctaLabel={copy.cardCta}
            />
          ))}
        </div>
      </div>

      <div
        className="hidden w-full overflow-hidden md:block"
        style={{
          WebkitMaskImage:
            "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)",
          maskImage:
            "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)",
        }}
      >
        <div
          data-opportunity-rail
          className="grid w-full auto-cols-[calc((100%_-_24px)/4)] grid-flow-col items-stretch gap-3 will-change-transform"
        >
          {[...copy.items, ...copy.items].map((item, index) => (
            <OpportunityCard
              key={`${item.name}-${index}`}
              item={item}
              careerStartHref={careerStartHref}
              onCareerStartClick={onCareerStartClick}
              ctaLabel={copy.cardCta}
              isDuplicate={index >= copy.items.length}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AudiencePreviewCard({ label }: { label: string }) {
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
        <span>{label}</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}

function SectionHeader({
  title,
  desc,
  body,
  isCenter = false,
}: {
  title: React.ReactNode;
  desc?: React.ReactNode;
  body?: React.ReactNode;
  isCenter?: boolean;
}) {
  return (
    <div
      className={`flex flex-col md:flex-row gap-5 md:gap-14 items-start md:items-end w-full mb-10 md:mb-12 ${isCenter ? "justify-center text-center" : "justify-between"}`}
    >
      <div className="flex flex-col gap-2">
        <h2 className={`${text.h2} w-full`}>{title}</h2>
        {desc && (
          <p
            className={cn(
              text.p,
              "w-full max-w-[1040px] mt-2 text-neutral-700"
            )}
          >
            {desc}
          </p>
        )}
      </div>
      {body ? (
        <p
          className={`${text.p} w-full max-w-[320px] flex items-end justify-end md:mr-8 md:ml-auto`}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

type LandingKoVfPageProps = {
  heroCopyAbtestType: CareerLandingHeroCopyAbtestType;
  locale: Locale;
};

type RequestHeaders = Record<string, string | string[] | undefined>;
type RequestCookies = Partial<Record<string, string>>;

function readHeader(headers: RequestHeaders, name: string) {
  const value = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeLocale(value: unknown): Locale | null {
  return value === "ko" || value === "en" ? value : null;
}

function getLocaleCountryFromAcceptLanguage(acceptLanguage: string) {
  const primaryLocale = acceptLanguage.split(",")[0]?.trim() ?? "";
  const [, rawCountry] = primaryLocale.split("-");
  return (rawCountry ?? "").toUpperCase();
}

function resolveLandingLocale(
  headers: RequestHeaders,
  cookies: RequestCookies
): Locale {
  const cookieLocale = normalizeLocale(cookies.NEXT_LOCALE);
  if (cookieLocale) return cookieLocale;

  const headerCountry =
    readHeader(headers, "x-vercel-ip-country") ||
    readHeader(headers, "cf-ipcountry") ||
    readHeader(headers, "x-country-code");
  const countryCode = (
    headerCountry ||
    getLocaleCountryFromAcceptLanguage(readHeader(headers, "accept-language"))
  ).toUpperCase();

  return countryCode === "KR" ? "ko" : "en";
}

function buildHeroCopyAbtestCookie(value: CareerLandingHeroCopyAbtestType) {
  return [
    `${CAREER_LANDING_HERO_COPY_ABTEST_COOKIE}=${value}`,
    "Path=/",
    "Max-Age=31536000",
    "SameSite=Lax",
  ].join("; ");
}

export const getServerSideProps: GetServerSideProps<
  LandingKoVfPageProps
> = async ({ req, res }) => {
  const heroCopyAbtestType = resolveCareerLandingHeroCopyAbtestType(
    req.cookies[CAREER_LANDING_HERO_COPY_ABTEST_COOKIE]
  );
  res.setHeader("Set-Cookie", buildHeroCopyAbtestCookie(heroCopyAbtestType));

  return {
    props: {
      heroCopyAbtestType,
      locale: resolveLandingLocale(req.headers, req.cookies),
    },
  };
};

export default function LandingKoVfPage({
  heroCopyAbtestType,
  locale,
}: LandingKoVfPageProps) {
  const [landingLocale, setLandingLocale] = useState<Locale>(locale);
  const copy = LANDING_COPY[landingLocale];
  const heroBody = usesCareerLandingHeroCopyB(heroCopyAbtestType)
    ? HERO_BODY_VARIANT_B[landingLocale]
    : copy.hero.body;
  const heroTitleClassName = cn(
    "text-center",
    text.h1,
    landingLocale === "en" &&
      "text-[36px] sm:text-[56px] md:text-[66px] leading-[1.16]"
  );
  const { careerStartHref, handleCareerStartClick } = useCareerLandingStart({
    abtestType: heroCopyAbtestType,
  });

  return (
    <MessagesProvider locale={landingLocale}>
      <Head>
        <title>{copy.meta.title}</title>
        <meta name="description" content={copy.meta.description} />
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
        html,
        body {
          overflow-x: clip !important;
          overflow-y: visible !important;
          position: relative;
        }

        nextjs-portal {
          display: none !important;
        }

        @keyframes opportunity-rail-scroll {
          from {
            transform: translate3d(0, 0, 0);
          }
          to {
            transform: translate3d(calc(-166.6666666667% - 20px), 0, 0);
          }
        }

        [data-opportunity-rail] {
          animation: opportunity-rail-scroll 64s linear infinite;
        }
      `}</style>

      <div
        id="top"
        className="min-h-screen overflow-x-clip break-keep bg-white font-sans text-neutral-950 antialiased"
      >
        <CareerAppBar
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
          labels={copy.appBar}
        />

        <main>
          <section className={`${ui.pageX} pt-32 md:pt-48`}>
            <div className={ui.shell}>
              <Reveal once blur={0} distance={20}>
                <div className="flex flex-col items-center justify-center gap-4 md:gap-8">
                  <h1 className={heroTitleClassName}>
                    {copy.hero.title[0]}
                    <br />
                    {copy.hero.title[1]}
                  </h1>
                  <p className="max-w-[520px] text-center text-[15px] leading-[1.75] text-neutral-700 md:text-[18px]">
                    <Lines lines={heroBody} />
                  </p>
                  <div className="mt-4 md:mt-4">
                    <Link
                      href={careerStartHref}
                      onClick={handleCareerStartClick}
                      className={cx(ui.btn, ui.btnPrimary)}
                    >
                      {copy.hero.cta}
                    </Link>
                    {/* <a href="#workflow" className={cx(ui.btn, ui.btnSecondary)}>
                      {copy.hero.secondaryCta}
                    </a> */}
                  </div>
                </div>
              </Reveal>
              <br />
              <br />
              <Reveal>
                <TalentSocialProof title={copy.socialProofTitle} />
              </Reveal>

              <Reveal once blur={0} distance={20} delay={0.08}>
                <HeroScreenshot
                  desktopLabel={copy.hero.desktopLabel}
                  mailNotification={copy.hero.mailNotification}
                />
              </Reveal>
            </div>
          </section>

          <section
            id="workflow"
            className={`${ui.pageX} ${ui.sectionY} bg-neutral-50`}
          >
            <div className={ui.shell}>
              <div className="md:hidden">
                <Reveal once blur={0} distance={20}>
                  <SectionHeader
                    title={
                      <>
                        {copy.workflow.title[0]}
                        <br />
                        {copy.workflow.title[1]}
                      </>
                    }
                    body={<>{copy.workflow.body}</>}
                  />
                </Reveal>
              </div>

              <ProductFlowPanel copy={copy.workflow} />
            </div>
          </section>

          <section id="how" className={`${ui.pageX} ${ui.sectionY}`}>
            <div className={ui.shell}>
              <Reveal once>
                <SectionHeader
                  title={
                    <>
                      <div className={`${text.h2}`}>
                        <div className="text-black/50 font-medium leading-[1.4]">
                          <p
                            dangerouslySetInnerHTML={{
                              __html: copy.how.statement.prefix,
                            }}
                          />
                          <span className="text-black">
                            {copy.how.statement.focus}
                          </span>
                        </div>
                      </div>
                    </>
                  }
                />
              </Reveal>

              <div className="grid md:grid-cols-2 gap-4">
                {copy.how.topRows.map((row, index) => {
                  const Icon = howTopIcons[index];

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
                            <Lines lines={row.body} />
                          </p>
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
              </div>
              <div className="mt-4 grid md:grid-cols-3 gap-4">
                {copy.how.rows.map((row, index) => {
                  const Icon = howIcons[index];

                  return (
                    <Reveal key={row.title} once delay={index * 0.06}>
                      <div
                        className={`flex min-h-[158px] h-full w-full flex-col rounded-3xl border border-black/5 bg-neutral-100 p-6`}
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
                          <Lines lines={row.body} />
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
                  title={
                    <div
                      className="text-white leading-[1.4]"
                      dangerouslySetInnerHTML={{ __html: copy.voices.title }}
                    />
                  }
                  desc={
                    <span className="text-white/80">{copy.voices.desc}</span>
                  }
                />
              </Reveal>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {copy.voices.items.map((voice, index) => (
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
                      {copy.security.title}
                    </div>
                  }
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 pb-8">
                  {copy.security.items.map((item, index) => {
                    const Icon = securityIcons[index] ?? LockKeyhole;

                    return (
                      <div className="relative z-10" key={item.title}>
                        <div
                          className={cn(
                            `${text.lg} flex items-center gap-3 text-neutral-50 font-medium`
                          )}
                        >
                          <span className="text-white">
                            <Icon
                              className="h-[18px] w-[18px]"
                              strokeWidth={1.8}
                            />
                          </span>
                          <span>{item.title}</span>
                        </div>
                        <p className={cn(`${text.sm} mt-2 text-neutral-50/60`)}>
                          {item.body}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Reveal>
            </div>
          </section>

          <OpportunityScroller
            copy={copy.opportunities}
            careerStartHref={careerStartHref}
            onCareerStartClick={handleCareerStartClick}
          />

          <div className={`${ui.pageX} ${ui.sectionY} bg-white`}>
            <div className={cn("flex items-center justify-center w-full px-4")}>
              <div className="max-w-[720px] flex flex-col w-full items-start justify-between min-h-[300px] bg-neutral-100 p-6 rounded-3xl">
                <div className={`${text.h3}`}>{copy.audience.title}</div>
                <div className="mt-6 grid w-full auto-rows-max grid-cols-1 gap-3 sm:grid-cols-2">
                  {copy.audience.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex w-full items-center rounded-full text-[13px] leading-snug md:text-sm"
                    >
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
              {/* <div className="w-full flex-1 h-full">
                  <AudiencePreviewCard label={copy.audience.aboutLabel} />
                </div> */}
            </div>
          </div>

          <section id="cta" className={`${ui.pageX} ${ui.sectionY}`}>
            <div className={ui.shell}>
              <Reveal once blur={0} distance={20}>
                <div className="flex flex-col gap-4 items-center justify-center text-center">
                  <h2 className={`${text.h2}`}>
                    {copy.cta.title[0]} {copy.cta.title[1]}
                  </h2>
                  {copy.cta.desc && (
                    <p
                      className={cn(text.lg, "mt-2 text-neutral-800")}
                      dangerouslySetInnerHTML={{ __html: copy.cta.desc }}
                    />
                  )}
                  <Link
                    href={careerStartHref}
                    onClick={handleCareerStartClick}
                    className={cx(ui.btn, ui.btnPrimary, "mt-8")}
                  >
                    {copy.cta.button}
                  </Link>
                  <div
                    className={cx("text-sm md:text-sm text-neutral-700 italic")}
                  >
                    {copy.cta.note}
                  </div>
                </div>
              </Reveal>
            </div>
          </section>
        </main>

        <CareerLandingFooter
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
          locale={landingLocale}
          onLocaleChange={setLandingLocale}
          labels={copy.footer}
        />
      </div>
    </MessagesProvider>
  );
}
