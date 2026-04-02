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
  CareerMessage,
  CareerNetworkApplication,
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
  careerMoveIntentLabel: "아직 이직 생각은 없지만, 기회를 받아보고 결정하고 싶음",
  technicalStrengths:
    "LLM 제품을 실제 사용자와 맞닿은 환경에 배포하는 일을 주로 해왔고, 모델 품질과 제품 속도를 같이 관리하는 역할을 선호합니다.",
  desiredTeams:
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
  const [savedResumeFileName, setSavedResumeFileName] = useState(
    "preview_resume.pdf"
  );
  const [networkApplication, setNetworkApplication] = useState(
    initialNetworkApplication
  );
  const [networkSaveInfo, setNetworkSaveInfo] = useState("");
  const [talentPreferences, setTalentPreferences] = useState(
    initialTalentPreferences
  );
  const [talentPreferencesSaveInfo, setTalentPreferencesSaveInfo] =
    useState("");
  const [profileSaveInfo, setProfileSaveInfo] = useState("");
  const [profileVisibility, setProfileVisibility] = useState<
    "open_to_matches" | "exceptional_only" | "dont_share"
  >("exceptional_only");
  const [blockedCompanies, setBlockedCompanies] = useState<string[]>([
    "Stealth Robotics",
  ]);
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
      talentPreferences,
      networkApplicationSavePending: false,
      networkApplicationSaveError: "",
      networkApplicationSaveInfo: networkSaveInfo,
      talentPreferencesSavePending: false,
      talentPreferencesSaveError: "",
      talentPreferencesSaveInfo,
      onNetworkApplicationChange: (next) => {
        setNetworkSaveInfo("");
        setNetworkApplication((current) =>
          typeof next === "function"
            ? next(current) ?? current
            : next ?? current
        );
      },
      onSaveNetworkApplication: () => {
        setNetworkSaveInfo("프로필 설정을 저장했습니다.");
        return true;
      },
      onTalentPreferencesChange: (next) => {
        setTalentPreferencesSaveInfo("");
        setTalentPreferences((current) =>
          typeof next === "function" ? next(current) ?? current : next ?? current
        );
      },
      onSaveTalentPreferences: () => {
        setTalentPreferencesSaveInfo("프로필 설정을 저장했습니다.");
        return true;
      },
      settingsLoading: false,
      settingsSaving: false,
      settingsError: "",
      profileVisibility,
      blockedCompanies,
      onProfileVisibilityChange: (value) => setProfileVisibility(value),
      onAddBlockedCompany: (name) =>
        setBlockedCompanies((current) =>
          current.includes(name) ? current : [...current, name]
        ),
      onRemoveBlockedCompany: (name) =>
        setBlockedCompanies((current) => current.filter((item) => item !== name)),
      onReloadTalentSettings: () => undefined,
    }),
    [
      blockedCompanies,
      networkApplication,
      networkSaveInfo,
      profileLinks,
      profileSaveInfo,
      profileVisibility,
      resumeFile,
      savedProfileLinks,
      savedResumeFileName,
      talentPreferences,
      talentPreferencesSaveInfo,
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
        setMessages((current) => [...current, nextUserMessage, nextAssistantMessage]);
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
        <CareerWorkspaceScreen
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
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
