import { ArrowUp, LoaderCircle, MapPin } from "lucide-react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MuteButton } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { rememberShareLink } from "@/hooks/org/useShareLinkClaim";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { SHARE_LINK_ORG_PARAM, type ShareLinkCta, type ShareLinkPage } from "@/lib/shareLinks/shared";

type Props = { page: ShareLinkPage | null };

const COPY = {
  ko: {
    intro: (name: string, posting: string) => `‘${posting}’에 지원한 ${name}님을 소개할게요.`,
    fit: "이 공고에 맞는 이유",
    career: "최근 경력",
    wants: "찾고 있는 일",
    chips: { salary: "희망 연봉은?", start: "언제부터 가능?", schedule: "일정 잡기", more: "후보 더 검토하기" },
    placeholder: (name: string) => `${name}님에 대해 더 물어보기`,
    send: "보내기",
    posting: "공고 보기",
    sheetTitle: "무료 · 구글로 10초",
    sheetLines: (name: string) => [
      `${name}님 후보 요약과 지원 내용을 계속 볼 수 있어요.`,
      "궁금한 점은 Harper가 바로 답해요.",
      "이 공고에 맞는 후보를 더 찾아 드려요.",
    ],
    google: "구글로 계속하기",
    free: "회사 이메일 계정으로 로그인해 주세요.",
    email: {
      open: "이메일로 계속하기",
      divider: "또는",
      emailPlaceholder: "회사 이메일",
      passwordPlaceholder: "비밀번호",
      passwordConfirmPlaceholder: "비밀번호 확인",
      signUp: "회원가입",
      signIn: "로그인",
      toSignIn: "이미 계정이 있다면 로그인",
      toSignUp: "처음이라면 회원가입",
      required: "이메일과 비밀번호를 입력해 주세요.",
      mismatch: "비밀번호가 일치하지 않아요.",
      registered: "이미 가입된 이메일이에요. 로그인으로 계속해 주세요.",
      signinFailed: "이메일 혹은 비밀번호가 올바르지 않아요.",
      notConfirmed: "아직 이메일 인증이 끝나지 않았어요. 받은 메일의 링크를 먼저 열어 주세요.",
      shortPassword: "비밀번호는 6자 이상이어야 해요.",
      rateLimited: "잠시 후 다시 시도해 주세요.",
      failed: "처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
      sentTitle: "인증 메일을 보냈어요",
      sent: (email: string) => `${email}로 보낸 메일의 링크를 열면 가입이 끝나고, 이 후보를 이어서 볼 수 있어요.`,
      sentHelp: "메일이 보이지 않으면 스팸함도 확인해 주세요.",
    },
    gone: "더 이상 볼 수 없는 링크예요",
    goneBody: "기간이 지났거나 후보가 공유를 멈췄어요.",
    home: "Harper 알아보기",
  },
  en: {
    intro: (name: string, posting: string) => `Meet ${name}, who applied for ${posting}.`,
    fit: "Why they fit this role",
    career: "Recent experience",
    wants: "What they’re looking for",
    chips: { salary: "Expected salary?", start: "Available from?", schedule: "Schedule a call", more: "Review more candidates" },
    placeholder: (name: string) => `Ask more about ${name}`,
    send: "Send",
    posting: "View posting",
    sheetTitle: "Free · 10 seconds with Google",
    sheetLines: (name: string) => [
      `Keep ${name}’s summary and application in one place.`,
      "Harper answers your questions right away.",
      "Harper finds more candidates for this role.",
    ],
    google: "Continue with Google",
    free: "Use your work email account.",
    email: {
      open: "Continue with email",
      divider: "or",
      emailPlaceholder: "Work email",
      passwordPlaceholder: "Password",
      passwordConfirmPlaceholder: "Confirm password",
      signUp: "Sign up",
      signIn: "Sign in",
      toSignIn: "Already have an account? Sign in",
      toSignUp: "New here? Sign up",
      required: "Enter your email and password.",
      mismatch: "Passwords do not match.",
      registered: "This email is already registered. Sign in instead.",
      signinFailed: "The email or password is incorrect.",
      notConfirmed: "Your email isn’t confirmed yet. Open the link in the email we sent first.",
      shortPassword: "Use at least 6 characters for the password.",
      rateLimited: "Please try again in a moment.",
      failed: "Something went wrong. Please try again.",
      sentTitle: "Check your email",
      sent: (email: string) => `Open the link we sent to ${email} to finish signing up and keep reviewing this candidate.`,
      sentHelp: "If you don’t see it, check your spam folder.",
    },
    gone: "This link is no longer available",
    goneBody: "It expired, or the candidate stopped sharing it.",
    home: "About Harper",
  },
} as const;

