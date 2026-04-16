import { Loader2, Phone, Plus, Upload, X } from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { CAREER_LINK_LABELS } from "@/components/career/constants";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import {
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

const LOGIN_GREETING_TEXT =
  "안녕하세요. 잘해드리겠습니다.\n\n회원님의 정보를 저장하기 위해서 우선 계정으로 로그인을 해주세요.";

const LOGIN_NUDGE =
  "<<일주일 이내에 Harper를 통해서 미국 법인의 회사로 한명이 채용되었어요!>>";

const LOADING_NUDGE =
  "<< 하퍼를 통해 이런 기회를 받게됩니다. -> 받게되는 좋은 기회 예시 >>";

const LOADING_EXAMPLES = [
  "미국 법인 AI Product 팀 Senior Software Engineer",
  "글로벌 SaaS 팀 ML Engineer (비자 스폰서 가능)",
  "국내 딥테크 스타트업 Applied AI Engineer",
];

const VOICE_TRANSCRIPT_PREVIEW_LIMIT = 120;
const BOTTOM_THRESHOLD_PX = 120;

const TimelinePanel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <CareerInlinePanel className={careerCx("max-w-[980px] px-5 py-5", className)}>
    {children}
  </CareerInlinePanel>
);

const AssistantLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[12px] font-medium text-beige900/90">{children}</div>
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
      "w-full rounded-[8px] border px-4 py-3 text-left text-[14px] leading-6 transition-colors",
      selected
        ? "border-beige900 bg-beige900 text-[#f5ecdd]"
        : "border-beige900/10 bg-white/45 text-beige900/70 hover:border-beige900/25 hover:text-beige900",
      props.className
    )}
  >
    {children}
  </button>
);

