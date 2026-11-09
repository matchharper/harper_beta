import { ArrowRight, ArrowUp, Home, Plus, Settings } from "lucide-react";
import React, {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Image from "next/image";
import { MuteButton } from "@/components/ui/button";
import {
  ChatDateDivider,
  ChatMessageBubbleFrame,
} from "@/components/chat/ChatTimeline";
import { ChatComposerSurface } from "@/components/chat/ChatComposer";
import { Card } from "@/components/ui/card";
import { TabBoxes } from "@/components/ui/tab-boxes";
import { Typography } from "@/components/ui/typography";
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
  composerPlaceholder: string;
  dateLabel: string;
  messages: Array<{
    id: string;
    role: "assistant" | "user";
    body: string;
  }>;
  desktop: {
    nav: {
      home: string;
      chat: string;
      opportunities: string;
      settings: string;
    };
    followups: string;
    summary: string;
    saved: string;
    applied: string;
    connected: string;
    add: string;
    send: string;
    close: string;
    companyQuestionTitle: string;
    companyQuestionDescription: string;
    companyQuestionAction: string;
    decisionTitle: string;
    decisionDescription: string;
    decisionAction: string;
  };
};

// career-i18n-skip
const COPY: Record<Locale, StaticCopy> = {
  ko: {
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
        body: "Northstar AI의 연결 제안을 준비했어요. 제품 출시 경험을 살리면서 초기 팀에서 주도적으로 일할 수 있는 역할이에요. Sierra에서 궁금해하는 미국 근무 비자도 함께 확인해 주세요.",
      },
    ],
    desktop: {
      nav: {
        home: "홈",
        chat: "채팅",
        opportunities: "기회",
        settings: "설정",
      },
      followups: "지금 팔로업",
      summary: "지원 현황",
      saved: "저장함",
      applied: "지원함",
      connected: "진행중",
      add: "추가 메뉴",
      send: "메시지 보내기",
      close: "닫기",
      companyQuestionTitle: "Sierra를 대신해 여쭤볼게요",
      companyQuestionDescription:
        "현재 미국에서 일할 수 있는 비자가 있으신가요?",
      companyQuestionAction: "답변하기",
      decisionTitle: "새로운 연결 제안이 도착했어요",
      decisionDescription:
        "초기 AI 팀에서 제품 경험을 살릴 역할이에요. 관심이 있는지 확인해 주세요.",
      decisionAction: "제안 보기",
    },
  },
  en: {
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
        body: "Northstar AI could be a good fit: an early team where you can use your product launch experience and take ownership. There's a connection offer ready to review, along with a question from Sierra about your US work visa.",
      },
    ],
    desktop: {
      nav: {
        home: "Home",
        chat: "Chat",
        opportunities: "Opportunities",
        settings: "Settings",
      },
      followups: "Follow-ups",
      summary: "Your opportunities",
      saved: "Saved",
      applied: "Applied",
      connected: "In progress",
      add: "Add attachment",
      send: "Send message",
      close: "Close",
      companyQuestionTitle: "A question from Harper, on Sierra's behalf",
      companyQuestionDescription:
        "Do you currently have a visa that allows you to work in the US?",
      companyQuestionAction: "Answer",
      decisionTitle: "A new connection is ready for review",
      decisionDescription:
        "An early AI team where your product experience could matter. Take a look and tell Harper what you think.",
      decisionAction: "View opportunity",
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
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <div className="absolute left-0 top-0" style={previewStyle}>
        {typeof children === "function" ? children(resolvedViewport) : children}
      </div>
    </div>
  );
};

const Avatar = () => (
  <div className="career-avatar relative size-8 shrink-0 overflow-hidden rounded-full">
    <Image
      alt=""
      className="h-full w-full scale-[1.35] object-cover"
      height={48}
      src="/images/notionface.png"
      width={48}
    />
  </div>
);

const StaticNavigation = ({
  copy,
  compact,
}: {
  copy: StaticCopy;
  compact: boolean;
}) => (
  <header className="career-topbar">
    <div className="career-topbar-home">
      <MuteButton
        aria-disabled="true"
        aria-label={compact ? copy.desktop.nav.settings : copy.desktop.nav.home}
        tabIndex={-1}
      >
        {compact ? (
          <Settings className="size-[18px]" strokeWidth={1.6} />
        ) : (
          <Home className="size-[18px]" strokeWidth={1.6} />
        )}
      </MuteButton>
    </div>
    <TabBoxes
      animateSelection
      aria-label="Career"
      activeValue="chat"
      className="career-top-tabs career-glass"
      items={[
        ...(compact ? [{ value: "home", label: copy.desktop.nav.home }] : []),
        { value: "chat", label: copy.desktop.nav.chat },
        {
          value: "history",
          label: copy.desktop.nav.opportunities,
          countLabel: <span className="career-nav-count">2</span>,
        },
      ]}
      onValueChange={() => undefined}
      size="lg"
      variant="neutral"
    />
    <div className="career-topbar-actions">
      {!compact && (
        <MuteButton aria-disabled="true" tabIndex={-1}>
          <Settings className="size-4" strokeWidth={1.6} />
          {copy.desktop.nav.settings}
        </MuteButton>
      )}
      <Avatar />
    </div>
  </header>
);

