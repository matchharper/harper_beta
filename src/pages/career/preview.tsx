import type { User } from "@supabase/supabase-js";
import { useMemo, useRef, useState } from "react";
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
import type {
  CareerHistoryOpportunity,
  CareerMessage,
  CareerNetworkApplication,
  CareerRecentOpportunity,
  CareerTalentNotification,
  CareerTalentInsights,
  CareerTalentPreferences,
  CareerTalentProfile,
} from "@/components/career/types";

const mockUser = {
  id: "career-preview-user",
  email: "preview@harper.ai",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {
    name: "Preview Candidate",
    full_name: "Preview Candidate",
  },
  created_at: new Date().toISOString(),
} as User;

const initialNetworkApplication: CareerNetworkApplication = {
  selectedRole: "Applied AI Engineer / Product-minded Builder",
  profileInputTypes: ["linkedin", "github", "website", "cv"],
  linkedinProfileUrl: "https://linkedin.com/in/preview-candidate",
  githubProfileUrl: "https://github.com/preview-candidate",
  scholarProfileUrl: null,
  personalWebsiteUrl: "https://previewcandidate.dev",
  submittedAt: new Date().toISOString(),
};

const initialTalentPreferences: CareerTalentPreferences = {
  engagementTypes: ["full_time", "fractional"],
  preferredLocations: ["korea_based", "global_remote"],
  careerMoveIntent: "open_to_explore",
  careerMoveIntentLabel:
    "아직 이직 생각은 없지만, 기회를 받아보고 결정하고 싶음",
};

const initialTalentInsights: CareerTalentInsights = {
  technical_strengths:
    "LLM 제품을 실제 사용자와 맞닿은 환경에 배포하는 일을 주로 해왔고, 모델 품질과 제품 속도를 같이 관리하는 역할을 선호합니다.",
  desired_teams:
    "작은 팀이어도 제품 방향과 기술 의사결정이 빠른 곳을 선호합니다. 의미 없는 AI 포장보다는 실제 사용량이 있는 제품이면 좋겠습니다.",
};

const initialTalentProfile: CareerTalentProfile = {
  talentUser: {
    user_id: "career-preview-user",
    name: "Preview Candidate",
    profile_picture: null,
    headline: "Applied AI Engineer focused on shipping agent products",
    bio: "사용자와 맞닿은 AI 제품을 빠르게 배포하고, 모델 성능과 제품 UX 사이의 균형을 설계하는 역할을 주로 맡아왔습니다.",
    location: "Seoul, South Korea",
  },
  talentExperiences: [
    {
      id: 1,
      talent_id: "career-preview-user",
      role: "Senior AI Engineer",
      description:
        "대화형 agent 제품을 설계하고, retrieval / evaluation / observability 파이프라인을 구축했습니다.",
      start_date: "2023-01-01",
      end_date: null,
      months: 28,
      company_name: "Applied AI Startup",
      company_location: "Seoul",
      company_logo: null,
      memo: "0 to 1 제품 론치 경험",
    },
    {
      id: 2,
      talent_id: "career-preview-user",
      role: "Software Engineer",
      description:
        "데이터 파이프라인과 internal tooling을 개발하며 제품팀과 협업했습니다.",
      start_date: "2020-02-01",
      end_date: "2022-12-01",
      months: 34,
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
      description: "LLM eval 도구와 agent workflow 패키지 유지보수",
      date: null,
      memo: null,
    },
  ],
};

