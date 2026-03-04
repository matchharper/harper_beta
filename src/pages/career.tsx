import {
  Loader2,
  LogOut,
  Plus,
  SendHorizontal,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";

type CareerStage = "profile" | "chat" | "completed";
type MessageRole = "assistant" | "user";

type CareerMessage = {
  id: string | number;
  role: MessageRole;
  content: string;
  messageType: string;
  createdAt: string;
  typing?: boolean;
};

type SessionResponse = {
  conversation: {
    id: string;
    stage: CareerStage;
    title: string | null;
    resumeFileName: string | null;
    resumeLinks: string[];
    reliefNudgeSent: boolean;
  };
  messages: Array<{
    id: number;
    role: MessageRole;
    content: string;
    messageType: string;
    createdAt: string;
  }>;
};

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

const LINK_LABELS = ["Github", "LinkedIn", "Google Scholar"];
const TARGET_QUESTIONS = 5;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const normalizeText = (raw: string) =>
  raw
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const toUiMessage = (message: {
  id: string | number;
  role: MessageRole;
  content: string;
  messageType?: string;
  createdAt?: string;
}): CareerMessage => ({
  id: message.id,
  role: message.role,
  content: message.content,
  messageType: message.messageType ?? "chat",
  createdAt: message.createdAt ?? new Date().toISOString(),
});

const getErrorMessage = (payload: unknown, fallback: string) => {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (
    typeof payload === "object" &&
    payload &&
    "error" in payload &&
    typeof (payload as any).error === "string"
  ) {
    return (payload as any).error;
  }
  return fallback;
};

const Career = () => {
  const { user, loading: authLoading } = useAuthStore();

  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");

  const [sessionPending, setSessionPending] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [stage, setStage] = useState<CareerStage>("profile");
  const [messages, setMessages] = useState<CareerMessage[]>([]);

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [profileLinks, setProfileLinks] = useState<string[]>(["", "", ""]);
  const [profilePending, setProfilePending] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [draft, setDraft] = useState("");
  const [chatLinkDraft, setChatLinkDraft] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [assistantTyping, setAssistantTyping] = useState(false);

  const typingQueueRef = useRef<Promise<void>>(Promise.resolve());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const userId = user?.id ?? null;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.");
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      const incomingHeaders = init?.headers as Record<string, string> | undefined;
      if (incomingHeaders) {
        Object.assign(headers, incomingHeaders);
      }
      if (
        init?.body &&
        !headers["Content-Type"] &&
        !(typeof FormData !== "undefined" && init.body instanceof FormData)
      ) {
        headers["Content-Type"] = "application/json";
      }

      return fetch(url, {
        ...init,
        headers,
      });
    },
    [getAccessToken]
  );

  const enqueueAssistantTypewriter = useCallback((message: CareerMessage) => {
    typingQueueRef.current = typingQueueRef.current.then(async () => {
      if (!mountedRef.current) return;

      setAssistantTyping(true);
      const id = String(message.id);
      setMessages((prev) => [
        ...prev,
        {
          ...message,
          content: "",
          typing: true,
        },
      ]);

      const fullText = message.content;
      const delay = Math.max(10, Math.min(28, Math.floor(1700 / Math.max(fullText.length, 30))));
      for (let index = 1; index <= fullText.length; index += 1) {
        if (!mountedRef.current) return;
        await sleep(delay);
        setMessages((prev) =>
          prev.map((item) =>
            String(item.id) === id
              ? {
                  ...item,
                  content: fullText.slice(0, index),
                }
              : item
          )
        );
      }

      setMessages((prev) =>
        prev.map((item) =>
          String(item.id) === id
            ? {
                ...item,
                content: fullText,
                typing: false,
              }
            : item
        )
      );
      setAssistantTyping(false);
    });

    return typingQueueRef.current;
  }, []);

  const loadSession = useCallback(async () => {
    setSessionPending(true);
    setSessionError("");
    try {
      const bootstrapRes = await fetchWithAuth("/api/talent/auth/bootstrap", {
        method: "POST",
      });
      if (!bootstrapRes.ok) {
        const payload = await bootstrapRes.json().catch(() => ({}));
        throw new Error(getErrorMessage(payload, "talent_users 초기화에 실패했습니다."));
      }

      const sessionRes = await fetchWithAuth("/api/talent/session");
      const payload = (await sessionRes.json().catch(() => ({}))) as SessionResponse & {
        error?: string;
      };
      if (!sessionRes.ok) {
        throw new Error(getErrorMessage(payload, "세션을 불러오지 못했습니다."));
      }

      setConversationId(payload.conversation.id);
      setStage(payload.conversation.stage);
      setMessages(payload.messages.map(toUiMessage));

      const links = payload.conversation.resumeLinks ?? [];
      setProfileLinks([
        links[0] ?? "",
        links[1] ?? "",
        links[2] ?? "",
        ...links.slice(3),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "세션을 불러오지 못했습니다.";
      setSessionError(message);
    } finally {
      setSessionPending(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      setConversationId(null);
      setStage("profile");
      setMessages([]);
      setSessionPending(false);
      setSessionError("");
      setProfilePending(false);
      setProfileError("");
      setChatPending(false);
      setChatError("");
      return;
    }

    void loadSession();
  }, [authLoading, loadSession, userId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [assistantTyping, chatPending, messages, profilePending, sessionPending]);

  const answeredCount = useMemo(
    () =>
      Math.min(
        messages.filter(
          (message) =>
            message.role === "user" && (message.messageType ?? "chat") === "chat"
        ).length,
        TARGET_QUESTIONS
      ),
    [messages]
  );
  const progressPercent = Math.round((answeredCount / TARGET_QUESTIONS) * 100);

  const circleRadius = 48;
  const circleLength = 2 * Math.PI * circleRadius;
  const circleOffset = circleLength * (1 - progressPercent / 100);

  const isComposerLocked =
    !user ||
    !conversationId ||
    sessionPending ||
    stage === "profile" ||
    profilePending ||
    chatPending ||
    assistantTyping;

  const composerPlaceholder = !user
    ? "로그인 후 대화를 시작할 수 있습니다."
    : stage === "profile"
      ? "기본 정보 제출 후 대화가 시작됩니다."
      : profilePending
        ? "이력서/링크를 분석 중입니다."
        : "Harper에게 답변을 입력하세요.";

  const handleGoogleLogin = async () => {
    if (authPending) return;
    setAuthPending(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/career` : undefined;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
      if (data?.url && typeof window !== "undefined") {
        window.location.assign(data.url);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google 로그인에 실패했습니다.");
    } finally {
      setAuthPending(false);
    }
  };

  const handleEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authPending) return;

    const email = authEmail.trim();
    if (!email || !authPassword) {
      setAuthError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setAuthPending(true);
    setAuthError("");
    setAuthInfo("");
    try {
      if (authMode === "signup") {
        const redirectTo =
          typeof window !== "undefined" ? `${window.location.origin}/career` : undefined;
        const { data, error } = await supabase.auth.signUp({
          email,
          password: authPassword,
          options: {
            emailRedirectTo: redirectTo,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setAuthInfo("회원가입 완료. 이메일 인증 후 다시 로그인해 주세요.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: authPassword,
        });
        if (error) throw error;
      }

      setAuthEmail("");
      setAuthPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "인증에 실패했습니다.");
    } finally {
      setAuthPending(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const readResumeText = useCallback(async (file: File) => {
    let text = "";
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetchWithAuth("/api/talent/resume/parse", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error("PDF에서 텍스트를 읽지 못했습니다.");
      }
      const payload = await response.json();
      text = String(payload?.text ?? "");
    } else {
      text = await file.text();
    }

    const normalized = normalizeText(text);
    if (!normalized) {
      throw new Error("이력서 텍스트를 읽지 못했습니다. 다른 파일로 시도해 주세요.");
    }
    return normalized.slice(0, 18000);
  }, [fetchWithAuth]);

  const handleProfileSubmit = async () => {
    if (!user || !conversationId || profilePending) return;

    if (!resumeFile) {
      setProfileError("이력서를 업로드해 주세요.");
      return;
    }

    const cleanedLinks = profileLinks.map((link) => link.trim()).filter(Boolean);
    if (cleanedLinks.length === 0) {
      setProfileError("LinkedIn/GitHub 등 링크를 하나 이상 입력해 주세요.");
      return;
    }

    setProfilePending(true);
    setProfileError("");
    setChatError("");

    try {
      const resumeText = await readResumeText(resumeFile);

      const response = await fetchWithAuth("/api/talent/onboarding/start", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          resumeFileName: resumeFile.name,
          resumeText,
          links: cleanedLinks,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "온보딩 시작에 실패했습니다."));
      }

      setStage((payload?.conversation?.stage as CareerStage) ?? "chat");
      setMessages((prev) => [...prev, toUiMessage(payload.userMessage)]);

      const assistants = (payload.assistantMessages ?? []) as SessionResponse["messages"];
      for (const assistant of assistants) {
        await enqueueAssistantTypewriter(toUiMessage(assistant));
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "기본 정보 제출 중 오류가 발생했습니다.";
      setProfileError(message);
    } finally {
      setProfilePending(false);
    }
  };

  const handleSend = async () => {
    if (isComposerLocked || !conversationId || !user) return;
    const text = draft.trim();
    if (!text) return;

    const link = chatLinkDraft.trim();
    const composed = link ? `${text}\n\n참고 링크: ${link}` : text;
    const tempId = `temp-user-${Date.now()}`;
    const nowIso = new Date().toISOString();

    setDraft("");
    setChatLinkDraft("");
    setShowLinkInput(false);
    setChatError("");
    setChatPending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: "user",
        content: composed,
        messageType: "chat",
        createdAt: nowIso,
      },
    ]);

    try {
      const response = await fetchWithAuth("/api/talent/chat", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          message: text,
          link,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "메시지 전송에 실패했습니다."));
      }

      setMessages((prev) => [
        ...prev.filter((item) => item.id !== tempId),
        toUiMessage(payload.userMessage),
      ]);
      await enqueueAssistantTypewriter(toUiMessage(payload.assistantMessage));

      if (payload?.progress?.completed) {
        setStage("completed");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "메시지 전송 중 오류가 발생했습니다.";
      setMessages((prev) => prev.filter((item) => item.id !== tempId));
      setDraft(text);
      setChatLinkDraft(link);
      setChatError(message);
    } finally {
      setChatPending(false);
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <main className="relative min-h-screen bg-hblack000 text-hblack900 font-inter">
      <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-10 lg:px-8 lg:py-10">
        <section className="flex min-h-[760px] flex-col rounded-2xl border border-hblack200 bg-hblack000 lg:col-span-7 lg:h-[calc(100vh-80px)]">
          <header className="border-b border-hblack200 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-xprimary">
                  Harper Career
                </p>
                <h1 className="mt-2 text-xl font-medium text-hblack1000">
                  Candidate Onboarding Chat
                </h1>
                <p className="mt-2 text-sm text-hblack500">
                  로그인, 기본 정보 제출, 대화 기반 매칭까지 한 화면에서 진행됩니다.
                </p>
              </div>
              <span className="inline-flex items-center rounded-lg border border-xprimary/30 bg-xprimary/10 px-3 py-1 text-xs font-medium text-xprimary">
                {stage === "completed" ? "Matching Ready" : "In Progress"}
              </span>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
            {!user && (
              <>
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-hblack500">Harper</div>
                  <article className="max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-3 text-sm leading-relaxed text-hblack700">
                    <p className="whitespace-pre-line">{LOGIN_GREETING_TEXT}</p>
                  </article>
                </div>

                <article className="max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={authPending}
                    className="flex h-10 w-full items-center justify-center rounded-lg border border-hblack300 bg-hblack000 text-sm font-medium text-hblack900 transition-colors hover:bg-hblack100 hover:border-xprimary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authPending ? "처리 중..." : "Google 로그인"}
                  </button>

                  <p className="mt-4 text-xs font-medium uppercase tracking-[0.08em] text-hblack500">
                    이메일 {authMode === "signup" ? "회원가입" : "로그인"}
                  </p>
                  <form onSubmit={handleEmailAuth} className="mt-2 space-y-2">
                    <input
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      type="email"
                      placeholder="ID (이메일)"
                      disabled={authPending}
                      className="h-10 w-full rounded-lg border border-hblack300 bg-hblack000 px-3 text-sm text-hblack900 outline-none transition-colors focus:border-xprimary"
                    />
                    <input
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      type="password"
                      placeholder="PW"
                      disabled={authPending}
                      className="h-10 w-full rounded-lg border border-hblack300 bg-hblack000 px-3 text-sm text-hblack900 outline-none transition-colors focus:border-xprimary"
                    />
                    <button
                      type="submit"
                      disabled={authPending}
                      className="h-10 w-full rounded-lg border border-xprimary bg-xprimary text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {authMode === "signup" ? "회원가입" : "로그인"}
                    </button>
                  </form>

                  <p className="mt-3 text-sm text-hblack600">
                    {authMode === "signup" ? "이미 계정이 있으신가요?" : "첫 방문이신가요?"}{" "}
                    <button
                      type="button"
                      onClick={() =>
                        setAuthMode((prev) => (prev === "signin" ? "signup" : "signin"))
                      }
                      disabled={authPending}
                      className="font-medium text-xprimary underline underline-offset-4"
                    >
                      {authMode === "signup" ? "로그인" : "회원가입"}
                    </button>
                  </p>

                  {authError && (
                    <p className="mt-2 rounded-lg border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
                      {authError}
                    </p>
                  )}
                  {authInfo && (
                    <p className="mt-2 rounded-lg border border-hblack200 bg-hblack100 px-3 py-2 text-sm text-hblack700">
                      {authInfo}
                    </p>
                  )}

                  <p className="mt-4 rounded-lg border border-xprimary/25 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
                    {LOGIN_NUDGE}
                  </p>
                </article>
              </>
            )}

            {user && (
              <>
                <article className="max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-3">
                  <p className="text-sm font-medium text-xprimary">✓ 로그인 완료!</p>
                  <p className="mt-1 text-sm text-hblack600">{user.email}</p>
                </article>

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
                      <div key={`${message.id}-${index}`} className="flex flex-col gap-1">
                        <div
                          className={[
                            "text-xs text-hblack500",
                            isUser ? "text-right" : "text-left",
                          ].join(" ")}
                        >
                          {isUser ? "me" : "Harper"}
                        </div>
                        <article
                          className={[
                            "max-w-[96%] rounded-xl border px-4 py-3 text-sm leading-relaxed transition-colors",
                            isUser
                              ? "ml-auto border-xprimary bg-xprimary/10 text-hblack1000"
                              : "border-hblack200 bg-hblack000 text-hblack700 hover:bg-hblack100",
                          ].join(" ")}
                        >
                          <p className="whitespace-pre-line">{message.content}</p>
                          {message.typing && (
                            <span className="inline-block w-2 animate-pulse align-baseline text-xprimary">
                              ▍
                            </span>
                          )}
                        </article>
                      </div>
                    );
                  })}

                {profilePending && (
                  <article className="max-w-[96%] rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
                    <div className="flex items-center gap-2 text-sm text-hblack700">
                      <Loader2 className="h-4 w-4 animate-spin text-xprimary" />
                      이력서/링크 정보를 분석 중입니다...
                    </div>
                    <p className="mt-3 rounded-lg border border-xprimary/25 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
                      {LOADING_NUDGE}
                    </p>
                    <div className="mt-3 rounded-lg border border-hblack200 px-3 py-3">
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
                      <p className="text-sm font-medium text-hblack1000">이력서 업로드</p>
                      <p className="mt-1 text-xs text-hblack500">
                        PDF, DOC, DOCX, TXT 파일을 업로드할 수 있습니다.
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <label
                          htmlFor="career-resume-upload"
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-hblack300 px-3 text-sm font-medium text-hblack800 hover:border-xprimary"
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
                            setResumeFile(event.target.files?.[0] ?? null);
                          }}
                        />
                        <span className="truncate text-sm text-hblack600">
                          {resumeFile?.name || "선택된 파일 없음"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-6">
                      <p className="text-sm font-medium text-hblack1000">주요 링크 입력</p>
                      <div className="mt-2 space-y-3">
                        {profileLinks.map((link, index) => (
                          <div key={`profile-link-${index}`} className="flex items-center gap-2">
                            <div className="w-28 text-xs font-medium text-hblack600">
                              {LINK_LABELS[index] ?? "추가 링크"}
                            </div>
                            <input
                              value={link}
                              onChange={(event) => {
                                const value = event.target.value;
                                setProfileLinks((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? value : item
                                  )
                                );
                              }}
                              placeholder="https://"
                              className="h-9 flex-1 border-0 border-b border-hblack300 bg-transparent px-0.5 text-sm text-hblack900 outline-none transition-colors focus:border-xprimary"
                            />
                            {index >= 3 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setProfileLinks((prev) =>
                                    prev.filter((_, itemIndex) => itemIndex !== index)
                                  )
                                }
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hblack300 text-hblack600 hover:border-xprimary hover:text-xprimary"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setProfileLinks((prev) => [...prev, ""])}
                        className="mt-3 inline-flex h-8 items-center rounded-lg border border-hblack300 px-3 text-xs font-medium text-hblack700 hover:border-xprimary hover:text-xprimary"
                      >
                        + 링크 추가
                      </button>
                    </div>

                    {profileError && (
                      <p className="mt-3 rounded-lg border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
                        {profileError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleProfileSubmit}
                      disabled={profilePending}
                      className="mt-4 h-10 w-full rounded-lg border border-xprimary bg-xprimary text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
              </>
            )}
          </div>

          <div className="border-t border-hblack200 p-4">
            {showLinkInput && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-hblack200 bg-hblack100 px-2 py-2">
                <input
                  value={chatLinkDraft}
                  onChange={(event) => setChatLinkDraft(event.target.value)}
                  placeholder="대화에 포함할 링크를 입력하세요."
                  className="h-9 flex-1 border-none bg-transparent px-2 text-sm text-hblack900 outline-none placeholder:text-hblack500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setChatLinkDraft("");
                    setShowLinkInput(false);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hblack300 text-hblack600 hover:border-xprimary hover:text-xprimary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="relative flex items-end rounded-lg border border-hblack200 bg-hblack000 px-2 py-2 focus-within:border-xprimary">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={composerPlaceholder}
                disabled={isComposerLocked}
                className="min-h-[88px] max-h-[140px] w-full resize-none border-none bg-transparent px-2 py-1 text-sm text-hblack900 outline-none placeholder:text-hblack500 disabled:cursor-not-allowed"
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLinkInput((prev) => !prev)}
                  disabled={!user || isComposerLocked}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hblack300 text-hblack600 transition-colors hover:bg-hblack100 hover:text-hblack900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={isComposerLocked || !draft.trim()}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-xprimary bg-xprimary text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {chatPending || assistantTyping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SendHorizontal className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="lg:col-span-3 lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-2xl border border-hblack200 bg-hblack000 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-hblack1000">온보딩 진행률</h2>
              {user ? (
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center gap-1 rounded-lg border border-hblack300 px-2 py-1 text-xs text-hblack600 transition-colors hover:bg-hblack100 hover:text-hblack900"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  로그아웃
                </button>
              ) : null}
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div className="relative h-28 w-28">
                <svg viewBox="0 0 120 120" className="h-28 w-28">
                  <circle
                    cx="60"
                    cy="60"
                    r={circleRadius}
                    stroke="currentColor"
                    className="text-hblack200"
                    strokeWidth="10"
                    fill="none"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r={circleRadius}
                    stroke="currentColor"
                    className="text-xprimary"
                    strokeWidth="10"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={circleLength}
                    strokeDashoffset={circleOffset}
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-hblack900">
                  {progressPercent}%
                </div>
              </div>

              <div className="flex-1">
                <p className="text-sm text-hblack600">
                  질문 응답 {answeredCount}/{TARGET_QUESTIONS}
                </p>
                <div className="mt-2 h-2 rounded-full bg-hblack200">
                  <div
                    className="h-2 rounded-full bg-xprimary transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-hblack500">
                  답변이 쌓일수록 매칭 정확도가 올라갑니다.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              {[
                { label: "로그인", done: Boolean(user) },
                {
                  label: "기본 정보 제출",
                  done: stage === "chat" || stage === "completed",
                },
                { label: "대화 진행", done: answeredCount > 0 },
                { label: "매칭 시작", done: stage === "completed" || answeredCount >= 5 },
              ].map((step) => (
                <div
                  key={step.label}
                  className="flex items-center justify-between rounded-lg border border-hblack200 px-3 py-2 transition-colors hover:bg-hblack100"
                >
                  <p className="text-sm text-hblack700">{step.label}</p>
                  <span
                    className={[
                      "text-xs font-medium",
                      step.done ? "text-xprimary" : "text-hblack500",
                    ].join(" ")}
                  >
                    {step.done ? "완료" : "대기"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-hblack200 bg-hblack000 p-6">
            <h3 className="text-sm font-medium uppercase tracking-[0.08em] text-hblack500">
              Question Track
            </h3>
            <div className="mt-3 space-y-2">
              {Array.from({ length: TARGET_QUESTIONS }).map((_, index) => {
                const done = index < answeredCount;
                const current = !done && index === answeredCount && user && stage !== "profile";

                return (
                  <div
                    key={`track-${index}`}
                    className={[
                      "rounded-lg border px-3 py-2 transition-colors",
                      done
                        ? "border-xprimary/30 bg-xprimary/10"
                        : current
                          ? "border-xprimary/30 bg-xprimary/5"
                          : "border-hblack200 hover:bg-hblack100",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-hblack500">질문 {index + 1}</p>
                      {done ? (
                        <span className="text-xs font-medium text-xprimary">완료</span>
                      ) : current ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-xprimary">
                          <Sparkles className="h-3 w-3" />
                          진행 중
                        </span>
                      ) : (
                        <span className="text-xs text-hblack400">대기</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
};

export default Career;
