import { useOrgLocale, useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useOrgInvitePreview } from "@/hooks/org/useOrg";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { MuteButton } from "../ui/button";
import { useRouter } from "next/navigation";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function OrgEntryAppBar({ isAuthenticated }: { isAuthenticated: boolean }) {
  const t = useOrgT();
  const router = useRouter();
  const signOut = useAuthStore((state) => state.signOut);
  const [signOutPending, setSignOutPending] = useState(false);

  const handleSignOut = async () => {
    if (signOutPending) return;
    setSignOutPending(true);
    try {
      await signOut();
      router.replace("/company");
    } finally {
      setSignOutPending(false);
    }
  };

  return (
    <header className="h-[52px]">
      <div className="flex h-full items-center justify-between px-3 sm:px-8">
        <Link
          href="/org"
          aria-label={t("OrgLoginScreen.7eba3972", "Harper 회사 페이지로 이동")}
          className="inline-flex items-center rounded-md px-1 py-1 outline-none transition-opacity hover:opacity-65 focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
        >
          <Image
            src="/svgs/logov2.svg"
            alt={t("OrgLoginScreen.362a63ea", "Harper")}
            width={68}
            height={31}
            priority
          />
        </Link>
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <MuteButton
              aria-label={t("OrgLoginScreen.39ffc282", "로그아웃")}
              disabled={signOutPending}
              onClick={() => void handleSignOut()}
              variant="transparent"
            >
              {signOutPending
                ? t("OrgLoginScreen.86020d72", "로그아웃 중")
                : t("OrgLoginScreen.39ffc282", "로그아웃")}
            </MuteButton>
          )}
          <MuteButton
            onClick={() => router.push("/company")}
            size="md"
            variant="default"
          >
            {t("OrgLoginScreen.5670ec7e", "Company")}
          </MuteButton>
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
  const t = useOrgT();
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={t("OrgLoginScreen.af0ba776", "")}
        width={24}
        height={24}
        unoptimized
        className="h-6 w-6 rounded-lg border border-neutral-1000-a05 object-cover"
      />
    );
  }

  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-weak text-sm font-medium text-neutral-primary">
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
  const t = useOrgT();
  const { locale } = useOrgLocale();
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
    const fallbackNext = hasInvite
      ? `/org?orgId=${encodeURIComponent(normalizedOrgId)}`
      : "/org";
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const next =
      window.location.pathname === "/org" ||
      window.location.pathname.startsWith("/org/")
        ? currentPath
        : fallbackNext;
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
      setRequestError(t("OrgLoginScreen.8a25c44c", "Harper 팀과 나눈 내용을 간단히 적어 주세요."));
      return;
    }

    if (!isAuthenticated && !collectEmail) {
      setRequestError(null);
      setCollectEmail(true);
      return;
    }

    const replyEmail = knownEmail || email.trim().toLowerCase();
    if (!replyEmail) {
      setRequestError(t("OrgLoginScreen.bd40208e", "답장받을 이메일을 입력해 주세요."));
      return;
    }
    if (!EMAIL_PATTERN.test(replyEmail)) {
      setRequestError(t("OrgLoginScreen.b08d8e8d", "이메일 형식을 확인해 주세요."));
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
          throw new Error(responseBody.error ?? t("OrgLoginScreen.c22028ec", "초대 링크 요청을 보내지 못했습니다."));
        }
      }
      setSubmitted(true);
    } catch (error) {
      setRequestError(localizedOrgErrorMessage(error, locale, t("OrgLoginScreen.c22028ec", "초대 링크 요청을 보내지 못했습니다.")));
    } finally {
      setSubmitPending(false);
    }
  };

  const updateMessage = (value: string) => {
    setRequestError(null);
    setMessage(value.split("\n").slice(0, 2).join("\n"));
  };

  const renderLoginButton = () => {
    return (
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
            alt={t("OrgLoginScreen.d032699c", "Google")}
            width={18}
            height={18}
          />
        )}
        {t("OrgLoginScreen.19ac59ac", "Google로 로그인")}
      </button>
    );
  };

  const renderInviteContent = () => {
    if (invitePreview.isLoading) {
      return (
        <div className="flex items-center gap-2 text-sm font-normal text-neutral-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {t("OrgLoginScreen.4b4eecbc", "초대 정보를 확인하는 중입니다.")}
        </div>
      );
    }

    if (invitePreview.error || !invitePreview.data?.workspace) {
      return (
        <div>
          <div className="text-[12px] font-medium text-neutral-soft">
            {t("OrgLoginScreen.e8e75376", "ORGANIZATION")}
          </div>
          <h1 className="mt-2.5 text-[16px] font-medium leading-6 tracking-[-0.025em] text-neutral-primary">
            {t("OrgLoginScreen.cfa2774c", "초대 링크를 확인할 수 없습니다.")}
          </h1>
          <p className="mt-2 text-[13px] font-normal leading-5 text-neutral-muted">
            {t("OrgLoginScreen.2ece7000", "링크가 잘렸거나 더 이상 유효하지 않을 수 있습니다. 초대한 사람에게 새 링크를 요청해 주세요.")}
          </p>
          <Link
            href="/org"
            className="mt-4 inline-flex h-8 items-center justify-center rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 text-[12px] font-medium text-neutral-primary transition hover:bg-bg-weak"
          >
            {t("OrgLoginScreen.09ce137c", "Organization으로 돌아가기")}
          </Link>
        </div>
      );
    }

    const workspace = invitePreview.data.workspace;
    return (
      <div>
        <div className="flex items-center gap-2 justify-center">
          <WorkspaceMark
            companyName={workspace.companyName}
            logoUrl={workspace.logoUrl}
          />
          <h1 className="text-[18px] font-normal leading-6 tracking-[-0.025em] text-neutral-primary">
            {workspace.companyName} {t("OrgLoginScreen.01b16a8f", "Workspace")}
          </h1>
        </div>
        <p className="mt-2 text-[14px] font-normal text-center leading-5 text-neutral-muted">
          {t("OrgLoginScreen.a2c2c7d0", "초대를 받은 계정만 해당 워크스페이스에 접근할 수 있습니다.")}
        </p>
        <br />
        {renderLoginButton()}
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
            {t("OrgLoginScreen.e292ea20", "요청을 보냈습니다.")}
          </h1>
          <p className="mt-2 text-[13px] font-normal leading-5 text-neutral-muted">
            {t("OrgLoginScreen.a1d70544", "내용을 확인한 뒤{email}로 초대 링크를 안내드리겠습니다.", {
              email: knownEmail || email.trim(),
            })}
          </p>
        </div>
      );
    }

    return (
      <div>
        <h1 className="text-center text-[18px] font-normal leading-6 tracking-[-0.025em] text-neutral-primary">
          {isAuthenticated ? t("OrgLoginScreen.f33114ed", "아직 가입된 Workspace가 없습니다.") : "Harper Workspace"}
        </h1>
        <p className="mt-3 text-center text-[14px] font-light leading-5 text-neutral-muted">
          {isAuthenticated ? (
            <>
              {t("OrgLoginScreen.a8507ac0", "받으신 초대 링크를 통해 접속해주세요.")}
              <br />
              {t("OrgLoginScreen.062fd580", "미팅을 했지만 아직 초대 링크를 받지 못하셨다면")}
              <br />
              {t("OrgLoginScreen.77d4cd03", "아래를 통해 문의를 남겨주세요.")}
            </>
          ) : (
            <>
              {t("OrgLoginScreen.8055386b", "현재 초대받은 팀에 한해서 채용을 도와드리고 있습니다.")}
              <br />
              {t("OrgLoginScreen.10a8920c", "아래에서 회사이메일로 로그인해주세요.")}
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
                  alt={t("OrgLoginScreen.d032699c", "Google")}
                  width={18}
                  height={18}
                />
              )}
              {t("OrgLoginScreen.19ac59ac", "Google로 로그인")}
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
              placeholder={t("OrgLoginScreen.ba9ea9bb", "예: 지난주 AI 엔지니어 채용에 관해 미팅했습니다.")}
              className="mt-1.5 h-20 w-full resize-none rounded-md bg-black/3 px-2.5 py-2 text-[14px] font-normal leading-5 text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a05"
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
                    {t("OrgLoginScreen.6c83ad23", "답장받을 이메일도 알려주세요.")}
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
                    placeholder={t("OrgLoginScreen.5346243f", "name@company.com")}
                    className="mt-1.5 h-8 w-full rounded-md border border-neutral-1000-a10 bg-bg-floating px-2.5 text-[14px] font-normal text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a05"
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
              className="mt-1 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-neutral-1000 px-3 text-[14px] font-medium text-neutral-00 transition hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {submitPending && (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              )}
              {!isAuthenticated && !collectEmail
                ? t("OrgLoginScreen.2d2c8cf9", "확인")
                : submitPending
                  ? t("OrgLoginScreen.ca1356e7", "제출 중")
                  : t("OrgLoginScreen.e04a3165", "보내기")}
            </button>
          </form>
        )}
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>{t("OrgLoginScreen.2103aec7", "Harper · Organization")}</title>
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

