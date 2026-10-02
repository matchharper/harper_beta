import {
  AudioLines,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  Inbox,
  List,
  MessageSquareText,
  Phone,
  Plus,
  PanelLeft,
  Settings,
  TextSelect,
  User,
  X,
} from "lucide-react";
import React, {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Image from "next/image";
import Face from "@/components/common/Face";
import { CompanyLogo } from "@/components/career/watchlist/CompanyLogo";
import { MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMessages, type Locale } from "@/i18n/useMessage";

type PreviewViewport = "desktop" | "mobile";
type PreviewViewportMode = PreviewViewport | "auto";

type CareerWorkspaceLandingMockupProps = {
  className?: string;
  disableInteractions?: boolean;
  embedded?: boolean;
  viewport?: PreviewViewportMode;
};

type StaticCopy = {
  assistantName: string;
  composerPlaceholder: string;
  dateLabel: string;
  messages: Array<{
    id: string;
    role: "assistant" | "user";
    body: string;
  }>;
  desktop: {
    nav: {
      tasks: string;
      new: string;
      saved: string;
      profile: string;
      brief: string;
      settings: string;
    };
    decisions: string;
    companyQuestionMeta: string;
    companyQuestionTitle: string;
    companyQuestionDescription: string;
    companyQuestionAction: string;
    decisionMeta: string;
    decisionTitle: string;
    decisionDescription: string;
    decisionAction: string;
    suggestions: string;
    suggestionTitle: string;
    suggestionDescription: string;
    suggestionAction: string;
    working: string;
    workingMeta: string;
    workingTitle: string;
    workingAction: string;
  };
};

// career-i18n-skip
const COPY: Record<Locale, StaticCopy> = {
  ko: {
    assistantName: "Harper",
    composerPlaceholder: "새로운 조건이나 궁금한 점을 남겨주세요",
    dateLabel: "오늘",
    messages: [
      {
        id: "m1",
        role: "user",
        body: "다음에는 제품 출시 경험을 살릴 수 있는 AI 팀을 보고 싶어요. 서울이나 샌프란시스코 모두 괜찮습니다.",
      },
      {
        id: "m2",
        role: "assistant",
        body: "좋아요. 지역과 경험을 선호 기준에 반영할게요. 공개 포지션과 연결 가능한 회사 기회를 함께 살펴보겠습니다.",
      },
      {
        id: "m3",
        role: "user",
        body: "초기 팀에서 책임 있게 일하고 싶어요. 보상도 지금보다 나으면 좋겠고요.",
      },
      {
        id: "m4",
        role: "assistant",
        body: "반영했어요. Northstar AI의 연결 제안을 할 일에 올려뒀어요. Sierra를 대신해 미국 근무 비자도 여쭤볼게요. 편한 쪽부터 확인해 주세요.",
      },
    ],
    desktop: {
      nav: {
        tasks: "할 일",
        new: "새 기회",
        saved: "내 기회",
        profile: "프로필",
        brief: "선호 기준",
        settings: "설정",
      },
      decisions: "지금 결정",
      companyQuestionMeta: "Sierra · Forward Deployed Engineer",
      companyQuestionTitle: "Sierra를 대신해 여쭤볼게요",
      companyQuestionDescription:
        "현재 미국에서 일할 수 있는 비자가 있으신가요?",
      companyQuestionAction: "답변하기",
      decisionMeta: "Northstar AI · Founding Applied AI Engineer",
      decisionTitle: "새로운 연결 제안이 도착했어요",
      decisionDescription:
        "초기 AI 팀에서 제품 경험을 살릴 역할이에요. 관심이 있는지 확인해 주세요.",
      decisionAction: "제안 보기",
      suggestions: "Harper 제안",
      suggestionTitle: "Harper와 5분 통화",
      suggestionDescription: "최근 상황이나 달라진 조건을 가볍게 이야기해요.",
      suggestionAction: "통화하기",
      working: "Harper가 하는 중",
      workingMeta: "Wonderful · APAC 팀",
      workingTitle: "연결 진행 상황을 확인하고 있어요",
      workingAction: "자세히 보기",
    },
  },
  en: {
    assistantName: "Harper",
    composerPlaceholder: "Ask anything",
    dateLabel: "Today",
    messages: [
      {
        id: "m1",
        role: "user",
        body: "I'd like to use my product launch experience on an AI team. I'm open to Seoul or San Francisco.",
      },
      {
        id: "m2",
        role: "assistant",
        body: "Got it. I'll keep those locations and your experience in mind as I look at open roles and companies I can connect you with.",
      },
      {
        id: "m3",
        role: "user",
        body: "I'd like more ownership on an early team, with better compensation than I have now.",
      },
      {
        id: "m4",
        role: "assistant",
        body: "I've added Northstar AI's connection offer to your To do list. I'll also ask about your US work visa on Sierra's behalf. Take a look whenever you're ready.",
      },
    ],
    desktop: {
      nav: {
        tasks: "To do",
        new: "New opportunities",
        saved: "My opportunities",
        profile: "Profile",
        brief: "Search brief",
        settings: "Settings",
      },
      decisions: "Your decisions",
      companyQuestionMeta: "Sierra · Forward Deployed Engineer",
      companyQuestionTitle: "A question from Harper, on Sierra's behalf",
      companyQuestionDescription:
        "Do you currently have a visa that allows you to work in the US?",
      companyQuestionAction: "Answer",
      decisionMeta: "Northstar AI · Founding Applied AI Engineer",
      decisionTitle: "A new connection is ready for review",
      decisionDescription:
        "An early AI team where your product experience could matter. Take a look and tell Harper what you think.",
      decisionAction: "View opportunity",
      suggestions: "Harper suggests",
      suggestionTitle: "A 5-minute call with Harper",
      suggestionDescription:
        "Share what's changed and what matters for your next move.",
      suggestionAction: "Start a call",
      working: "Harper is working on",
      workingMeta: "Wonderful · APAC team",
      workingTitle: "Checking on your connection",
      workingAction: "View progress",
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

const MessageBubble = ({
  assistantName,
  body,
  role,
}: {
  assistantName: string;
  body: string;
  role: "assistant" | "user";
}) => {
  const isUser = role === "user";

  return (
    <div className="flex flex-col gap-2">
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
    </div>
  );
};

const StaticComposer = ({
  compact,
  placeholder,
}: {
  compact: boolean;
  placeholder: string;
}) => (
  <div className="shrink-0 px-4 pb-3 pt-2 md:px-5 md:pb-6 md:pt-0">
    <div className="mx-auto w-full max-w-[1120px]">
      <div
        className={cn(
          "overflow-hidden rounded-[18px] border",
          "border-neutral-1000-a05 bg-bg-floating/55 shadow-sm backdrop-blur-lg",
          compact
            ? "grid h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center"
            : "flex flex-col"
        )}
      >
        {compact ? (
          <MuteButton
            aria-disabled="true"
            aria-label="추가 메뉴"
            className="ml-2 rounded-full"
            size="md"
            tabIndex={-1}
            variant="transparent"
          >
            <Plus className="h-5 w-5" />
          </MuteButton>
        ) : null}
        <div
          className={cn(
            "min-w-0 text-neutral-placeholder",
            compact
              ? "truncate px-2 text-[15px] leading-5"
              : "min-h-12 px-3.5 py-3 text-[15px] leading-6"
          )}
        >
          {placeholder}
        </div>
        <div
          className={cn(
            "flex items-center",
            compact ? "mr-2 justify-self-end" : "justify-between px-2 pb-2"
          )}
        >
          {!compact ? (
            <MuteButton
              aria-disabled="true"
              aria-label="추가 메뉴"
              className="rounded-full"
              size="md"
              tabIndex={-1}
              variant="transparent"
            >
              <Plus className="h-5 w-5" />
            </MuteButton>
          ) : null}
          <MuteButton
            type="button"
            aria-disabled="true"
            aria-label="통화 모드"
            tabIndex={-1}
            className="rounded-full"
            size="md"
            variant="primary"
          >
            <AudioLines className="h-4 w-4" />
          </MuteButton>
        </div>
      </div>
    </div>
  </div>
);

const StaticChatPanel = ({
  copy,
  viewport,
}: {
  copy: StaticCopy;
  viewport: PreviewViewport;
}) => {
  const compact = viewport === "mobile";

  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden",
        compact ? "bg-bg-default" : "bg-bg-basement"
      )}
    >
      <div
        className={cn(
          "min-h-0 flex-1 scrollbar-thin scrollbar-thumb-neutral-1000-a10 scrollbar-track-transparent",
          compact
            ? "overflow-y-auto overscroll-contain px-4 pb-[120px] pt-5"
            : "overflow-hidden px-5 pb-[210px] pt-6 md:px-6"
        )}
      >
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5">
          <div className="flex justify-center py-1">
            <span className="rounded-full bg-bg-weak px-3 py-1 text-[12px] text-neutral-soft">
              {copy.dateLabel}
            </span>
          </div>
          {copy.messages.map((message) => (
            <MessageBubble
              key={message.id}
              assistantName={copy.assistantName}
              body={message.body}
              role={message.role}
            />
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-bg-basement via-bg-basement/70 to-transparent">
        <div>
          <StaticComposer
            compact={compact}
            placeholder={copy.composerPlaceholder}
          />
        </div>
      </div>
    </section>
  );
};

const StaticTaskSection = ({
  children,
  count,
  title,
}: {
  children: ReactNode;
  count?: number;
  title: string;
}) => (
  <section>
    <div className="flex items-center gap-2">
      <h2 className="text-[16px] font-medium">{title}</h2>
      {count ? (
        <span className="text-[13px] text-neutral-muted">({count})</span>
      ) : null}
    </div>
    <div>{children}</div>
  </section>
);

const StaticTaskRow = ({
  action,
  description,
  icon,
  meta,
  primary = false,
  title,
}: {
  action?: string;
  description?: string;
  icon: ReactNode;
  meta?: string;
  primary?: boolean;
  title: string;
}) => (
  <article className="flex items-start gap-3 border-b border-neutral-1000-a05 py-5 last:border-b-0">
    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-bg-weak text-neutral-muted">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      {meta ? (
        <p className="mb-1 text-[12px] text-neutral-muted">{meta}</p>
      ) : null}
      <h3 className={cn("text-[15px] leading-5", primary && "font-medium")}>
        {title}
      </h3>
      {description ? (
        <p className="mt-1.5 line-clamp-3 text-[13px] leading-[1.45] text-neutral-muted">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-3">
          <MuteButton
            aria-disabled="true"
            className="pointer-events-none"
            size="sm"
            tabIndex={-1}
            variant={primary ? "primary" : "default"}
          >
            {action}
            {!primary ? <ChevronRight className="size-3.5" /> : null}
          </MuteButton>
        </div>
      ) : null}
    </div>
  </article>
);

const DesktopWorkspace = ({ copy }: { copy: StaticCopy }) => {
  const navItems = [
    {
      label: copy.desktop.nav.tasks,
      icon: <Inbox className="size-4.5" strokeWidth={1.5} />,
      count: 2,
      active: true,
    },
    {
      label: copy.desktop.nav.new,
      icon: (
        <Image
          alt=""
          className="size-5"
          height={20}
          src="/svgs/loader.svg"
          width={20}
        />
      ),
      count: 2,
    },
    {
      label: copy.desktop.nav.saved,
      icon: <BriefcaseBusiness className="size-4.5" strokeWidth={1.5} />,
    },
    {
      label: copy.desktop.nav.profile,
      icon: <User className="size-4.5" strokeWidth={1.5} />,
    },
    {
      label: copy.desktop.nav.brief,
      icon: <TextSelect className="size-4.5" strokeWidth={1.5} />,
    },
  ];

  return (
    <main className="flex h-full w-full overflow-hidden bg-bg-basement text-neutral-primary">
      <aside className="flex w-[244px] shrink-0 flex-col border-r border-neutral-1000-a05 bg-bg-basement px-3 py-3">
        <div className="mb-4 flex h-9 items-center justify-between pl-2.5">
          <span className="font-hedvig text-[1.1rem]">Harper</span>
          <PanelLeft
            className="size-4.5 text-neutral-muted"
            strokeWidth={1.5}
          />
        </div>
        <nav className="flex-1 space-y-1" aria-label="Career">
          {navItems.map(({ label, icon, count, active }) => (
            <div
              key={label}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14.5px]",
                active && "bg-neutral-300/70"
              )}
            >
              <span className="inline-flex shrink-0">{icon}</span>
              <span className="min-w-0 truncate">{label}</span>
              {count ? (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-faded px-1.5 text-[11px] leading-none text-primary">
                  {count}
                </span>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="space-y-2 pt-4">
          <div className="flex h-9 items-center gap-2.5 px-2.5 text-[14.5px]">
            <Settings className="size-4.5" strokeWidth={1.5} />
            {copy.desktop.nav.settings}
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1">
            <Avatar small />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">Chris</div>
              <div className="truncate text-[12px] text-neutral-muted">
                chris@example.com
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1">
        <section className="min-w-0 basis-1/2 border-r border-neutral-1000-a05 bg-bg-basement">
          <StaticChatPanel copy={copy} viewport="desktop" />
        </section>

        <div
          role="presentation"
          className="flex w-2 shrink-0 items-center justify-center bg-bg-basement"
        >
          <div className="h-10 w-[3px] rounded-full bg-black/20" />
        </div>

        <section className="flex min-w-0 flex-1 flex-col border-l border-neutral-1000-a05 bg-bg-basement">
          <header className="flex h-14 shrink-0 items-center border-b border-neutral-1000-a05 px-4 text-[18px]">
            {copy.desktop.nav.tasks}
          </header>
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-8">
            <div className="mx-auto w-full max-w-2xl py-7">
              <div className="space-y-9">
                <StaticTaskSection title={copy.desktop.decisions} count={2}>
                  <StaticTaskRow
                    icon={<MessageSquareText className="size-4" />}
                    meta={copy.desktop.companyQuestionMeta}
                    title={copy.desktop.companyQuestionTitle}
                    description={copy.desktop.companyQuestionDescription}
                    action={copy.desktop.companyQuestionAction}
                    primary
                  />
                  <StaticTaskRow
                    icon={
                      <CompanyLogo
                        logoUrl={null}
                        name="Northstar AI"
                        size="sm"
                      />
                    }
                    meta={copy.desktop.decisionMeta}
                    title={copy.desktop.decisionTitle}
                    description={copy.desktop.decisionDescription}
                    action={copy.desktop.decisionAction}
                    primary
                  />
                </StaticTaskSection>
                <StaticTaskSection title={copy.desktop.suggestions}>
                  <StaticTaskRow
                    icon={<Phone className="size-4" />}
                    title={copy.desktop.suggestionTitle}
                    description={copy.desktop.suggestionDescription}
                    action={copy.desktop.suggestionAction}
                  />
                </StaticTaskSection>
                <StaticTaskSection title={copy.desktop.working}>
                  <StaticTaskRow
                    icon={<Building2 className="size-4" />}
                    meta={copy.desktop.workingMeta}
                    title={copy.desktop.workingTitle}
                    action={copy.desktop.workingAction}
                  />
                </StaticTaskSection>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

const MobileWorkspace = ({ copy }: { copy: StaticCopy }) => (
  <main className="flex h-full w-full flex-col overflow-hidden bg-bg-floating text-neutral-primary">
    <header className="relative z-20 flex shrink-0 items-center justify-center px-4 pb-2 pt-2">
      <MuteButton
        aria-disabled="true"
        aria-label="메뉴 열기"
        className="absolute left-3 top-2 rounded-full border-neutral-1000-a05 bg-bg-floating/55 text-neutral-muted backdrop-blur-lg"
        size="md"
        tabIndex={-1}
      >
        <List className="h-4 w-4" />
      </MuteButton>
      <div className="flex h-8 w-24 items-center justify-center">
        <div className="h-[3px] w-10 rounded-full bg-black/20" />
      </div>
      <MuteButton
        aria-disabled="true"
        aria-label="채팅 접기"
        className="absolute right-3 top-2 rounded-full border-neutral-1000-a05 bg-bg-floating/55 text-neutral-muted backdrop-blur-lg"
        size="md"
        tabIndex={-1}
      >
        <X className="h-4 w-4" />
      </MuteButton>
    </header>
    <div className="min-h-0 flex-1 overflow-hidden border-t border-neutral-1000-a05">
      <StaticChatPanel copy={copy} viewport="mobile" />
    </div>
  </main>
);

const StaticWorkspace = ({
  copy,
  viewport,
}: {
  copy: StaticCopy;
  viewport: PreviewViewport;
}) =>
  viewport === "mobile" ? (
    <MobileWorkspace copy={copy} />
  ) : (
    <DesktopWorkspace copy={copy} />
  );

const CareerWorkspaceLandingMockup = ({
  className,
  disableInteractions = false,
  embedded = false,
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
            <StaticWorkspace copy={copy} viewport={resolvedViewport} />
          )}
        </ScaledPreviewViewport>
      </div>
    );
  }

  return (
    <div className={cn("h-svh w-full", guardClassName)}>
      <StaticWorkspace copy={copy} viewport="desktop" />
    </div>
  );
};

export default React.memo(CareerWorkspaceLandingMockup);