const CHIPS: Array<Exclude<ShareLinkCta, "ask">> = ["salary", "start", "schedule", "more"];

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function report(token: string, event: "open" | "cta", cta?: ShareLinkCta) {
  void authHeaders().then((headers) =>
    fetch("/api/share-links/event", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ token, event, cta: cta ?? null }),
      keepalive: true,
    }).catch(() => undefined)
  );
}

function HarperMessage({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3">
      <Image alt="Harper" className="rounded-full" height={28} src="/images/squareface.png" width={28} />
      <div className="min-w-0">
        <p className="mb-1 text-[12px] leading-5 text-neutral-700">Harper</p>
        <div className="break-keep text-[15px] leading-[1.72] text-neutral-primary md:text-[15.5px] md:leading-[1.75]">
          {children}
        </div>
      </div>
    </div>
  );
}

function Lines({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-neutral-soft">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Gone({ language }: { language: "ko" | "en" }) {
  const copy = COPY[language];
  return (
    <main className="flex min-h-svh items-center justify-center bg-bg-basement px-4 text-neutral-primary">
      <div className="w-full max-w-[440px] text-center">
        <h1 className="text-[20px] font-medium">{copy.gone}</h1>
        <p className="mt-2 text-[13px] text-neutral-muted">{copy.goneBody}</p>
        <MuteButton asChild className="mt-6" variant="neutral">
          <Link href="/company">{copy.home}</Link>
        </MuteButton>
      </div>
    </main>
  );
}

/**
 * Where a 후보자 링크 lands (/c/<token>): Harper introduces the candidate to the company the candidate wrote
 * to, without an account. A question (button or typed) asks the company to sign up, then /org?share=<token>
 * puts the candidate on the posting's Role and opens them there. Not indexed.
 */
type EmailCopy = (typeof COPY)[keyof typeof COPY]["email"];

/** Supabase's sign-up/sign-in errors, in the company's words (same cases as the Career email login). */
function emailAuthError(error: unknown, mode: "signup" | "signin", copy: EmailCopy) {
  const detail = error as { code?: string; message?: string; status?: number } | null;
  const text = `${detail?.code ?? ""} ${detail?.message ?? ""}`.toLowerCase();
  if (mode === "signin" && (text.includes("invalid") || detail?.status === 400)) return copy.signinFailed;
  if (text.includes("not confirmed") || text.includes("email_not_confirmed")) return copy.notConfirmed;
  if (mode === "signup" && (text.includes("already") || text.includes("registered"))) return copy.registered;
  if (text.includes("password") && text.includes("6")) return copy.shortPassword;
  if (text.includes("rate limit") || text.includes("too many") || detail?.status === 429) return copy.rateLimited;
  return copy.failed;
}

const INPUT = "h-11 w-full rounded-xl border border-neutral-1000-a05 bg-bg-floating px-4 text-[14px] text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a05 disabled:opacity-60";

/**
 * For a company that does not sign in with Google: email and password, the same way Harper's other email logins
 * work. A new account confirms its address by mail; the mail's link comes back to the same /org?share= page.
 */
function EmailSignIn({ copy, next, disabled }: { copy: EmailCopy; next: () => string; disabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="mt-3 w-full text-center text-[13px] text-neutral-muted underline underline-offset-4 transition hover:text-neutral-primary disabled:opacity-55"
      >
        {copy.open}
      </button>
    );
  }
  if (sentTo) {
    return (
      <div className="mt-4 rounded-xl bg-bg-weak px-4 py-3 text-[13px] leading-5 text-neutral-primary">
        <p className="font-medium">{copy.sentTitle}</p>
        <p className="mt-1">{copy.sent(sentTo)}</p>
        <p className="mt-1 text-neutral-muted">{copy.sentHelp}</p>
      </div>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const address = email.trim();
    if (!address || !password) return setError(copy.required);
    if (mode === "signup" && password !== confirm) return setError(copy.mismatch);
    setPending(true);
    setError(null);
    try {
      const target = next();
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: address,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auths/callback?next=${encodeURIComponent(target)}` },
        });
        if (signUpError) throw signUpError;
        // Supabase answers an address that already has an account with a user without identities.
        if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) {
          setMode("signin");
          setError(copy.registered);
          return;
        }
        if (!data.session) {
          setSentTo(address);
          return;
        }
        useAuthStore.getState().setLoginPersona(data.session, "company");
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: address, password });
        if (signInError) throw signInError;
        useAuthStore.getState().setLoginPersona(data.session, "company");
      }
      void router.push(target);
    } catch (caught) {
      setError(emailAuthError(caught, mode, copy));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-2">
      <div className="flex items-center gap-3 pb-1 text-[12px] text-neutral-soft">
        <span className="h-px flex-1 bg-neutral-1000-a05" aria-hidden />
        {copy.divider}
        <span className="h-px flex-1 bg-neutral-1000-a05" aria-hidden />
      </div>
      <input
        type="email"
        autoComplete="email"
        placeholder={copy.emailPlaceholder}
        value={email}
        onChange={(event) => { setEmail(event.target.value); setError(null); }}
        disabled={pending}
        className={INPUT}
        required
      />
      <input
        type="password"
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        placeholder={copy.passwordPlaceholder}
        value={password}
        onChange={(event) => { setPassword(event.target.value); setError(null); }}
        disabled={pending}
        className={INPUT}
        required
      />
      {mode === "signup" ? (
        <input
          type="password"
          autoComplete="new-password"
          placeholder={copy.passwordConfirmPlaceholder}
          value={confirm}
          onChange={(event) => { setConfirm(event.target.value); setError(null); }}
          disabled={pending}
          className={INPUT}
          required
        />
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-surface-inverse px-4 py-3 text-[14px] font-medium text-neutral-00 transition hover:bg-neutral-primary disabled:cursor-not-allowed disabled:opacity-55"
      >
        {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
        {mode === "signup" ? copy.signUp : copy.signIn}
      </button>
      <button
        type="button"
        onClick={() => { setMode((current) => (current === "signup" ? "signin" : "signup")); setConfirm(""); setError(null); }}
        className="w-full pt-1 text-center text-[12px] text-neutral-muted underline underline-offset-4 transition hover:text-neutral-primary"
      >
        {mode === "signup" ? copy.toSignIn : copy.toSignUp}
      </button>
      {error ? <p role="alert" className="text-center text-[13px] text-critical">{error}</p> : null}
    </form>
  );
}

export default function ShareLinkPageView({ page }: Props) {
  const router = useRouter();
  const [signInOpen, setSignInOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const chosen = useRef<ShareLinkCta | null>(null);
  const token = page?.token ?? "";

  // Counted after the page has been on screen for a second (mail scanners do not run it), once per tab.
  useEffect(() => {
    if (!token) return;
    const key = `harper:share-link-open:${token}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
    } catch {
      // Count it anyway.
    }
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      try {
        window.sessionStorage.setItem(key, "1");
      } catch {
        // Counted; a reload may count again.
      }
      report(token, "open");
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [token]);

  if (!page) return <Gone language={router.locale === "en" ? "en" : "ko"} />;
  const copy = COPY[page.language];
  const { snapshot } = page;
  const orgHref = (cta: ShareLinkCta) =>
    `/org?${new URLSearchParams({ [SHARE_LINK_ORG_PARAM]: token, cta, utm_source: "harper_share_link", utm_medium: "email" })}`;

  const choose = async (cta: ShareLinkCta, text?: string) => {
    chosen.current = cta;
    report(token, "cta", cta);
    rememberShareLink(token, cta, text);
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    // Already signed in: straight to the company's workspace.
    if (data.session) {
      void router.push(orgHref(cta));
      return;
    }
    setError(null);
    setSignInOpen(true);
  };

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = question.trim();
    if (text) void choose("ask", text);
  };

  const signIn = async () => {
    setPending(true);
    setError(null);
    const next = orgHref(chosen.current ?? "more");
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auths/callback?next=${encodeURIComponent(next)}` },
    });
    if (signInError) {
      setError(signInError.message);
      setPending(false);
    }
  };

  const meta = [snapshot.headline, snapshot.location].filter(Boolean);

  return (
    <>
      <Head>
        <title>{page.language === "ko" ? `${snapshot.name} 후보 요약 · Harper` : `${snapshot.name} · Harper`}</title>
        <meta key="robots" name="robots" content="noindex,nofollow" />
        <link rel="icon" href="/images/logo.ico" />
      </Head>
      <div className="flex min-h-svh flex-col bg-bg-basement text-neutral-primary">
        <header className="sticky top-0 z-10 border-b border-neutral-1000-a05 bg-bg-basement/90 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between px-4">
            <Link href="/company" className="flex items-center">
              <Image src="/svgs/logov2.svg" alt="Harper" width={64} height={29} priority />
            </Link>
            {page.posting.url ? (
              <a
                className="text-[13px] text-neutral-muted underline-offset-4 hover:underline"
                href={page.posting.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {copy.posting}
              </a>
            ) : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-40 pt-6 md:pt-10">
          <div className="space-y-6">
            <HarperMessage>
              <p>{copy.intro(snapshot.name, page.posting.title)}</p>
              <div className="mt-3 rounded-card border border-neutral-1000-a05 bg-bg-floating px-4 py-3">
                <p className="text-[15px] font-medium">{snapshot.name}</p>
                {meta.length ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-neutral-muted">
                    {snapshot.location ? <MapPin aria-hidden className="size-3.5 shrink-0" /> : null}
                    {meta.join(" · ")}
                  </p>
                ) : null}
                <p className="mt-2 text-[14px] leading-6">{snapshot.summary}</p>
              </div>
            </HarperMessage>
            {snapshot.fit.length ? (
              <HarperMessage>
                <p className="font-medium">{copy.fit}</p>
                <Lines items={snapshot.fit} />
              </HarperMessage>
            ) : null}
            {snapshot.career.length ? (
              <HarperMessage>
                <p className="font-medium">{copy.career}</p>
                <Lines items={snapshot.career} />
              </HarperMessage>
            ) : null}
            {snapshot.wants.length ? (
              <HarperMessage>
                <p className="font-medium">{copy.wants}</p>
                <Lines items={snapshot.wants} />
              </HarperMessage>
            ) : null}
          </div>
        </main>

        <div className="fixed inset-x-0 bottom-0 z-10 bg-linear-to-t from-bg-basement via-bg-basement/95 to-bg-basement/0 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
          <div className="mx-auto max-w-[760px] px-4">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              {CHIPS.map((cta) => (
                <MuteButton key={cta} className="shrink-0 rounded-full px-3" variant="raised" onClick={() => void choose(cta)}>
                  {copy.chips[cta]}
                </MuteButton>
              ))}
            </div>
            <form
              onSubmit={submitQuestion}
              className="flex items-center gap-2 rounded-composer border-(length:--composer-border-width) border-composer-border-mobile bg-composer bg-composer-image px-4 py-2 font-composer text-composer-foreground shadow-(--shadow-composer) backdrop-blur-composer md:border-composer-border"
            >
              <label className="sr-only" htmlFor="share-link-question">{copy.placeholder(snapshot.name)}</label>
              <input
                id="share-link-question"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-neutral-soft"
                maxLength={1_000}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={copy.placeholder(snapshot.name)}
                value={question}
              />
              <MuteButton aria-label={copy.send} disabled={!question.trim()} size="sm" type="submit" variant="dark" className="rounded-full">
                <ArrowUp aria-hidden className="size-4" />
              </MuteButton>
            </form>
          </div>
        </div>
      </div>

      <ResponsiveDialog
        open={signInOpen}
        onOpenChange={(open) => {
          if (!pending) setSignInOpen(open);
        }}
        title={copy.sheetTitle}
      >
        <div className="pb-2">
          <ul className="space-y-2 text-[14px] leading-6 text-neutral-primary">
            {copy.sheetLines(snapshot.name).map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-neutral-soft" />
                {line}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void signIn()}
            disabled={pending}
            className="mt-6 inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-neutral-1000-a05 bg-bg-floating px-4 py-3.5 text-[15px] font-medium text-neutral-700 shadow-(--shadow-sm) transition duration-200 hover:border-neutral-200 hover:shadow-none active:shadow-inner disabled:cursor-not-allowed disabled:opacity-55"
          >
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
            ) : (
              <Image src="/images/logos/google.png" alt="" width={18} height={18} />
            )}
            {copy.google}
          </button>
          <EmailSignIn copy={copy.email} next={() => orgHref(chosen.current ?? "more")} disabled={pending} />
          <p className="mt-3 text-center text-[12px] text-neutral-muted">{copy.free}</p>
          {error ? (
            <p role="alert" className="mt-2 text-center text-[13px] text-critical">
              {error}
            </p>
          ) : null}
        </div>
      </ResponsiveDialog>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const token = typeof context.params?.token === "string" ? context.params.token : "";
  const { readShareLinkPage } = await import("@/lib/shareLinks/page.server");
  const page = await readShareLinkPage(token).catch((error: unknown) => {
    console.error("[c] could not read the link", error);
    return null;
  });
  context.res.setHeader("Cache-Control", "private, no-store");
  context.res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!page) context.res.statusCode = 404;
  return { props: { page } };
};
