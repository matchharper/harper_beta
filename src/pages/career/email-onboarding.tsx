import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  MessageSquareText,
  Phone,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import { normalizeCareerUtmSource } from "@/lib/career/utm";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { useAuthStore } from "@/store/useAuthStore";
import Face from "@/components/common/Face";

const COPY: Record<
  Locale,
  {
    authRequired: string;
    backHome: string;
    call: string;
    chat: string;
    claimFailed: string;
    errorTitle: string;
    pageTitle: string;
    loading: string;
    signIn: string;
    title: string;
  }
> = {
  ko: {
    authRequired: "회원가입 후 이어서 진행할 수 있어요.",
    backHome: "홈으로 돌아가기",
    call: "Harper와 통화하기",
    chat: "채팅으로 이어가기",
    claimFailed:
      "메일 링크를 확인할 수 없어요. 받은 메일의 링크로 다시 접속해 주세요.",
    errorTitle: "이어가기 링크를 다시 확인해주세요.",
    pageTitle: "Harper와 이어가기",
    loading: "이어서 준비하고 있어요.",
    signIn: "로그인",
    title: "어떤 방식이 편하신가요?",
  },
  en: {
    authRequired: "Sign up to continue.",
    backHome: "Back to home",
    call: "Talk to Harper",
    chat: "Continue by chat",
    claimFailed:
      "We could not verify this email link. Please open the link from Harper's email again.",
    errorTitle: "Check your continuation link.",
    pageTitle: "Continue with Harper",
    loading: "Preparing your next step.",
    signIn: "Sign in",
    title: "How would you like to continue with Harper?",
  },
};

