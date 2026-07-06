import { Loader2, Plus, Upload, X } from "lucide-react";
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
import { getCareerLinkLabels } from "@/components/career/constants";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import {
  CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER,
  type CareerCallStartRequest,
  type CareerMessage,
  type CareerHistoryOpportunity,
  type CareerRecommendationSearchStatus,
} from "@/components/career/types";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/prompts/conversationStarters";
import {
  RECOMMEND_JOB_POSTINGS_CHAT_PREAMBLES,
  splitRecommendJobPostingStatusLogs,
} from "@/lib/talentOnboarding/recommendJobPostingStatus";
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
  PrimaryButton,
  SecondaryButton,
  BareButton,
} from "@/components/ui/button";
import { Input, Input as UiInput } from "@/components/ui/input";
import { InlinePanel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import CareerMessageBubble, {
  type CareerAssistantChoiceSelection,
} from "./CareerMessageBubble";
import Image from "next/image";
import { useRouter } from "next/router";
import React from "react";
import {
  careerTimelineBodyTextClassName,
  careerTimelineMetaTextClassName,
  careerTimelineTypographyStyle,
} from "./careerTimelineTypography";
import { OnboardingCompletionNotice } from "./elements/OnboardingCompletionNotice";
import { OnboardingCompletionWrapup } from "./elements/OnboardingCompletionWrapup";
import { OpportunityPreviewCards } from "./elements/OpportunityPreviewCards";
import { RecommendationSearchStatusPanel } from "./elements/RecommendationSearchStatusPanel";
import { ThinkingLogPanel } from "./elements/ThinkingLogPanel";
import { TimelinePendingPanel } from "./elements/TimelinePendingPanel";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import Face from "@/components/common/Face";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";

const BOTTOM_THRESHOLD_PX = 120;
const TIMELINE_SCROLL_STYLE: React.CSSProperties = {
  ...careerTimelineTypographyStyle,
  paddingBottom: "var(--career-timeline-bottom-padding, 192px)",
  scrollPaddingBottom: "var(--career-timeline-bottom-padding, 192px)",
};
const HISTORY_TAB_QUERY_KEY = "historyTab";
const HISTORY_ROLE_QUERY_KEY = "id";
const CLAIMED_WORKSPACE_BOOTSTRAP_MESSAGE =
  // career-i18n-skip-next-line system marker comparison
  "기존에 제출한 정보로 커리어 워크스페이스를 시작했습니다.";
const MESSAGE_DATE_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  ko: new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    month: "long",
    weekday: "short",
    year: "numeric",
  }),
  en: new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }),
};

const MESSAGE_DATE_FALLBACK_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
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

const formatMessageDateLabel = (createdAt: string, locale: Locale) => {
  const date = parseMessageDate(createdAt);
  return date
    ? (
        MESSAGE_DATE_FORMATTERS[locale] ?? MESSAGE_DATE_FALLBACK_FORMATTER
      ).format(date)
    : "";
};

const TimelinePanel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <InlinePanel className={cn("max-w-[980px]", className)}>
    {children}
  </InlinePanel>
);

const AssistantLabel = ({ children }: { children: React.ReactNode }) => (
  <div
    className={cn(
      "font-medium text-neutral-primary",
      careerTimelineMetaTextClassName
    )}
  >
    {children}
  </div>
);

const TimelineDateDivider = ({
  ariaPrefix,
  label,
}: {
  ariaPrefix: string;
  label: string;
}) => (
  <div
    role="separator"
    className="flex justify-center py-2"
    aria-label={`${ariaPrefix} ${label}`}
  >
    <span
      className={cn(
        "rounded-full bg-bg-weak px-2.5 py-0.5 font-light text-neutral-soft",
        careerTimelineMetaTextClassName
      )}
    >
      {label}
    </span>
  </div>
);

