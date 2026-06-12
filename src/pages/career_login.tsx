import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { Loader2, MailCheck } from "lucide-react";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import {
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_UTM_SOURCE_STORAGE_KEY,
  normalizeCareerUtmSource,
} from "@/lib/careerUtm";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

type PartnerLogo = {
  src: string;
  name: string;
  width: number;
  invert?: boolean;
};

const partnerLogos: PartnerLogo[] = [
  { src: "/images/logos/sn.png", name: "snu", width: 78, invert: true },
  { src: "/images/logos/kai.png", name: "kaist", width: 82, invert: true },
  { src: "/images/logos/stan.png", name: "stanford", width: 86, invert: true },
  { src: "/svgs/cohere.svg", name: "cohere", width: 78, invert: true },
  { src: "/svgs/yc.svg", name: "ycombinator", width: 100, invert: true },
  { src: "/images/logos/naver.svg", name: "naver", width: 64, invert: true },
  { src: "/images/logos/moloco.png", name: "moloco", width: 78, invert: true },
];

const resolveSafeNextPath = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
};

const CareerLoginLoadingState = () => (
  <main className="relative flex min-h-svh w-full items-center justify-center bg-bg-basement text-neutral-primary">
    <Loader2 className="h-5 w-5 animate-spin text-neutral-muted" />
    <span className="sr-only">커리어 로그인 페이지 로딩 중</span>
  </main>
);

