import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  CareerChatPanelProvider,
  type CareerChatPanelContextValue,
} from "@/components/career/CareerChatPanelContext";
import {
  CareerSidebarProvider,
  type CareerSidebarContextValue,
} from "@/components/career/CareerSidebarContext";
import CareerSettingsModal from "@/components/career/CareerSettingsModal";
import CareerWorkspaceScreen from "@/components/career/CareerWorkspaceScreen";
import type { CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";
import {
  CareerOpportunityType,
  type CareerHistoryOpportunity,
  type CareerMessage,
  type CareerRecentOpportunity,
  type CareerTalentInsights,
  type CareerTalentPreferences,
  type CareerTalentProfile,
} from "@/components/career/types";
import { getCareerDefaultSavedStage } from "@/components/career/opportunityTypeMeta";
import { deriveHistoryOpportunityCounts } from "@/hooks/career/careerSessionData";
import {
  DEFAULT_TALENT_GET_EXTERNAL_RECOMMENDATION,
  DEFAULT_TALENT_GET_INTERNAL_RECOMMENDATION,
  DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS,
  DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
} from "@/lib/talentOnboarding/recommendationSettings";
import { cn } from "@/lib/utils";
import { useCareerT } from "@/i18n/useCareerT";
import React from "react";

type CareerT = ReturnType<typeof useCareerT>;

const PREVIEW_NOW = Date.UTC(2026, 3, 20, 9, 0, 0);
const previewDate = (offsetMs = 0) =>
  new Date(PREVIEW_NOW + offsetMs).toISOString();
const previewDaysAgo = (days: number) =>
  previewDate(-days * 24 * 60 * 60 * 1000);
const previewHoursAgo = (hours: number) => previewDate(-hours * 60 * 60 * 1000);
const previewMinutesAfter = (minutes: number) =>
  previewDate(minutes * 60 * 1000);

type CareerWorkspaceHistoryTarget = {
  historyTab: "new" | "saved" | "archived";
  savedStage?:
    | "all"
    | "saved"
    | "applied"
    | "connected"
    | "closed"
    | "hidden";
};

const mockUser = {
  id: "career-preview-user",
  email: "preview@harper.ai",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {
    name: "Chris",
    full_name: "Chris",
  },
  created_at: previewDate(),
} as User;

const initialTalentPreferences: CareerTalentPreferences = {
  engagementTypes: ["full_time", "fractional"],
  getExternalRecommendation: DEFAULT_TALENT_GET_EXTERNAL_RECOMMENDATION,
  getInternalRecommendation: DEFAULT_TALENT_GET_INTERNAL_RECOMMENDATION,
  isOnboardingDone: true,
  periodicIntervalDays: DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS,
  recommendationBatchSize: DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
};

const getInitialTalentInsights = (t: CareerT): CareerTalentInsights => ({
  technical_strengths: t(
    "career.preview.career_workspace_preview.1c9yhl3",
    "LLM 제품을 실제 사용자와 맞닿은 환경에 배포하는 일을 주로 해왔고, 모델 품질과 제품 속도를 같이 관리하는 역할을 선호합니다."
  ),
  desired_teams: t(
    "career.preview.career_workspace_preview.0wa8f7a",
    "작은 팀이어도 제품 방향과 기술 의사결정이 빠른 곳을 선호합니다. 의미 없는 AI 포장보다는 실제 사용량이 있는 제품이면 좋겠습니다."
  ),
});

const getInitialTalentProfile = (t: CareerT): CareerTalentProfile => ({
  talentUser: {
    user_id: "career-preview-user",
    name: "Chris",
    profile_picture: null,
    headline: "Applied AI Engineer focused on shipping agent products",
    bio: t(
      "career.preview.career_workspace_preview.1hcvc0e",
      "사용자와 맞닿은 AI 제품을 빠르게 배포하고, 모델 성능과 제품 UX 사이의 균형을 설계하는 역할을 주로 맡아왔습니다."
    ),
    location: "Seoul, South Korea",
  },
  talentExperiences: [
    {
      id: 1,
      talent_id: "career-preview-user",
      role: "Senior AI Engineer",
      description: t(
        "career.preview.career_workspace_preview.12a8e6s",
        "대화형 agent 제품을 설계하고, retrieval / evaluation / observability 파이프라인을 구축했습니다."
      ),
      employment_type: "Full-time",
      start_date: "2023-01-01",
      end_date: null,
      months: 28,
      company_id: null,
      company_link: null,
      company_name: "Applied AI Startup",
      company_location: "Seoul",
      company_logo: null,
      memo: t(
        "career.preview.career_workspace_preview.0ng3mak",
        "0 to 1 제품 론치 경험"
      ),
    },
    {
      id: 2,
      talent_id: "career-preview-user",
      role: "Software Engineer",
      description: t(
        "career.preview.career_workspace_preview.19rh5dl",
        "데이터 파이프라인과 internal tooling을 개발하며 제품팀과 협업했습니다."
      ),
      employment_type: "Full-time",
      start_date: "2020-02-01",
      end_date: "2022-12-01",
      months: 34,
      company_id: null,
      company_link: null,
      company_name: "Global SaaS Team",
      company_location: "Remote",
      company_logo: null,
      memo: null,
    },
  ],
  talentEducations: [
    {
      id: 1,
      talent_id: "career-preview-user",
      school: "KAIST",
      degree: "M.S.",
      description: "Machine Learning Systems",
      field: "Computer Science",
      start_date: "2018-03-01",
      end_date: "2020-02-01",
      url: null,
      memo: null,
    },
  ],
  talentExtras: [
    {
      title: "Open Source",
      description: t(
        "career.preview.career_workspace_preview.1tenwz4",
        "LLM eval 도구와 agent workflow 패키지 유지보수"
      ),
      date: null,
      memo: null,
    },
  ],
});

const getPreviewConversationTurns = (
  t: CareerT
): Array<Pick<CareerMessage, "role" | "content" | "messageType">> => [
  {
    role: "assistant",
    content: t(
      "career.preview.career_workspace_preview.022alch",
      "온보딩이 끝났어요. 지금은 어떤 기회를 가장 우선해서 보고 싶으세요?"
    ),
    messageType: "chat",
  },
  {
    role: "user",
    content: t(
      "career.preview.career_workspace_preview.1j2um38",
      "글로벌 AI 제품팀에서 지금보다 보상과 책임이 큰 역할을 먼저 보고 싶어요."
    ),
    messageType: "chat",
  },
  {
    role: "assistant",
    content: t(
      "career.preview.career_workspace_preview.0gdmtk0",
      "좋아요. 서울, Remote, SF까지 열어두고 applied AI와 agent product 중심으로 좁혀볼게요."
    ),
    messageType: "chat",
  },
  {
    role: "user",
    content: t(
      "career.preview.career_workspace_preview.19k8ud9",
      "정규직이 우선이고, 강한 fit이면 fractional advisory도 괜찮아요."
    ),
    messageType: "chat",
  },
  {
    role: "assistant",
    content: t(
      "career.preview.career_workspace_preview.0kof53s",
      "반영했어요. 연결 가능한 내부 기회와 공개 포지션을 함께 보고, fit이 강한 것부터 먼저 정리해둘게요."
    ),
    messageType: "chat",
  },
];

function buildPreviewConversationMessages({
  loopKey,
  typing,
  turns,
  visibleCount,
}: {
  loopKey: number;
  typing: boolean;
  turns: Array<Pick<CareerMessage, "role" | "content" | "messageType">>;
  visibleCount: number;
}): CareerMessage[] {
  return turns.slice(0, visibleCount).map((turn, index) => ({
    ...turn,
    id: `preview-loop-${loopKey}-${index}`,
    createdAt: previewMinutesAfter(index),
    typing: typing && index === visibleCount - 1 && turn.role === "assistant",
  }));
}

const getInitialRecentOpportunities = (
  t: CareerT
): CareerRecentOpportunity[] => [
  {
    id: "preview-history-1",
    kind: "match",
    opportunityType: CareerOpportunityType.IntroRequest,
    title: "Applied AI Engineer",
    companyName: "Stealth Agent Startup",
    summary: t(
      "career.preview.career_workspace_preview.0r19bht",
      "작은 팀에서 제품과 모델 품질을 함께 책임질 수 있는 역할입니다."
    ),
    location: "Seoul / Hybrid",
    engagementType: "Full-time",
    matchedAt: previewDaysAgo(2),
  },
  {
    id: "preview-history-2",
    kind: "recommendation",
    opportunityType: CareerOpportunityType.ExternalJd,
    title: "Founding ML Engineer",
    companyName: "Global Remote SaaS",
    summary: t(
      "career.preview.career_workspace_preview.1ist4od",
      "초기 제품 방향과 LLM workflow를 같이 설계할 수 있는 포지션입니다."
    ),
    location: "US / Remote",
    engagementType: "Full-time or Fractional",
    matchedAt: previewDaysAgo(4),
  },
];

const getInitialHistoryOpportunities = (
  t: CareerT
): CareerHistoryOpportunity[] => [
  {
    id: "preview-history-1",
    roleId: "preview-role-1",
    title: "Applied AI Engineer",
    companyName: "Harper Portfolio Team",
    companyDescription: t(
      "career.preview.career_workspace_preview.1gp8ljf",
      "작은 제품팀에서 모델 품질과 사용자 경험을 같이 책임지는 팀입니다."
    ),
    companyHomepageUrl: "https://harper.ai",
    companyLinkedinUrl: null,
    companyLogoUrl: null,
    description: t(
      "career.preview.career_workspace_preview.1nzus3x",
      "프로덕트 팀과 바로 붙어 agent 기능을 제품에 배포하고 운영 지표까지 같이 보는 역할입니다."
    ),
    employmentTypes: ["full_time"],
    externalJdUrl: null,
    feedback: null,
    feedbackAt: null,
    feedbackReason: null,
    href: "https://harper.ai",
    clickedAt: null,
    isAccepted: true,
    isInternal: true,
    kind: "match",
    location: "Seoul",
    opportunityType: CareerOpportunityType.IntroRequest,
    postedAt: previewDaysAgo(4),
    recommendedAt: previewDaysAgo(2),
    recommendationReasons: [
      t(
        "career.preview.career_workspace_preview.0r259wt",
        "LLM 제품 론치 경험이 직접적으로 연결됩니다."
      ),
      t(
        "career.preview.career_workspace_preview.051gu06",
        "작은 팀에서 제품 방향과 기술 의사결정을 함께 가져갈 수 있습니다."
      ),
    ],
    sourceJobId: null,
    savedStage: null,
    sourceProvider: null,
    sourceType: "internal",
    status: "active",
    viewedAt: null,
    workMode: "hybrid",
  },
  {
    id: "preview-history-2",
    roleId: "preview-role-2",
    title: "Founding ML Engineer",
    companyName: "Global Remote SaaS",
    companyDescription: t(
      "career.preview.career_workspace_preview.01j68q1",
      "미국 기반 B2B SaaS 팀으로, 초기 AI 기능을 제품 핵심으로 전환하고 있습니다."
    ),
    companyHomepageUrl: "https://example.com/remote-saas",
    companyLinkedinUrl: "https://linkedin.com/company/remote-saas",
    companyLogoUrl: null,
    description: t(
      "career.preview.career_workspace_preview.18ymrj7",
      "LLM workflow와 evaluation 체계를 만들고, 엔지니어링 팀과 함께 고객 기능을 빠르게 실험하는 포지션입니다."
    ),
    employmentTypes: ["full_time", "contract"],
    externalJdUrl: "https://jobs.example.com/founding-ml",
    feedback: "positive",
    feedbackAt: previewDaysAgo(1),
    feedbackReason: null,
    href: "https://jobs.example.com/founding-ml",
    clickedAt: previewHoursAgo(23),
    isAccepted: false,
    isInternal: false,
    kind: "recommendation",
    location: "US",
    opportunityType: CareerOpportunityType.ExternalJd,
    postedAt: previewDaysAgo(7),
    recommendedAt: previewDaysAgo(3),
    recommendationReasons: [
      t(
        "career.preview.career_workspace_preview.19hvkft",
        "Remote 선호와 제품 중심 applied AI 경험이 잘 맞습니다."
      ),
      t(
        "career.preview.career_workspace_preview.05fo2rr",
        "초기 시스템 설계와 품질 기준 수립 경험을 바로 활용할 수 있습니다."
      ),
    ],
    sourceJobId: "remote-saas-ml-1",
    savedStage: "saved",
    sourceProvider: "greenhouse",
    sourceType: "external",
    status: "active",
    viewedAt: previewHoursAgo(25),
    workMode: "remote",
  },
  {
    id: "preview-history-3",
    roleId: "preview-role-3",
    title: "Research Engineer",
    companyName: "Frontier Robotics Lab",
    companyDescription: t(
      "career.preview.career_workspace_preview.10x4rht",
      "논문과 프로덕트 사이를 잇는 applied research 조직입니다."
    ),
    companyHomepageUrl: "https://example.com/robotics-lab",
    companyLinkedinUrl: null,
    companyLogoUrl: null,
    description: t(
      "career.preview.career_workspace_preview.045qelm",
      "멀티모달 모델 평가 파이프라인과 배포 시스템을 만드는 역할입니다."
    ),
    employmentTypes: ["full_time"],
    externalJdUrl: "https://jobs.example.com/research-engineer",
    feedback: null,
    feedbackAt: null,
    feedbackReason: null,
    href: "https://jobs.example.com/research-engineer",
    clickedAt: null,
    isAccepted: false,
    isInternal: false,
    kind: "recommendation",
    location: "Tokyo",
    opportunityType: CareerOpportunityType.ExternalJd,
    postedAt: previewDaysAgo(8),
    recommendedAt: previewDaysAgo(4),
    recommendationReasons: [
      t(
        "career.preview.career_workspace_preview.0hhw3xx",
        "논문 기반 평가 시스템 경험이 직접적으로 이어집니다."
      ),
      t(
        "career.preview.career_workspace_preview.1b3wco5",
        "research와 product의 중간 지점 역할을 선호하는지 확인이 필요한 기회입니다."
      ),
    ],
    sourceJobId: "robotics-lab-2",
    savedStage: null,
    sourceProvider: "lever",
    sourceType: "external",
    status: "active",
    viewedAt: null,
    workMode: "onsite",
  },
  {
    id: "preview-history-4",
    roleId: "preview-role-4",
    title: "Product ML Lead",
    companyName: "Stealth Commerce AI",
    companyDescription: t(
      "career.preview.career_workspace_preview.0kxr9jl",
      "커머스 검색과 개인화 모델을 제품 KPI에 직접 연결하는 팀입니다."
    ),
    companyHomepageUrl: null,
    companyLinkedinUrl: "https://linkedin.com/company/stealth-commerce-ai",
    companyLogoUrl: null,
    description: t(
      "career.preview.career_workspace_preview.05gbt68",
      "추천 모델과 conversational UX를 제품 조직과 함께 리드하는 포지션입니다."
    ),
    employmentTypes: ["full_time"],
    externalJdUrl: null,
    feedback: "negative",
    feedbackAt: previewHoursAgo(6),
    feedbackReason: null,
    href: "https://linkedin.com/company/stealth-commerce-ai",
    clickedAt: null,
    isAccepted: false,
    isInternal: true,
    kind: "recommendation",
    location: "Singapore",
    opportunityType: CareerOpportunityType.InternalRecommendation,
    postedAt: previewDaysAgo(10),
    recommendedAt: previewDaysAgo(5),
    recommendationReasons: [
      t(
        "career.preview.career_workspace_preview.0occyrr",
        "제품 오너십은 높지만 도메인 자체 선호가 갈릴 수 있습니다."
      ),
    ],
    sourceJobId: null,
    savedStage: null,
    sourceProvider: null,
    sourceType: "internal",
    status: "active",
    viewedAt: previewDaysAgo(5),
    workMode: "hybrid",
  },
];

type CareerWorkspacePreviewViewport = "desktop" | "mobile";
type CareerWorkspacePreviewViewportMode =
  | CareerWorkspacePreviewViewport
  | "auto";

type CareerWorkspacePreviewProps = {
  autoPlayConversation?: boolean;
  className?: string;
  disableInteractions?: boolean;
  embedded?: boolean;
  initialTab?: CareerWorkspaceTab | "chat";
  viewport?: CareerWorkspacePreviewViewportMode;
};

const PREVIEW_VIEWPORT_SIZE: Record<
  CareerWorkspacePreviewViewport,
  { width: number; height: number }
> = {
  desktop: { width: 1512, height: 827 },
  mobile: { width: 390, height: 844 },
};

const PREVIEW_MOBILE_MAX_WIDTH = 520;

const ScaledPreviewViewport = ({
  children,
  viewport,
}: {
  children:
    | ReactNode
    | ((resolvedViewport: CareerWorkspacePreviewViewport) => ReactNode);
  viewport: CareerWorkspacePreviewViewportMode;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [{ height, width }, setSize] = useState({ height: 0, width: 0 });
  const resolvedViewport =
    viewport === "auto"
      ? width > 0 && width <= PREVIEW_MOBILE_MAX_WIDTH
        ? "mobile"
        : "desktop"
      : viewport;
  const viewportSize = PREVIEW_VIEWPORT_SIZE[resolvedViewport];
  const scale =
    height > 0 && width > 0
      ? Math.min(width / viewportSize.width, height / viewportSize.height)
      : 1;
  const x = Math.max((width - viewportSize.width * scale) / 2, 0);
  const y = Math.max((height - viewportSize.height * scale) / 2, 0);
  const previewStyle = {
    height: viewportSize.height,
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
    transformOrigin: "top left",
    width: viewportSize.width,
  } satisfies CSSProperties;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        height: rect.height,
        width: rect.width,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-bg-basement"
    >
      <div className="absolute left-0 top-0" style={previewStyle}>
        {typeof children === "function" ? children(resolvedViewport) : children}
      </div>
    </div>
  );
};

const CareerWorkspacePreviewLanding = ({
  autoPlayConversation = true,
  className,
  disableInteractions = false,
  embedded = false,
  initialTab = "chat",
  viewport = "auto",
}: CareerWorkspacePreviewProps) => {
  const router = useRouter();
  const t = useCareerT();
  const previewConversationTurns = useMemo(
    () => getPreviewConversationTurns(t),
    [t]
  );
  const initialMessages = useMemo(
    () =>
      buildPreviewConversationMessages({
        loopKey: 0,
        turns: previewConversationTurns,
        typing: false,
        visibleCount: previewConversationTurns.length,
      }),
    [previewConversationTurns]
  );
  const initialRecentOpportunities = useMemo(
    () => getInitialRecentOpportunities(t),
    [t]
  );
  const initialHistoryOpportunities = useMemo(
    () => getInitialHistoryOpportunities(t),
    [t]
  );
  const initialTalentInsights = useMemo(() => getInitialTalentInsights(t), [t]);
  const initialTalentProfile = useMemo(() => getInitialTalentProfile(t), [t]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CareerWorkspaceTab | "chat">(
    initialTab
  );
  const workspaceActiveTab = activeTab === "chat" ? "home" : activeTab;
  const [autoLoopEnabled, setAutoLoopEnabled] = useState(autoPlayConversation);
  const [conversationLoopKey, setConversationLoopKey] = useState(0);
  const [visibleConversationCount, setVisibleConversationCount] = useState(
    autoPlayConversation ? 1 : previewConversationTurns.length
  );
  const [manualMessages, setManualMessages] = useState<CareerMessage[] | null>(
    autoPlayConversation ? null : initialMessages
  );
  const [profileLinks, setProfileLinks] = useState<string[]>([
    "https://linkedin.com/in/preview-candidate",
    "https://github.com/preview-candidate",
    "",
    "https://previewcandidate.dev",
    "https://x.com/previewcandidate",
  ]);
  const [savedProfileLinks, setSavedProfileLinks] = useState<string[]>([
    "https://linkedin.com/in/preview-candidate",
    "https://github.com/preview-candidate",
    "",
    "https://previewcandidate.dev",
    "https://x.com/previewcandidate",
  ]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [savedResumeFileName, setSavedResumeFileName] =
    useState("preview_resume.pdf");
  const [talentPreferences, setTalentPreferences] = useState(
    initialTalentPreferences
  );
  const [savedTalentPreferences, setSavedTalentPreferences] = useState(
    initialTalentPreferences
  );
  const [talentPreferencesUpdatedAt, setTalentPreferencesUpdatedAt] =
    useState(previewDate());
  const [talentPreferencesSaveInfo, setTalentPreferencesSaveInfo] =
    useState("");
  const [talentInsights, setTalentInsights] = useState<CareerTalentInsights>(
    initialTalentInsights
  );
  const [savedTalentInsights, setSavedTalentInsights] =
    useState<CareerTalentInsights>(initialTalentInsights);
  const [talentProfile, setTalentProfile] =
    useState<CareerTalentProfile>(initialTalentProfile);
  const [talentInsightsUpdatedAt, setTalentInsightsUpdatedAt] =
    useState(previewDate());
  const [talentInsightsSaveInfo, setTalentInsightsSaveInfo] = useState("");
  const [profileSaveInfo, setProfileSaveInfo] = useState("");
  const [profileVisibility, setProfileVisibility] = useState<
    "open_to_matches" | "exceptional_only" | "dont_share"
  >("exceptional_only");
  const [savedProfileVisibility, setSavedProfileVisibility] = useState<
    "open_to_matches" | "exceptional_only" | "dont_share"
  >("exceptional_only");
  const [blockedCompanies, setBlockedCompanies] = useState<string[]>([
    "Stealth Robotics",
  ]);
  const [savedBlockedCompanies, setSavedBlockedCompanies] = useState<string[]>([
    "Stealth Robotics",
  ]);
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState(previewDate());
  const [historyOpportunities, setHistoryOpportunities] = useState(
    initialHistoryOpportunities
  );

  useEffect(() => {
    setTalentInsights(initialTalentInsights);
    setSavedTalentInsights(initialTalentInsights);
    setTalentProfile(initialTalentProfile);
    setHistoryOpportunities(initialHistoryOpportunities);
    if (!autoPlayConversation) {
      setManualMessages(initialMessages);
    }
  }, [
    autoPlayConversation,
    initialHistoryOpportunities,
    initialMessages,
    initialTalentInsights,
    initialTalentProfile,
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const blockPreviewInteraction = useCallback(
    (event: SyntheticEvent<HTMLElement>) => {
      if (!disableInteractions) return;
      event.preventDefault();
      event.stopPropagation();
    },
    [disableInteractions]
  );
  const blockPreviewKeyboardInteraction = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!disableInteractions) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
    },
    [disableInteractions]
  );
  const interactionGuardProps = disableInteractions
    ? {
        onClickCapture: blockPreviewInteraction,
        onDoubleClickCapture: blockPreviewInteraction,
        onSubmitCapture: blockPreviewInteraction,
        onKeyDownCapture: blockPreviewKeyboardInteraction,
      }
    : {};
  const messages = useMemo(
    () =>
      autoLoopEnabled
        ? buildPreviewConversationMessages({
            loopKey: conversationLoopKey,
            turns: previewConversationTurns,
            typing: true,
            visibleCount: visibleConversationCount,
          })
        : (manualMessages ?? initialMessages),
    [
      autoLoopEnabled,
      conversationLoopKey,
      initialMessages,
      manualMessages,
      previewConversationTurns,
      visibleConversationCount,
    ]
  );

  useEffect(() => {
    if (!autoLoopEnabled) return;

    const delay =
      visibleConversationCount >= previewConversationTurns.length
        ? 2800
        : visibleConversationCount === 1
          ? 1200
          : 1550;

    const timeoutId = window.setTimeout(() => {
      if (visibleConversationCount >= previewConversationTurns.length) {
        setConversationLoopKey((current) => current + 1);
        setVisibleConversationCount(1);
        return;
      }
      setVisibleConversationCount((current) => current + 1);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [
    autoLoopEnabled,
    previewConversationTurns.length,
    visibleConversationCount,
  ]);
  const handleWorkspaceTabChange = useCallback(
    (
      nextTab: CareerWorkspaceTab,
      options?: {
        historyTarget?: CareerWorkspaceHistoryTarget;
      }
    ) => {
      if (disableInteractions) return;
      setActiveTab(nextTab);

      if (!router.isReady || nextTab !== "history") return;

      const historyTarget = options?.historyTarget;
      if (!historyTarget) return;

      const query: Record<string, string | string[] | undefined> = {
        ...router.query,
        historyTab: historyTarget.historyTab,
      };
      delete query.tab;

      if (historyTarget.savedStage) {
        query.savedStage = historyTarget.savedStage;
      } else {
        delete query.savedStage;
      }

      void router.push(
        {
          pathname: "/career/preview",
          query,
        },
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [disableInteractions, router]
  );

  const sidebarContextValue: CareerSidebarContextValue = useMemo(
    () => ({
      user: mockUser,
      conversationId: "preview-conversation",
      stage: "completed",
      isOnboardingDone: talentPreferences.isOnboardingDone,
      workspaceDataLoading: false,
      userChatCount: 2,
      answeredCount: 8,
      targetQuestions: 8,
      progressPercent: 100,
      onOpenSettings: () => setIsSettingsOpen(true),
      onLogout: () => undefined,
      activeCompanyRoleCount: 1284,
      opportunityRun: null,
      opportunityRunTriggerPending: false,
      onboardingCompletionTestPending: false,
      sessionReengagementTestPending: false,
      currentDataJobPostingRecommendationTestPending: false,
      onRunOnboardingCompletionTest: () => true,
      onRunCurrentDataJobPostingRecommendationTest: () => undefined,
      onRunSessionReengagementTest: () => undefined,
      onRunPeriodicOpportunityDiscoveryTest: () => undefined,
      onRunOpportunityDiscoveryTest: () => undefined,
      recentOpportunities: initialRecentOpportunities,
      historyOpportunityCounts:
        deriveHistoryOpportunityCounts(historyOpportunities),
      historyOpportunities,
      historyLoading: false,
      historyLoadingMore: false,
      hasMoreHistoryOpportunities: false,
      historyUpdatingOpportunityIds: [],
      historyUpdateError: "",
      onLoadMoreHistoryOpportunities: () => undefined,
      onLoadHistoryOpportunityByRoleId: (roleId) =>
        historyOpportunities.find((item) => item.roleId === roleId) ?? null,
      onUpdateHistoryOpportunityFeedback: (
        opportunityId,
        feedback,
        options
      ) => {
        const now = new Date().toISOString();
        setHistoryOpportunities((current) =>
          current.map((item) =>
            item.id === opportunityId
              ? {
                  ...item,
                  feedback,
                  feedbackAt: now,
                  feedbackReason: options?.feedbackReason ?? null,
                  savedStage:
                    feedback === "positive"
                      ? (options?.savedStage ??
                        getCareerDefaultSavedStage(item.opportunityType))
                      : null,
                }
              : item
          )
        );
      },
      onUpdateHistoryOpportunitySavedStage: (opportunityId, savedStage) => {
        setHistoryOpportunities((current) =>
          current.map((item) =>
            item.id === opportunityId
              ? { ...item, feedback: "positive", savedStage }
              : item
          )
        );
      },
      onUpdateHistoryOpportunityTalentMemo: (opportunityId, talentMemo) => {
        setHistoryOpportunities((current) =>
          current.map((item) =>
            item.id === opportunityId
              ? {
                  ...item,
                  talentMemo: String(talentMemo ?? "").trim() || null,
                }
              : item
          )
        );
      },
      onMarkHistoryOpportunityViewed: (opportunityId) => {
        const now = new Date().toISOString();
        setHistoryOpportunities((current) =>
          current.map((item) =>
            item.id === opportunityId && !item.viewedAt
              ? { ...item, viewedAt: now }
              : item
          )
        );
      },
      onMarkHistoryOpportunityClicked: (opportunityId) => {
        const now = new Date().toISOString();
        setHistoryOpportunities((current) =>
          current.map((item) =>
            item.id === opportunityId && !item.clickedAt
              ? { ...item, clickedAt: now }
              : item
          )
        );
      },
      onUpdateCompanyFollow: async () => null,
      resumeFile,
      savedResumeFileName,
      savedResumeStoragePath: "talent/resume/preview_resume.pdf",
      savedResumeDownloadUrl: "#",
      profileLinks,
      savedProfileLinks,
      profileSavePending: false,
      profileSaveError: "",
      profileSaveInfo,
      onResumeFileChange: setResumeFile,
      onProfileLinkChange: (index, value) => {
        setProfileSaveInfo("");
        setProfileLinks((current) =>
          current.map((item, itemIndex) => (itemIndex === index ? value : item))
        );
      },
      onAddProfileLink: () => {
        setProfileSaveInfo("");
        setProfileLinks((current) => [...current, ""]);
      },
      onRemoveProfileLink: (index) => {
        setProfileSaveInfo("");
        setProfileLinks((current) =>
          current.filter((_, itemIndex) => itemIndex !== index)
        );
      },
      onSaveTalentProfile: (args) => {
        setSavedProfileLinks(profileLinks);
        if (resumeFile) {
          setSavedResumeFileName(resumeFile.name);
          setResumeFile(null);
        }
        if (args?.structuredProfile) {
          setTalentProfile(args.structuredProfile);
          setProfileSaveInfo(
            t(
              "career.preview.career_workspace_preview.1truxm7",
              "프로필을 저장했습니다."
            )
          );
          return true;
        }
        setProfileSaveInfo(
          t(
            "career.preview.career_workspace_preview.05bnk2r",
            "이력서와 링크를 저장했습니다."
          )
        );
        return true;
      },
      onRefreshTalentProfileSources: () => {
        setProfileSaveInfo(
          t(
            "career.preview.career_workspace_preview.1bdgvh5",
            "저장된 이력서/링크에서 정보를 다시 가져왔습니다."
          )
        );
        return true;
      },
      talentProfile,
      talentPreferences,
      talentInsights,
      talentPreferencesUpdatedAt,
      talentInsightsUpdatedAt,
      talentPreferencesSavePending: false,
      talentPreferencesSaveError: "",
      talentPreferencesSaveInfo,
      hasUnsavedTalentPreferencesChanges:
        JSON.stringify(talentPreferences) !==
        JSON.stringify(savedTalentPreferences),
      talentInsightsSavePending: false,
      talentInsightsSaveError: "",
      talentInsightsSaveInfo,
      hasUnsavedTalentInsightsChanges:
        JSON.stringify(talentInsights) !== JSON.stringify(savedTalentInsights),
      onTalentPreferencesChange: (next) => {
        setTalentPreferencesSaveInfo("");
        setTalentPreferences((current) =>
          typeof next === "function"
            ? (next(current) ?? current)
            : (next ?? current)
        );
      },
      onSaveTalentPreferences: () => {
        setSavedTalentPreferences(talentPreferences);
        setTalentPreferencesUpdatedAt(new Date().toISOString());
        setTalentPreferencesSaveInfo(
          t(
            "career.preview.career_workspace_preview.0o0xl6w",
            "프로필 설정을 저장했습니다."
          )
        );
        return true;
      },
      onResetTalentPreferences: () => {
        setTalentPreferencesSaveInfo("");
        setTalentPreferences(savedTalentPreferences);
      },
      onTalentInsightsChange: (next) => {
        setTalentInsightsSaveInfo("");
        setTalentInsights((current) =>
          typeof next === "function"
            ? (next(current) ?? current)
            : (next ?? current)
        );
      },
      onSaveTalentInsights: () => {
        setSavedTalentInsights(talentInsights);
        setTalentInsightsUpdatedAt(new Date().toISOString());
        setTalentInsightsSaveInfo(
          t(
            "career.preview.career_workspace_preview.1ashy8n",
            "Harper insight를 저장했습니다."
          )
        );
        return true;
      },
      onResetTalentInsights: () => {
        setTalentInsightsSaveInfo("");
        setTalentInsights(savedTalentInsights);
      },
      settingsLoading: false,
      settingsSaving: false,
      settingsError: "",
      settingsUpdatedAt,
      profileVisibility,
      blockedCompanies,
      hasUnsavedTalentSettingsChanges:
        profileVisibility !== savedProfileVisibility ||
        JSON.stringify(blockedCompanies) !==
          JSON.stringify(savedBlockedCompanies),
      onProfileVisibilityChange: (value) => {
        setProfileVisibility(value);
        setSavedProfileVisibility(value);
        setSettingsUpdatedAt(new Date().toISOString());
        return true;
      },
      onAddBlockedCompany: (name) => {
        const nextBlockedCompanies = blockedCompanies.includes(name)
          ? blockedCompanies
          : [...blockedCompanies, name];
        setBlockedCompanies(nextBlockedCompanies);
        setSavedBlockedCompanies(nextBlockedCompanies);
        setSettingsUpdatedAt(new Date().toISOString());
        return true;
      },
      onRemoveBlockedCompany: (name) => {
        const nextBlockedCompanies = blockedCompanies.filter(
          (item) => item !== name
        );
        setBlockedCompanies(nextBlockedCompanies);
        setSavedBlockedCompanies(nextBlockedCompanies);
        setSettingsUpdatedAt(new Date().toISOString());
        return true;
      },
      onSaveTalentSettings: () => {
        setSavedProfileVisibility(profileVisibility);
        setSavedBlockedCompanies(blockedCompanies);
        setSettingsUpdatedAt(new Date().toISOString());
        return true;
      },
      onResetTalentSettings: () => {
        setProfileVisibility(savedProfileVisibility);
        setBlockedCompanies(savedBlockedCompanies);
      },
      onReloadTalentSettings: () => undefined,
    }),
    [
      blockedCompanies,
      profileLinks,
      profileSaveInfo,
      profileVisibility,
      resumeFile,
      savedBlockedCompanies,
      savedProfileLinks,
      savedProfileVisibility,
      savedResumeFileName,
      savedTalentPreferences,
      settingsUpdatedAt,
      talentPreferences,
      talentInsights,
      talentInsightsSaveInfo,
      talentInsightsUpdatedAt,
      talentProfile,
      talentPreferencesUpdatedAt,
      talentPreferencesSaveInfo,
      savedTalentInsights,
      historyOpportunities,
      initialRecentOpportunities,
      t,
    ]
  );

  const chatContextValue: CareerChatPanelContextValue = useMemo(
    () => ({
      user: mockUser,
      conversationId: "preview-conversation",
      stage: "completed",
      messages,
      scrollRef,
      hasOlderMessages: false,
      loadingOlderMessages: false,
      authLoading: false,
      authPending: false,
      authError: "",
      authInfo: "",
      sessionPending: false,
      sessionError: "",
      isOnboardingDone: talentPreferences.isOnboardingDone,
      resumeFile,
      profileLinks,
      profilePending: false,
      profileError: "",
      chatError: "",
      assistantTyping: autoLoopEnabled,
      toolStatusMessage: "",
      activeThinkingLogs: [],
      activeRecommendationSearchStatus: null,
      onboardingWrapupPending: false,
      thinkingLogsByMessageId: {},
      chatPending: false,
      sessionReengagementPending: false,
      sessionReengagementThinkingLogs: [],
      sessionReengagementRecommendationStatus: null,
      opportunityFeedbackFollowUpPending: false,
      opportunityFeedbackFollowUpTrigger: null,
      opportunityRun: null,
      opportunitySearchLocked: false,
      historyUpdatingOpportunityIds: [],
      onboardingBeginPending: false,
      forceCompletePending: false,
      interviewProgress: {
        canForceComplete: false,
        filledCount: 8,
        percent: 100,
        remainingCount: 0,
        totalCount: 8,
      },
      onboardingPausePending: false,
      onGoogleLogin: () => undefined,
      onEmailAuth: async () => true,
      onResumeFileChange: setResumeFile,
      onProfileLinkChange: (index, value) =>
        setProfileLinks((current) =>
          current.map((item, itemIndex) => (itemIndex === index ? value : item))
        ),
      onRemoveProfileLink: (index) =>
        setProfileLinks((current) =>
          current.filter((_, itemIndex) => itemIndex !== index)
        ),
      onAddProfileLink: () => setProfileLinks((current) => [...current, ""]),
      onProfileSubmit: () => undefined,
      onSendChatMessage: async ({ text }) => {
        setAutoLoopEnabled(false);
        const nextUserMessage: CareerMessage = {
          id: Date.now(),
          role: "user",
          content: text,
          messageType: "chat",
          createdAt: new Date().toISOString(),
        };
        const nextAssistantMessage: CareerMessage = {
          id: Date.now() + 1,
          role: "assistant",
          content: t(
            "career.preview.career_workspace_preview.1dkij5s",
            "미리보기 화면입니다. 실제 연동에서는 이 입력이 서버 대화와 이어집니다."
          ),
          messageType: "chat",
          createdAt: new Date().toISOString(),
        };
        setManualMessages((current) => [
          ...(current ?? messages),
          nextUserMessage,
          nextAssistantMessage,
        ]);
      },
      onUpdateHistoryOpportunityFeedback: async () => undefined,
      onLoadOlderMessages: async () => undefined,
      onForceCompleteOnboarding: async () => {
        setAutoLoopEnabled(false);
        const now = Date.now();
        const nextAssistantMessage: CareerMessage = {
          id: now,
          role: "assistant",
          content: t(
            "career.preview.career_workspace_preview.04a6xnr",
            "미리보기 화면입니다. 실제 연동에서는 인터뷰를 종료하고 대화 요약 카드만 여기에 렌더링합니다."
          ),
          messageType: "onboarding_completion_wrapup",
          createdAt: new Date().toISOString(),
        };
        const nextStepsMessage: CareerMessage = {
          id: now + 1,
          role: "assistant",
          content: t(
            "career.preview.career_workspace_preview.1rsjscm",
            "말씀해주신 조건들을 Harper의 검색 기준에 반영했어요. 결과는 포지션 탭과 이메일로 준비되는 대로 보내드릴 거예요. 최대 1시간 정도 걸릴 수 있어요. 확인하신 뒤에는 좋아요/싫어요를 눌러주시고, 마음에 드는 회사는 track 해두시면 관련 소식이나 채용 업데이트를 챙겨드릴게요. 한 가지만 여쭤볼게요. 선호하실 만한 기회라면 제가 연결 가능한 기회가 아닌 외부 공고라도 주기적으로 알려드리면 좋을까요? 아니면 내부 연결처럼 특히 핏이 강한 기회가 있을 때만 연락드리는 쪽이 편하실까요?"
          ),
          messageType: "onboarding_completion_next_steps",
          createdAt: new Date().toISOString(),
        };
        setManualMessages((current) => [
          ...(current ?? messages),
          nextAssistantMessage,
          nextStepsMessage,
        ]);
        return true;
      },
      showVoiceStartPrompt: false,
      onUseChatOnly: () => undefined,
      onPauseOnboarding: async () => undefined,
      onSubmitOnboardingInterest: async () => true,
      onContinueOnboardingConversation: async () => undefined,
      inputMode: "text",
      voiceTranscript: "",
      voiceMuted: false,
      onToggleVoiceMute: () => undefined,
    }),
    [
      autoLoopEnabled,
      messages,
      profileLinks,
      resumeFile,
      t,
      talentPreferences.isOnboardingDone,
    ]
  );

  const renderPreviewContent = (
    resolvedViewport?: CareerWorkspacePreviewViewport
  ) => (
    <CareerChatPanelProvider value={chatContextValue}>
      <CareerSidebarProvider value={sidebarContextValue}>
        <CareerWorkspaceScreen
          activeTab={workspaceActiveTab}
          fillParent={embedded}
          forcedViewport={embedded ? resolvedViewport : undefined}
          initialMobileChatOpen={
            activeTab === "chat" && !(embedded && resolvedViewport === "mobile")
          }
          onChangeTab={handleWorkspaceTabChange}
        />
        <CareerSettingsModal
          open={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </CareerSidebarProvider>
    </CareerChatPanelProvider>
  );

  if (embedded) {
    return (
      <div
        {...interactionGuardProps}
        className={cn("h-full w-full", className)}
      >
        <ScaledPreviewViewport viewport={viewport}>
          {(resolvedViewport) => renderPreviewContent(resolvedViewport)}
        </ScaledPreviewViewport>
      </div>
    );
  }

  return (
    <div {...interactionGuardProps} className={className}>
      {renderPreviewContent()}
    </div>
  );
};

export default React.memo(CareerWorkspacePreviewLanding);