const initialNotifications: CareerTalentNotification[] = [
  {
    id: 1,
    message: "Harper가 당신의 프로필을 바탕으로 새 매칭 가능성을 찾았습니다.",
    isRead: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    message: "프로필 링크가 최신 상태인지 확인해 주세요.",
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
];

const initialMessages: CareerMessage[] = [
  {
    id: 1,
    role: "assistant",
    content:
      "안녕하세요. 현재 프로필을 바탕으로 바로 대화를 이어갈 수 있어요. 지금 어떤 방향의 기회를 우선적으로 보고 싶은지 알려주세요.",
    messageType: "chat",
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    role: "user",
    content:
      "정규직과 fractional 둘 다 열려 있고, 제품에 바로 연결되는 applied AI 역할을 우선적으로 보고 싶어요.",
    messageType: "chat",
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    role: "assistant",
    content:
      "좋습니다. <<제품 임팩트가 빠르게 보이는 팀>>과 <<작은 조직에서 기술 의사결정 폭이 큰 역할>>을 우선적으로 보겠습니다.",
    messageType: "chat",
    createdAt: new Date().toISOString(),
  },
];

const initialRecentOpportunities: CareerRecentOpportunity[] = [
  {
    id: "preview-opportunity-1",
    kind: "match",
    title: "Applied AI Engineer",
    companyName: "Stealth Agent Startup",
    summary:
      "작은 팀에서 제품과 모델 품질을 함께 책임질 수 있는 역할입니다.",
    location: "Seoul / Hybrid",
    engagementType: "Full-time",
    matchedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "preview-opportunity-2",
    kind: "recommendation",
    title: "Founding ML Engineer",
    companyName: "Global Remote SaaS",
    summary:
      "초기 제품 방향과 LLM workflow를 같이 설계할 수 있는 포지션입니다.",
    location: "US / Remote",
    engagementType: "Full-time or Fractional",
    matchedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const initialHistoryOpportunities: CareerHistoryOpportunity[] = [
  {
    id: "preview-history-1",
    roleId: "preview-role-1",
    title: "Applied AI Engineer",
    companyName: "Harper Portfolio Team",
    companyDescription:
      "작은 제품팀에서 모델 품질과 사용자 경험을 같이 책임지는 팀입니다.",
    companyHomepageUrl: "https://harper.ai",
    companyLinkedinUrl: null,
    companyLogoUrl: null,
    description:
      "프로덕트 팀과 바로 붙어 agent 기능을 제품에 배포하고 운영 지표까지 같이 보는 역할입니다.",
    employmentTypes: ["full_time"],
    externalJdUrl: null,
    feedback: null,
    feedbackAt: null,
    feedbackReason: null,
    href: "https://harper.ai",
    clickedAt: null,
    dismissedAt: null,
    isAccepted: true,
    isInternal: true,
    kind: "match",
    location: "Seoul",
    postedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    recommendedAt: new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000
    ).toISOString(),
    recommendationReasons: [
      "LLM 제품 론치 경험이 직접적으로 연결됩니다.",
      "작은 팀에서 제품 방향과 기술 의사결정을 함께 가져갈 수 있습니다.",
    ],
    sourceJobId: null,
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
    companyDescription:
      "미국 기반 B2B SaaS 팀으로, 초기 AI 기능을 제품 핵심으로 전환하고 있습니다.",
    companyHomepageUrl: "https://example.com/remote-saas",
    companyLinkedinUrl: "https://linkedin.com/company/remote-saas",
    companyLogoUrl: null,
    description:
      "LLM workflow와 evaluation 체계를 만들고, 엔지니어링 팀과 함께 고객 기능을 빠르게 실험하는 포지션입니다.",
    employmentTypes: ["full_time", "contract"],
    externalJdUrl: "https://jobs.example.com/founding-ml",
    feedback: "tracked",
    feedbackAt: new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString(),
    feedbackReason: null,
    href: "https://jobs.example.com/founding-ml",
    clickedAt: new Date(
      Date.now() - 23 * 60 * 60 * 1000
    ).toISOString(),
    dismissedAt: null,
    isAccepted: false,
    isInternal: false,
    kind: "recommendation",
    location: "US",
    postedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    recommendedAt: new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000
    ).toISOString(),
    recommendationReasons: [
      "Remote 선호와 제품 중심 applied AI 경험이 잘 맞습니다.",
      "초기 시스템 설계와 품질 기준 수립 경험을 바로 활용할 수 있습니다.",
    ],
    sourceJobId: "remote-saas-ml-1",
    sourceProvider: "greenhouse",
    sourceType: "external",
    status: "active",
    viewedAt: new Date(
      Date.now() - 25 * 60 * 60 * 1000
    ).toISOString(),
    workMode: "remote",
  },
  {
    id: "preview-history-3",
    roleId: "preview-role-3",
    title: "Research Engineer",
    companyName: "Frontier Robotics Lab",
    companyDescription:
      "논문과 프로덕트 사이를 잇는 applied research 조직입니다.",
    companyHomepageUrl: "https://example.com/robotics-lab",
    companyLinkedinUrl: null,
    companyLogoUrl: null,
    description:
      "멀티모달 모델 평가 파이프라인과 배포 시스템을 만드는 역할입니다.",
    employmentTypes: ["full_time"],
    externalJdUrl: "https://jobs.example.com/research-engineer",
    feedback: "dont_know",
    feedbackAt: new Date(
      Date.now() - 12 * 60 * 60 * 1000
    ).toISOString(),
    feedbackReason: null,
    href: "https://jobs.example.com/research-engineer",
    clickedAt: null,
    dismissedAt: null,
    isAccepted: false,
    isInternal: false,
    kind: "recommendation",
    location: "Tokyo",
    postedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    recommendedAt: new Date(
      Date.now() - 4 * 24 * 60 * 60 * 1000
    ).toISOString(),
    recommendationReasons: [
      "논문 기반 평가 시스템 경험이 직접적으로 이어집니다.",
      "research와 product의 중간 지점 역할을 선호하는지 확인이 필요한 기회입니다.",
    ],
    sourceJobId: "robotics-lab-2",
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
    companyDescription:
      "커머스 검색과 개인화 모델을 제품 KPI에 직접 연결하는 팀입니다.",
    companyHomepageUrl: null,
    companyLinkedinUrl: "https://linkedin.com/company/stealth-commerce-ai",
    companyLogoUrl: null,
    description:
      "추천 모델과 conversational UX를 제품 조직과 함께 리드하는 포지션입니다.",
    employmentTypes: ["full_time"],
    externalJdUrl: null,
    feedback: "not_for_me",
    feedbackAt: new Date(
      Date.now() - 6 * 60 * 60 * 1000
    ).toISOString(),
    feedbackReason: null,
    href: "https://linkedin.com/company/stealth-commerce-ai",
    clickedAt: null,
    dismissedAt: new Date(
      Date.now() - 6 * 60 * 60 * 1000
    ).toISOString(),
    isAccepted: false,
    isInternal: true,
    kind: "recommendation",
    location: "Singapore",
    postedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    recommendedAt: new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000
    ).toISOString(),
    recommendationReasons: [
      "제품 오너십은 높지만 도메인 자체 선호가 갈릴 수 있습니다.",
    ],
    sourceJobId: null,
    sourceProvider: null,
    sourceType: "internal",
    status: "active",
    viewedAt: new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000
    ).toISOString(),
    workMode: "hybrid",
  },
];