const CareerLoginContent = () => {
  const router = useRouter();
  const {
    user,
    authLoading,
    authPending,
    authError,
    authInfo,
    handleGoogleLogin,
    handleEmailAuth,
  } = useCareerAuth();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [emailMode, setEmailMode] = useState<"signin" | "signup">("signin");
  const [formError, setFormError] = useState("");

  const nextPath = useMemo(
    () => resolveSafeNextPath(router.query.next) ?? "/career",
    [router.query.next]
  );
  const emailOnboardingTokenParam =
    typeof router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM] === "string"
      ? router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM]
      : "";
  const buildResolvedNextPath = useCallback(() => {
    const inviteToken =
      typeof router.query.invite === "string" ? router.query.invite : "";
    const mail = typeof router.query.mail === "string" ? router.query.mail : "";
    const source =
      typeof router.query.source === "string"
        ? normalizeCareerUtmSource(router.query.source)
        : null;
    const localId =
      typeof router.query.lid === "string" ? router.query.lid.trim() : "";
    const origin =
      typeof window === "undefined"
        ? "https://matchharper.com"
        : window.location.origin;
    const nextUrl = new URL(nextPath, origin);
    if (inviteToken) nextUrl.searchParams.set("invite", inviteToken);
    if (mail) nextUrl.searchParams.set("mail", mail);
    if (source) nextUrl.searchParams.set("source", source);
    if (localId) nextUrl.searchParams.set("lid", localId);
    if (emailOnboardingTokenParam) {
      nextUrl.searchParams.set(
        CAREER_EMAIL_ONBOARDING_TOKEN_PARAM,
        emailOnboardingTokenParam
      );
    }
    return `${nextUrl.pathname}${nextUrl.search}`;
  }, [
    emailOnboardingTokenParam,
    nextPath,
    router.query.invite,
    router.query.lid,
    router.query.mail,
    router.query.source,
  ]);
  const emailConfirmationSent = Boolean(authInfo);
  const submittedEmail = email.trim();

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;

    const source =
      typeof router.query.source === "string"
        ? normalizeCareerUtmSource(router.query.source)
        : null;
    const localId =
      typeof router.query.lid === "string" ? router.query.lid : "";

    if (source) {
      localStorage.setItem(CAREER_UTM_SOURCE_STORAGE_KEY, source);
    }
    if (localId) {
      localStorage.setItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY, localId);
    }
  }, [router.isReady, router.query.lid, router.query.source]);

  useEffect(() => {
    if (authLoading || !user || !router.isReady) return;

    void router.replace(buildResolvedNextPath());
  }, [authLoading, buildResolvedNextPath, router, router.isReady, user]);

  const handleSubmitEmailAuth = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");

    if (!showEmailForm) {
      setShowEmailForm(true);
      return;
    }

    if (emailMode === "signup" && password !== passwordConfirm) {
      setFormError("비밀번호가 일치하지 않습니다.");
      return;
    }

    const ok = await handleEmailAuth({
      mode: emailMode,
      email,
      password,
    });
    if (ok) {
      void router.replace(buildResolvedNextPath());
    }
  };

  if (authLoading || user || !router.isReady) {
    return <CareerLoginLoadingState />;
  }

  return (
    <>
      <Head>
        <title>Harper Career Login</title>
        <link rel="icon" href="/images/logo.ico" />
      </Head>
      <main className="relative flex min-h-svh w-full flex-col overflow-hidden bg-bg-basement text-neutral-primary">
        <div
          className="pointer-events-none absolute inset-x-0 top-[60px] h-[62svh] min-h-[420px] opacity-70"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in srgb, var(--color-neutral-1000) 18%, transparent) 1.2px, transparent 1.2px)",
            backgroundSize: "16px 16px",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 10%, black 78%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 10%, black 78%, transparent 100%)",
          }}
        />

        <header className="relative z-10 flex h-16 w-full items-center px-5 sm:px-8 lg:px-12">
          <div className="mx-auto flex w-full max-w-[1760px] items-center">
            <div className="flex items-center gap-2 text-neutral-primary">
              <Image
                src="/svgs/harper-h-mark.svg"
                alt=""
                width={20}
                height={20}
                aria-hidden="true"
                className="h-5 w-5"
              />
              <Text
                as="span"
                variant="title"
                tone="primary"
                className="font-halant text-[23px] leading-none tracking-[-0.04em]"
              >
                Harper
              </Text>
            </div>
          </div>
        </header>

        <section className="relative z-10 mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center px-4 pt-10 text-center sm:pt-12 md:pt-16">
          <Text
            as="h1"
            variant="display"
            tone="primary"
            className="text-balance text-[26px] font-medium leading-[1.24] tracking-[-0.035em] sm:text-[34px] md:text-[38px]"
          >
            <span className="block sm:inline">당신만을 위한</span>
            <br className="hidden sm:block" />
            <span className="block sm:inline">커리어 에이전트</span>{" "}
            <span className="block sm:inline">Harper</span>
          </Text>
          <Text
            as="p"
            variant="body"
            tone="muted"
            className="mt-4 max-w-[430px] text-xs font-medium leading-5 sm:text-sm"
          >
            하나의 프로필에서 대화, 선호, 추천까지. 인재를 위한 커리어 에이전트
            Harper와 함께 시작하세요.
          </Text>

          <div className="mt-7 w-full max-w-[420px] rounded-[22px] border border-neutral-1000-a05 bg-bg-floating/90 p-4 shadow-[0_18px_54px_rgba(31,28,26,0.07)] backdrop-blur-sm sm:p-6">
            {emailConfirmationSent ? (
              <div
                className="px-1 py-2 text-center"
                role="status"
                aria-live="polite"
              >
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-neutral-1000-a05 bg-bg-floating text-neutral-primary">
                  <MailCheck className="h-4 w-4" />
                </div>
                <Text
                  as="h2"
                  variant="head2"
                  tone="primary"
                  className="mt-4 text-[20px] font-semibold tracking-[-0.04em]"
                >
                  인증 메일을 보냈습니다
                </Text>
                <Text
                  as="p"
                  variant="caption"
                  tone="muted"
                  className="mx-auto mt-3 max-w-[320px] text-[12px] leading-5"
                >
                  {submittedEmail ? `${submittedEmail}로 ` : ""}
                  보낸 메일의 인증 링크를 열어 회원가입을 완료해 주세요. 인증이
                  끝나면 다시 이 페이지로 돌아와 이메일 로그인으로 계속할 수
                  있습니다.
                </Text>
                <Text
                  as="p"
                  variant="caption"
                  tone="subtle"
                  className="mt-2 text-[11px] leading-5"
                >
                  메일이 보이지 않으면 스팸함이나 프로모션함도 확인해 주세요.
                </Text>
              </div>
            ) : (
              <>
                <BareButton
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  disabled={authPending}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-[9px] border border-neutral-1000-a10 bg-bg-floating px-4 text-[14px] font-semibold tracking-[-0.015em] text-neutral-primary outline-none transition hover:border-neutral-400 hover:bg-bg-weak focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {authPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Image
                      src="/images/logos/google.png"
                      alt=""
                      width={16}
                      height={16}
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                  )}
                  <span>
                    {authPending ? "처리 중..." : "Google 계정으로 계속하기"}
                  </span>
                </BareButton>

                <div className="flex h-10 items-center justify-center text-[12px] font-medium text-neutral-soft">
                  또는
                </div>

                <form
                  onSubmit={(event) => void handleSubmitEmailAuth(event)}
                  className="space-y-2.5 text-left"
                >
                  <UiInput
                    unstyled
                    type="email"
                    placeholder="이메일 입력"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setFormError("");
                    }}
                    autoComplete="email"
                    disabled={authPending}
                    className="h-11 w-full rounded-[9px] border border-neutral-1000-a05 bg-bg-floating px-4 text-[13px] font-medium text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />

                  {showEmailForm ? (
                    <>
                      <UiInput
                        unstyled
                        type="password"
                        placeholder="비밀번호 입력"
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setFormError("");
                        }}
                        autoComplete={
                          emailMode === "signin"
                            ? "current-password"
                            : "new-password"
                        }
                        disabled={authPending}
                        className="h-10 w-full rounded-[9px] border border-neutral-1000-a05 bg-bg-floating px-4 text-[13px] font-medium text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:opacity-60"
                        required
                      />
                      {emailMode === "signup" ? (
                        <UiInput
                          unstyled
                          type="password"
                          placeholder="비밀번호 확인"
                          value={passwordConfirm}
                          onChange={(event) => {
                            setPasswordConfirm(event.target.value);
                            setFormError("");
                          }}
                          autoComplete="new-password"
                          disabled={authPending}
                          className="h-10 w-full rounded-[9px] border border-neutral-1000-a05 bg-bg-floating px-4 text-[13px] font-medium text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:opacity-60"
                          required
                        />
                      ) : null}
                    </>
                  ) : null}

                  <BareButton
                    type="submit"
                    disabled={authPending}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-black px-4 text-[14px] font-semibold tracking-[-0.015em] text-neutral-00 outline-none transition hover:bg-neutral-primary focus-visible:ring-2 focus-visible:ring-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    <span>
                      {authPending
                        ? "처리 중..."
                        : !showEmailForm
                          ? "이메일로 계속하기"
                          : emailMode === "signin"
                            ? "로그인"
                            : "회원가입"}
                    </span>
                  </BareButton>

                  {showEmailForm ? (
                    <BareButton
                      type="button"
                      onClick={() => {
                        setFormError("");
                        setPasswordConfirm("");
                        setEmailMode((current) =>
                          current === "signin" ? "signup" : "signin"
                        );
                      }}
                      className="w-full pt-0.5 text-center text-[12px] font-medium text-neutral-muted underline underline-offset-4 transition hover:text-neutral-primary"
                    >
                      {emailMode === "signin"
                        ? "처음이라면 회원가입"
                        : "이미 계정이 있다면 로그인"}
                    </BareButton>
                  ) : null}
                </form>

                {formError || authError ? (
                  <Text
                    as="p"
                    variant="caption"
                    tone="primary"
                    className="mt-3 rounded-[8px] border border-critical/30 bg-critical-faded px-3 py-2 text-left text-[12px] font-medium leading-5 text-critical"
                  >
                    {formError || authError}
                  </Text>
                ) : null}

                <Text
                  as="p"
                  variant="caption"
                  tone="subtle"
                  className="mx-auto mt-4 max-w-[340px] text-center text-[10px] font-medium leading-5"
                >
                  계속 진행하면 Harper의 이용 약관 및 개인정보 처리방침에 동의한
                  것으로 간주됩니다.
                </Text>
              </>
            )}
          </div>
        </section>

        {!emailConfirmationSent ? (
          <section className="relative z-10 mx-auto w-full max-w-[1280px] px-6 pb-7 pt-[12svh] text-center sm:pt-12 md:pb-9">
            <Text
              as="h2"
              variant="label"
              tone="muted"
              className="font-sans text-[13px] font-medium tracking-[-0.02em] sm:text-[14px]"
            >
              이곳의 인재들이 신뢰합니다.
            </Text>
            <div className="mt-6 grid grid-cols-3 items-center justify-center gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-7">
              {partnerLogos.map((logo) => (
                <span
                  key={logo.name}
                  className="relative mx-auto block h-7 opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0"
                  style={{ width: logo.width }}
                >
                  <Image
                    src={logo.src}
                    alt={logo.name}
                    fill
                    sizes={`${logo.width}px`}
                    className="object-contain"
                    style={logo.invert ? { filter: "invert(1)" } : undefined}
                  />
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
};

const CareerLogin = () => {
  return <CareerLoginContent />;
};

export default CareerLogin;
