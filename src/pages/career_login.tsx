import { useEffect, useMemo, useState, type FormEvent } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Loader2, Mail } from "lucide-react";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { BeigeButton, BeigeInput } from "@/components/ui/beige";

const schoolLogos = [
  { src: "/images/logos/sn.png", name: "서울대학교" },
  { src: "/images/logos/kaist.png", name: "KAIST" },
  { src: "/images/logos/stanford.png", name: "Stanford" },
];

const companyLogos = [
  { src: "/svgs/a16z2.svg", name: "a16z", width: 72 },
  { src: "/svgs/yc.svg", name: "YC", width: 78 },
  { src: "/images/mistral.png", name: "Mistral", width: 82 },
  { src: "/svgs/cohere.svg", name: "Cohere", width: 56 },
];

const resolveSafeNextPath = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
};

const CareerLoginLoadingState = () => (
  <main className="relative flex min-h-screen w-full items-center justify-center bg-beige100 font-geist text-beige900">
    <Loader2 className="h-5 w-5 animate-spin text-beige900/40" />
    <span className="sr-only">커리어 로그인 페이지 로딩 중</span>
  </main>
);

const CareerLogin = () => {
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
  const [emailMode, setEmailMode] = useState<"signin" | "signup">("signin");

  const nextPath = useMemo(
    () => resolveSafeNextPath(router.query.next) ?? "/career",
    [router.query.next]
  );

  useEffect(() => {
    if (authLoading || !user || !router.isReady) return;

    const inviteToken =
      typeof router.query.invite === "string" ? router.query.invite : "";
    const mail = typeof router.query.mail === "string" ? router.query.mail : "";
    const nextUrl = new URL(nextPath, window.location.origin);
    if (inviteToken) nextUrl.searchParams.set("invite", inviteToken);
    if (mail) nextUrl.searchParams.set("mail", mail);

    void router.replace(`${nextUrl.pathname}${nextUrl.search}`);
  }, [
    authLoading,
    nextPath,
    router,
    router.isReady,
    router.query.invite,
    router.query.mail,
    user,
  ]);

  const handleSubmitEmailAuth = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await handleEmailAuth({
      mode: emailMode,
      email,
      password,
    });
    if (ok) {
      void router.replace(nextPath);
    }
  };

  if (authLoading || user || !router.isReady) {
    return <CareerLoginLoadingState />;
  }

  return (
    <>
      <Head>
        <link rel="icon" href="/images/logo.ico" />
      </Head>
      <main className="flex min-h-screen w-full flex-col bg-beige100 px-4 py-5 font-geist text-beige900">
        <div className="mx-auto flex w-full max-w-[1040px] items-center justify-between">
          <button
            type="button"
            onClick={() => void router.push("/network")}
            className="font-halant text-[28px] leading-none tracking-[-0.06em] text-beige900"
          >
            Harper
          </button>
        </div>

        <section className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
          <h1 className="text-center text-3xl font-medium tracking-[-0.04em]">
            Login
          </h1>

          <div className="mt-8 flex flex-col gap-3">
            <BeigeButton
              type="button"
              size="lg"
              variant="primary"
              onClick={() => void handleGoogleLogin()}
              disabled={authPending}
              className="w-full"
            >
              {authPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  처리 중...
                </>
              ) : (
                "구글 로그인"
              )}
            </BeigeButton>

            <BeigeButton
              type="button"
              size="lg"
              variant="outline"
              icon={<Mail className="h-4 w-4" />}
              onClick={() => setShowEmailForm((current) => !current)}
              disabled={authPending}
              className="w-full"
            >
              이메일로 로그인
            </BeigeButton>
          </div>

          {showEmailForm ? (
            <form
              onSubmit={(event) => void handleSubmitEmailAuth(event)}
              className="mt-4 space-y-3 border-t border-beige900/10 pt-4"
            >
              <BeigeInput
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={authPending}
                className="h-11"
              />
              <BeigeInput
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  emailMode === "signin" ? "current-password" : "new-password"
                }
                disabled={authPending}
                className="h-11"
              />
              <BeigeButton
                type="submit"
                size="lg"
                variant="primary"
                disabled={authPending}
                className="w-full"
              >
                {authPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    처리 중...
                  </>
                ) : emailMode === "signin" ? (
                  "로그인"
                ) : (
                  "회원가입"
                )}
              </BeigeButton>
              <button
                type="button"
                onClick={() =>
                  setEmailMode((current) =>
                    current === "signin" ? "signup" : "signin"
                  )
                }
                className="w-full text-center text-sm text-beige900/60 underline underline-offset-4 transition hover:text-beige900"
              >
                {emailMode === "signin"
                  ? "처음이라면 회원가입"
                  : "이미 계정이 있다면 로그인"}
              </button>
            </form>
          ) : null}

          {authError ? (
            <p className="mt-4 border border-xprimary/30 bg-white/45 px-3 py-2 text-sm leading-6 text-xprimary">
              {authError}
            </p>
          ) : null}
          {authInfo ? (
            <p className="mt-3 border border-beige900/10 bg-white/45 px-3 py-2 text-sm leading-6 text-beige900/70">
              {authInfo}
            </p>
          ) : null}
        </section>

        <section className="mx-auto w-full max-w-[760px] pb-6 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-beige900/65">
            <span>100+ engineers and researchers from</span>
            <span className="flex -space-x-2">
              {schoolLogos.map((school) => (
                <span
                  key={school.name}
                  className="inline-flex h-8 w-8 overflow-hidden rounded-full border border-beige900/20 bg-beige500"
                >
                  <img
                    src={school.src}
                    alt={school.name}
                    className="h-full w-full object-cover"
                  />
                </span>
              ))}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 opacity-80">
            {companyLogos.map((logo) => (
              <img
                key={logo.name}
                src={logo.src}
                alt={logo.name}
                width={logo.width}
                height={32}
                className="h-7 w-auto object-contain"
              />
            ))}
          </div>
        </section>
      </main>
    </>
  );
};

export default CareerLogin;
