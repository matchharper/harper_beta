import { Loader2, Upload, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { CAREER_LINK_LABELS } from "@/components/career/constants";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import CareerMessageBubble from "./CareerMessageBubble";
import Image from "next/image";

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

const VOICE_START_PROMPT = [
  "<< 제출해주신 이력서에서 강한 전문성이 확인됐어요. >>",
  "",
  "이제 회원님의 커리어 목표를 주제로, 좋은 기회를 드리기 위해 약 5~10분 정도의 대화가 시작될 예정이에요.",
  "",
  "중간에 얼마든지 진행 상황을 저장하고 종료하실 수 있습니다.",
  "",
  "바로 시작하시겠어요?",
].join("\n");

const CareerTimelineSection = () => {
  const {
    user,
    stage,
    messages,
    scrollRef,
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
    onGoogleLogin,
    onEmailAuth,
    onResumeFileChange,
    onProfileLinkChange,
    onRemoveProfileLink,
    onAddProfileLink,
    onProfileSubmit,
    showVoiceStartPrompt,
    onStartVoiceCall,
    onUseChatOnly,
  } = useCareerChatPanelContext();

  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

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

  return (
    <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
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
          {sessionPending && (
            <article className="max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
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
                  className="flex flex-col gap-1"
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
                  <CareerMessageBubble message={message} isUser={isUser} />
                </div>
              );
            })}

          {!sessionPending &&
            stage !== "profile" &&
            chatPending &&
            !assistantTyping && (
              <div className="flex flex-col gap-1">
                <div className="text-xs text-hblack500">Harper</div>
                <article className="max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-3 text-sm text-hblack700">
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

          {!sessionPending && stage === "profile" && (
            <article className="max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
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
                    className="inline-flex h-10 items-center gap-2 border border-hblack300 px-3 text-sm font-medium text-hblack800 hover:border-xprimary"
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
                  <span className="truncate text-sm text-hblack600">
                    {resumeFile?.name || "선택된 파일 없음"}
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm font-medium text-hblack1000">
                  주요 링크 입력
                </p>
                <div className="mt-2 space-y-3">
                  {profileLinks.map((link, index) => (
                    <div
                      key={`profile-link-${index}`}
                      className="flex items-center gap-2"
                    >
                      <div className="w-28 text-xs font-medium text-hblack600">
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
                          className="inline-flex h-8 w-8 items-center justify-center border border-hblack300 text-hblack600 hover:border-xprimary hover:text-xprimary"
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
                  className="mt-3 inline-flex h-8 items-center border border-hblack300 px-3 text-xs font-medium text-hblack700 hover:border-xprimary hover:text-xprimary"
                >
                  + 링크 추가
                </button>
              </div>

              {profileError && (
                <p className="mt-3 border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
                  {profileError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void onProfileSubmit()}
                disabled={profilePending}
                className="mt-4 h-10 w-full border border-xprimary bg-xprimary text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {profilePending ? "분석 준비 중..." : "제출하기"}
              </button>
            </article>
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
                {VOICE_START_PROMPT}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onStartVoiceCall}
                  disabled={onboardingBeginPending}
                  className="h-10 border border-xprimary bg-xprimary px-4 text-sm font-medium text-hblack000 transition-opacity hover:opacity-90"
                >
                  {onboardingBeginPending ? "준비 중..." : "Call 시작하기"}
                </button>
                <button
                  type="button"
                  onClick={onUseChatOnly}
                  disabled={onboardingBeginPending}
                  className="h-10 border border-hblack300 bg-hblack000 px-4 text-sm text-hblack700 transition-colors hover:border-xprimary hover:text-xprimary"
                >
                  {onboardingBeginPending
                    ? "준비 중..."
                    : "현재 채팅으로만 가능해요"}
                </button>
              </div>
            </article>
          )}
        </>
      )}
    </div>
  );
};

export default CareerTimelineSection;