function getQueryText(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function buildCurrentPath(router: ReturnType<typeof useRouter>) {
  const asPath = router.asPath || "/career/email-onboarding";
  const fallback = "/career/email-onboarding";
  if (!asPath.startsWith("/")) return fallback;

  try {
    const url = new URL(asPath, "https://matchharper.com");
    url.searchParams.delete("mail");
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

function buildCareerStartHref(args: {
  abtestType: string;
  localId: string;
  mode: "call" | "chat";
  source: string;
  token: string;
}) {
  const params = new URLSearchParams({ start: args.mode });
  if (args.token) params.set(CAREER_EMAIL_ONBOARDING_TOKEN_PARAM, args.token);
  if (args.localId) params.set("lid", args.localId);
  if (args.abtestType) params.set("ab", args.abtestType);
  if (args.source) params.set("source", args.source);
  return `/career?${params.toString()}`;
}

export default function CareerEmailOnboardingBridgePage() {
  const router = useRouter();
  const { locale } = useMessages();
  const copy = COPY[locale];
  const authLoading = useAuthStore((state) => state.loading);
  const session = useAuthStore((state) => state.session);
  const user = useAuthStore((state) => state.user);
  const [error, setError] = useState("");
  const [claimReady, setClaimReady] = useState(false);

  const token = getQueryText(router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM]);
  const localId = getQueryText(router.query.lid);
  const abtestType = getQueryText(router.query.ab);
  const source = normalizeCareerUtmSource(getQueryText(router.query.source));

  const loginHref = useMemo(() => {
    const params = new URLSearchParams({
      next: buildCurrentPath(router),
      source: source || "email_onboarding_review",
    });
    if (localId) params.set("lid", localId);
    if (abtestType) params.set("ab", abtestType);
    if (token) params.set(CAREER_EMAIL_ONBOARDING_TOKEN_PARAM, token);
    return `/career_login?${params.toString()}`;
  }, [abtestType, localId, router, source, token]);
  const callHref = useMemo(
    () =>
      buildCareerStartHref({
        abtestType,
        localId,
        mode: "call",
        source: source || "email_onboarding_review",
        token,
      }),
    [abtestType, localId, source, token]
  );
  const chatHref = useMemo(
    () =>
      buildCareerStartHref({
        abtestType,
        localId,
        mode: "chat",
        source: source || "email_onboarding_review",
        token,
      }),
    [abtestType, localId, source, token]
  );

  useEffect(() => {
    if (!router.isReady || authLoading) return;

    if (!token) {
      queueMicrotask(() => setError(copy.claimFailed));
      return;
    }

    if (!user) {
      queueMicrotask(() => setError(copy.authRequired));
      void router.replace(loginHref);
      return;
    }

    const accessToken = session?.access_token;
    if (!accessToken) {
      queueMicrotask(() => setError(copy.authRequired));
      void router.replace(loginHref);
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      setError("");
      setClaimReady(false);
    });

    void (async () => {
      try {
        const response = await fetch("/api/talent/auth/bootstrap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            emailOnboardingToken: token,
            locale,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setError(payload.error || copy.claimFailed);
          return;
        }
        setClaimReady(true);
      } catch {
        if (!cancelled) setError(copy.claimFailed);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    copy.authRequired,
    copy.claimFailed,
    locale,
    loginHref,
    router,
    router.isReady,
    session?.access_token,
    token,
    user,
  ]);

  const isLoading = authLoading || (!error && !claimReady);

  return (
    <>
      <Head>
        <title>{copy.pageTitle}</title>
        <link rel="icon" href="/images/logo.ico" />
      </Head>
      <main
        className="min-h-svh bg-bg-basement text-neutral-primary"
        aria-busy={isLoading || undefined}
      >
        <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-4 sm:px-6">
          <header className="flex h-16 items-center">
            <Link
              href="/"
              aria-label="Harper home"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-bg-weak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
            >
              <Image
                src="/svgs/harper-h-mark.svg"
                alt=""
                width={20}
                height={20}
                className="h-5 w-5"
              />
            </Link>
          </header>

          <section className="grid flex-1 place-items-center pb-20 pt-8 text-center sm:pb-24">
            <div className="flex w-full max-w-[520px] flex-col items-center">
              {isLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex min-h-[190px] flex-col items-center justify-center"
                >
                  <LoaderCircle className="h-5 w-5 animate-spin text-neutral-muted" />
                  <Text as="p" variant="body" tone="muted" className="mt-4">
                    {copy.loading}
                  </Text>
                </div>
              ) : error ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-neutral-1000-a10 bg-bg-floating text-neutral-muted">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <Text
                    as="h1"
                    variant="head1"
                    tone="primary"
                    className="mt-5 max-w-[420px] text-[24px] font-medium leading-[1.28] sm:text-[28px]"
                  >
                    {copy.errorTitle}
                  </Text>
                  <Text
                    as="p"
                    variant="body"
                    tone="muted"
                    className="mt-3 max-w-[420px] text-[14px] leading-6"
                  >
                    {error}
                  </Text>
                  <Button
                    asChild
                    variant="black"
                    size="xl"
                    className="mt-7 min-w-[160px] text-[14px]"
                  >
                    <Link href={token ? loginHref : "/"} prefetch={false}>
                      {token ? copy.signIn : copy.backHome}
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Face size={58} />
                  <Text
                    as="h1"
                    variant="head1"
                    tone="primary"
                    className="mt-4 max-w-[440px] text-[24px] font-normal leading-[1.25] sm:text-[20px]"
                  >
                    {copy.title}
                  </Text>
                  <div className="mt-8 max-w-[300px] flex flex-col items-center justify-center w-full gap-3">
                    <Button
                      asChild
                      variant="primary"
                      size="xl"
                      className="h-11 w-full min-w-0 md:text-[14px] text-[16px] rounded-md font-normal"
                    >
                      <Link href={callHref}>
                        <Phone className="h-4 w-4" />
                        <span className="min-w-0 truncate">{copy.call}</span>
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="secondary"
                      size="xl"
                      className="h-11 w-full min-w-0 bg-bg-floating md:text-[14px] text-[16px] rounded-md font-normal"
                    >
                      <Link href={chatHref}>
                        <MessageSquareText className="h-4 w-4" />
                        <span className="min-w-0 truncate">{copy.chat}</span>
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
