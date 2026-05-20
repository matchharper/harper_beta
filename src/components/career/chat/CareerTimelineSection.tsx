import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  Upload,
  X,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import {
  FormEvent,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CAREER_LINK_LABELS } from "@/components/career/constants";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import type {
  CareerMessage,
  CareerHistoryOpportunity,
  CareerRecommendationSearchStatus,
} from "@/components/career/types";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/conversationStarters";
import { splitRecommendJobPostingStatusLogs } from "@/lib/talentOnboarding/recommendJobPostingStatus";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
  TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE,
  TALENT_ONBOARDING_INTEREST_OPTIONS,
  type TalentOnboardingInterestOptionId,
} from "@/lib/talentOnboarding/onboarding";
import {
  shouldShowContinueConversationAction,
  shouldShowOnboardingInterestSelector,
} from "@/hooks/career/careerHelpers";
import {
  CareerInlinePanel,
  CareerPrimaryButton,
  CareerSecondaryButton,
  CareerTextInput,
  careerCx,
} from "../ui/CareerPrimitives";
import CareerMessageBubble from "./CareerMessageBubble";
import CareerRichText from "../ui/CareerRichText";
import Image from "next/image";
import { useRouter } from "next/router";
import { formatRelativeTime } from "@/lib/utils";
import React from "react";

const LOGIN_GREETING_TEXT =
  "안녕하세요.\n\n회원님의 정보를 저장하기 위해서 우선 계정으로 로그인을 해주세요.";

const LOADING_EXAMPLES = [
  "미국 법인 AI Product 팀 Senior Software Engineer",
  "글로벌 SaaS 팀 ML Engineer (비자 스폰서 가능)",
  "국내 딥테크 스타트업 Applied AI Engineer",
];

const VOICE_TRANSCRIPT_PREVIEW_LIMIT = 120;
const BOTTOM_THRESHOLD_PX = 120;
const HISTORY_TAB_QUERY_KEY = "historyTab";
const HISTORY_ROLE_QUERY_KEY = "id";
const CLAIMED_WORKSPACE_BOOTSTRAP_MESSAGE =
  "기존에 제출한 정보로 커리어 워크스페이스를 시작했습니다.";
const MESSAGE_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  day: "numeric",
  month: "long",
  weekday: "short",
  year: "numeric",
});

const parseMessageDate = (createdAt: string) => {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getMessageDateKey = (createdAt: string) => {
  const date = parseMessageDate(createdAt);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getPreviousMessageDateKey = (
  messages: CareerMessage[],
  currentIndex: number
) => {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const dateKey = getMessageDateKey(messages[index].createdAt);
    if (dateKey) return dateKey;
  }
  return "";
};

const getSingleQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const formatMessageDateLabel = (createdAt: string) => {
  const date = parseMessageDate(createdAt);
  return date ? MESSAGE_DATE_FORMATTER.format(date) : "";
};

const formatChatOpportunityWorkMode = (value: string | null) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  if (!normalized) return null;
  if (normalized === "remote") return "원격";
  if (normalized === "hybrid") return "하이브리드";
  if (normalized === "onsite" || normalized === "on_site") return "대면";
  return value.trim().replaceAll("_", " ");
};

const formatChatOpportunityEmploymentType = (value: string) => {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  if (!normalized) return null;
  if (normalized === "full_time") return "풀타임";
  if (normalized === "part_time") return "파트타임";
  if (normalized === "internship") return "인턴";
  if (normalized === "contract") return "계약직";
  if (normalized === "fractional") return "Fractional";
  return value.trim().replaceAll("_", " ");
};

const getChatOpportunityMetaItems = (item: CareerHistoryOpportunity) =>
  [
    item.location,
    formatChatOpportunityWorkMode(item.workMode),
    ...item.employmentTypes.map(formatChatOpportunityEmploymentType),
  ].filter(Boolean) as string[];

const TimelinePanel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <CareerInlinePanel className={careerCx("max-w-[980px]", className)}>
    {children}
  </CareerInlinePanel>
);

const AssistantLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[12px] font-medium text-beige900/90">{children}</div>
);

const TimelineDateDivider = ({ label }: { label: string }) => (
  <div
    role="separator"
    className="flex justify-center py-2"
    aria-label={`대화 날짜 ${label}`}
  >
    <span className="rounded-full bg-beige500 px-3 py-1 text-[12px] font-normal text-beige900/45">
      {label}
    </span>
  </div>
);

const StatusMessage = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={careerCx("text-sm leading-6 text-beige900/70", className)}>
    {children}
  </div>
);

