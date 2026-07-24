import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useOrgInvitePreview } from "@/hooks/org/useOrg";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { supabase } from "@/lib/supabase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function OrgEntryAppBar({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="h-[52px]">
      <div className="flex h-full items-center justify-between px-3 sm:px-8">
        <Link
          href="/org"
          aria-label="Harper 회사 페이지로 이동"
          className="inline-flex items-center rounded-md px-1 py-1 outline-none transition-opacity hover:opacity-65 focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
        >
          <Image
            src="/svgs/logov2.svg"
            alt="Harper"
            width={68}
            height={29}
            priority
          />
        </Link>
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <Link
              href="/company"
              aria-label="Harper 회사 페이지로 이동"
              className="rounded-full px-3 py-1.5 text-[12px] font-normal text-black/50 transition hover:bg-bg-weak"
            >
              로그아웃
            </Link>
          )}
          <Link
            href="/company"
            aria-label="Harper 회사 페이지로 이동"
            className="rounded-full border border-neutral-1000-a10 px-3 py-1.5 text-[12px] font-normal text-black/50 transition hover:bg-bg-weak"
          >
            Company
          </Link>
        </div>
      </div>
    </header>
  );
}

function WorkspaceMark({
  companyName,
  logoUrl,
}: {
  companyName: string;
  logoUrl?: string | null;
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="h-10 w-10 rounded-lg border border-neutral-1000-a05 object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-weak text-sm font-medium text-neutral-primary">
      {companyName.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function OrgLoginScreen({
  authenticatedEmail,
  orgId,
}: {
  authenticatedEmail?: string | null;
  orgId?: string | null;
}) {
  const normalizedOrgId = orgId?.trim() ?? "";
  const knownEmail = authenticatedEmail?.trim().toLowerCase() ?? "";
  const hasInvite = Boolean(normalizedOrgId);
  const isAuthenticated = Boolean(knownEmail);
  const invitePreview = useOrgInvitePreview({
    enabled: hasInvite,
    orgId: normalizedOrgId,
  });
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [collectEmail, setCollectEmail] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!collectEmail) return;
    emailInputRef.current?.focus();
  }, [collectEmail]);

  const handleLogin = async () => {
    setLoginPending(true);
    setLoginError(null);
    const next = hasInvite
      ? `/org?orgId=${encodeURIComponent(normalizedOrgId)}`
      : "/org";
    const redirectTo = `${window.location.origin}/auths/callback?next=${encodeURIComponent(next)}`;
    const { error: nextLoginError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (nextLoginError) {
      setLoginError(nextLoginError.message);
      setLoginPending(false);
    }
  };

  const submitAccessRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitPending) return;

    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      setRequestError("Harper 팀과 나눈 내용을 간단히 적어 주세요.");
      return;
    }

    if (!isAuthenticated && !collectEmail) {
      setRequestError(null);
      setCollectEmail(true);
      return;
    }

    const replyEmail = knownEmail || email.trim().toLowerCase();
    if (!replyEmail) {
      setRequestError("답장받을 이메일을 입력해 주세요.");
      return;
    }
    if (!EMAIL_PATTERN.test(replyEmail)) {
      setRequestError("이메일 형식을 확인해 주세요.");
      return;
    }

    setSubmitPending(true);
    setRequestError(null);
    const payload = {
      email: replyEmail,
      message: normalizedMessage,
      pagePath:
        typeof window === "undefined"
          ? "/org"
          : `${window.location.pathname}${window.location.search}`,
    };

    try {
      if (isAuthenticated) {
        await fetchWithInternalAuth<{ ok: true }>("/api/feedback/org-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        const response = await fetch("/api/feedback/org-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const responseBody = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(
            responseBody.error ?? "초대 링크 요청을 보내지 못했습니다."
          );
        }
      }
      setSubmitted(true);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "초대 링크 요청을 보내지 못했습니다."
      );
    } finally {
      setSubmitPending(false);
    }
  };

  const updateMessage = (value: string) => {
    setRequestError(null);
    setMessage(value.split("\n").slice(0, 2).join("\n"));
  };

  const renderInviteContent = () => {
    if (invitePreview.isLoading) {
      return (
        <div className="flex items-center gap-2 text-sm font-normal text-neutral-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          초대 정보를 확인하는 중입니다.
        </div>
      );
    }

    if (invitePreview.error || !invitePreview.data?.workspace) {
      return (
        <div>
          <div className="text-[12px] font-medium text-neutral-soft">
            ORGANIZATION
          </div>
          <h1 className="mt-2.5 text-[16px] font-medium leading-6 tracking-[-0.025em] text-neutral-primary">
            초대 링크를 확인할 수 없습니다.
          </h1>
          <p className="mt-2 text-[13px] font-normal leading-5 text-neutral-muted">
            링크가 잘렸거나 더 이상 유효하지 않을 수 있습니다. 초대한 사람에게
            새 링크를 요청해 주세요.
          </p>
          <Link
            href="/org"
            className="mt-4 inline-flex h-8 items-center justify-center rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 text-[12px] font-medium text-neutral-primary transition hover:bg-bg-weak"
          >
            Organization으로 돌아가기
          </Link>
        </div>
      );
    }

    const workspace = invitePreview.data.workspace;
    return (
      <div>
        <WorkspaceMark
          companyName={workspace.companyName}
          logoUrl={workspace.logoUrl}
        />
        <div className="mt-4 text-[11px] font-medium text-neutral-soft">
          WORKSPACE INVITATION
        </div>
        <h1 className="mt-1.5 text-[16px] font-medium leading-6 tracking-[-0.025em] text-neutral-primary">
          {workspace.companyName} Workspace에 초대받았습니다.
        </h1>
        <p className="mt-2 text-[13px] font-normal leading-5 text-neutral-muted">
          Google 계정으로 계속하면 팀의 Organization에 바로 참여할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => void handleLogin()}
          disabled={loginPending}
          className="mt-5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-neutral-1000 px-3 text-[12px] font-medium text-neutral-00 transition hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loginPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : null}
          Google로 초대 수락하기
        </button>
        {loginError ? (
          <p className="mt-3 text-[12px] font-normal leading-5 text-critical">
            {loginError}
          </p>
        ) : null}
      </div>
    );
  };

  const renderAccessRequestContent = () => {
    if (submitted) {
      return (
        <div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-positive-faded text-positive">
            <Check className="h-4 w-4" />
          </div>
          <h1 className="mt-4 text-[16px] font-medium leading-6 tracking-[-0.025em] text-neutral-primary">
            요청을 보냈습니다.
          </h1>
          <p className="mt-2 text-[13px] font-normal leading-5 text-neutral-muted">
            내용을 확인한 뒤 {knownEmail || email.trim()}로 초대 링크를
            안내드리겠습니다.
          </p>
        </div>
      );
    }

    return (
      <div>
        <h1 className="text-center text-[18px] font-normal leading-6 tracking-[-0.025em] text-neutral-primary">
          {isAuthenticated
            ? "아직 가입된 Workspace가 없습니다."
            : "Harper Workspace"}
        </h1>
        <p className="mt-3 text-center text-[13px] font-light leading-5 text-neutral-muted">
          {isAuthenticated ? (
            <>
              받으신 초대 링크를 통해 접속해주세요.
              <br />
              미팅을 했지만 아직 초대 링크를 받지 못하셨다면 아래를 통해 문의를
              남겨주세요.
            </>
          ) : (
            <>
              현재 초대받은 팀에 한해서 채용을 도와드리고 있습니다.
              <br />
              아래에서 회사이메일로 로그인해주세요.
            </>
          )}
        </p>

        {!isAuthenticated && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => void handleLogin()}
              disabled={loginPending}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-neutral-1000-a05 bg-bg-floating px-4 py-3 text-[14px] font-medium text-neutral-700 shadow-sm transition duration-200 hover:border-neutral-200 hover:shadow-none active:shadow-inner disabled:cursor-not-allowed disabled:opacity-55"
            >
              {loginPending ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Image
                  src="/images/logos/google.png"
                  alt="Google"
                  width={18}
                  height={18}
                />
              )}
              Google로 로그인
            </button>
            {loginError ? (
              <p className="mt-3 text-[12px] font-normal leading-5 text-critical">
                {loginError}
              </p>
            ) : null}
          </div>
        )}

        {isAuthenticated && (
          <form className="mt-6" onSubmit={submitAccessRequest}>
            <textarea
              id="org-access-message"
              rows={2}
              maxLength={800}
              value={message}
              onChange={(event) => updateMessage(event.target.value)}
              placeholder="예: 지난주 AI 엔지니어 채용에 관해 미팅했습니다."
              className="mt-1.5 h-16 w-full resize-none rounded-md bg-black/3 px-2.5 py-2 text-[12px] font-normal leading-5 text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a05"
            />
            <AnimatePresence initial={false}>
              {!isAuthenticated && collectEmail ? (
                <motion.div
                  key="reply-email"
                  initial={{ height: 0, opacity: 0, y: -6 }}
                  animate={{ height: "auto", opacity: 1, y: 0 }}
                  exit={{ height: 0, opacity: 0, y: -6 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <label
                    htmlFor="org-access-email"
                    className="mt-4 block text-[12px] font-medium text-neutral-primary"
                  >
                    답장받을 이메일도 알려주세요.
                  </label>
                  <input
                    ref={emailInputRef}
                    id="org-access-email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    spellCheck={false}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setRequestError(null);
                    }}
                    placeholder="name@company.com"
                    className="mt-1.5 h-8 w-full rounded-md border border-neutral-1000-a10 bg-bg-floating px-2.5 text-[12px] font-normal text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a05"
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            {requestError ? (
              <p className="mt-3 text-[12px] font-normal leading-5 text-critical">
                {requestError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitPending}
              className="mt-1 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-neutral-1000 px-3 text-[12px] font-medium text-neutral-00 transition hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {submitPending && (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              )}
              {!isAuthenticated && !collectEmail
                ? "확인"
                : submitPending
                  ? "제출 중"
                  : "보내기"}
            </button>
          </form>
        )}
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Harper · Organization</title>
      </Head>
      <div className="min-h-screen bg-bg-default text-neutral-primary">
        <OrgEntryAppBar isAuthenticated={isAuthenticated} />
        <main className="flex min-h-[calc(100vh-52px)] items-center justify-center px-4 pb-14">
          <section className="w-full max-w-[400px]">
            {hasInvite ? renderInviteContent() : renderAccessRequestContent()}
          </section>
        </main>
      </div>
    </>
  );
}