const getRecommendationStatusAnchor = (
  message: CareerMessage,
  latestStatus: CareerRecommendationSearchStatus | null
) => {
  if (!latestStatus) return null;
  const explicitAnchor = message.recommendationStatusAfterCharCount;
  if (
    typeof explicitAnchor === "number" &&
    Number.isFinite(explicitAnchor) &&
    explicitAnchor > 0 &&
    explicitAnchor <= message.content.length
  ) {
    return Math.floor(explicitAnchor);
  }

  const leadingWhitespaceLength =
    message.content.length - message.content.trimStart().length;
  const trimmedContent = message.content.slice(leadingWhitespaceLength);
  const matchedPreamble = RECOMMEND_JOB_POSTINGS_CHAT_PREAMBLES.find(
    (preamble) => trimmedContent.startsWith(preamble)
  );
  if (!matchedPreamble) {
    return null;
  }

  const fallbackAnchor = leadingWhitespaceLength + matchedPreamble.length;
  return fallbackAnchor <= message.content.length ? fallbackAnchor : null;
};

const StatusMessage = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "text-neutral-muted",
      careerTimelineBodyTextClassName,
      className
    )}
  >
    {children}
  </div>
);

const InterestChoiceButton = ({
  selected,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
}) => (
  <BareButton
    type="button"
    {...props}
    className={cn(
      "w-fit rounded-[8px] border border-neutral-1000-a05 px-3 py-1.5 text-left text-[14px] leading-6 transition-colors",
      selected
        ? "border-neutral-800 bg-black text-neutral-00"
        : "bg-bg-floating text-neutral-muted hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary",
      props.className
    )}
  >
    {children}
  </BareButton>
);

type StartConversationStarterHandler = (args: {
  mode: CareerConversationStarterMode;
  starterId: CareerConversationStarterId;
}) => boolean | Promise<boolean>;