const ThinkingLogPanel = memo(function ThinkingLogPanel({
  active = false,
  logs,
}: {
  active?: boolean;
  logs: string[];
}) {
  const [expanded, setExpanded] = useState(active);
  const isExpanded = active || expanded;

  if (logs.length === 0) return null;

  return (
    <div
      className="flex w-full max-w-[760px] flex-col gap-2 text-[13px] text-beige900/55"
      aria-live={active ? "polite" : undefined}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="cursor-pointer inline-flex w-fit items-center gap-1.5 rounded-[8px] py-1 text-[13px] font-medium text-beige900/55 transition-colors hover:text-beige900/75"
      >
        {active ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-beige900/45" />
        ) : isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-beige900/45" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-beige900/45" />
        )}
        <span>Thinking</span>
      </button>
      {isExpanded ? (
        <div className="ml-[7px] border-l border-beige900/10 pl-4">
          <ol className="flex flex-col gap-1.5">
            {logs.map((log, index) => (
              <li
                key={`${index}-${log}`}
                className="wrap-break-word text-[13px] leading-6 text-beige900/55"
              >
                {log}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
});

const RecommendationSearchStatusPanel = memo(
  function RecommendationSearchStatusPanel({
    active = false,
    status,
  }: {
    active?: boolean;
    status: CareerRecommendationSearchStatus;
  }) {
    const isRunning = status.state === "running";
    const isCompleted = status.state === "completed";
    const icon = isRunning ? (
      <Loader2 className="h-4 w-4 animate-spin text-beige900/65" />
    ) : isCompleted ? (
      <CheckCircle2 className="h-4 w-4 text-beige900/70" />
    ) : (
      <AlertCircle className="h-4 w-4 text-beige900/65" />
    );
    const title = isRunning
      ? "검색중..."
      : isCompleted
        ? "검색 완료"
        : "검색 실패";
    const detail = isRunning
      ? "프로필과 최근 대화를 반영해 맞춤 채용공고를 찾고 있습니다."
      : isCompleted
        ? [
            typeof status.candidateCount === "number"
              ? `${status.candidateCount}개 공고 검토`
              : "공고 검토 완료",
            typeof status.recommendationCount === "number"
              ? `${status.recommendationCount}개 추천`
              : "",
          ]
            .filter(Boolean)
            .join(" / ")
        : "이번 검색은 완료하지 못했습니다.";

    return (
      <div
        className="w-full max-w-[760px] rounded-[8px] border border-beige900/10 bg-white/55 px-4 py-3 shadow-[0_10px_28px_rgba(54,42,30,0.07)]"
        aria-live={active ? "polite" : undefined}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#f5ecdd]/60">
              {icon}
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold leading-5 text-beige900">
                {title}
              </div>
              <div className="truncate text-[12px] leading-5 text-beige900/55">
                {detail}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-beige900/10">
          <div
            className={careerCx(
              "h-full rounded-full bg-beige900 transition-all duration-500",
              isRunning
                ? "w-1/2 animate-[career-search-progress_6.4s_ease-in-out_infinite]"
                : isCompleted
                  ? "w-full"
                  : "w-full bg-beige900/35"
            )}
          />
        </div>
      </div>
    );
  }
);

const InterestChoiceButton = ({
  selected,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
}) => (
  <button
    type="button"
    {...props}
    className={careerCx(
      "w-fit rounded-[8px] border border-black/10 px-3 py-1.5 text-left text-[14px] leading-6 transition-colors",
      selected
        ? "border-beige900 bg-beige900 text-[#f5ecdd]"
        : "bg-white/45 text-beige900/70 hover:border-beige900/25 hover:text-beige900",
      props.className
    )}
  >
    {children}
  </button>
);

const OpportunityPreviewCards = memo(function OpportunityPreviewCards({
  items,
  onOpenOpportunity,
}: {
  items: CareerHistoryOpportunity[];
  onOpenOpportunity: (opportunity: CareerHistoryOpportunity) => void;
}) {
  const [activeItemState, setActiveItemState] = useState({
    index: 0,
    signature: "",
  });
  const itemSignature = useMemo(
    () => items.map((item) => item.id).join("|"),
    [items]
  );

  const activeIndex =
    activeItemState.signature === itemSignature ? activeItemState.index : 0;
  const activeItemIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));
  const item = items[activeItemIndex] ?? null;
  const hasMultipleItems = items.length > 1;

  const moveActiveItem = useCallback(
    (direction: -1 | 1) => {
      if (items.length <= 1) return;
      setActiveItemState((current) => {
        const currentIndex =
          current.signature === itemSignature ? current.index : 0;
        const next = currentIndex + direction;
        if (next < 0) {
          return {
            index: items.length - 1,
            signature: itemSignature,
          };
        }
        if (next >= items.length) {
          return {
            index: 0,
            signature: itemSignature,
          };
        }
        return {
          index: next,
          signature: itemSignature,
        };
      });
    },
    [itemSignature, items.length]
  );

  if (!item) return null;

  const feedback = item.feedback;
  const isPositive = feedback === "positive";
  const postedAgo = formatRelativeTime(item.postedAt);
  const metaItems = getChatOpportunityMetaItems(item);
  const summary =
    item.recommendationSummary?.trim() ||
    item.recommendationReasons[0] ||
    item.description ||
    item.companyDescription ||
    null;

  return (
    <div className="flex w-full max-w-[980px] flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          const interactiveTarget = (event.target as HTMLElement).closest(
            "button,a,input,select,textarea"
          );
          if (interactiveTarget) return;
          onOpenOpportunity(item);
        }}
        onKeyDown={(event) => {
          if (event.currentTarget !== event.target) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onOpenOpportunity(item);
        }}
        className="group relative flex cursor-pointer flex-col gap-4 rounded-[8px] border border-beige900/10 bg-white/70 px-4 py-4 text-left outline-none transition-colors hover:border-beige900/25 hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-beige900/25"
        aria-label={`${item.companyName} ${item.title} 공고 열기`}
      >
        {hasMultipleItems ? (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
            <button
              type="button"
              onClick={() => moveActiveItem(-1)}
              className="inline-flex h-5 w-5 rounded-sm bg-hgray900 text-hgray500 cursor-pointer hover:bg-hgray800 items-center justify-center"
              aria-label="이전 공고"
              title="이전 공고"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-8 text-center text-[11px] font-medium leading-none text-hgray500">
              {activeItemIndex + 1}/{items.length}
            </span>
            <button
              type="button"
              onClick={() => moveActiveItem(1)}
              className="inline-flex h-5 w-5 rounded-sm bg-hgray900 text-hgray500 cursor-pointer hover:bg-hgray800 items-center justify-center"
              aria-label="다음 공고"
              title="다음 공고"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div
            className={careerCx(
              "flex min-w-0 items-start gap-3",
              hasMultipleItems && "pr-24"
            )}
          >
            {item.companyLogoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.companyLogoUrl}
                  alt={item.companyName}
                  className="h-11 w-11 shrink-0 rounded-[8px] border border-beige900/10 bg-white object-cover"
                />
              </>
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-beige900 text-[#f5ecdd]">
                <Building2 className="h-4 w-4" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="mt-0.5 break-words text-[15px] font-medium text-beige900">
                {item.title}
              </div>
              <div className="mt-0.5 flex flex-row items-center gap-2 break-words text-[13px] text-black/90">
                {item.companyName}
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-5 text-black/60">
                  {metaItems.length > 0 &&
                    metaItems.map((meta) => (
                      <>
                        <span>·</span>
                        <span>{meta}</span>
                      </>
                    ))}
                  {postedAgo && metaItems.length > 0 && <span>·</span>}
                  {postedAgo && <span>{postedAgo}에 게시됨</span>}
                </div>
                {feedback && (
                  <div
                    className={careerCx(
                      "mt-1 inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium",
                      isPositive
                        ? "border-beige900/20 bg-beige900 text-[#f5ecdd]"
                        : "border-beige900/10 bg-white/60 text-beige900/55"
                    )}
                  >
                    {isPositive ? "저장함" : "선호하지 않음"}
                  </div>
                )}
              </div>
            </div>

            {!hasMultipleItems && (
              <ChevronRight className="h-4 w-4 shrink-0 text-beige900/35 transition-transform group-hover:translate-x-0.5 group-hover:text-beige900/60" />
            )}
          </div>

          {summary && (
            <div className="max-h-24 overflow-hidden text-[13px] leading-6 text-black/60">
              {summary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const OnboardingCompletionNotice = memo(function OnboardingCompletionNotice({
  content,
}: {
  content: string;
}) {
  return (
    <div className="w-full max-w-[760px] rounded-[8px] border border-beige900/10 bg-white/35 px-4 py-3 text-[12px] leading-5 text-beige900/50">
      <div className="mb-1 text-[11px] font-medium text-beige900/35">안내</div>
      <div className="whitespace-pre-wrap wrap-break-word">{content}</div>
    </div>
  );
});

const OnboardingCompletionWrapup = memo(function OnboardingCompletionWrapup({
  content,
  onRegenerate,
  regenerating,
}: {
  content: string;
  onRegenerate?: () => void | Promise<void>;
  regenerating?: boolean;
}) {
  const showRegenerateButton =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_ONBOARDING_WRAPUP_REGENERATE === "1";

  return (
    <div className="w-full max-w-[760px] overflow-hidden rounded-[8px] border border-beige700/25 bg-linear-to-br from-white via-white to-beige100/75 shadow-[0_18px_60px_rgba(46,23,6,0.08)]">
      <div className="flex items-center justify-between gap-3 border-b border-beige900/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-beige700" />
          <div className="text-[15px] font-medium leading-6 text-beige900">
            대화 요약
          </div>
        </div>
        {showRegenerateButton && onRegenerate ? (
          <button
            type="button"
            onClick={() => void onRegenerate()}
            disabled={regenerating}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-beige700/25 bg-white/70 px-2.5 text-[11px] font-medium text-beige700 transition-colors hover:border-beige700/45 hover:bg-beige100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Regenerate
          </button>
        ) : null}
      </div>
      <div className="px-4 py-4">
        <CareerRichText
          content={content}
          className="text-[13px] leading-6 text-beige900/75 [&_li]:text-[13px] [&_li]:leading-6 [&_ol]:text-[13px] [&_p]:text-[13px] [&_p]:leading-6 [&_p]:text-beige900/75 [&_strong]:font-semibold [&_strong]:text-beige900 [&_ul]:text-[13px] [&_ul]:leading-6"
        />
      </div>
    </div>
  );
});

const TimelinePendingPanel = memo(function TimelinePendingPanel({
  label,
  detail,
}: {
  label: string;
  detail: string;
}) {
  return (
    <div
      role="status"
      className="flex w-full max-w-[760px] items-center gap-2 text-[13px] leading-5 text-beige900/50"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-beige900/45" />
      <div className="min-w-0">
        <div className="career-thinking-shimmer inline-block font-medium">
          {label}
        </div>
        <div className="mt-0.5 break-words text-[12px] text-beige900/40">
          {detail}
        </div>
      </div>
    </div>
  );
});

type StartConversationStarterHandler = (args: {
  mode: CareerConversationStarterMode;
  starterId: CareerConversationStarterId;
}) => boolean | Promise<boolean>;

const TimelineMessageList = memo(function TimelineMessageList({
  messages,
  assistantTyping,
  isVoiceMode,
  lastSpokenAssistantMessageIndex,
  thinkingLogsByMessageId,
  onOpenOpportunity,
  onRegenerateOnboardingWrapup,
  onboardingWrapupPending,
  onStartCallMode,
  onStartConversationStarter,
  sessionReengagementActionMessageId,
  isStartingCall,
}: {
  messages: CareerMessage[];
  assistantTyping: boolean;
  isVoiceMode: boolean;
  lastSpokenAssistantMessageIndex: number;
  thinkingLogsByMessageId: Record<string, string[]>;
  isStartingCall: boolean;
  onRegenerateOnboardingWrapup?: () => void | Promise<void>;
  onboardingWrapupPending: boolean;
  onStartCallMode?: (openingText?: string) => boolean | Promise<boolean>;
  onStartConversationStarter?: StartConversationStarterHandler;
  sessionReengagementActionMessageId?: string | null;
  onOpenOpportunity: (opportunity: CareerHistoryOpportunity) => void;
}) {
  return (
    <>
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const thinkingLogs = isUser
          ? []
          : message.thinkingLogs?.length
            ? message.thinkingLogs
            : (thinkingLogsByMessageId[String(message.id)] ?? []);
        const { latestStatus, textLogs } =
          splitRecommendJobPostingStatusLogs(thinkingLogs);
        const messageDateKey = getMessageDateKey(message.createdAt);
        const previousMessageDateKey = getPreviousMessageDateKey(
          messages,
          index
        );
        const dateLabel =
          messageDateKey !== previousMessageDateKey
            ? formatMessageDateLabel(message.createdAt)
            : "";
        const isOnboardingCompletionNotice =
          message.messageType ===
          TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE;
        const isOnboardingCompletionWrapup =
          message.messageType ===
          TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP;
        const isLatestAssistantMessage =
          !isUser && index === messages.length - 1;
        const isAssistantStreamActive =
          isLatestAssistantMessage && assistantTyping;
        const shouldRenderChatBubble =
          isUser ||
          Boolean(message.typing) ||
          message.content.trim().length > 0;
        const showReengagementActions =
          !isUser &&
          index === messages.length - 1 &&
          !message.typing &&
          Boolean(onStartConversationStarter) &&
          sessionReengagementActionMessageId != null &&
          String(message.id) === sessionReengagementActionMessageId;
        const messageNode = (
          <div
            className={careerCx(
              "flex flex-col gap-2",
              isVoiceMode &&
                index !== lastSpokenAssistantMessageIndex &&
                "opacity-70"
            )}
          >
            {!isUser && textLogs.length > 0 && (
              <ThinkingLogPanel
                active={isAssistantStreamActive || isOnboardingCompletionWrapup}
                logs={textLogs}
              />
            )}
            {!isUser && latestStatus && (
              <RecommendationSearchStatusPanel
                active={isAssistantStreamActive}
                status={latestStatus}
              />
            )}
            {isOnboardingCompletionWrapup ? (
              <OnboardingCompletionWrapup
                content={message.content}
                onRegenerate={onRegenerateOnboardingWrapup}
                regenerating={onboardingWrapupPending}
              />
            ) : isOnboardingCompletionNotice ? (
              <OnboardingCompletionNotice content={message.content} />
            ) : shouldRenderChatBubble ? (
              <>
                {!isUser && (
                  <AssistantLabel>
                    <Image
                      src="/svgs/harper-h-mark.svg"
                      alt="Harper"
                      width={18}
                      height={18}
                      className="mt-2"
                    />
                  </AssistantLabel>
                )}
                <CareerMessageBubble
                  message={message}
                  isUser={isUser}
                  isAssistantSpeaking={
                    !isUser && index === lastSpokenAssistantMessageIndex
                  }
                  isCallStartPending={isStartingCall}
                  onStartCallMode={
                    onStartCallMode
                      ? (openingText) => {
                          void onStartCallMode(openingText);
                        }
                      : undefined
                  }
                />
                {/* {showReengagementActions && (
                  <div className="mt-1">
                    <ConversationStarterActions
                      callStartPending={isStartingCall}
                      disabled={isStartingCall}
                      onStart={(startArgs) => {
                        return onStartConversationStarter?.(startArgs) ?? false;
                      }}
                      variant="reengagement"
                    />
                  </div>
                )} */}
              </>
            ) : null}
            {!isUser && (message.opportunityPreview?.length ?? 0) > 0 && (
              <OpportunityPreviewCards
                items={message.opportunityPreview ?? []}
                onOpenOpportunity={onOpenOpportunity}
              />
            )}
          </div>
        );

        return (
          <Fragment key={String(message.id)}>
            {dateLabel && <TimelineDateDivider label={dateLabel} />}
            {messageNode}
          </Fragment>
        );
      })}
    </>
  );
});

const CareerTimelineSection = () => {
  const router = useRouter();
  const {
    user,
    conversationId,
    stage,
    messages,
    scrollRef,
    hasOlderMessages,
    loadingOlderMessages,
    authPending,
    authError,
    authInfo,
    sessionPending,
    sessionError,
    resumeFile,
    profileLinks,
    profilePending,
    profileError,
    chatError,
    assistantTyping,
    activeThinkingLogs,
    activeRecommendationSearchStatus,
    onboardingWrapupPending,
    thinkingLogsByMessageId,
    chatPending,
    sessionReengagementPending,
    sessionReengagementThinkingLogs,
    sessionReengagementRecommendationStatus,
    sessionReengagementActionMessageId,
    onboardingBeginPending,
    callStartPending = false,
    callWrapUpPending = false,
    onboardingPausePending,
    onGoogleLogin,
    onEmailAuth,
    onResumeFileChange,
    onProfileLinkChange,
    onRemoveProfileLink,
    onAddProfileLink,
    onProfileSubmit,
    onLoadOlderMessages,
    onRegenerateOnboardingWrapup,
    onStartConversationStarter,
    showVoiceStartPrompt,
    onStartCallMode,
    onUseChatOnly,
    onPauseOnboarding,
    onSubmitOnboardingInterest,
    onContinueOnboardingConversation,
    inputMode,
    voiceTranscript,
    assistantAudioBusy,
  } = useCareerChatPanelContext();

  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showLoadOlderButton, setShowLoadOlderButton] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [interestSelectionState, setInterestSelectionState] = useState<{
    messageKey: string;
    options: TalentOnboardingInterestOptionId[];
  }>({
    messageKey: "",
    options: [],
  });
  const isStartingCall =
    (onboardingBeginPending && !callWrapUpPending) || callStartPending;
  const isConversationActionLocked = isStartingCall || callWrapUpPending;
  const showSessionReengagementPending =
    sessionReengagementPending &&
    !isConversationActionLocked &&
    !chatPending &&
    !assistantTyping &&
    !onboardingWrapupPending &&
    !onboardingPausePending &&
    !profilePending &&
    !sessionPending &&
    inputMode !== "call" &&
    stage !== "profile";
  const visibleSessionReengagementActionMessageId =
    !isConversationActionLocked &&
    !chatPending &&
    !assistantTyping &&
    !onboardingWrapupPending &&
    !onboardingPausePending &&
    !profilePending &&
    !sessionPending &&
    inputMode !== "call" &&
    stage !== "profile"
      ? sessionReengagementActionMessageId
      : null;
  const initialBottomSyncDoneRef = useRef(false);

  const handleEmailAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onEmailAuth({
      mode: authMode,
      email: authEmail,
      password: authPassword,
    });
    if (!ok) return;
    setAuthEmail("");
    setAuthPassword("");
    setAuthMode("signin");
  };

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
    },
    [scrollRef]
  );

  const syncScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nextShowLoadOlderButton = el.scrollTop <= 24;
    setShowLoadOlderButton((prev) =>
      prev === nextShowLoadOlderButton ? prev : nextShowLoadOlderButton
    );
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nextStickToBottom = distanceToBottom <= BOTTOM_THRESHOLD_PX;
    setStickToBottom((prev) =>
      prev === nextStickToBottom ? prev : nextStickToBottom
    );
  }, [scrollRef]);

  useEffect(() => {
    syncScrollState();
  }, [messages.length, syncScrollState]);

  const handleTimelineScroll = useCallback(() => {
    syncScrollState();
  }, [syncScrollState]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!hasOlderMessages || loadingOlderMessages) return;

    const el = scrollRef.current;
    const previousScrollHeight = el?.scrollHeight ?? null;
    const previousScrollTop = el?.scrollTop ?? 0;

    await onLoadOlderMessages();

    if (!el || previousScrollHeight === null) return;

    window.requestAnimationFrame(() => {
      const scrollHeightDelta = el.scrollHeight - previousScrollHeight;
      el.scrollTop = previousScrollTop + scrollHeightDelta;
      syncScrollState();
    });
  }, [
    hasOlderMessages,
    loadingOlderMessages,
    onLoadOlderMessages,
    scrollRef,
    syncScrollState,
  ]);

  const isVoiceMode = inputMode === "voice";
  const timelineMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          !(
            message.role === "user" &&
            message.messageType === "profile_submit" &&
            message.content.trim() === CLAIMED_WORKSPACE_BOOTSTRAP_MESSAGE
          )
      ),
    [messages]
  );
  const hasTimelineMessages = timelineMessages.length > 0;
  const latestTimelineMessage = timelineMessages[timelineMessages.length - 1];
  const latestTimelineMessageKey = latestTimelineMessage
    ? [
        latestTimelineMessage.id,
        latestTimelineMessage.role,
        latestTimelineMessage.messageType,
        latestTimelineMessage.content.length,
        latestTimelineMessage.typing ? "typing" : "settled",
      ].join(":")
    : "";
  const lastSpokenAssistantMessageIndex = useMemo(() => {
    if (!assistantAudioBusy) return -1;

    for (let index = timelineMessages.length - 1; index >= 0; index -= 1) {
      const message = timelineMessages[index];
      if (
        message.role === "assistant" &&
        !message.typing &&
        Boolean(message.content.trim()) &&
        (message.messageType ?? "chat") === "chat"
      ) {
        return index;
      }
    }

    return -1;
  }, [assistantAudioBusy, timelineMessages]);

  const compactTranscriptPreview = useMemo(() => {
    const transcriptPreview = voiceTranscript.trim();
    return transcriptPreview.length > VOICE_TRANSCRIPT_PREVIEW_LIMIT
      ? `${transcriptPreview.slice(0, VOICE_TRANSCRIPT_PREVIEW_LIMIT - 1)}...`
      : transcriptPreview;
  }, [voiceTranscript]);
  const pauseCloseTyping = useMemo(
    () =>
      messages.some(
        (message) =>
          message.messageType === TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE &&
          Boolean(message.typing)
      ),
    [messages]
  );
  const showInterestSelector = useMemo(
    () => shouldShowOnboardingInterestSelector(messages),
    [messages]
  );
  const selectedInterestOptions = useMemo(
    () =>
      showInterestSelector &&
      interestSelectionState.messageKey === latestTimelineMessageKey
        ? interestSelectionState.options
        : [],
    [interestSelectionState, latestTimelineMessageKey, showInterestSelector]
  );
  const showContinueConversation = useMemo(
    () => shouldShowContinueConversationAction(messages) && !pauseCloseTyping,
    [messages, pauseCloseTyping]
  );

  useEffect(() => {
    initialBottomSyncDoneRef.current = false;
  }, [conversationId, inputMode]);

  useEffect(() => {
    if (initialBottomSyncDoneRef.current) return;
    if (!conversationId || sessionPending || inputMode === "call") return;
    if (!hasTimelineMessages) return;

    initialBottomSyncDoneRef.current = true;
    const id = window.requestAnimationFrame(() => {
      scrollToBottom("auto");
      syncScrollState();
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    conversationId,
    inputMode,
    hasTimelineMessages,
    scrollToBottom,
    sessionPending,
    syncScrollState,
  ]);

  useEffect(() => {
    if (!stickToBottom || inputMode === "call") return;
    if (!hasTimelineMessages) return;

    const id = window.requestAnimationFrame(() => {
      scrollToBottom(
        assistantTyping ||
          chatPending ||
          callWrapUpPending ||
          showSessionReengagementPending
          ? "auto"
          : "smooth"
      );
      syncScrollState();
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    assistantTyping,
    callWrapUpPending,
    chatPending,
    hasTimelineMessages,
    inputMode,
    latestTimelineMessageKey,
    scrollToBottom,
    showSessionReengagementPending,
    stickToBottom,
    syncScrollState,
  ]);

  const handleToggleInterestOption = useCallback(
    (optionId: TalentOnboardingInterestOptionId) => {
      setInterestSelectionState((prev) => {
        const currentOptions =
          prev.messageKey === latestTimelineMessageKey ? prev.options : [];
        const options = currentOptions.includes(optionId)
          ? currentOptions.filter((item) => item !== optionId)
          : [...currentOptions, optionId];
        return {
          messageKey: latestTimelineMessageKey,
          options,
        };
      });
    },
    [latestTimelineMessageKey]
  );

  const handleSubmitInterestOptions = useCallback(async () => {
    const saved = await onSubmitOnboardingInterest(selectedInterestOptions);
    if (!saved) return;
    setInterestSelectionState({
      messageKey: latestTimelineMessageKey,
      options: [],
    });
  }, [
    latestTimelineMessageKey,
    onSubmitOnboardingInterest,
    selectedInterestOptions,
  ]);

  const handleOpenOpportunity = useCallback(
    (opportunity: CareerHistoryOpportunity) => {
      const roleId = String(opportunity.roleId ?? "").trim();
      if (!roleId) return;

      const query: Record<string, string> = {
        [HISTORY_TAB_QUERY_KEY]: "new",
        [HISTORY_ROLE_QUERY_KEY]: roleId,
      };
      const invite = getSingleQueryValue(router.query.invite);
      const mail = getSingleQueryValue(router.query.mail);

      if (invite) query.invite = invite;
      if (mail) query.mail = mail;

      void router.push(
        {
          pathname: "/career/history",
          query,
        },
        undefined,
        { scroll: false, shallow: true }
      );
    },
    [router]
  );

  if (!user) {
    return (
      <>
        <div className="flex flex-col gap-2">
          <AssistantLabel>Harper</AssistantLabel>
          <CareerMessageBubble
            message={{
              id: "login-greeting",
              role: "assistant",
              content: LOGIN_GREETING_TEXT,
              createdAt: "",
              messageType: "chat",
            }}
            isUser={false}
          />
        </div>

        <TimelinePanel>
          <CareerSecondaryButton
            onClick={() => void onGoogleLogin()}
            disabled={authPending}
            className="w-full justify-center px-4"
          >
            {authPending ? "처리 중..." : "Google 로그인"}
          </CareerSecondaryButton>

          <div className="mt-5 text-[14px] font-medium text-beige900/55">
            이메일 {authMode === "signup" ? "회원가입" : "로그인"}
          </div>

          <form onSubmit={handleEmailAuthSubmit} className="mt-3 space-y-3">
            <CareerTextInput
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              type="email"
              placeholder="ID (이메일)"
              disabled={authPending}
            />
            <CareerTextInput
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              type="password"
              placeholder="PW"
              disabled={authPending}
            />
            <CareerPrimaryButton
              type="submit"
              disabled={authPending}
              className="w-full justify-center"
            >
              {authMode === "signup" ? "회원가입" : "로그인"}
            </CareerPrimaryButton>
          </form>

          <div className="mt-4 text-sm text-beige900/55">
            {authMode === "signup"
              ? "이미 계정이 있으신가요?"
              : "첫 방문이신가요?"}{" "}
            <button
              type="button"
              onClick={() =>
                setAuthMode((prev) => (prev === "signin" ? "signup" : "signin"))
              }
              disabled={authPending}
              className="font-medium text-beige900 underline underline-offset-4"
            >
              {authMode === "signup" ? "로그인" : "회원가입"}
            </button>
          </div>

          {authError && (
            <div className="mt-4 border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
              {authError}
            </div>
          )}
          {authInfo && (
            <div className="mt-4 border border-beige900/10 bg-white/40 px-4 py-3 text-sm text-beige900/50">
              {authInfo}
            </div>
          )}
        </TimelinePanel>
      </>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleTimelineScroll}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0 py-4 pb-28 scrollbar-thin scrollbar-thumb-[rgba(92,61,34,0.15)] scrollbar-track-transparent"
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 py-1">
        {showLoadOlderButton && hasOlderMessages && (
          <div className="sticky top-0 z-10 flex justify-center pb-2">
            <button
              type="button"
              onClick={() => void handleLoadOlderMessages()}
              disabled={loadingOlderMessages}
              className="inline-flex h-9 items-center justify-center rounded-[8px] bg-white/45 px-4 text-xs text-beige900/55 transition-colors hover:border-beige900/30 hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingOlderMessages ? "불러오는 중..." : "이전 대화 더 보기"}
            </button>
          </div>
        )}

        {isVoiceMode && stage !== "profile" ? (
          <div className="sticky top-0 z-20 flex justify-center">
            <div className="inline-flex items-center gap-3 rounded-[8px] border border-beige900 bg-beige900 px-4 py-2 text-sm text-[#f5ecdd]">
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#f5ecdd]/25">
                <Phone className="h-3.5 w-3.5" />
              </div>
              <span>Harper 음성 대화</span>
              {compactTranscriptPreview ? (
                <span className="max-w-[360px] truncate text-[#f5ecdd]/75">
                  {compactTranscriptPreview}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {sessionPending && !hasTimelineMessages ? (
          <div className="flex min-h-[52vh] items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-beige900/60">
              <Loader2 className="h-4 w-4 animate-spin text-beige900" />
              하퍼가 들어오고 있습니다...
            </div>
          </div>
        ) : null}

        {hasTimelineMessages ? (
          <TimelineMessageList
            messages={timelineMessages}
            assistantTyping={assistantTyping}
            isVoiceMode={isVoiceMode}
            lastSpokenAssistantMessageIndex={lastSpokenAssistantMessageIndex}
            thinkingLogsByMessageId={thinkingLogsByMessageId}
            onRegenerateOnboardingWrapup={onRegenerateOnboardingWrapup}
            onboardingWrapupPending={onboardingWrapupPending}
            onStartCallMode={onStartCallMode}
            onStartConversationStarter={onStartConversationStarter}
            sessionReengagementActionMessageId={
              visibleSessionReengagementActionMessageId
            }
            isStartingCall={isStartingCall}
            onOpenOpportunity={handleOpenOpportunity}
          />
        ) : null}

        {showSessionReengagementPending &&
          (sessionReengagementRecommendationStatus ? (
            <RecommendationSearchStatusPanel
              active
              status={sessionReengagementRecommendationStatus}
            />
          ) : sessionReengagementThinkingLogs.length > 0 ? (
            <ThinkingLogPanel active logs={sessionReengagementThinkingLogs} />
          ) : (
            <TimelinePendingPanel
              label="Thinking..."
              detail="오랜만에 이어갈 대화를 준비하고 있어요."
            />
          ))}

        {callWrapUpPending && !sessionPending && stage !== "profile" && (
          <TimelinePendingPanel
            label="Call wrap-up..."
            detail="통화 내용을 정리하고 다음 메시지를 준비하고 있어요."
          />
        )}

        {onboardingWrapupPending &&
          !callWrapUpPending &&
          !sessionPending &&
          stage !== "profile" && (
            <TimelinePendingPanel
              label="Thinking..."
              detail="대화 내용을 정리하고 있어요."
            />
          )}

        {!sessionPending &&
          stage !== "profile" &&
          !onboardingWrapupPending &&
          !callWrapUpPending &&
          chatPending &&
          !assistantTyping &&
          (activeRecommendationSearchStatus ? (
            <RecommendationSearchStatusPanel
              active
              status={activeRecommendationSearchStatus}
            />
          ) : activeThinkingLogs.length > 0 ? (
            <ThinkingLogPanel active logs={activeThinkingLogs} />
          ) : (
            <StatusMessage>
              <span className="career-thinking-shimmer inline-block text-sm font-medium">
                Thinking...
              </span>
            </StatusMessage>
          ))}

        {profilePending && (
          <TimelinePanel className="max-w-[980px]">
            <div className="flex items-center gap-2 text-sm text-beige900/50">
              <Loader2 className="h-4 w-4 animate-spin text-beige900" />
              이력서와 링크 정보를 분석 중입니다...
            </div>
            <div className="mt-5 grid gap-2 border-t border-beige900/10 pt-4">
              {LOADING_EXAMPLES.map((example) => (
                <div
                  key={example}
                  className="text-[14px] leading-7 text-beige900/55"
                >
                  {example}
                </div>
              ))}
            </div>
          </TimelinePanel>
        )}

        {!profilePending && !sessionPending && stage === "profile" && (
          <TimelinePanel className="max-w-[980px]">
            <div className="grid gap-6">
              <section>
                <div className="text-[15px] font-medium text-beige900">
                  이력서 업로드
                </div>
                <div className="mt-1 text-[13px] leading-6 text-beige900/45">
                  PDF, DOC, DOCX 파일을 업로드할 수 있습니다.
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label
                    htmlFor="career-resume-upload"
                    className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[8px] border border-beige900/15 bg-white/45 px-4 text-sm text-beige900 transition-colors hover:border-beige900/30"
                  >
                    <Upload className="h-4 w-4" />
                    파일 선택
                  </label>
                  <input
                    id="career-resume-upload"
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={(event) => {
                      onResumeFileChange(event.target.files?.[0] ?? null);
                    }}
                  />
                  <div className="text-sm text-beige900/55">
                    {resumeFile?.name || "선택된 파일 없음"}
                  </div>
                </div>
              </section>

              <section className="border-t border-beige900/10 pt-6">
                <div className="text-[15px] font-medium text-beige900">
                  주요 링크
                </div>
                <div className="mt-4 space-y-3">
                  {profileLinks.map((link, index) => (
                    <div
                      key={`profile-link-${index}`}
                      className="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)_40px]"
                    >
                      <div className="pt-2 text-[14px] font-medium text-beige900/50">
                        {CAREER_LINK_LABELS[index] ?? "추가 링크"}
                      </div>
                      <CareerTextInput
                        value={link}
                        onChange={(event) =>
                          onProfileLinkChange(index, event.target.value)
                        }
                        placeholder="https://"
                      />
                      {index >= CAREER_LINK_LABELS.length ? (
                        <button
                          type="button"
                          onClick={() => onRemoveProfileLink(index)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-beige900/15 bg-white/45 text-beige900/50 transition-colors hover:border-beige900/30 hover:text-beige900"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : (
                        <div />
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onAddProfileLink}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-[8px] border border-beige900/15 bg-white/45 px-4 text-sm text-beige900 transition-colors hover:border-beige900/30"
                >
                  <Plus className="h-4 w-4" />
                  링크 추가
                </button>
              </section>

              {profileError ? (
                <div className="border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
                  {profileError}
                </div>
              ) : null}

              <div className="border-t border-beige900/10 pt-5">
                <div className="text-[13px] leading-6 text-beige900/45">
                  이력서나 링크 하나만 있어도 우선 시작할 수 있습니다. 정보는
                  언제든지 바꿀 수 있습니다.
                </div>
                <CareerPrimaryButton
                  onClick={() => void onProfileSubmit()}
                  disabled={profilePending}
                  className="mt-4 w-full justify-center"
                >
                  {profilePending ? "분석 준비 중..." : "제출하기"}
                </CareerPrimaryButton>
              </div>
            </div>
          </TimelinePanel>
        )}

        {sessionError && (
          <div className="border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
            {sessionError}
          </div>
        )}

        {chatError && (
          <div className="border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
            {chatError}
          </div>
        )}

        {showVoiceStartPrompt && (
          <TimelinePanel className="max-w-[620px] p-0 text-[14px] leading-7 text-beige900/90">
            <div className="">
              좋은 회사와 역할, 기회를 연결해드리기 위해 몇가지 질문을 더 하고
              싶어요.
              <br />
              희망 역할과 피하고 싶은 조건만 짧게 확인할게요.
            </div>
            <div className="mt-5 flex flex-row gap-2">
              <CareerPrimaryButton
                onClick={() => onStartCallMode?.()}
                disabled={isConversationActionLocked}
                className="w-fit justify-center"
              >
                {isStartingCall
                  ? "통화 연결 중..."
                  : callWrapUpPending
                    ? "정리 중..."
                    : "전화로 시작"}
              </CareerPrimaryButton>
              <CareerSecondaryButton
                onClick={onUseChatOnly}
                disabled={isConversationActionLocked}
                className="w-fit justify-center"
              >
                {isConversationActionLocked ? "준비 중..." : "채팅으로 시작"}
              </CareerSecondaryButton>
              <CareerSecondaryButton
                onClick={() => void onPauseOnboarding()}
                disabled={onboardingPausePending}
                className="w-fit justify-center"
              >
                {onboardingPausePending
                  ? "준비 중..."
                  : "우선 종료하고 나중에 이어할게요."}
              </CareerSecondaryButton>
            </div>
          </TimelinePanel>
        )}

        {showInterestSelector && (
          <TimelinePanel className="max-w-[900px] p-0">
            <div className="text-[12px] font-medium text-beige900/40">
              복수 선택 가능
            </div>

            <div className="mt-3 space-y-2 flex flex-col">
              {TALENT_ONBOARDING_INTEREST_OPTIONS.map((option) => {
                const selected = selectedInterestOptions.includes(option.id);
                return (
                  <InterestChoiceButton
                    key={option.id}
                    selected={selected}
                    onClick={() => handleToggleInterestOption(option.id)}
                    disabled={onboardingPausePending}
                  >
                    {option.label}
                  </InterestChoiceButton>
                );
              })}
            </div>

            <CareerPrimaryButton
              onClick={() => void handleSubmitInterestOptions()}
              disabled={
                onboardingPausePending || selectedInterestOptions.length === 0
              }
              className="mt-5 w-fit justify-center"
            >
              {onboardingPausePending ? "저장 중..." : "선택 저장하기"}
            </CareerPrimaryButton>
          </TimelinePanel>
        )}

        {showContinueConversation && (
          <TimelinePanel className="max-w-[620px] p-0">
            <div className="text-[14px] leading-7 text-beige900/90">
              5분 커리어 인터뷰가 아직 완료되지 않았어요.
              <br />
              이어서 답변하면 맞춤 기회 탐색을 시작할 수 있습니다.
            </div>
            <CareerPrimaryButton
              onClick={() => void onContinueOnboardingConversation()}
              disabled={onboardingBeginPending}
              className="mt-4 justify-center"
            >
              {onboardingBeginPending ? "준비 중..." : "대화 이어가기"}
            </CareerPrimaryButton>
          </TimelinePanel>
        )}
      </div>
    </div>
  );
};

export default React.memo(CareerTimelineSection);
