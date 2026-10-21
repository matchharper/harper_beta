import { useEffect, useRef, useState, type ReactNode } from "react";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, Compass } from "lucide-react";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import { MuteButton } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { useMessages } from "@/i18n/useMessage";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  canSwitchAuthPersonaWithoutLogout,
  getPersonaLoginPath,
  type AuthPersona,
} from "@/lib/authSessionPersona";
import { useAuthStore } from "@/store/useAuthStore";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";

const COPY = {
  ko: {
    loading: "로그인 정보를 확인하고 있어요.",
    talent: "현재 커리어로 로그인되어 있습니다.",
    company: "현재 회사로 로그인되어 있습니다.",
    toTalent: "로그아웃 후 새로 커리어로 로그인하시겠어요?",
    toCompany: "로그아웃 후 새로 회사로 로그인하시겠어요?",
    loginTalent: "로그아웃 후 커리어로 로그인",
    loginCompany: "로그아웃 후 회사로 로그인",
    backTalent: "커리어 화면으로 돌아가기",
    backCompany: "회사 화면으로 돌아가기",
    home: "홈으로 돌아가기",
    pending: "로그아웃 중",
    error: "로그아웃하지 못했어요. 다시 시도해 주세요.",
  },
  en: {
    loading: "Checking your sign-in details.",
    talent: "You're signed in to Career.",
    company: "You're signed in as a company.",
    toTalent: "Would you like to log out and sign in to Career?",
    toCompany: "Would you like to log out and sign in as a company?",
    loginTalent: "Log out and sign in to Career",
    loginCompany: "Log out and sign in as a company",
    backTalent: "Back to Career",
    backCompany: "Back to Company",
    home: "Back to home",
    pending: "Logging out",
    error: "Couldn't log out. Please try again.",
  },
} as const;

export function AuthPersonaGate({
  requiredPersona,
  children,
}: {
  requiredPersona: AuthPersona | null;
  children: ReactNode;
}) {
  const { loading, user, persona, initializeLoginPersona, signOut } =
    useAuthStore();
  const { locale: careerLocale, setLocale: setCareerLocale } = useMessages();
  const { locale: orgLocale, setLocale: setOrgLocale } = useOrgLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState(false);
  const locale = requiredPersona === "company" ? orgLocale : careerLocale;
  const copy = COPY[locale];
  const canSwitchFreely = canSwitchAuthPersonaWithoutLogout(user?.email);

  useEffect(() => {
    if (
      !loading &&
      router.isReady &&
      requiredPersona &&
      user &&
      !persona &&
      !pending
    ) {
      initializeLoginPersona(requiredPersona);
    }
  }, [
    loading,
    router.isReady,
    requiredPersona,
    user,
    persona,
    pending,
    initializeLoginPersona,
  ]);

  if (!requiredPersona) return children;

  // Mount neither workspace nor its data/bootstrap effects until the login matches.
  if (
    loading ||
    !router.isReady ||
    (user && !persona && !pending && !canSwitchFreely)
  ) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-bg-default">
        <Loading label={copy.loading} />
      </main>
    );
  }
  if (!pending && (!user || persona === requiredPersona || canSwitchFreely)) {
    return children;
  }

  const currentLabel = persona ? copy[persona] : copy.pending;
  const isTalentDestination = requiredPersona === "talent";
  const returnPath =
    persona === "talent" ? "/career" : persona === "company" ? "/org" : "/";

  const switchLogin = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(false);
    const loginPath = getPersonaLoginPath(router.asPath, requiredPersona);
    try {
      await signOut({ scope: "local" });
    } catch {
      pendingRef.current = false;
      setPending(false);
      setError(true);
      return;
    }
    queryClient.clear();
    useCompanyUserStore.getState().clear();
    // Reload also clears persona-specific component/store state before signing in.
    window.location.replace(loginPath);
  };

  return (
    <>
      <Head>
        <title>{currentLabel} | Harper</title>
      </Head>
      <div className="flex min-h-svh flex-col bg-bg-default pt-[54px] text-neutral-primary">
        <CareerAppBar
          careerStartHref={returnPath}
          locale={locale}
          sectionHrefPrefix="/"
          bgColor="bg-default"
        />
        <main className="flex flex-1 flex-col items-center justify-center px-5 py-20 min-h-[86vh]">
          <section
            className="w-full max-w-lg text-center"
            aria-labelledby="auth-persona-title"
          >
            <h1
              id="auth-persona-title"
              className="text-balance text-2xl font-medium leading-snug tracking-tight sm:text-[28px]"
            >
              {currentLabel}
            </h1>
            <p className="mt-4 text-xl sm:text-2xl text-neutral-muted">
              {isTalentDestination ? copy.toTalent : copy.toCompany}
            </p>
            <div className="mx-auto mt-20 flex max-w-sm flex-col gap-3">
              <MuteButton
                variant="dark"
                size="lg"
                disabled={pending}
                onClick={() => void switchLogin()}
                aria-busy={pending}
              >
                <span
                  className="flex shrink-0 items-center gap-1.5"
                  aria-hidden="true"
                >
                  {isTalentDestination ? (
                    <Compass className="size-4.5" strokeWidth={1.2} />
                  ) : (
                    <Building2 className="size-4.5" strokeWidth={1.2} />
                  )}
                </span>
                <span className="min-w-[180px]">
                  {pending
                    ? copy.pending
                    : isTalentDestination
                      ? copy.loginTalent
                      : copy.loginCompany}
                </span>
              </MuteButton>
              <MuteButton
                size="lg"
                disabled={pending}
                onClick={() => void router.replace(returnPath)}
              >
                <Image
                  src="/svgs/face.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-4.5"
                />
                <span className="min-w-[170px]">
                  {persona === "talent"
                    ? copy.backTalent
                    : persona === "company"
                      ? copy.backCompany
                      : copy.home}
                </span>
              </MuteButton>
            </div>
            {error && (
              <p role="alert" className="mt-4 text-sm text-critical">
                {copy.error}
              </p>
            )}
          </section>
        </main>
        <CareerLandingFooter
          careerStartHref="/career"
          locale={locale}
          onLocaleChange={(nextLocale) => {
            if (requiredPersona === "company") {
              void setOrgLocale(nextLocale);
            } else {
              setCareerLocale(nextLocale);
            }
          }}
          audience={isTalentDestination ? "talent" : "company"}
        />
      </div>
    </>
  );
}
