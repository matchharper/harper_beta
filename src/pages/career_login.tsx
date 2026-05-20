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

type PartnerLogo = {
  src: string;
  name: string;
  width: number;
  invert?: boolean;
};

const partnerLogos: PartnerLogo[] = [
  { src: "/svgs/a16z2.svg", name: "a16z", width: 58 },
  { src: "/svgs/yc.svg", name: "Y Combinator", width: 72 },
  { src: "/images/mistral.png", name: "Mistral AI", width: 78 },
  { src: "/svgs/cohere.svg", name: "Cohere", width: 76 },
  { src: "/svgs/sequoia2.svg", name: "Sequoia", width: 82 },
  { src: "/svgs/nvidia.svg", name: "NVIDIA", width: 78, invert: true },
];

const resolveSafeNextPath = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
};

const CareerLoginLoadingState = () => (
  <main className="relative flex min-h-svh w-full items-center justify-center bg-[#fbfaf7] font-geist text-[#171513]">
    <Loader2 className="h-5 w-5 animate-spin text-[#21170d]/40" />
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
    const origin =
      typeof window === "undefined"
        ? "https://matchharper.com"
        : window.location.origin;
    const nextUrl = new URL(nextPath, origin);
    if (inviteToken) nextUrl.searchParams.set("invite", inviteToken);
    if (mail) nextUrl.searchParams.set("mail", mail);
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
    router.query.mail,
  ]);
  const emailConfirmationSent = Boolean(authInfo);
  const submittedEmail = email.trim();

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
      <main className="relative flex min-h-svh w-full flex-col overflow-hidden bg-beige50 font-geist text-beige900">
        <div
          className="pointer-events-none absolute inset-x-0 top-[60px] h-[62svh] min-h-[420px] opacity-70"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(45, 24, 16, 0.18) 1.2px, transparent 1.2px)",
            backgroundSize: "16px 16px",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 10%, black 78%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 10%, black 78%, transparent 100%)",
          }}
        />

        <header className="relative z-10 flex h-16 w-full items-center px-5 sm:px-8 lg:px-12">
          <div className="mx-auto flex w-full max-w-[1760px] items-center">
            <div className="flex items-center gap-2 text-[#21170d]">
              <Image
                src="/svgs/harper-h-mark.svg"
                alt=""
                width={20}
                height={20}
                aria-hidden="true"
                className="h-5 w-5"
              />
              <span className="font-halant text-[23px] leading-none tracking-[-0.04em]">
                Harper
              </span>
            </div>
          </div>
        </header>

        <section className="relative z-10 mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center px-4 pt-10 text-center sm:pt-12 md:pt-16">
          <h1 className="text-balance text-[26px] font-medium leading-[1.08] tracking-[-0.035em] text-[#111111] sm:text-[34px] md:text-[38px]">
            <span className="block sm:inline">나에게 맞는</span>
            <span className="block sm:inline">기회를 찾기까지</span>
            <br className="hidden sm:block" />
            <span className="block">60초면 충분합니다</span>
          </h1>
          <p className="mt-4 max-w-[430px] text-xs font-medium leading-5 text-[#21170d]/68 sm:text-sm">
            하나의 프로필에서 대화, 선호, 추천까지. 인재를 위한 커리어 에이전트
            Harper와 함께 시작하세요.
          </p>

          <div className="mt-7 w-full max-w-[420px] rounded-[22px] border border-[#21170d]/10 bg-[#fbfaf7]/88 p-4 shadow-[0_18px_54px_rgba(45,24,16,0.07)] backdrop-blur-sm sm:p-6">
            {emailConfirmationSent ? (
              <div
                className="px-1 py-2 text-center"
                role="status"
                aria-live="polite"
              >
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-[#21170d]/10 bg-white/70 text-[#21170d]">
                  <MailCheck className="h-4 w-4" />
                </div>
                <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.04em]">
                  인증 메일을 보냈습니다
                </h2>
                <p className="mx-auto mt-3 max-w-[320px] text-[12px] leading-5 text-[#21170d]/65">
                  {submittedEmail ? `${submittedEmail}로 ` : ""}
                  보낸 메일의 인증 링크를 열어 회원가입을 완료해 주세요. 인증이
                  끝나면 다시 이 페이지로 돌아와 이메일 로그인으로 계속할 수
                  있습니다.
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#21170d]/48">
                  메일이 보이지 않으면 스팸함이나 프로모션함도 확인해 주세요.
                </p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  disabled={authPending}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-[9px] border border-[#21170d]/16 bg-white/70 px-4 text-[14px] font-semibold tracking-[-0.015em] text-[#26211c] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none transition hover:border-[#21170d]/28 hover:bg-white focus-visible:ring-2 focus-visible:ring-[#21170d]/20 disabled:cursor-not-allowed disabled:opacity-60"
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
                </button>

                <div className="flex h-10 items-center justify-center text-[12px] font-medium text-[#21170d]/38">
                  또는
                </div>

                <form
                  onSubmit={(event) => void handleSubmitEmailAuth(event)}
                  className="space-y-2.5 text-left"
                >
                  <input
                    type="email"
                    placeholder="이메일 입력"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setFormError("");
                    }}
                    autoComplete="email"
                    disabled={authPending}
                    className="h-11 w-full rounded-[9px] border border-[#21170d]/12 bg-white/64 px-4 text-[13px] font-medium text-[#21170d] outline-none transition placeholder:text-[#21170d]/34 focus:border-[#21170d]/28 focus:bg-white focus:ring-2 focus:ring-[#21170d]/8 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />

                  {showEmailForm ? (
                    <>
                      <input
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
                        className="h-10 w-full rounded-[9px] border border-[#21170d]/12 bg-white/64 px-4 text-[13px] font-medium text-[#21170d] outline-none transition placeholder:text-[#21170d]/34 focus:border-[#21170d]/28 focus:bg-white focus:ring-2 focus:ring-[#21170d]/8 disabled:cursor-not-allowed disabled:opacity-60"
                        required
                      />
                      {emailMode === "signup" ? (
                        <input
                          type="password"
                          placeholder="비밀번호 확인"
                          value={passwordConfirm}
                          onChange={(event) => {
                            setPasswordConfirm(event.target.value);
                            setFormError("");
                          }}
                          autoComplete="new-password"
                          disabled={authPending}
                          className="h-10 w-full rounded-[9px] border border-[#21170d]/12 bg-white/64 px-4 text-[13px] font-medium text-[#21170d] outline-none transition placeholder:text-[#21170d]/34 focus:border-[#21170d]/28 focus:bg-white focus:ring-2 focus:ring-[#21170d]/8 disabled:cursor-not-allowed disabled:opacity-60"
                          required
                        />
                      ) : null}
                    </>
                  ) : null}

                  <button
                    type="submit"
                    disabled={authPending}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-[#111111] px-4 text-[14px] font-semibold tracking-[-0.015em] text-white shadow-[0_10px_24px_rgba(17,17,17,0.12)] outline-none transition hover:bg-[#252525] focus-visible:ring-2 focus-visible:ring-[#111111]/25 disabled:cursor-not-allowed disabled:opacity-60"
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
                  </button>

                  {showEmailForm ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFormError("");
                        setPasswordConfirm("");
                        setEmailMode((current) =>
                          current === "signin" ? "signup" : "signin"
                        );
                      }}
                      className="w-full pt-0.5 text-center text-[12px] font-medium text-[#21170d]/54 underline underline-offset-4 transition hover:text-[#21170d]"
                    >
                      {emailMode === "signin"
                        ? "처음이라면 회원가입"
                        : "이미 계정이 있다면 로그인"}
                    </button>
                  ) : null}
                </form>

                {formError || authError ? (
                  <p className="mt-3 rounded-[8px] border border-[#d35400]/25 bg-white/70 px-3 py-2 text-left text-[12px] font-medium leading-5 text-[#c44900]">
                    {formError || authError}
                  </p>
                ) : null}

                <p className="mx-auto mt-4 max-w-[340px] text-center text-[10px] font-medium leading-5 text-[#21170d]/46">
                  계속 진행하면 Harper의 이용 약관 및 개인정보 처리방침에 동의한
                  것으로 간주됩니다.
                </p>
              </>
            )}
          </div>
        </section>

        {!emailConfirmationSent ? (
          <section className="relative z-10 mx-auto w-full max-w-[1280px] px-6 pb-7 pt-10 text-center sm:pt-12 md:pb-9">
            <h2 className="font-halant text-[17px] font-medium leading-tight tracking-[-0.02em] text-[#21170d] sm:text-[19px]">
              Harper 네트워크에서 만나는 팀
            </h2>
            <div className="mt-6 grid grid-cols-2 items-center gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
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