// Self-serve login preserved for the payment launch; currently disabled.
// import Head from "next/head";
// import Image from "next/image";
// import Link from "next/link";
// import { useRouter } from "next/router";
// import { useEffect, useState, type FormEvent } from "react";
// import { LoaderCircle, Mail } from "lucide-react";
// import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
// import { useOrgInvitePreview } from "@/hooks/org/useOrg";
// import { supabase } from "@/lib/supabase";
// import { MuteButton } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { OrgSignupEntry } from "./onboarding/OrgSignupEntry";
//
// export function OrgLoginScreen({
//   authenticatedEmail,
//   orgId,
// }: {
//   authenticatedEmail?: string | null;
//   orgId?: string | null;
// }) {
//   const { locale } = useOrgLocale();
//   const router = useRouter();
//   const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
//   const invitation = useOrgInvitePreview({
//     enabled: Boolean(orgId),
//     orgId: orgId || "",
//   });
//   const [email, setEmail] = useState("");
//   const [pending, setPending] = useState(false);
//   const [error, setError] = useState("");
//   const [sent, setSent] = useState(false);
//   const [cooldown, setCooldown] = useState(0);
//   useEffect(() => {
//     if (!cooldown) return;
//     const id = setTimeout(() => setCooldown((n) => n - 1), 1000);
//     return () => clearTimeout(id);
//   }, [cooldown]);
//   function redirectTo() {
//     const url = new URL(window.location.href);
//     url.searchParams.delete("authError");
//     const next = `${url.pathname}${url.search}`;
//     return `${window.location.origin}/auths/callback?next=${encodeURIComponent(next)}`;
//   }
//   async function google() {
//     setPending(true);
//     setError("");
//     try {
//       const result = await supabase.auth.signInWithOAuth({
//         provider: "google",
//         options: {
//           redirectTo: redirectTo(),
//           queryParams: { prompt: "select_account" },
//         },
//       });
//       if (result.error) throw result.error;
//     } catch {
//       setError(
//         c(
//           "로그인을 시작하지 못했어요. 다시 시도해 주세요.",
//           "Couldn’t start sign-in. Please try again."
//         )
//       );
//       setPending(false);
//     }
//   }
//   async function sendLink(event: FormEvent) {
//     event.preventDefault();
//     if (pending || cooldown) return;
//     setPending(true);
//     setError("");
//     try {
//       const result = await supabase.auth.signInWithOtp({
//         email: email.trim(),
//         options: { emailRedirectTo: redirectTo() },
//       });
//       if (result.error) throw result.error;
//       setSent(true);
//       setCooldown(60);
//     } catch {
//       setError(
//         c(
//           "로그인 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
//           "Couldn’t send a sign-in link. Please try again shortly."
//         )
//       );
//     } finally {
//       setPending(false);
//     }
//   }
//   if (authenticatedEmail) return <OrgSignupEntry email={authenticatedEmail} />;
//   return (
//     <main className="min-h-svh bg-bg-basement text-neutral-primary">
//       <Head>
//         <title>
//           {c("회사 계정으로 시작하기", "Start with your work account")} · Harper
//         </title>
//       </Head>
//       <header className="flex h-20 items-center justify-between px-6 md:px-12">
//         <Link href="/company" className="font-hedvig text-2xl">
//           Harper
//         </Link>
//         <Link href="/pricing" className="text-sm text-neutral-muted">
//           {c("요금제", "Pricing")}
//         </Link>
//       </header>
//       <div className="mx-auto w-full max-w-[420px] px-6 pb-16 pt-16 md:pt-24">
//         <h1 className="text-[28px] font-normal leading-snug tracking-tight">
//           {orgId && invitation.data?.workspace
//             ? c(
//                 `${invitation.data.workspace.companyName}에 참여하세요`,
//                 `Join ${invitation.data.workspace.companyName}`
//               )
//             : c("회사 이메일로\n시작하세요", "Your next hire starts here")}
//         </h1>
//         <p className="mb-9 mt-4 text-sm leading-7 text-neutral-muted">
//           {orgId
//             ? c(
//                 "초대받은 이메일로 로그인해 주세요.",
//                 "Sign in with the email that received your invitation."
//               )
//             : c(
//                 "가입 후 회사 정보를 확인하고 바로 시작할 수 있어요. 처음에는 무료로 이용해 보세요.",
//                 "Confirm your company after signing in, then start for free."
//               )}
//         </p>
//         <MuteButton
//           variant="default"
//           size="lg"
//           className="w-full rounded-full"
//           disabled={pending}
//           onClick={() => void google()}
//         >
//           <Image src="/images/logos/google.png" alt="" width={18} height={18} />
//           {c("Google 회사 계정으로 계속", "Continue with Google")}
//         </MuteButton>
//         <div className="my-4 flex items-center gap-4 text-xs text-neutral-soft">
//           <span className="h-px flex-1 bg-neutral-1000-a10" />
//           {c("또는 이메일로", "or use email")}
//           <span className="h-px flex-1 bg-neutral-1000-a10" />
//         </div>
//         <form onSubmit={(event) => void sendLink(event)} className="space-y-4">
//           <label htmlFor="org-work-email" className="block text-sm">
//             {c("회사 이메일", "Work email")}
//           </label>
//           <Input
//             id="org-work-email"
//             type="email"
//             autoComplete="email"
//             placeholder="you@company.com"
//             required
//             maxLength={254}
//             value={email}
//             onChange={(e) => {
//               setEmail(e.target.value);
//               setSent(false);
//             }}
//             disabled={pending}
//           />
//           <MuteButton
//             type="submit"
//             variant="dark"
//             size="lg"
//             className="w-full rounded-full"
//             disabled={pending || cooldown > 0}
//           >
//             {pending ? (
//               <LoaderCircle className="size-4 animate-spin" />
//             ) : (
//               <Mail className="size-4" />
//             )}
//             {cooldown > 0
//               ? c(`${cooldown}초 후 다시 보내기`, `Resend in ${cooldown}s`)
//               : c("로그인 링크 받기", "Email me a sign-in link")}
//           </MuteButton>
//         </form>
//         {sent ? (
//           <p
//             className="mt-5 text-sm leading-6 text-neutral-muted"
//             role="status"
//           >
//             {c(
//               "메일의 링크를 열어 계속해 주세요. 메일이 보이지 않으면 스팸함도 확인해 주세요.",
//               "Open the link in your email to continue. Check your spam folder if it hasn’t arrived."
//             )}
//           </p>
//         ) : null}
//         {error || (router.query.authError && !pending && !sent) ? (
//           <p className="mt-4 text-sm text-critical" role="alert">
//             {error ||
//               c(
//                 "로그인을 완료하지 못했어요. 다시 로그인하거나 새 이메일 링크를 받아 주세요.",
//                 "Sign-in wasn’t completed. Try again or request a new email link."
//               )}
//           </p>
//         ) : null}
//         <p className="mt-8 text-xs leading-6 text-neutral-soft">
//           {c(
//             "회사 계정으로 로그인하거나 새 계정을 만들게 됩니다.",
//             "You’ll sign in or create a company account."
//           )}{" "}
//           <Link
//             href={`/privacy?lang=${locale}`}
//             className="underline underline-offset-4"
//           >
//             {c("개인정보 처리방침", "Privacy policy")}
//           </Link>
//         </p>
//       </div>
//     </main>
//   );
// }