const TimelineMessageList = memo(function TimelineMessageList({
  messages,
  assistantTyping,
  thinkingLogsByMessageId,
  onOpenOpportunity,
  onRegenerateOnboardingWrapup,
  onCancelActiveRecommendationSearch,
  onboardingWrapupPending,
  onStartCallMode,
  isStartingCall,
  assistantChoiceActionsDisabled,
  onSelectAssistantChoice,
}: {
  messages: CareerMessage[];
  assistantTyping: boolean;
  thinkingLogsByMessageId: Record<string, string[]>;
  isStartingCall: boolean;
  assistantChoiceActionsDisabled: boolean;
  onSelectAssistantChoice?: (
    selection: CareerAssistantChoiceSelection
  ) => void | Promise<void>;
  onRegenerateOnboardingWrapup?: () => void | Promise<void>;
  onCancelActiveRecommendationSearch?: () => void;
  onboardingWrapupPending: boolean;
  onStartCallMode?: (
    args?: CareerCallStartRequest
  ) => boolean | Promise<boolean>;
  onStartConversationStarter?: StartConversationStarterHandler;
  sessionReengagementActionMessageId?: string | null;
  onOpenOpportunity: (opportunity: CareerHistoryOpportunity) => void;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const dateAriaPrefix = t(
    "career.chat.career_timeline_section.17u6jy7",
    "대화 날짜"
  );

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
        const isRunningRecommendationSearch = latestStatus?.state === "running";
        const messageDateKey = getMessageDateKey(message.createdAt);
        const previousMessageDateKey = getPreviousMessageDateKey(
          messages,
          index
        );
        const dateLabel =
          messageDateKey !== previousMessageDateKey
            ? formatMessageDateLabel(message.createdAt, locale)
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
        const disableAssistantChoiceActions =
          assistantChoiceActionsDisabled ||
          !isLatestAssistantMessage ||
          isAssistantStreamActive;
        const shouldRenderChatBubble =
          isUser ||
          Boolean(message.typing) ||
          message.content.trim().length > 0;
        const recommendationStatusAnchor =
          !isUser &&
          !isOnboardingCompletionWrapup &&
          !isOnboardingCompletionNotice
            ? getRecommendationStatusAnchor(message, latestStatus)
            : null;
        const recommendationSearchPreambleContent =
          recommendationStatusAnchor === null
            ? ""
            : message.content.slice(0, recommendationStatusAnchor).trim();
        const recommendationSearchResultContent =
          recommendationStatusAnchor === null
            ? ""
            : message.content.slice(recommendationStatusAnchor).trim();
        const shouldRenderSplitRecommendationSearch =
          !isUser &&
          Boolean(latestStatus) &&
          recommendationStatusAnchor !== null &&
          recommendationSearchPreambleContent.length > 0 &&
          shouldRenderChatBubble;
        const recommendationSearchPreambleMessage: CareerMessage = {
          ...message,
          content: recommendationSearchPreambleContent,
          typing: false,
        };
        const recommendationSearchResultMessage: CareerMessage = {
          ...message,
          content: recommendationSearchResultContent,
          typing: message.typing,
        };

        const messageNode = (
          <div className="flex flex-col gap-2">
            {!isUser && textLogs.length > 0 && (
              <ThinkingLogPanel
                active={isAssistantStreamActive || isOnboardingCompletionWrapup}
                logs={textLogs}
              />
            )}
            {!isUser &&
              latestStatus &&
              !isRunningRecommendationSearch &&
              !shouldRenderSplitRecommendationSearch && (
                <RecommendationSearchStatusPanel
                  active={isAssistantStreamActive}
                  status={latestStatus}
                />
              )}
            {shouldRenderSplitRecommendationSearch && latestStatus ? (
              <>
                <AssistantLabel>
                  <Image
                    src="/svgs/harper-h-mark.svg"
                    alt="Harper"
                    width={18}
                    height={18}
                    className="mt-2"
                  />
                </AssistantLabel>
                <CareerMessageBubble
                  message={recommendationSearchPreambleMessage}
                  isUser={false}
                  choiceActionsDisabled={disableAssistantChoiceActions}
                  isCallStartPending={isStartingCall}
                  onSelectAssistantChoice={onSelectAssistantChoice}
                  onStartCallMode={
                    onStartCallMode
                      ? (openingText) => {
                          void onStartCallMode(openingText);
                        }
                      : undefined
                  }
                />
                <RecommendationSearchStatusPanel
                  active={isAssistantStreamActive}
                  onCancel={
                    isRunningRecommendationSearch
                      ? onCancelActiveRecommendationSearch
                      : undefined
                  }
                  status={latestStatus}
                />
                {recommendationSearchResultContent.length > 0 && (
                  <CareerMessageBubble
                    message={recommendationSearchResultMessage}
                    isUser={false}
                    choiceActionsDisabled={disableAssistantChoiceActions}
                    isCallStartPending={isStartingCall}
                    onSelectAssistantChoice={onSelectAssistantChoice}
                    onStartCallMode={
                      onStartCallMode
                        ? (openingText) => {
                            void onStartCallMode(openingText);
                          }
                        : undefined
                    }
                  />
                )}
              </>
            ) : isOnboardingCompletionWrapup ? (
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
                  choiceActionsDisabled={disableAssistantChoiceActions}
                  isCallStartPending={isStartingCall}
                  onSelectAssistantChoice={onSelectAssistantChoice}
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
            {!isUser &&
              latestStatus &&
              isRunningRecommendationSearch &&
              !shouldRenderSplitRecommendationSearch && (
                <RecommendationSearchStatusPanel
                  active={isAssistantStreamActive}
                  onCancel={onCancelActiveRecommendationSearch}
                  status={latestStatus}
                />
              )}
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
            {dateLabel && (
              <TimelineDateDivider
                ariaPrefix={dateAriaPrefix}
                label={dateLabel}
              />
            )}
            {messageNode}
          </Fragment>
        );
      })}
    </>
  );
});