const CareerPreviewPage = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<CareerMessage[]>(initialMessages);
  const [profileLinks, setProfileLinks] = useState<string[]>([
    "https://linkedin.com/in/preview-candidate",
    "https://github.com/preview-candidate",
    "https://previewcandidate.dev",
  ]);
  const [savedProfileLinks, setSavedProfileLinks] = useState<string[]>([
    "https://linkedin.com/in/preview-candidate",
    "https://github.com/preview-candidate",
    "https://previewcandidate.dev",
  ]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [savedResumeFileName, setSavedResumeFileName] =
    useState("preview_resume.pdf");
  const [networkApplication, setNetworkApplication] = useState(
    initialNetworkApplication
  );
  const [savedNetworkApplication, setSavedNetworkApplication] = useState(
    initialNetworkApplication
  );
  const [networkApplicationUpdatedAt, setNetworkApplicationUpdatedAt] = useState(
    new Date().toISOString()
  );
  const [networkSaveInfo, setNetworkSaveInfo] = useState("");
  const [talentPreferences, setTalentPreferences] = useState(
    initialTalentPreferences
  );
  const [savedTalentPreferences, setSavedTalentPreferences] = useState(
    initialTalentPreferences
  );
  const [talentPreferencesUpdatedAt, setTalentPreferencesUpdatedAt] = useState(
    new Date().toISOString()
  );
  const [talentPreferencesSaveInfo, setTalentPreferencesSaveInfo] =
    useState("");
  const [talentInsights, setTalentInsights] =
    useState<CareerTalentInsights>(initialTalentInsights);
  const [savedTalentInsights, setSavedTalentInsights] =
    useState<CareerTalentInsights>(initialTalentInsights);
  const [talentInsightsUpdatedAt, setTalentInsightsUpdatedAt] = useState(
    new Date().toISOString()
  );
  const [talentInsightsSaveInfo, setTalentInsightsSaveInfo] = useState("");
  const [profileSaveInfo, setProfileSaveInfo] = useState("");
  const [settingsSaveInfo, setSettingsSaveInfo] = useState("");
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
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState(
    new Date().toISOString()
  );
  const [historyOpportunities, setHistoryOpportunities] = useState(
    initialHistoryOpportunities
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const sidebarContextValue: CareerSidebarContextValue = useMemo(
    () => ({
      user: mockUser,
      stage: "chat",
      userChatCount: 1,
      answeredCount: 4,
      targetQuestions: 8,
      progressPercent: 50,
      onOpenSettings: () => setIsSettingsOpen(true),
      onLogout: () => undefined,
      recentOpportunities: initialRecentOpportunities,
      historyOpportunities,
      historyUpdatingRoleIds: [],
      historyUpdateError: "",
      onUpdateHistoryOpportunityFeedback: (roleId, feedback) => {
        const now = new Date().toISOString();
        setHistoryOpportunities((current) =>
          current.map((item) =>
            item.roleId === roleId
              ? {
                  ...item,
                  dismissedAt: feedback === "not_for_me" ? now : null,
                  feedback,
                  feedbackAt: now,
                }
              : item
          )
        );
      },
      onMarkHistoryOpportunityViewed: (roleId) => {
        const now = new Date().toISOString();
        setHistoryOpportunities((current) =>
          current.map((item) =>
            item.roleId === roleId && !item.viewedAt
              ? { ...item, viewedAt: now }
              : item
          )
        );
      },
      onMarkHistoryOpportunityClicked: (roleId) => {
        const now = new Date().toISOString();
        setHistoryOpportunities((current) =>
          current.map((item) =>
            item.roleId === roleId && !item.clickedAt
              ? { ...item, clickedAt: now }
              : item
          )
        );
      },
      notifications: initialNotifications,
      unreadNotificationCount: initialNotifications.filter(
        (notification) => !notification.isRead
      ).length,
      notificationsMarkingAsRead: false,
      notificationsError: "",
      onMarkNotificationsRead: () => undefined,
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
      onSaveTalentProfile: () => {
        setSavedProfileLinks(profileLinks);
        if (resumeFile) {
          setSavedResumeFileName(resumeFile.name);
          setResumeFile(null);
        }
        setProfileSaveInfo("이력서와 링크를 저장했습니다.");
      },
      talentProfile: initialTalentProfile,
      networkApplication,
      networkApplicationUpdatedAt,
      talentPreferences,
      talentInsights,
      talentPreferencesUpdatedAt,
      talentInsightsUpdatedAt,
      networkApplicationSavePending: false,
      networkApplicationSaveError: "",
      networkApplicationSaveInfo: networkSaveInfo,
      hasUnsavedNetworkApplicationChanges:
        JSON.stringify(networkApplication) !==
        JSON.stringify(savedNetworkApplication),
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
      onNetworkApplicationChange: (next) => {
        setNetworkSaveInfo("");
        setNetworkApplication((current) =>
          typeof next === "function"
            ? (next(current) ?? current)
            : (next ?? current)
        );
      },
      onSaveNetworkApplication: () => {
        setSavedNetworkApplication(networkApplication);
        setNetworkApplicationUpdatedAt(new Date().toISOString());
        setNetworkSaveInfo("프로필 설정을 저장했습니다.");
        return true;
      },
      onResetNetworkApplication: () => {
        setNetworkSaveInfo("");
        setNetworkApplication(savedNetworkApplication);
      },
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
        setTalentPreferencesSaveInfo("프로필 설정을 저장했습니다.");
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
        setTalentInsightsSaveInfo("Harper insight를 저장했습니다.");
        return true;
      },
      onResetTalentInsights: () => {
        setTalentInsightsSaveInfo("");
        setTalentInsights(savedTalentInsights);
      },
      settingsLoading: false,
      settingsSaving: false,
      settingsError: "",
      settingsSaveInfo,
      settingsUpdatedAt,
      profileVisibility,
      blockedCompanies,
      hasUnsavedTalentSettingsChanges:
        profileVisibility !== savedProfileVisibility ||
        JSON.stringify(blockedCompanies) !==
          JSON.stringify(savedBlockedCompanies),
      onProfileVisibilityChange: (value) => {
        setSettingsSaveInfo("");
        setProfileVisibility(value);
      },
      onAddBlockedCompany: (name) => {
        setSettingsSaveInfo("");
        setBlockedCompanies((current) =>
          current.includes(name) ? current : [...current, name]
        );
      },
      onRemoveBlockedCompany: (name) => {
        setSettingsSaveInfo("");
        setBlockedCompanies((current) =>
          current.filter((item) => item !== name)
        );
      },
      onSaveTalentSettings: () => {
        setSavedProfileVisibility(profileVisibility);
        setSavedBlockedCompanies(blockedCompanies);
        setSettingsUpdatedAt(new Date().toISOString());
        setSettingsSaveInfo("프로필 설정을 저장했습니다.");
        return true;
      },
      onResetTalentSettings: () => {
        setSettingsSaveInfo("");
        setProfileVisibility(savedProfileVisibility);
        setBlockedCompanies(savedBlockedCompanies);
      },
      onReloadTalentSettings: () => undefined,
    }),
    [
      blockedCompanies,
      networkApplication,
      networkApplicationUpdatedAt,
      networkSaveInfo,
      profileLinks,
      profileSaveInfo,
      profileVisibility,
      resumeFile,
      savedBlockedCompanies,
      savedNetworkApplication,
      savedProfileLinks,
      savedProfileVisibility,
      savedResumeFileName,
      savedTalentPreferences,
      settingsSaveInfo,
      settingsUpdatedAt,
      talentPreferences,
      talentInsights,
      talentInsightsSaveInfo,
      talentInsightsUpdatedAt,
      talentPreferencesUpdatedAt,
      talentPreferencesSaveInfo,
      savedTalentInsights,
      historyOpportunities,
    ]
  );

  const chatContextValue: CareerChatPanelContextValue = useMemo(
    () => ({
      user: mockUser,
      conversationId: "preview-conversation",
      stage: "chat",
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
      resumeFile,
      profileLinks,
      profilePending: false,
      profileError: "",
      chatError: "",
      assistantTyping: false,
      chatPending: false,
      onboardingBeginPending: false,
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
          content:
            "미리보기 화면입니다. 실제 연동에서는 이 입력이 서버 대화와 이어집니다.",
          messageType: "chat",
          createdAt: new Date().toISOString(),
        };
        setMessages((current) => [
          ...current,
          nextUserMessage,
          nextAssistantMessage,
        ]);
      },
      onLoadOlderMessages: async () => undefined,
      showVoiceStartPrompt: false,
      onStartVoiceCall: () => undefined,
      onUseChatOnly: () => undefined,
      onPauseOnboarding: async () => undefined,
      onSubmitOnboardingInterest: async () => true,
      onContinueOnboardingConversation: async () => undefined,
      inputMode: "text",
      voiceTranscript: "",
      voiceListening: false,
      voiceMuted: false,
      voiceError: "",
      assistantAudioBusy: false,
      voicePrimaryPressed: false,
      onVoicePrimaryAction: () => undefined,
      onToggleVoiceMute: () => undefined,
      onSwitchToTextMode: () => undefined,
    }),
    [messages, profileLinks, resumeFile]
  );

  return (
    <CareerChatPanelProvider value={chatContextValue}>
      <CareerSidebarProvider value={sidebarContextValue}>
        <CareerWorkspaceScreen />
        <CareerSettingsModal
          open={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </CareerSidebarProvider>
    </CareerChatPanelProvider>
  );
};

export async function getServerSideProps() {
  if (process.env.NODE_ENV === "production") {
    return { notFound: true };
  }

  return {
    props: {},
  };
}

export default CareerPreviewPage;
