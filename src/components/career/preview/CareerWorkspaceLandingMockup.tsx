import {
  ArrowUp,
  AudioLines,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CircleHelp,
  FileText,
  GalleryVerticalEnd,
  House,
  Lock,
  MapPin,
  MessageCircleMore,
  MessageSquareText,
  Phone,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import React, {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Face from "@/components/common/Face";
import { cn } from "@/lib/utils";
import { useMessages, type Locale } from "@/i18n/useMessage";

type PreviewViewport = "desktop" | "mobile";
type PreviewViewportMode = PreviewViewport | "auto";

type CareerWorkspaceLandingMockupProps = {
  autoPlayConversation?: boolean;
  className?: string;
  disableInteractions?: boolean;
  embedded?: boolean;
  initialTab?: "chat" | "home" | "history" | "profile" | "watchlist";
  onGmailMockupVisibleChange?: (visible: boolean) => void;
  viewport?: PreviewViewportMode;
};

type StaticOpportunity = {
  id: string;
  company: string;
  title: string;
  location: string;
  type: string;
  source: string;
  summary: string;
};

type StaticCopy = {
  activeLabel: string;
  assistantName: string;
  chatTitle: string;
  composerPlaceholder: string;
  dashboardTitle: string;
  digestTitle: string;
  digestSubtitle: string;
  greeting: string;
  nav: {
    home: string;
    positions: string;
    profile: string;
  };
  opportunitySectionTitle: string;
  opportunitySectionDescription: string;
  fitReviewedLabel: string;
  privacyTitle: string;
  privacyBody: string;
  profileTitle: string;
  profileBody: string;
  screeningLabel: string;
  summaryCards: Array<{
    label: string;
    value: string;
    detail: string;
    icon: LucideIcon;
  }>;
  messages: Array<{
    id: string;
    role: "assistant" | "user";
    body: string;
  }>;
  opportunities: StaticOpportunity[];
  home: {
    welcomePrefix: string;
    activeOpportunityLabel: string;
    recommendationSettingLabel: string;
    starters: Array<{
      label: string;
      icon: "message" | "sliders";
    }>;
    callTitle: string;
    callDescription: string;
    callCta: string;
    newOpportunityTitle: string;
    newOpportunityCount: number;
    newOpportunityDescription: string;
    newOpportunityButton: string;
    savedTitle: string;
    savedCount: number;
    savedDescription: string;
    savedButton: string;
    profileVisibilityLabel: string;
    profileVisibilityHint: string;
    visibilityOptions: Array<{
      label: string;
      description: string;
      icon: "shield-check" | "shield-alert" | "lock";
      selected?: boolean;
    }>;
    blockedCompanyLabel: string;
    blockedCompanyHint: string;
    blockedCompanies: string[];
  };
};

// career-i18n-skip
const COPY: Record<Locale, StaticCopy> = {
  ko: {
    activeLabel: "온보딩 완료",
    assistantName: "Harper",
    chatTitle: "채팅",
    composerPlaceholder: "새로운 조건이나 궁금한 점을 남겨주세요",
    dashboardTitle: "Chris님의 커리어 워크스페이스",
    digestTitle: "오늘 확인할 추천",
    digestSubtitle: "온보딩 정보와 선호도를 바탕으로 정리했어요.",
    greeting: "Welcome, Chris",
    nav: {
      home: "홈",
      positions: "포지션",
      profile: "프로필",
    },
    opportunitySectionTitle: "새로 들어온 기회",
    opportunitySectionDescription:
      "Harper가 비공개 네트워크와 공개 포지션을 함께 확인해 정리한 목록입니다.",
    fitReviewedLabel: "검토 완료",
    privacyTitle: "비공개로 관리 중",
    privacyBody:
      "프로필은 승인한 회사와 포지션에만 전달됩니다. 현재 회사와 차단한 회사에는 공유하지 않습니다.",
    profileTitle: "프로필 소스",
    profileBody:
      "LinkedIn, GitHub, resume가 연결되어 있고 새 추천에 자동 반영됩니다.",
    screeningLabel: "검토 중",
    summaryCards: [
      {
        label: "새 추천",
        value: "4",
        detail: "2개 연결 가능",
        icon: Sparkles,
      },
      {
        label: "저장한 포지션",
        value: "2",
        detail: "후속 검토 중",
        icon: Bookmark,
      },
      {
        label: "진행 중",
        value: "1",
        detail: "창업자 미팅 대기",
        icon: Calendar,
      },
    ],
    messages: [
      {
        id: "m1",
        role: "user",
        body: "저는 샌프란시스코에서 Forward Deployed Engineer로 일하고 있어요. 다음 커리어로는 빠르게 성장하는 AI 스타트업의 초기 팀원으로 더 많은 책임을 갖고 싶습니다.",
      },
      {
        id: "m2",
        role: "assistant",
        body: "좋아요. 마침 딱 맞는 기회가 하나 떠오르네요. Wonderful이 지금 아시아 전역으로 빠르게 확장하고 있어요. 혹시 샌프란시스코를 떠나 리로케이션하는 것도 열려 있으신가요? 이 포지션은 꽤 좋은 리로케이션 패키지도 제공합니다.",
      },
      {
        id: "m3",
        role: "user",
        body: "네 가능해요! 싱가포르와 서울 둘 다 가능합니다.",
      },
      {
        id: "m4",
        role: "assistant",
        body: "좋습니다. 다른 HR 단계를 거치지 않고 바로 APAC 지역 채용 팀 리더 분과 연결드릴게요. 방금 Wonderful의 APAC VP에게 직접 소개 메일을 보냈습니다. 메일함을 확인해보세요.",
      },
    ],
    opportunities: [
      {
        id: "o1",
        company: "Global Remote SaaS",
        title: "Senior AI Product Engineer",
        location: "Remote - US/EU overlap",
        type: "Full-time",
        source: "Public role",
        summary:
          "Agent workflow, eval, product analytics를 함께 보는 작은 플랫폼 팀입니다.",
      },
      {
        id: "o2",
        company: "Stealth Robotics",
        title: "Founding Applied AI Engineer",
        location: "San Francisco hybrid",
        type: "Full-time",
        source: "Internal intro",
        summary:
          "비공개 채용입니다. founder가 agent product 배포 경험을 강하게 보고 있어요.",
      },
      {
        id: "o3",
        company: "Frontier ML Platform",
        title: "AI Product Advisor",
        location: "Remote",
        type: "Fractional",
        source: "Partner network",
        summary:
          "주 6-8시간 자문 형태로, LLM UX와 evaluation 체계를 잡는 역할입니다.",
      },
    ],
    home: {
      welcomePrefix: "Welcome",
      activeOpportunityLabel:
        "현재 Harper 네트워크에서 1,240개의 기회를 스캔하고 있습니다. 매일매일 더 많은 기회를 발견합니다.",
      recommendationSettingLabel:
        "외부 공개 포지션 추천과 내부 회사 연결 제안을 받고 있어요.",
      starters: [
        {
          label: "더 이야기하고 더 좋은 연결 받기",
          icon: "message",
        },
        {
          label: "선호 조건 업데이트하기",
          icon: "sliders",
        },
      ],
      callTitle: "Harper와 5분 통화",
      callDescription:
        "변경된 사항이 있거나 요구사항이 있을 때 — 통화하면 빨라요",
      callCta: "통화 시작",
      newOpportunityTitle: "새로 받은 기회",
      newOpportunityCount: 4,
      newOpportunityDescription: "추천된 기회 · 2개 연결 가능",
      newOpportunityButton: "검토하기",
      savedTitle: "저장 / 연결",
      savedCount: 2,
      savedDescription: "관심·진행 중인 포지션",
      savedButton: "상세 보기",
      profileVisibilityLabel: "프로필 공개",
      profileVisibilityHint:
        "어떤 수준의 매칭에서 회사가 프로필을 볼 수 있는지 정합니다.",
      visibilityOptions: [
        {
          label: "Open to matches",
          description:
            "강하게 맞는 포지션으로 판단되면 회사에 먼저 프로필을 공유합니다.",
          icon: "shield-check",
        },
        {
          label: "Exceptional only",
          description:
            "먼저 매칭된 기회를 확인한 뒤 직접 허용한 경우에만 공유됩니다.",
          icon: "shield-alert",
          selected: true,
        },
        {
          label: "Don't share",
          description: "절대 어떤 경우에도 프로필이 공유되지 않습니다.",
          icon: "lock",
        },
      ],
      blockedCompanyLabel: "차단 회사",
      blockedCompanyHint: "현재 회사와 공유를 원하지 않는 회사를 제외합니다.",
      blockedCompanies: ["Current Company", "Stealth Robotics"],
    },
  },
  en: {
    activeLabel: "Onboarding complete",
    assistantName: "Harper",
    chatTitle: "Chat",
    composerPlaceholder: "Ask anything",
    dashboardTitle: "Chris's career workspace",
    digestTitle: "Today's recommendations",
    digestSubtitle: "Curated from your onboarding context and preferences.",
    greeting: "Welcome, Chris",
    nav: {
      home: "Home",
      positions: "Positions",
      profile: "Profile",
    },
    opportunitySectionTitle: "New opportunities",
    opportunitySectionDescription:
      "Harper reviewed private network leads and public roles before adding them here.",
    fitReviewedLabel: "Fit reviewed",
    privacyTitle: "Private by default",
    privacyBody:
      "Your profile is shared only with approved companies and roles. Current and blocked companies are excluded.",
    profileTitle: "Profile sources",
    profileBody:
      "LinkedIn, GitHub, and resume context are connected and reflected in new recommendations.",
    screeningLabel: "Screening",
    summaryCards: [
      {
        label: "New matches",
        value: "4",
        detail: "2 intros available",
        icon: Sparkles,
      },
      {
        label: "Saved roles",
        value: "2",
        detail: "Queued for review",
        icon: Bookmark,
      },
      {
        label: "In progress",
        value: "1",
        detail: "Founder meeting pending",
        icon: Calendar,
      },
    ],
    messages: [
      {
        id: "m1",
        role: "user",
        body: "I'm a Forward Deployed Engineer based in SF. Looking for my next move to build core architecture at a scaling AI startup.",
      },
      {
        id: "m2",
        role: "assistant",
        body: "Got it. I actually have the perfect fit in mind. Wonderful is aggressively expanding across Asia right now. Are you open to relocating from SF? They offer a premium relocation package.",
      },
      {
        id: "m3",
        role: "user",
        body: "Let's do it. Both Singapore and Seoul work for me.",
      },
      {
        id: "m4",
        role: "assistant",
        body: "Perfect. I'm skipping HR and routing you directly to the top. I just fired off a direct intro email to their VP of APAC. Check your inbox.",
      },
    ],
    opportunities: [
      {
        id: "o1",
        company: "Global Remote SaaS",
        title: "Senior AI Product Engineer",
        location: "Remote - US/EU overlap",
        type: "Full-time",
        source: "Public role",
        summary:
          "A small platform team combining agent workflows, evals, and product analytics.",
      },
      {
        id: "o2",
        company: "Stealth Robotics",
        title: "Founding Applied AI Engineer",
        location: "San Francisco hybrid",
        type: "Full-time",
        source: "Internal intro",
        summary:
          "A private search where the founder is prioritizing shipped agent product experience.",
      },
      {
        id: "o3",
        company: "Frontier ML Platform",
        title: "AI Product Advisor",
        location: "Remote",
        type: "Fractional",
        source: "Partner network",
        summary:
          "A 6-8 hour weekly advisory role shaping LLM UX and evaluation systems.",
      },
    ],
    home: {
      welcomePrefix: "Welcome",
      activeOpportunityLabel:
        "Harper is currently scanning 1,240 opportunities across the network. More matches are discovered every day.",
      recommendationSettingLabel:
        "You are receiving both public role recommendations and private internal intros.",
      starters: [
        {
          label: "Share more context for better matches",
          icon: "message",
        },
        {
          label: "Update preferences",
          icon: "sliders",
        },
      ],
      callTitle: "5-minute call with Harper",
      callDescription:
        "When something changes or you have new requirements, a quick call is faster.",
      callCta: "Start call",
      newOpportunityTitle: "New opportunities",
      newOpportunityCount: 4,
      newOpportunityDescription: "Recommended roles · 2 intros available",
      newOpportunityButton: "Review",
      savedTitle: "Saved / connected",
      savedCount: 2,
      savedDescription: "Interested or in-progress positions",
      savedButton: "View details",
      profileVisibilityLabel: "Profile visibility",
      profileVisibilityHint:
        "Control when companies can see your profile for a match.",
      visibilityOptions: [
        {
          label: "Open to matches",
          description:
            "For strong matches, Harper can share your profile first.",
          icon: "shield-check",
        },
        {
          label: "Exceptional only",
          description:
            "Your profile is shared only after you approve a specific match.",
          icon: "shield-alert",
          selected: true,
        },
        {
          label: "Don't share",
          description: "Your profile is never shared with companies.",
          icon: "lock",
        },
      ],
      blockedCompanyLabel: "Blocked companies",
      blockedCompanyHint:
        "Exclude current employers or companies you do not want to hear from.",
      blockedCompanies: ["Current Company", "Stealth Robotics"],
    },
  },
};

const PREVIEW_VIEWPORT_SIZE: Record<
  PreviewViewport,
  { height: number; width: number }
> = {
  desktop: { height: 827, width: 1512 },
  mobile: { height: 700, width: 390 },
};

const PREVIEW_MOBILE_MAX_WIDTH = 520;
const CHAT_ANIMATION_INITIAL_DELAY_MS = 450;
const CHAT_ANIMATION_MESSAGE_INTERVAL_MS = 1450;
const CHAT_ANIMATION_AFTER_LAST_DELAY_MS = 2200;
const CHAT_ANIMATION_GMAIL_VISIBLE_MS = 9000;
const CHAT_ANIMATION_RESET_DELAY_MS = 800;

const ScaledPreviewViewport = ({
  children,
  viewport,
}: {
  children: ReactNode | ((resolvedViewport: PreviewViewport) => ReactNode);
  viewport: PreviewViewportMode;
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
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateSize);
    observer?.observe(element);
    window.addEventListener("resize", updateSize);

    return () => {
      observer?.disconnect();
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

const StaticAction = ({
  active,
  badge,
  children,
  className,
}: {
  active?: boolean;
  badge?: number;
  children: ReactNode;
  className?: string;
}) => (
  <button
    type="button"
    aria-disabled="true"
    tabIndex={-1}
    className={cn(
      "inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border px-4 text-[13px] font-medium transition-colors",
      active
        ? "border-neutral-1000-a10 bg-bg-floating text-neutral-primary shadow-sm"
        : "border-transparent bg-transparent text-neutral-muted",
      className
    )}
  >
    {children}
    {badge ? (
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] text-neutral-00">
        {badge}
      </span>
    ) : null}
  </button>
);

const IconButton = ({ icon }: { icon: ReactNode }) => (
  <button
    type="button"
    aria-disabled="true"
    tabIndex={-1}
    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating text-neutral-primary"
  >
    {icon}
  </button>
);

const Avatar = ({ small = false }: { small?: boolean }) => (
  <div
    className={cn(
      "flex shrink-0 items-center justify-center rounded-full bg-black font-medium text-neutral-00",
      small ? "h-8 w-8 text-[12px]" : "h-9 w-9 text-[13px]"
    )}
  >
    C
  </div>
);

const AssistantProfile = ({ assistantName }: { assistantName: string }) => (
  <div className="flex h-8 items-center gap-2 text-[13px] font-medium leading-none text-neutral-primary md:text-[15px]">
    <Face
      size={24}
      status="idle"
      className="rounded-full"
      aria-label={`${assistantName} face`}
    />
    <span>{assistantName}</span>
  </div>
);

const DesktopHeader = () => (
  <header className="z-20 shrink-0 border-b border-neutral-1000-a05 bg-bg-default text-neutral-primary">
    <div className="flex h-[57px] flex-row items-center justify-between gap-4 px-8">
      <div className="font-hedvig font-bold text-neutral-primary">Harper</div>
      <div className="flex items-center gap-2">
        <IconButton icon={<CircleHelp className="h-4 w-4" />} />
        <IconButton icon={<Settings2 className="h-4 w-4" />} />
        <Avatar small />
      </div>
    </div>
  </header>
);

const MessageBubble = ({
  animated,
  assistantName,
  body,
  role,
}: {
  animated?: boolean;
  assistantName: string;
  body: string;
  role: "assistant" | "user";
}) => {
  const isUser = role === "user";

  return (
    <motion.div
      initial={animated ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-2"
    >
      {!isUser ? <AssistantProfile assistantName={assistantName} /> : null}
      <article
        className={cn(
          "max-w-[92%] whitespace-pre-line wrap-break-word text-[15px] leading-[1.5] md:text-[16px] md:leading-[1.72]",
          isUser
            ? "ml-auto rounded-[14px] bg-black px-4 py-2.5 text-neutral-00"
            : "w-fit max-w-[920px] text-neutral-primary"
        )}
      >
        {body}
      </article>
    </motion.div>
  );
};

const OpportunityDigest = ({
  copy,
  compact = false,
}: {
  copy: StaticCopy;
  compact?: boolean;
}) => (
  <div
    className={cn(
      "w-fit max-w-[900px] rounded-[14px] border border-neutral-1000-a05 bg-bg-floating p-4 text-neutral-primary shadow-sm",
      compact && "max-w-full"
    )}
  >
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[17px] font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          {copy.digestTitle}
        </div>
        <p className="mt-1 text-[16px] leading-6 text-neutral-muted">
          {copy.digestSubtitle}
        </p>
      </div>
      <span className="rounded-full bg-bg-weak px-2.5 py-1 text-[15px] font-medium text-neutral-muted">
        {copy.opportunities.length}
      </span>
    </div>
    <div className="mt-4 grid gap-2">
      {copy.opportunities.slice(0, compact ? 2 : 3).map((item) => (
        <div
          key={item.id}
          className="rounded-[10px] border border-neutral-1000-a05 bg-bg-default px-3 py-2.5"
        >
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[16px] font-medium text-neutral-primary">
                {item.title}
              </div>
              <div className="mt-1 truncate text-[15px] text-neutral-muted">
                {item.company} · {item.type}
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-primary-faded px-2 py-1 text-[14px] font-medium text-accent-700">
              {item.source}
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const StaticComposer = ({ placeholder }: { placeholder: string }) => (
  <div className="shrink-0 px-4 pb-3 pt-2 md:px-5 md:pb-6 md:pt-0">
    <div className="mx-auto w-full max-w-[1120px]">
      <div className="overflow-hidden rounded-[16px] border border-neutral-1000-a10 bg-bg-floating/80 shadow-sm backdrop-blur-xl">
        <div className="relative flex min-h-[84px] items-start">
          <div className="min-w-0 flex-1 px-3.5 py-4 text-[15px] leading-6 text-neutral-placeholder md:text-[16px] md:leading-7">
            {placeholder}
          </div>
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            <button
              type="button"
              aria-disabled="true"
              tabIndex={-1}
              className="inline-flex h-8 w-10 items-center justify-center rounded-[14px] border border-neutral-1000-a10 bg-primary text-neutral-00 shadow-xs"
            >
              <AudioLines className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

function useConversationPlayback({
  enabled,
  messageCount,
  onGmailMockupVisibleChange,
}: {
  enabled: boolean;
  messageCount: number;
  onGmailMockupVisibleChange?: (visible: boolean) => void;
}) {
  const [animatedVisibleMessageCount, setAnimatedVisibleMessageCount] =
    useState(0);

  useEffect(() => {
    if (!enabled) {
      onGmailMockupVisibleChange?.(false);
      return undefined;
    }

    let cancelled = false;
    const timers: number[] = [];

    const schedule = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        if (!cancelled) callback();
      }, delay);
      timers.push(timer);
    };

    const runCycle = () => {
      if (cancelled) return;

      setAnimatedVisibleMessageCount(0);
      onGmailMockupVisibleChange?.(false);

      for (let index = 0; index < messageCount; index += 1) {
        schedule(
          () => setAnimatedVisibleMessageCount(index + 1),
          CHAT_ANIMATION_INITIAL_DELAY_MS +
            index * CHAT_ANIMATION_MESSAGE_INTERVAL_MS
        );
      }

      const gmailShowDelay =
        CHAT_ANIMATION_INITIAL_DELAY_MS +
        Math.max(messageCount - 1, 0) * CHAT_ANIMATION_MESSAGE_INTERVAL_MS +
        CHAT_ANIMATION_AFTER_LAST_DELAY_MS;
      const gmailHideDelay = gmailShowDelay + CHAT_ANIMATION_GMAIL_VISIBLE_MS;

      schedule(() => {
        onGmailMockupVisibleChange?.(true);
      }, gmailShowDelay);
      schedule(() => {
        onGmailMockupVisibleChange?.(false);
      }, gmailHideDelay);
      schedule(runCycle, gmailHideDelay + CHAT_ANIMATION_RESET_DELAY_MS);
    };

    schedule(runCycle, 0);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      onGmailMockupVisibleChange?.(false);
    };
  }, [enabled, messageCount, onGmailMockupVisibleChange]);

  return {
    visibleMessageCount: enabled ? animatedVisibleMessageCount : messageCount,
  };
}

const StaticChatPanel = ({
  autoPlayConversation,
  copy,
  onGmailMockupVisibleChange,
  viewport,
}: {
  autoPlayConversation?: boolean;
  copy: StaticCopy;
  onGmailMockupVisibleChange?: (visible: boolean) => void;
  viewport: PreviewViewport;
}) => {
  const compact = viewport === "mobile";
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { visibleMessageCount } = useConversationPlayback({
    enabled: Boolean(autoPlayConversation),
    messageCount: copy.messages.length,
    onGmailMockupVisibleChange,
  });
  const visibleMessages = copy.messages.slice(0, visibleMessageCount);
  const showDigest = !autoPlayConversation;

  useEffect(() => {
    if (!compact) return;

    const element = scrollContainerRef.current;
    if (!element) return;

    const frameId = window.requestAnimationFrame(() => {
      element.scrollTo({
        behavior: visibleMessageCount <= 1 ? "auto" : "smooth",
        top: element.scrollHeight,
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [compact, visibleMessageCount]);

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-bg-default">
      <div
        ref={scrollContainerRef}
        className={cn(
          "min-h-0 flex-1 scrollbar-thin scrollbar-thumb-neutral-1000-a10 scrollbar-track-transparent",
          compact
            ? "overflow-y-auto overscroll-contain px-4 pb-[260px] pt-5"
            : "overflow-hidden px-5 pb-[210px] pt-6 md:px-6"
        )}
      >
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5">
          <div className="flex justify-center py-1">
            <span className="rounded-full bg-bg-weak px-3 py-1 text-[12px] text-neutral-soft">
              2026-07-13
            </span>
          </div>
          {visibleMessages.map((message) => (
            <MessageBubble
              key={message.id}
              animated={autoPlayConversation}
              assistantName={copy.assistantName}
              body={message.body}
              role={message.role}
            />
          ))}
          {showDigest ? (
            <div className="flex flex-col gap-2">
              <AssistantProfile assistantName={copy.assistantName} />
              <OpportunityDigest copy={copy} compact={compact} />
            </div>
          ) : null}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-bg-basement via-bg-basement/70 to-transparent">
        <div>
          <StaticComposer placeholder={copy.composerPlaceholder} />
        </div>
      </div>
    </section>
  );
};

const StarterIcon = ({ type }: { type: "message" | "sliders" }) =>
  type === "message" ? (
    <MessageCircleMore className="h-3.5 w-3.5" strokeWidth={1.8} />
  ) : (
    <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
  );

const ConversationStarterRow = ({ copy }: { copy: StaticCopy }) => (
  <div className="mt-12 flex w-full flex-row flex-wrap items-center justify-center gap-2">
    {copy.home.starters.map((starter) => (
      <button
        key={starter.label}
        type="button"
        aria-disabled="true"
        tabIndex={-1}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-neutral-1000-a05 bg-bg-floating pl-2 pr-4 text-center font-normal text-neutral-primary shadow-sm"
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/5 text-neutral-muted">
          <StarterIcon type={starter.icon} />
        </span>
        <span className="min-w-0 text-[14px] font-medium leading-5">
          {starter.label}
        </span>
      </button>
    ))}
  </div>
);

const StaticCallCard = ({ copy }: { copy: StaticCopy }) => (
  <div className="mt-6 rounded-3xl border border-neutral-1000-a05 bg-bg-floating px-4 py-5 shadow-sm md:px-6">
    <div className="flex flex-col items-center justify-between gap-2 md:flex-row">
      <div className="hidden h-14 w-14 min-w-14 items-center justify-center rounded-lg bg-neutral-200 md:flex">
        <Phone className="h-6 w-6 text-neutral-muted" strokeWidth={1.6} />
      </div>
      <div className="flex w-full flex-col items-start justify-center gap-2 px-2 md:gap-1">
        <div className="w-full text-center text-base font-medium leading-5 text-neutral-primary md:text-left">
          {copy.home.callTitle}
        </div>
        <div className="w-full text-center text-sm font-normal leading-5 text-neutral-muted md:text-left">
          {copy.home.callDescription}
        </div>
      </div>
      <button
        type="button"
        aria-disabled="true"
        tabIndex={-1}
        className="mt-4 inline-flex h-9 min-w-[60%] items-center justify-center gap-2 rounded-[8px] border border-neutral-1000-a10 bg-black px-3.5 text-sm font-medium text-neutral-00 md:mt-0 md:min-w-[130px]"
      >
        <Phone className="h-4 w-4 shrink-0" strokeWidth={1.6} />
        <span className="min-w-0 truncate">{copy.home.callCta}</span>
      </button>
    </div>
  </div>
);

const HomeOpportunitySummaryCardStatic = ({
  buttonLabel,
  count,
  description,
  icon,
  iconClassName,
  title,
}: {
  buttonLabel: string;
  count: number;
  description: string;
  icon: ReactNode;
  iconClassName: string;
  title: string;
}) => (
  <div className="group flex min-h-[104px] w-full flex-col items-stretch justify-between whitespace-normal rounded-2xl border border-neutral-1000-a05 bg-bg-floating px-4 py-4 text-left text-neutral-primary shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="text-base font-medium leading-5 text-neutral-primary">
        {title}
      </div>
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${iconClassName}`}
      >
        {icon}
      </span>
    </div>
    <div>
      <div className="mt-0 flex items-end gap-2.5">
        <span className="text-3xl font-medium leading-none text-neutral-primary sm:text-4xl">
          {count.toLocaleString()}
        </span>
        <span className="pb-0.5 text-xs font-normal leading-4 text-neutral-soft">
          {description}
        </span>
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-normal leading-4 text-neutral-muted">
        {buttonLabel}
        <span aria-hidden>›</span>
      </span>
    </div>
  </div>
);

const VisibilityIcon = ({
  type,
  selected,
}: {
  selected?: boolean;
  type: "shield-check" | "shield-alert" | "lock";
}) => {
  const className = selected ? "h-4 w-4 text-neutral-primary" : "h-4 w-4";
  if (type === "shield-check") return <ShieldCheck className={className} />;
  if (type === "shield-alert") return <ShieldAlert className={className} />;
  return <Lock className={className} />;
};

const StaticProfileSharingSettings = ({ copy }: { copy: StaticCopy }) => (
  <div className="mt-12">
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium leading-5 text-neutral-primary">
            {copy.home.profileVisibilityLabel}
          </div>
          <p className="mt-1 text-xs font-normal leading-4 text-neutral-soft">
            {copy.home.profileVisibilityHint}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          {copy.home.visibilityOptions.map((option) => (
            <div
              key={option.label}
              className={cn(
                "rounded-lg border px-3 py-3 text-left transition-colors",
                option.selected
                  ? "border-neutral-800 bg-bg-floating text-neutral-primary shadow-sm"
                  : "border-neutral-1000-a05 bg-bg-floating text-neutral-muted"
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg-weak",
                    option.selected
                      ? "text-neutral-primary"
                      : "text-neutral-muted"
                  )}
                >
                  <VisibilityIcon
                    selected={option.selected}
                    type={option.icon}
                  />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium leading-5 text-neutral-primary">
                    {option.label}
                  </div>
                  <p className="mt-1 line-clamp-3 text-[11.5px] leading-4 text-neutral-muted">
                    {option.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-neutral-1000-a05 bg-bg-floating px-4 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium leading-5 text-neutral-primary">
                {copy.home.blockedCompanyLabel}
              </div>
              <p className="mt-1 text-xs leading-4 text-neutral-soft">
                {copy.home.blockedCompanyHint}
              </p>
            </div>
            <button
              type="button"
              aria-disabled="true"
              tabIndex={-1}
              className="inline-flex h-8 items-center justify-center rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-3 text-xs font-medium text-neutral-muted"
            >
              Save
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {copy.home.blockedCompanies.map((company) => (
              <span
                key={company}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-bg-weak px-3 text-xs font-medium text-neutral-muted"
              >
                {company}
                <X className="h-3 w-3" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const StaticDashboard = ({ copy }: { copy: StaticCopy }) => (
  <div className="mx-auto w-full max-w-[1120px] px-4 pb-8">
    <div className="space-y-4 text-neutral-primary">
      <h2 className="mt-8 text-center font-hedvig text-xl font-semibold leading-tight text-balance text-neutral-primary">
        {copy.home.welcomePrefix}, <span className="text-primary">Chris</span>!
      </h2>
      <div>
        <p className="text-center text-sm font-medium leading-5 text-neutral-muted">
          {copy.home.activeOpportunityLabel}
        </p>
        <p className="mt-1 text-center text-sm font-medium leading-5 text-neutral-muted">
          {copy.home.recommendationSettingLabel}
        </p>
      </div>
      <ConversationStarterRow copy={copy} />
      <StaticCallCard copy={copy} />
      <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HomeOpportunitySummaryCardStatic
          title={copy.home.newOpportunityTitle}
          count={copy.home.newOpportunityCount}
          description={copy.home.newOpportunityDescription}
          buttonLabel={copy.home.newOpportunityButton}
          icon={
            <GalleryVerticalEnd
              className="h-5 w-5 text-primary"
              strokeWidth={1.8}
            />
          }
          iconClassName="bg-accent-200"
        />
        <HomeOpportunitySummaryCardStatic
          title={copy.home.savedTitle}
          count={copy.home.savedCount}
          description={copy.home.savedDescription}
          buttonLabel={copy.home.savedButton}
          icon={<Star className="h-5 w-5 text-positive" strokeWidth={1.9} />}
          iconClassName="bg-positive-faded"
        />
      </div>
      <StaticProfileSharingSettings copy={copy} />
      <div className="mt-12 rounded-3xl border border-neutral-1000-a05 bg-bg-floating px-5 py-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-bg-weak text-neutral-muted">
            <FileText className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-medium leading-5 text-neutral-primary">
              {copy.profileTitle}
            </div>
            <p className="mt-1 text-sm leading-5 text-neutral-muted">
              {copy.profileBody}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const DesktopWorkspace = ({
  autoPlayConversation,
  copy,
  onGmailMockupVisibleChange,
}: {
  autoPlayConversation?: boolean;
  copy: StaticCopy;
  onGmailMockupVisibleChange?: (visible: boolean) => void;
}) => (
  <main className="flex h-full w-full flex-col overflow-hidden bg-bg-basement text-neutral-primary">
    <DesktopHeader />
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <section className="flex min-h-0 basis-[56%] flex-col border-r-0 border-neutral-1000-a05 bg-bg-default">
        <StaticChatPanel
          autoPlayConversation={autoPlayConversation}
          copy={copy}
          onGmailMockupVisibleChange={onGmailMockupVisibleChange}
          viewport="desktop"
        />
      </section>

      <div
        role="presentation"
        className="flex w-2 shrink-0 items-center justify-center bg-bg-basement"
      >
        <div className="h-10 w-[3px] rounded-full bg-black/20" />
      </div>

      <section className="min-w-0 flex-1 bg-bg-basement">
        <div className="flex h-full min-h-0 flex-col">
          <nav className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-neutral-1000-a05 px-3 py-3.5">
            <StaticAction active>
              <House className="h-4 w-4" />
              {copy.nav.home}
            </StaticAction>
            <StaticAction badge={2}>
              <GalleryVerticalEnd className="h-4 w-4" />
              {copy.nav.positions}
            </StaticAction>
            <StaticAction>
              <User className="h-4 w-4" />
              {copy.nav.profile}
            </StaticAction>
          </nav>
          <div className="min-h-0 flex-1 overflow-hidden pb-8">
            <StaticDashboard copy={copy} />
          </div>
        </div>
      </section>
    </div>
  </main>
);

const MobileWorkspace = ({
  autoPlayConversation,
  copy,
  onGmailMockupVisibleChange,
}: {
  autoPlayConversation?: boolean;
  copy: StaticCopy;
  onGmailMockupVisibleChange?: (visible: boolean) => void;
}) => (
  <main className="flex h-full pt-0.5 w-full flex-col overflow-hidden bg-bg-basement text-neutral-primary">
    <header className="relative z-20 flex h-12 shrink-0 items-center justify-between px-2 text-neutral-primary backdrop-blur-xl overflow-hidden">
      <button
        type="button"
        aria-disabled="true"
        tabIndex={-1}
        className="inline-flex h-11 max-w-[180px] items-center gap-2 rounded-md px-2.5 text-base font-medium text-neutral-primary"
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-neutral-primary">
          <MessageSquareText className="h-4 w-4" />
        </span>
        <span>{copy.chatTitle}</span>
      </button>
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-hedvig text-[18px] text-neutral-primary">
        Harper
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-disabled="true"
          tabIndex={-1}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-neutral-muted"
        >
          <Settings2 className="h-5 w-5" />
        </button>
        <Avatar small />
      </div>
    </header>
    <div className="relative min-h-0 flex-1 bg-bg-basement">
      <div className="absolute inset-x-0 bottom-0 top-0 z-10 flex flex-col border-t border-neutral-1000-a05 bg-bg-floating text-neutral-primary">
        <div className="relative flex shrink-0 items-center justify-center px-4 pb-2 pt-3">
          <div className="flex h-6 w-24 items-center justify-center">
            <div className="h-1.5 w-12 rounded-full bg-black/15" />
          </div>
          <button
            type="button"
            aria-disabled="true"
            tabIndex={-1}
            className="absolute right-3 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-1000-a05 bg-bg-floating text-neutral-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <StaticChatPanel
            autoPlayConversation={autoPlayConversation}
            copy={copy}
            onGmailMockupVisibleChange={onGmailMockupVisibleChange}
            viewport="mobile"
          />
        </div>
      </div>
    </div>
  </main>
);

const StaticWorkspace = ({
  autoPlayConversation,
  copy,
  onGmailMockupVisibleChange,
  viewport,
}: {
  autoPlayConversation?: boolean;
  copy: StaticCopy;
  onGmailMockupVisibleChange?: (visible: boolean) => void;
  viewport: PreviewViewport;
}) =>
  viewport === "mobile" ? (
    <MobileWorkspace
      autoPlayConversation={autoPlayConversation}
      copy={copy}
      onGmailMockupVisibleChange={onGmailMockupVisibleChange}
    />
  ) : (
    <DesktopWorkspace
      autoPlayConversation={autoPlayConversation}
      copy={copy}
      onGmailMockupVisibleChange={onGmailMockupVisibleChange}
    />
  );

const CareerWorkspaceLandingMockup = ({
  autoPlayConversation,
  className,
  disableInteractions = false,
  embedded = false,
  onGmailMockupVisibleChange,
  viewport = "auto",
}: CareerWorkspaceLandingMockupProps) => {
  const { locale } = useMessages();
  const copy = COPY[locale] ?? COPY.ko;
  const guardClassName = cn(
    disableInteractions && "pointer-events-none select-none",
    className
  );

  if (embedded) {
    return (
      <div className={cn("h-full w-full", guardClassName)}>
        <ScaledPreviewViewport viewport={viewport}>
          {(resolvedViewport) => (
            <StaticWorkspace
              autoPlayConversation={autoPlayConversation}
              copy={copy}
              onGmailMockupVisibleChange={onGmailMockupVisibleChange}
              viewport={resolvedViewport}
            />
          )}
        </ScaledPreviewViewport>
      </div>
    );
  }

  return (
    <div className={cn("h-svh w-full", guardClassName)}>
      <StaticWorkspace
        autoPlayConversation={autoPlayConversation}
        copy={copy}
        onGmailMockupVisibleChange={onGmailMockupVisibleChange}
        viewport="desktop"
      />
    </div>
  );
};

export default React.memo(CareerWorkspaceLandingMockup);
