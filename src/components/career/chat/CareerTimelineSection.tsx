import { Loader2, Phone, Upload, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
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

const CareerTimelineSection = () => {
  const {
    user,
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
    voiceListening,
    voiceMuted,
    voiceTranscript,
    assistantAudioBusy,
  } = useCareerChatPanelContext();

  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showLoadOlderButton, setShowLoadOlderButton] = useState(false);
  const [selectedInterestOptions, setSelectedInterestOptions] = useState<
    TalentOnboardingInterestOptionId[]
  >([]);

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

  const syncLoadOlderButtonVisibility = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLoadOlderButton(el.scrollTop <= 24);
  }, [scrollRef]);

  useEffect(() => {
    syncLoadOlderButtonVisibility();
  }, [messages.length, syncLoadOlderButtonVisibility]);

  const handleTimelineScroll = useCallback(() => {
    syncLoadOlderButtonVisibility();
  }, [syncLoadOlderButtonVisibility]);

  const handleLoadOlderMessages = useCallback(async () => {
    const el = scrollRef.current;
    const previousScrollHeight = el?.scrollHeight ?? null;
    const previousScrollTop = el?.scrollTop ?? 0;

    await onLoadOlderMessages();

    if (!el || previousScrollHeight === null) return;

    window.requestAnimationFrame(() => {
      const scrollHeightDelta = el.scrollHeight - previousScrollHeight;
      el.scrollTop = previousScrollTop + scrollHeightDelta;
      syncLoadOlderButtonVisibility();
    });
  }, [onLoadOlderMessages, scrollRef, syncLoadOlderButtonVisibility]);

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

  if (user && isVoiceMode && stage !== "profile" && false) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 lg:px-6 lg:py-6">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-2 text-center">
            <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-xprimary text-hblack000 shadow-[0_18px_60px_rgba(17,24,39,0.18)] sm:h-48 sm:w-48">
              <p className="mt-3 font-hedvig text-2xl leading-none sm:text-3xl">
                Harper
              </p>
            </div>
          </div>

          <div className="bg-hblack000 mb-12 backdrop-blur">
            <div
              ref={scrollRef}
              className="h-[200px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-hblack200 scrollbar-track-transparent bg-hblack50 px-2 rounded-md"
            >
              {sessionPending && (
                <article className="rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
                  <div className="flex items-center gap-2 text-sm text-hblack700">
                    <Loader2 className="h-4 w-4 animate-spin text-xprimary" />
                    저장된 대화를 불러오는 중입니다...
                  </div>
                </article>
              )}

              {!sessionPending && messages.length === 0 && (
                <article className="rounded-2xl border border-hblack100 bg-hblack000/70 px-4 py-4 text-sm text-hblack600">
                  아직 표시할 대화 기록이 없습니다.
                </article>
              )}

              {!sessionPending && (
                <div className="space-y-3 pb-2">
                  {messages.map((message, index) => {
                    const isUser = message.role === "user";
                    return (
                      <div
                        key={`${message.id}-${index}`}
                        className="flex flex-col gap-1"
                      >
                        <CareerMessageBubble
                          message={message}
                          isUser={isUser}
                        />
                      </div>
                    );
                  })}

                  {chatPending && !assistantTyping && (
                    <article className="rounded-2xl border border-hblack100 bg-hblack000/70 px-4 py-3 text-sm text-hblack700">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-xprimary" />
                        채팅을 작성중입니다...
                      </div>
                    </article>
                  )}
                </div>
              )}

              {sessionError && (
                <article className="mt-3 rounded-xl border border-xprimary/30 bg-xprimary/10 px-4 py-3 text-sm text-xprimary">
                  {sessionError}
                </article>
              )}

              {chatError && (
                <article className="mt-3 rounded-xl border border-xprimary/30 bg-xprimary/10 px-4 py-3 text-sm text-xprimary">
                  {chatError}
                </article>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleTimelineScroll}
      className="flex-1 space-y-4 overflow-y-auto px-6 py-6 pb-24 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
    >
      {user && showLoadOlderButton && hasOlderMessages ? (
        <div className="sticky top-0 z-10 flex justify-center pb-2">
          <button
            type="button"
            onClick={() => void handleLoadOlderMessages()}
            disabled={loadingOlderMessages}
            className="inline-flex h-9 items-center justify-center rounded-full border border-hblack200 bg-hblack000 px-4 text-xs text-hblack700 shadow-[0_8px_20px_rgba(17,24,39,0.08)] transition-colors hover:border-xprimary hover:text-xprimary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingOlderMessages ? "불러오는 중..." : "이전 대화 더 보기"}
          </button>
        </div>
      ) : null}

      {!user && (
        <>
          <div className="flex flex-col gap-1">
            <div className="text-xs text-hblack500">Harper</div>
            <article className="max-w-[96%] border border-hblack200 bg-hblack000 px-4 py-3 text-sm leading-relaxed text-hblack700">
              <p className="whitespace-pre-line">{LOGIN_GREETING_TEXT}</p>
            </article>
          </div>

          <article className="max-w-[96%] border border-hblack200 bg-hblack000 px-4 py-4">
            <button
              type="button"
              onClick={() => void onGoogleLogin()}
              disabled={authPending}
              className="flex h-10 w-full items-center justify-center border border-hblack300 bg-hblack000 text-sm font-medium text-hblack900 transition-colors hover:bg-hblack100 hover:border-xprimary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authPending ? "처리 중..." : "Google 로그인"}
            </button>

            <p className="mt-4 text-xs font-medium uppercase tracking-[0.08em] text-hblack500">
              이메일 {authMode === "signup" ? "회원가입" : "로그인"}
            </p>
            <form onSubmit={handleEmailAuthSubmit} className="mt-2 space-y-2">
              <input
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                type="email"
                placeholder="ID (이메일)"
                disabled={authPending}
                className="h-10 w-full border border-hblack300 bg-hblack000 px-3 text-sm text-hblack900 outline-none transition-colors focus:border-xprimary"
              />
              <input
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                type="password"
                placeholder="PW"
                disabled={authPending}
                className="h-10 w-full border border-hblack300 bg-hblack000 px-3 text-sm text-hblack900 outline-none transition-colors focus:border-xprimary"
              />
              <button
                type="submit"
                disabled={authPending}
                className="h-10 w-full border border-xprimary bg-xprimary text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {authMode === "signup" ? "회원가입" : "로그인"}
              </button>
            </form>

            <p className="mt-3 text-sm text-hblack600">
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
                className="font-medium text-xprimary underline underline-offset-4"
              >
                {authMode === "signup" ? "로그인" : "회원가입"}
              </button>
            </p>

            {authError && (
              <p className="mt-2 border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
                {authError}
              </p>
            )}
            {authInfo && (
              <p className="mt-2 border border-hblack200 bg-hblack100 px-3 py-2 text-sm text-hblack700">
                {authInfo}
              </p>
            )}

            <p className="mt-4 border border-xprimary/25 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
              {LOGIN_NUDGE}
            </p>
          </article>
        </>
      )}

      {user && (
        <>
          {isVoiceMode && stage !== "profile" && (
            <div className="inline-flex pr-6 pl-1 py-1 flex-row items-center justify-center gap-4 sticky rounded-full top-0 z-20 left-[50%] -translate-x-1/2 border-b border-xprimary/15 bg-xprimary shadow-[0_10px_24px_rgba(17,24,39,0.08)]">
              <div className="w-8 h-8 rounded-full bg-hblack000 flex items-center justify-center">
                <Phone className="h-4 w-4 text-xprimary" fill="currentColor" />
              </div>
              <div className="text-base font-medium text-hblack000">Harper</div>
            </div>
          )}

          {sessionPending && (
            <article className="max-w-[96%] h-[60vh] flex items-center justify-center bg-hblack000 px-4 py-4">
              <div className="flex items-center gap-2 text-sm text-hblack700">
                <Loader2 className="h-4 w-4 animate-spin text-xprimary" />
                저장된 대화를 불러오는 중입니다...
              </div>
            </article>
          )}

          {!sessionPending &&
            messages.map((message, index) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={`${message.id}-${index}`}
                  className={`flex flex-col gap-1 ${isVoiceMode && index !== lastSpokenAssistantMessageIndex ? "opacity-70" : ""}`}
                >
                  <div
                    className={[
                      "text-xs",
                      isUser
                        ? "text-right text-hblack500"
                        : "text-left text-xprimary",
                    ].join(" ")}
                  >
                    {isUser ? "" : ""}
                  </div>
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

          {!sessionPending &&
            stage !== "profile" &&
            chatPending &&
            !assistantTyping && (
              <div className="flex flex-col gap-1">
                <div className="text-xs text-hblack500">Harper</div>
                <article className="max-w-[96%] text-sm text-hblack700">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-xprimary" />
                    채팅을 작성중입니다...
                  </div>
                </article>
              </div>
            )}

          {profilePending && (
            <article className="max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
              <div className="flex items-center gap-2 text-sm text-hblack700">
                <Loader2 className="h-4 w-4 animate-spin text-xprimary" />
                이력서/링크 정보를 분석 중입니다...
              </div>
              <p className="mt-3 border border-xprimary/25 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
                {LOADING_NUDGE}
              </p>
              <div className="mt-3 border border-hblack200 px-3 py-3">
                {LOADING_EXAMPLES.map((example) => (
                  <p key={example} className="text-sm text-hblack600">
                    • {example}
                  </p>
                ))}
              </div>
            </article>
          )}

          {!profilePending && !sessionPending && stage === "profile" && (
            <>
              <article className="lg:max-w-[80%] max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-hblack1000">
                    이력서 업로드
                  </p>
                  <p className="mt-1 text-xs text-hblack500">
                    PDF, DOC, DOCX, TXT 파일을 업로드할 수 있습니다.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <label
                      htmlFor="career-resume-upload"
                      className="inline-flex h-10 items-center gap-2 bg-hblack50 rounded-md px-3 text-sm font-medium text-hblack800 hover:border-xprimary"
                    >
                      <Upload className="h-4 w-4" />
                      파일 선택
                    </label>
                    <input
                      id="career-resume-upload"
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={(event) => {
                        onResumeFileChange(event.target.files?.[0] ?? null);
                      }}
                    />
                    <span className="truncate text-sm text-hblack500">
                      {resumeFile?.name || "선택된 파일 없음"}
                    </span>
                  </div>
                </div>

                <div className="mt-8">
                  <p className="text-sm font-medium text-hblack1000">
                    주요 링크 입력
                  </p>
                  <div className="mt-2 space-y-3">
                    {profileLinks.map((link, index) => (
                      <div
                        key={`profile-link-${index}`}
                        className="flex items-center gap-2"
                      >
                        <div className="w-28 text-sm font-medium text-hblack600">
                          {CAREER_LINK_LABELS[index] ?? "추가 링크"}
                        </div>
                        <input
                          value={link}
                          onChange={(event) =>
                            onProfileLinkChange(index, event.target.value)
                          }
                          placeholder="https://"
                          className="h-9 flex-1 border-0 border-b border-hblack300 bg-transparent px-0.5 text-sm text-hblack900 outline-none transition-colors focus:border-xprimary"
                        />
                        {index >= 3 && (
                          <button
                            type="button"
                            onClick={() => onRemoveProfileLink(index)}
                            className="inline-flex h-8 w-8 items-center justify-center bg-hblack50 rounded-md text-hblack600 hover:border-xprimary hover:text-xprimary"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={onAddProfileLink}
                    className="mt-3 inline-flex h-8 items-center bg-hblack50 rounded-md px-3 text-xs font-medium text-hblack700 hover:border-xprimary hover:text-xprimary"
                  >
                    + 링크 추가
                  </button>
                </div>

                {profileError && (
                  <p className="mt-3 border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-xs rounded-sm text-xprimary">
                    {profileError}
                  </p>
                )}
                <p className="mt-6 text-[13px] text-hblack400">
                  이력서 혹은 링크드인 중 하나만으로도 우선 시작하실 수
                  있습니다!
                  <br />
                  정보는 언제든지 변경가능합니다.
                </p>
                <button
                  type="button"
                  onClick={() => void onProfileSubmit()}
                  disabled={profilePending}
                  className="mt-2 h-10 w-full rounded-md border border-xprimary bg-xprimary text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {profilePending ? "분석 준비 중..." : "제출하기"}
                </button>
              </article>
              <div className="mt-[-4px] text-sm text-xprimary">
                * 현재 올리신 정보는 설정하시기 전까지 절대 외부에 공개되지
                않습니다.
              </div>
            </>
          )}

          {sessionError && (
            <article className="max-w-[96%] rounded-xl border border-xprimary/30 bg-xprimary/10 px-4 py-3 text-sm text-xprimary">
              {sessionError}
            </article>
          )}

          {chatError && (
            <article className="max-w-[96%] rounded-xl border border-xprimary/30 bg-xprimary/10 px-4 py-3 text-sm text-xprimary">
              {chatError}
            </article>
          )}

          {showVoiceStartPrompt && (
            <article className="max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
              <div className="text-xs text-hblack500">Harper</div>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-hblack700">
                지금 짧게 대화가 가능하신가요?
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onStartVoiceCall(5)}
                  disabled={onboardingBeginPending}
                  className="h-10 rounded-md border border-xprimary bg-xprimary px-4 text-sm font-medium text-hblack000 transition-opacity hover:opacity-90"
                >
                  {onboardingBeginPending ? "준비 중..." : "5분 통화 시작"}
                </button>
                <button
                  type="button"
                  onClick={() => onStartVoiceCall(10)}
                  disabled={onboardingBeginPending}
                  className="h-10 rounded-md border border-hblack300 bg-hblack000 px-4 text-sm text-hblack700 transition-colors hover:border-xprimary hover:text-xprimary"
                >
                  {onboardingBeginPending ? "준비 중..." : "10분 통화 시작"}
                </button>
                <button
                  type="button"
                  onClick={onUseChatOnly}
                  disabled={onboardingBeginPending}
                  className="h-10 rounded-md border border-hblack300 bg-hblack000 px-4 text-sm text-hblack700 transition-colors hover:border-xprimary hover:text-xprimary"
                >
                  {onboardingBeginPending ? "준비 중..." : "텍스트로 시작"}
                </button>
                <button
                  type="button"
                  onClick={() => void onPauseOnboarding()}
                  disabled={onboardingPausePending}
                  className="h-10 rounded-md border border-hblack300 bg-hblack000 px-4 text-sm text-hblack700 transition-colors hover:border-xprimary hover:text-xprimary"
                >
                  {onboardingPausePending
                    ? "준비 중..."
                    : "우선 등록을 완료하고 나중에 할게요."}
                </button>
              </div>
            </article>
          )}

          {showInterestSelector && (
            <article className="max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
              <p className="text-sm font-medium text-hblack1000">
                현재 어떤 기회를 찾고 있는지
              </p>
              <p className="mt-1 text-xs text-hblack500">복수 선택 가능</p>

              <div className="mt-4 space-y-2">
                {TALENT_ONBOARDING_INTEREST_OPTIONS.map((option, index) => {
                  const selected = selectedInterestOptions.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleToggleInterestOption(option.id)}
                      disabled={onboardingPausePending}
                      className={[
                        "flex w-full rounded-lg border px-3 py-3 text-left text-sm transition-colors",
                        selected
                          ? "border-xprimary bg-xprimary/10 text-xprimary"
                          : "border-hblack200 bg-hblack000 text-hblack700 hover:border-hblack400",
                      ].join(" ")}
                    >
                      {index + 1}) {option.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => void handleSubmitInterestOptions()}
                disabled={
                  onboardingPausePending || selectedInterestOptions.length === 0
                }
                className="mt-4 h-10 w-full rounded-md border border-xprimary bg-xprimary px-4 text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {onboardingPausePending ? "저장 중..." : "선택 저장하기"}
              </button>
            </article>
          )}

          {showContinueConversation && (
            <article className="max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
              <button
                type="button"
                onClick={() => void onContinueOnboardingConversation()}
                disabled={onboardingBeginPending}
                className="h-10 rounded-md border border-hblack300 bg-hblack000 px-4 text-sm text-hblack700 transition-colors hover:border-xprimary hover:text-xprimary"
              >
                {onboardingBeginPending ? "준비 중..." : "계속 더 대화하기"}
              </button>
            </article>
          )}
        </>
      )}
    </div>
  );
};

export default CareerTimelineSection;