const CareerTimelineSection = () => {
  const t = useCareerT();

  const router = useRouter();
  const { m } = useMessages();
  const logCareerEvent = useCareerLogEvent();
  const careerLinkLabels = useMemo(() => getCareerLinkLabels(t), [t]);
  const loginGreetingText = t(
    "career.chat.career_timeline_section.0arsq09",
    "안녕하세요. 회원님의 정보를 저장하기 위해서 우선 계정으로 로그인을 해주세요."
  );
  const loadingExamples = useMemo(
    () => [
      t(
        "career.chat.career_timeline_section.0or3a9m",
        "미국 법인 AI Product 팀 Senior Software Engineer"
      ),
      t(
        "career.chat.career_timeline_section.00l29f9",
        "글로벌 SaaS 팀 ML Engineer (비자 스폰서 가능)"
      ),
      t(
        "career.chat.career_timeline_section.13lt218",
        "국내 딥테크 스타트업 Applied AI Engineer"
      ),
    ],
    [t]
  );
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
    onCancelActiveRecommendationSearch,
    onboardingWrapupPending,
    thinkingLogsByMessageId,
    chatPending,
    sessionReengagementPending,
    sessionReengagementThinkingLogs,
    sessionReengagementRecommendationStatus,
    sessionReengagementActionMessageId,
    opportunityFeedbackFollowUpPending,
    opportunityFeedbackFollowUpTrigger,
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
    onSendChatMessage,
    onStartConversationStarter,
    showVoiceStartPrompt,
    onStartCallMode,
    onUseChatOnly,
    onPauseOnboarding,
    onSubmitOnboardingInterest,
    onContinueOnboardingConversation,
    inputMode,
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
  const assistantChoiceActionsDisabled =
    isConversationActionLocked ||
    chatPending ||
    assistantTyping ||
    onboardingWrapupPending ||
    onboardingPausePending ||
    profilePending ||
    sessionPending ||
    inputMode === "call";
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
  const showOpportunityFeedbackFollowUpPending =
    opportunityFeedbackFollowUpPending &&
    !isConversationActionLocked &&
    !chatPending &&
    !assistantTyping &&
    !onboardingWrapupPending &&
    !onboardingPausePending &&
    !profilePending &&
    !sessionPending &&
    inputMode !== "call" &&
    stage !== "profile";
  const opportunityFeedbackFollowUpPendingDetail =
    opportunityFeedbackFollowUpTrigger ===
    CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.ImmediateInternalFeedback
      ? t(
          "career.chat.career_timeline_section.0qzkj18",
          "다음 프로세스를 확인하고 있어요."
        )
      : opportunityFeedbackFollowUpTrigger ===
          CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.AllRecommendedOpportunitiesCleared
        ? t(
            "career.chat.career_timeline_section.1ct6hfb",
            "방금 남긴 피드백을 바탕으로 다음 추천 방향을 정리하고 있어요."
          )
        : t(
            "career.chat.career_timeline_section.0hm90b7",
            "남겨주신 피드백을 반영해서 다음 메시지를 준비하고 있어요."
          );
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
      scrollToBottom("smooth");
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
    showOpportunityFeedbackFollowUpPending,
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

  const handleSelectAssistantChoice = useCallback(
    async (selection: CareerAssistantChoiceSelection) => {
      const text = selection.choice.trim();
      if (!text || assistantChoiceActionsDisabled) return;

      logCareerEvent("click_chat_choice_button", {
        assistantMessageId: selection.assistantMessageId,
        choiceCount: selection.choiceCount,
        choiceIndex: selection.choiceIndex,
      });

      await onSendChatMessage({
        channel: "chat",
        text,
      });
    },
    [assistantChoiceActionsDisabled, logCareerEvent, onSendChatMessage]
  );

  if (!user) {
    return (
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0 pt-4 scrollbar-thin scrollbar-thumb-neutral-1000-a10 scrollbar-track-transparent"
        style={TIMELINE_SCROLL_STYLE}
      >
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 py-1">
          <div className="flex flex-col gap-2">
            <AssistantLabel>Harper</AssistantLabel>
            <CareerMessageBubble
              message={{
                id: "login-greeting",
                role: "assistant",
                content: loginGreetingText,
                createdAt: "",
                messageType: "chat",
              }}
              isUser={false}
            />
          </div>

          <TimelinePanel>
            <SecondaryButton
              onClick={() => void onGoogleLogin()}
              disabled={authPending}
              className="w-full justify-center px-4"
            >
              {authPending
                ? t("career.chat.career_timeline_section.1xwvmgk", "처리 중...")
                : t(
                    "career.chat.career_timeline_section.1sop3l6",
                    "Google 로그인"
                  )}
            </SecondaryButton>

            <div className="mt-5 text-[14px] font-medium text-neutral-muted">
              {t("career.onboarding.onboarding.17sy1or", "이메일")}{" "}
              {authMode === "signup"
                ? t("career.chat.career_timeline_section.06wb0ci", "회원가입")
                : t("career.chat.career_timeline_section.074rfeb", "로그인")}
            </div>

            <form onSubmit={handleEmailAuthSubmit} className="mt-3 space-y-3">
              <Input
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                type="email"
                placeholder={t(
                  "career.chat.career_timeline_section.1sv2rkn",
                  "ID (이메일)"
                )}
                disabled={authPending}
              />
              <Input
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                type="password"
                placeholder="PW"
                disabled={authPending}
              />
              <PrimaryButton
                type="submit"
                disabled={authPending}
                className="w-full justify-center"
              >
                {authMode === "signup"
                  ? t("career.chat.career_timeline_section.06wb0ci", "회원가입")
                  : t("career.chat.career_timeline_section.074rfeb", "로그인")}
              </PrimaryButton>
            </form>

            <div className="mt-4 text-sm text-neutral-muted">
              {authMode === "signup"
                ? t(
                    "career.chat.career_timeline_section.0jstyw1",
                    "이미 계정이 있으신가요?"
                  )
                : t(
                    "career.chat.career_timeline_section.09zvq4w",
                    "첫 방문이신가요?"
                  )}{" "}
              <BareButton
                type="button"
                onClick={() =>
                  setAuthMode((prev) =>
                    prev === "signin" ? "signup" : "signin"
                  )
                }
                disabled={authPending}
                className="font-medium text-neutral-primary underline underline-offset-4"
              >
                {authMode === "signup"
                  ? t("career.chat.career_timeline_section.074rfeb", "로그인")
                  : t(
                      "career.chat.career_timeline_section.06wb0ci",
                      "회원가입"
                    )}
              </BareButton>
            </div>

            {authError && (
              <div className="mt-4 border border-critical/30 bg-critical-faded px-4 py-3 text-sm text-critical">
                {authError}
              </div>
            )}
            {authInfo && (
              <div className="mt-4 border border-neutral-1000-a05 bg-bg-floating px-4 py-3 text-sm text-neutral-soft">
                {authInfo}
              </div>
            )}
          </TimelinePanel>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleTimelineScroll}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0 pt-4 scrollbar-thin scrollbar-thumb-neutral-1000-a10 scrollbar-track-transparent"
      style={TIMELINE_SCROLL_STYLE}
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 py-1">
        {showLoadOlderButton && hasOlderMessages && (
          <div className="sticky top-0 z-10 flex justify-center pb-2">
            <BareButton
              type="button"
              onClick={() => void handleLoadOlderMessages()}
              disabled={loadingOlderMessages}
              className="inline-flex h-9 items-center justify-center rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-4 text-xs text-neutral-muted transition-colors hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingOlderMessages
                ? t(
                    "career.chat.career_timeline_section.0bh3gyc",
                    "불러오는 중..."
                  )
                : t(
                    "career.chat.career_timeline_section.0t1ynxd",
                    "이전 대화 더 보기"
                  )}
            </BareButton>
          </div>
        )}

        {sessionPending && !hasTimelineMessages && (
          <div className="flex flex-col gap-2 min-h-[52vh] items-center justify-center">
            <Face size={96} />
            <div className="flex items-center gap-2 text-sm text-neutral-muted">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-primary" />
              {t(
                "career.chat.career_timeline_section.1qh8yei",
                "하퍼가 들어오고 있습니다..."
              )}
            </div>
          </div>
        )}

        {hasTimelineMessages ? (
          <TimelineMessageList
            messages={timelineMessages}
            assistantTyping={assistantTyping}
            thinkingLogsByMessageId={thinkingLogsByMessageId}
            assistantChoiceActionsDisabled={assistantChoiceActionsDisabled}
            onSelectAssistantChoice={handleSelectAssistantChoice}
            onRegenerateOnboardingWrapup={onRegenerateOnboardingWrapup}
            onCancelActiveRecommendationSearch={
              onCancelActiveRecommendationSearch
            }
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
              detail={t(
                "career.common.career.1kdjvb7",
                "오랜만에 이어갈 대화를 준비하고 있어요."
              )}
            />
          ))}

        {callWrapUpPending && !sessionPending && stage !== "profile" && (
          <TimelinePendingPanel
            label="Call wrap-up..."
            detail={t(
              "career.common.career.1xci024",
              "통화 내용을 정리하고 다음 메시지를 준비하고 있어요."
            )}
          />
        )}

        {onboardingWrapupPending &&
          !callWrapUpPending &&
          !sessionPending &&
          stage !== "profile" && (
            <TimelinePendingPanel
              label="Thinking..."
              detail={t(
                "career.common.career.11j6jdx",
                "대화 내용을 정리하고 있어요."
              )}
            />
          )}

        {showOpportunityFeedbackFollowUpPending && (
          <TimelinePendingPanel
            label="Thinking..."
            detail={opportunityFeedbackFollowUpPendingDetail}
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
              onCancel={onCancelActiveRecommendationSearch}
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
            <div className="flex items-center gap-2 text-sm text-neutral-soft">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-primary" />
              {t(
                "career.chat.career_timeline_section.0m1h5tz",
                "이력서와 링크 정보를 분석 중입니다..."
              )}
            </div>
            <div className="mt-5 grid gap-2 border-t border-neutral-1000-a05 pt-4">
              {loadingExamples.map((example) => (
                <div
                  key={example}
                  className="text-[14px] leading-7 text-neutral-muted"
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
                <div className="text-[15px] font-medium text-neutral-primary">
                  {t(
                    "career.chat.career_timeline_section.0hahmkh",
                    "이력서 업로드"
                  )}
                </div>
                <div className="mt-1 text-[13px] leading-6 text-neutral-soft">
                  {t(
                    "career.chat.career_timeline_section.0ebbrm3",
                    "PDF, DOC, DOCX 파일을 업로드할 수 있습니다."
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label
                    htmlFor="career-resume-upload"
                    className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[8px] border border-neutral-1000-a10 bg-bg-floating px-4 text-sm text-neutral-primary transition-colors hover:border-neutral-400 hover:bg-bg-weak"
                  >
                    <Upload className="h-4 w-4" />
                    {t(
                      "career.chat.career_timeline_section.1gfaiqo",
                      "파일 선택"
                    )}
                  </label>
                  <UiInput
                    unstyled
                    id="career-resume-upload"
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={(event) => {
                      onResumeFileChange(event.target.files?.[0] ?? null);
                    }}
                  />
                  <div className="text-sm text-neutral-muted">
                    {resumeFile?.name ||
                      t(
                        "career.chat.career_timeline_section.0cx2fkc",
                        "선택된 파일 없음"
                      )}
                  </div>
                </div>
              </section>

              <section className="border-t border-neutral-1000-a05 pt-6">
                <div className="text-[15px] font-medium text-neutral-primary">
                  {t(
                    "career.chat.career_timeline_section.1ovt2je",
                    "주요 링크"
                  )}
                </div>
                <div className="mt-4 space-y-3">
                  {profileLinks.map((link, index) => (
                    <div
                      key={`profile-link-${index}`}
                      className="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)_40px]"
                    >
                      <div className="pt-2 text-[14px] font-medium text-neutral-soft">
                        {careerLinkLabels[index] ??
                          t(
                            "career.chat.career_timeline_section.0ong27a",
                            "추가 링크"
                          )}
                      </div>
                      <Input
                        value={link}
                        onChange={(event) =>
                          onProfileLinkChange(index, event.target.value)
                        }
                        placeholder="https://"
                      />
                      {index >= careerLinkLabels.length ? (
                        <BareButton
                          type="button"
                          onClick={() => onRemoveProfileLink(index)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-neutral-1000-a10 bg-bg-floating text-neutral-soft transition-colors hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary"
                        >
                          <X className="h-4 w-4" />
                        </BareButton>
                      ) : (
                        <div />
                      )}
                    </div>
                  ))}
                </div>
                <BareButton
                  type="button"
                  onClick={onAddProfileLink}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-[8px] border border-neutral-1000-a10 bg-bg-floating px-4 text-sm text-neutral-primary transition-colors hover:border-neutral-400 hover:bg-bg-weak"
                >
                  <Plus className="h-4 w-4" />
                  {t(
                    "career.chat.career_timeline_section.1gvzqes",
                    "링크 추가"
                  )}
                </BareButton>
              </section>

              {profileError ? (
                <div className="border border-critical/30 bg-critical-faded px-4 py-3 text-sm text-critical">
                  {profileError}
                </div>
              ) : null}

              <div className="border-t border-neutral-1000-a05 pt-5">
                <div className="text-[13px] leading-6 text-neutral-soft">
                  {t(
                    "career.chat.career_timeline_section.0n6afuz",
                    "이력서나 링크 하나만 있어도 우선 시작할 수 있습니다. 정보는 언제든지 바꿀 수 있습니다."
                  )}
                </div>
                <PrimaryButton
                  onClick={() => void onProfileSubmit()}
                  disabled={profilePending}
                  className="mt-4 w-full justify-center"
                >
                  {profilePending
                    ? t(
                        "career.chat.career_timeline_section.0hzihgh",
                        "분석 준비 중..."
                      )
                    : t(
                        "career.chat.career_timeline_section.0hfdmut",
                        "제출하기"
                      )}
                </PrimaryButton>
              </div>
            </div>
          </TimelinePanel>
        )}

        {sessionError && (
          <div className="border border-critical/30 bg-critical-faded px-4 py-3 text-sm text-critical">
            {sessionError}
          </div>
        )}

        {chatError && (
          <div className="border border-critical/30 bg-critical-faded px-4 py-3 text-sm text-critical">
            {chatError}
          </div>
        )}

        {showVoiceStartPrompt && (
          <div className="max-w-[620px]">
            <div className="md:text-[14px] text-[15px]">
              {t(
                "career.chat.career_timeline_section.0ijd99q",
                "좋은 회사와 역할, 기회를 연결해드리기 위해 5분 커리어 인터뷰를 통해 몇가지 질문을 더 드리고 싶어요."
              )}
              <br />
              {t(
                "career.chat.career_timeline_section.0g10mif",
                "희망 역할과 피하고 싶은 조건만 짧게 확인할게요."
              )}
            </div>
            <div className="mt-5 flex flex-row gap-2">
              <PrimaryButton
                onClick={() => onStartCallMode?.()}
                disabled={isConversationActionLocked}
                className="w-fit justify-center"
              >
                {isStartingCall
                  ? t(
                      "career.common.career_chat_panel.1q1egw3",
                      "통화 연결 중..."
                    )
                  : callWrapUpPending
                    ? t(
                        "career.chat.career_timeline_section.0twh3v7",
                        "정리 중..."
                      )
                    : t(
                        "career.chat.career_timeline_section.0ai2d9e",
                        "전화로 시작"
                      )}
              </PrimaryButton>
              <SecondaryButton
                onClick={onUseChatOnly}
                disabled={isConversationActionLocked}
                className="w-fit justify-center"
              >
                {isConversationActionLocked
                  ? t(
                      "career.chat.career_timeline_section.0l0nx9g",
                      "준비 중..."
                    )
                  : t(
                      "career.chat.career_timeline_section.1xcwt3x",
                      "채팅으로 시작"
                    )}
              </SecondaryButton>
              <SecondaryButton
                onClick={() => void onPauseOnboarding()}
                disabled={onboardingPausePending}
                className="w-fit justify-center"
              >
                {onboardingPausePending
                  ? t(
                      "career.chat.career_timeline_section.0l0nx9g",
                      "준비 중..."
                    )
                  : t(
                      "career.chat.career_timeline_section.0v3ly8r",
                      "우선 종료하고 나중에 이어할게요."
                    )}
              </SecondaryButton>
            </div>
          </div>
        )}

        {showInterestSelector && (
          <div className="max-w-[900px]">
            <div className="text-[12px] font-medium text-neutral-soft">
              {t(
                "career.chat.career_timeline_section.0dm46ie",
                "복수 선택 가능"
              )}
            </div>

            <div className="mt-3 space-y-2 flex flex-col">
              {TALENT_ONBOARDING_INTEREST_OPTIONS.map((option) => {
                const selected = selectedInterestOptions.includes(option.id);
                const label = m.career?.[option.labelKey] ?? option.label;
                return (
                  <InterestChoiceButton
                    key={option.id}
                    selected={selected}
                    onClick={() => handleToggleInterestOption(option.id)}
                    disabled={onboardingPausePending}
                  >
                    {label}
                  </InterestChoiceButton>
                );
              })}
            </div>

            <PrimaryButton
              onClick={() => void handleSubmitInterestOptions()}
              disabled={
                onboardingPausePending || selectedInterestOptions.length === 0
              }
              className="mt-5 w-fit justify-center"
            >
              {onboardingPausePending
                ? t(
                    "career.profile.career_profile_settings_section.08zy6at",
                    "저장 중..."
                  )
                : t(
                    "career.chat.career_timeline_section.1r3zjih",
                    "선택 저장하기"
                  )}
            </PrimaryButton>
          </div>
        )}

        {showContinueConversation && (
          <TimelinePanel className="max-w-[620px] p-0">
            <div className="text-[14px] leading-7 text-neutral-primary">
              {t(
                "career.chat.career_timeline_section.171qysx",
                "5분 커리어 인터뷰가 아직 완료되지 않았어요."
              )}
              <br />
              {t(
                "career.chat.career_timeline_section.1go05rp",
                "이어서 답변하면 맞춤 기회 탐색을 시작할 수 있습니다."
              )}
            </div>
            <PrimaryButton
              onClick={() => void onContinueOnboardingConversation()}
              disabled={onboardingBeginPending}
              className="mt-4 justify-center"
            >
              {onboardingBeginPending
                ? t("career.chat.career_timeline_section.0l0nx9g", "준비 중...")
                : t(
                    "career.chat.career_timeline_section.079zqvv",
                    "대화 이어가기"
                  )}
            </PrimaryButton>
          </TimelinePanel>
        )}
      </div>
    </div>
  );
};

export default React.memo(CareerTimelineSection);