const StaticComposer = ({
  compact,
  copy,
}: {
  compact: boolean;
  copy: StaticCopy;
}) => (
  <div className={cn("shrink-0 px-5", compact ? "pb-4" : "pb-7")}>
    <div className="mx-auto w-full max-w-(--career-chat-width)">
      <ChatComposerSurface>
        <Typography
          className="min-h-12 px-3.5 py-3 text-neutral-placeholder"
          variant="body"
        >
          {copy.composerPlaceholder}
        </Typography>
        <div className="flex items-center justify-between px-2 pb-2">
          <MuteButton
            aria-disabled="true"
            aria-label={copy.desktop.add}
            tabIndex={-1}
            variant="transparent"
          >
            <Plus className="size-5" />
          </MuteButton>
          <MuteButton
            aria-label={copy.desktop.send}
            disabled
            size="md"
            variant="dark"
          >
            <ArrowUp className="size-4" />
          </MuteButton>
        </div>
      </ChatComposerSurface>
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
    <section className="relative flex h-full min-h-0 min-w-0 flex-col">
      <div
        className={cn(
          "min-h-0 flex-1 overflow-hidden px-5",
          compact ? "pt-20" : "pt-[100px]"
        )}
      >
        <div className="mx-auto flex w-full max-w-(--career-chat-width) flex-col">
          <ChatDateDivider label={copy.dateLabel} />
          {copy.messages.map((message) => (
            <ChatMessageBubbleFrame
              key={message.id}
              isUser={message.role === "user"}
              className={cn(
                "shrink-0",
                message.role === "user" && (compact ? "my-5" : "my-10 md:my-10")
              )}
              typographyClassName="text-sm leading-[1.8]"
            >
              {message.body}
            </ChatMessageBubbleFrame>
          ))}
        </div>
      </div>
      <StaticComposer compact={compact} copy={copy} />
    </section>
  );
};

const StaticFollowups = ({ copy }: { copy: StaticCopy }) => (
  <div className="career-followups">
    <header className="career-followups-header">
      <div className="career-followups-date">{copy.dateLabel}</div>
      <Typography as="h2" variant="title" className="mt-1">
        {copy.desktop.followups} 2
      </Typography>
    </header>
    <div className="flex flex-col gap-3">
      {[
        {
          title: copy.desktop.companyQuestionTitle,
          description: copy.desktop.companyQuestionDescription,
          action: copy.desktop.companyQuestionAction,
        },
        {
          title: copy.desktop.decisionTitle,
          description: copy.desktop.decisionDescription,
          action: copy.desktop.decisionAction,
        },
      ].map(({ title, description, action }) => (
        <Card className="career-followup-card career-glass" key={title}>
          <Typography
            as="h3"
            className="career-followup-title"
            variant="body-sm"
          >
            {title}
          </Typography>
          <Typography
            className="career-followup-description"
            variant="description"
          >
            {description}
          </Typography>
          <div className="flex items-center justify-between">
            <Typography
              as="div"
              className="career-followup-action"
              variant="body-xs"
            >
              {action}
              <ArrowRight className="size-4 text-neutral-soft" />
            </Typography>
            <span className="career-card-close mt-3">{copy.desktop.close}</span>
          </div>
        </Card>
      ))}
    </div>
    <Card className="career-summary career-glass mt-6">
      <Typography
        as="h3"
        variant="caption"
        className="mb-2.5 text-neutral-soft"
      >
        {copy.desktop.summary}
      </Typography>
      <dl>
        {[
          { label: copy.desktop.saved, count: 2 },
          { label: copy.desktop.applied, count: 1 },
          { label: copy.desktop.connected, count: 1 },
        ].map(({ label, count }) => (
          <div className="flex flex-col" key={label}>
            <dt className="order-2">{label}</dt>
            <dd className="order-1">{count}</dd>
          </div>
        ))}
      </dl>
    </Card>
  </div>
);

const StaticWorkspace = ({
  copy,
  viewport,
}: {
  copy: StaticCopy;
  viewport: PreviewViewport;
}) => {
  const compact = viewport === "mobile";

  return (
    <div
      className="career-landing-preview career-sky-canvas relative isolate h-full w-full overflow-hidden"
      inert
    >
      <StaticNavigation compact={compact} copy={copy} />
      {compact ? (
        <StaticChatPanel copy={copy} viewport={viewport} />
      ) : (
        <div className="grid h-full grid-cols-[minmax(0,1fr)_var(--career-panel-width)] gap-12 pl-(--career-page-inset) pr-(--career-panel-inset)">
          <StaticChatPanel copy={copy} viewport={viewport} />
          <aside className="career-right-column [&::after]:hidden">
            <div className="relative h-full overflow-hidden pt-[84px]">
              <StaticFollowups copy={copy} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

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