const CareerTimelineSection = () => {
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
    chatPending,
    onboardingBeginPending,
    onboardingPausePending,
    onGoogleLogin,
    onEmailAuth,
    onResumeFileChange,
    onProfileLinkChange,
    onRemoveProfileLink,
    onAddProfileLink,
    onProfileSubmit,
    onLoadOlderMessages,
    showVoiceStartPrompt,
    onStartVoiceCall,
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
  const [selectedInterestOptions, setSelectedInterestOptions] = useState<
    TalentOnboardingInterestOptionId[]
  >([]);
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
    setShowLoadOlderButton(el.scrollTop <= 24);
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distanceToBottom <= BOTTOM_THRESHOLD_PX);
  }, [scrollRef]);

  useEffect(() => {
    syncScrollState();
  }, [messages.length, syncScrollState]);

  const handleTimelineScroll = useCallback(() => {
    syncScrollState();
  }, [syncScrollState]);

  const handleLoadOlderMessages = useCallback(async () => {
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
  }, [onLoadOlderMessages, scrollRef, syncScrollState]);

  const isVoiceMode = inputMode === "voice";
  let lastSpokenAssistantMessageIndex = -1;

  if (assistantAudioBusy) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (
        message.role === "assistant" &&
        !message.typing &&
        Boolean(message.content.trim()) &&
        (message.messageType ?? "chat") === "chat"
      ) {
        lastSpokenAssistantMessageIndex = index;
        break;
      }
    }
  }

  const transcriptPreview = voiceTranscript.trim();
  const compactTranscriptPreview =
    transcriptPreview.length > VOICE_TRANSCRIPT_PREVIEW_LIMIT
      ? `${transcriptPreview.slice(0, VOICE_TRANSCRIPT_PREVIEW_LIMIT - 1)}...`
      : transcriptPreview;
  const pauseCloseTyping = messages.some(
    (message) =>
      message.messageType === TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE &&
      Boolean(message.typing)
  );
  const showInterestSelector = shouldShowOnboardingInterestSelector(messages);
  const showContinueConversation =
    shouldShowContinueConversationAction(messages) && !pauseCloseTyping;

  useEffect(() => {
    if (!showInterestSelector) {
      setSelectedInterestOptions([]);
    }
  }, [showInterestSelector]);

  useEffect(() => {
    initialBottomSyncDoneRef.current = false;
  }, [conversationId, inputMode]);

  useEffect(() => {
    if (initialBottomSyncDoneRef.current) return;
    if (!conversationId || sessionPending || inputMode === "call") return;
    if (messages.length === 0) return;

    initialBottomSyncDoneRef.current = true;
    const id = window.requestAnimationFrame(() => {
      scrollToBottom("auto");
      syncScrollState();
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    conversationId,
    inputMode,
    messages.length,
    scrollToBottom,
    sessionPending,
    syncScrollState,
  ]);

  useEffect(() => {
    if (!stickToBottom || inputMode === "call") return;
    if (messages.length === 0) return;

    const id = window.requestAnimationFrame(() => {
      scrollToBottom(assistantTyping || chatPending ? "auto" : "smooth");
      syncScrollState();
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    assistantTyping,
    chatPending,
    inputMode,
    messages,
    scrollToBottom,
    stickToBottom,
    syncScrollState,
  ]);

  const handleToggleInterestOption = useCallback(
    (optionId: TalentOnboardingInterestOptionId) => {
      setSelectedInterestOptions((prev) =>
        prev.includes(optionId)
          ? prev.filter((item) => item !== optionId)
          : [...prev, optionId]
      );
    },
    []
  );

  const handleSubmitInterestOptions = useCallback(async () => {
    const saved = await onSubmitOnboardingInterest(selectedInterestOptions);
    if (!saved) return;
    setSelectedInterestOptions([]);
  }, [onSubmitOnboardingInterest, selectedInterestOptions]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleTimelineScroll}
      className="min-h-0 flex-1 overflow-y-auto px-0 py-4 pb-28 scrollbar-thin scrollbar-thumb-[rgba(92,61,34,0.16)] scrollbar-track-transparent"
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 py-1">
        {user && showLoadOlderButton && hasOlderMessages && (
          <div className="sticky top-0 z-10 flex justify-center pb-2">
            <button
              type="button"
              onClick={() => void handleLoadOlderMessages()}
              disabled={loadingOlderMessages}
              className="inline-flex h-9 items-center justify-center rounded-[8px] border border-beige900/15 bg-white/45 px-4 text-xs text-beige900/55 transition-colors hover:border-beige900/30 hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingOlderMessages ? "불러오는 중..." : "이전 대화 더 보기"}
            </button>
          </div>
        )}

        {!user ? (
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
                    setAuthMode((prev) =>
                      prev === "signin" ? "signup" : "signin"
                    )
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

              <StatusMessage className="mt-5">{LOGIN_NUDGE}</StatusMessage>
            </TimelinePanel>
          </>
        ) : null}

        {user && isVoiceMode && stage !== "profile" ? (
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

        {user && sessionPending ? (
          <div className="flex min-h-[52vh] items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-beige900/60">
              <Loader2 className="h-4 w-4 animate-spin text-beige900" />
              저장된 대화를 불러오는 중입니다...
            </div>
          </div>
        ) : null}

        {user &&
          !sessionPending &&
          messages.filter((m) => m.messageType !== "call_transcript").map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div
                key={String(message.id)}
                className={careerCx(
                  "flex flex-col gap-2",
                  isVoiceMode &&
                    index !== lastSpokenAssistantMessageIndex &&
                    "opacity-70"
                )}
              >
                {!isUser && <AssistantLabel>Harper</AssistantLabel>}
                <CareerMessageBubble
                  message={message}
                  isUser={isUser}
                  isAssistantSpeaking={
                    !isUser && index === lastSpokenAssistantMessageIndex
                  }
                />
              </div>
            );
          })}

        {user &&
          !sessionPending &&
          stage !== "profile" &&
          chatPending &&
          !assistantTyping && (
            <StatusMessage>
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-beige900" />
                채팅을 작성중입니다...
              </span>
            </StatusMessage>
          )}

        {user && profilePending && (
          <TimelinePanel className="max-w-[980px]">
            <div className="flex items-center gap-2 text-sm text-beige900/50">
              <Loader2 className="h-4 w-4 animate-spin text-beige900" />
              이력서와 링크 정보를 분석 중입니다...
            </div>
            <StatusMessage className="mt-4">{LOADING_NUDGE}</StatusMessage>
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

        {user && !profilePending && !sessionPending && stage === "profile" && (
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
                      {index >= 3 ? (
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

        {user && sessionError && (
          <div className="border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
            {sessionError}
          </div>
        )}

        {user && chatError && (
          <div className="border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
            {chatError}
          </div>
        )}

        {user && showVoiceStartPrompt && (
          <TimelinePanel className="max-w-[620px]">
            <div className="text-[15px] leading-7 text-beige900/70">
              현재 대화가 가능하신가요?
              <br />
              간단한 질문 몇 가지만 여쭤볼게요.
            </div>
            <div className="mt-5 grid gap-2">
              <CareerPrimaryButton
                onClick={() => onStartVoiceCall(5)}
                disabled={onboardingBeginPending}
                className="w-full justify-center"
              >
                {onboardingBeginPending ? "준비 중..." : "5분 통화 시작"}
              </CareerPrimaryButton>
              <CareerPrimaryButton
                onClick={() => onStartVoiceCall(10)}
                disabled={onboardingBeginPending}
                className="w-full justify-center"
              >
                {onboardingBeginPending ? "준비 중..." : "10분 통화 시작"}
              </CareerPrimaryButton>
              <CareerSecondaryButton
                onClick={onUseChatOnly}
                disabled={onboardingBeginPending}
                className="w-full justify-center"
              >
                {onboardingBeginPending ? "준비 중..." : "텍스트로 시작"}
              </CareerSecondaryButton>
              <CareerSecondaryButton
                onClick={() => void onPauseOnboarding()}
                disabled={onboardingPausePending}
                className="w-full justify-center"
              >
                {onboardingPausePending
                  ? "준비 중..."
                  : "우선 종료하고 나중에 이어할게요."}
              </CareerSecondaryButton>
            </div>
          </TimelinePanel>
        )}

        {user && showInterestSelector && (
          <TimelinePanel className="max-w-[900px]">
            <div className="text-[12px] font-medium text-beige900/40">
              복수 선택 가능
            </div>

            <div className="mt-3 space-y-2">
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
              className="mt-5 w-full justify-center"
            >
              {onboardingPausePending ? "저장 중..." : "선택 저장하기"}
            </CareerPrimaryButton>
          </TimelinePanel>
        )}

        {user && showContinueConversation && (
          <TimelinePanel className="max-w-[620px]">
            <div className="text-[15px] leading-7 text-beige900/55">
              방문해주셔서 감사합니다.
            </div>
            <CareerPrimaryButton
              onClick={() => void onContinueOnboardingConversation()}
              disabled={onboardingBeginPending}
              className="mt-4 justify-center"
            >
              {onboardingBeginPending ? "준비 중..." : "지금 더 대화하기"}
            </CareerPrimaryButton>
          </TimelinePanel>
        )}
      </div>
    </div>
  );
};

export default CareerTimelineSection;
