"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/router";
import { LoaderCircle } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import GradientBackground from "@/components/landing/GradientBackground";
import Header from "@/components/landing/Header";
import {
  RequestAccessForm,
  type RequestAccessValues,
} from "@/components/Modal/RequestAccessModal";
import { showToast } from "@/components/toast/toast";
import { useCountryMessages } from "@/i18n/useCountryMessage";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuthStore } from "@/store/useAuthStore";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { handleContactUs } from "@/utils/info";

const LoginModal = dynamic(() => import("@/components/Modal/LoginModal"));

type InviteStatus =
  | "idle"
  | "needs_login"
  | "redeeming"
  | "needs_name"
  | "error";

const INVITE_FLOW_COPY = {
  ko: {
    title: "Invitation Access",
    description:
      "초대 링크가 확인되었습니다. 로그인만 완료하면 바로 Harper를 사용할 수 있습니다.",
    loginPrompt:
      "초대 링크가 확인되었습니다. 로그인 후 접근 권한을 바로 열어드리겠습니다.",
    loginCta: "로그인하여 계속",
    processing: "초대 코드를 적용하고 있습니다.",
    success: "접근 권한이 확인되었습니다. Harper로 이동합니다.",
    retry: "다시 시도",
    exhausted: "이 초대 코드는 더 이상 사용할 수 없습니다.",
    bootstrapFailed:
      "계정 초기화에 실패했습니다. 다시 로그인한 뒤 시도해 주세요.",
    genericError:
      "초대 코드 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    missingName:
      "접근 권한을 열기 전에 사용할 이름이 필요합니다. 이름을 입력해 주세요.",
    nameLabel: "이름",
    namePlaceholder: "이름을 입력해 주세요",
    nameSubmit: "이름 저장 후 계속",
  },
  en: {
    title: "Invitation Access",
    description:
      "Your invite link has been verified. Log in and we'll unlock Harper right away.",
    loginPrompt:
      "Your invite link is ready. Log in and we'll activate access immediately.",
    loginCta: "Log in to continue",
    processing: "Applying your invite code.",
    success: "Access confirmed. Redirecting to Harper.",
    retry: "Try again",
    exhausted: "This invite code is no longer available.",
    bootstrapFailed:
      "We couldn't initialize your account. Please sign in again.",
    genericError:
      "Something went wrong while processing your invite. Please try again.",
    missingName:
      "We need your name before activating access. Please enter it below.",
    nameLabel: "Name",
    namePlaceholder: "Enter your name",
    nameSubmit: "Save name and continue",
  },
} as const;

const isMissingDisplayName = (name?: string | null) => {
  const normalized = (name ?? "").trim();
  return !normalized || normalized.toLowerCase() === "anonymous";
};

export default function InvitationPage() {
  const router = useRouter();
  const [landingId, setLandingId] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isOpenLoginModal, setIsOpenLoginModal] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>("idle");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteName, setInviteName] = useState("");
  const { m, countryLang, locale } = useCountryMessages();

  const interactiveRef = useRef<HTMLDivElement>(null);
  const hasLoggedEnterRef = useRef(false);
  const hasPromptedInviteLoginRef = useRef(false);
  const autoRedeemKeyRef = useRef("");
  const isMobile = useIsMobile();
  const { user, loading: authLoading } = useAuthStore();
  const { companyUser, load } = useCompanyUserStore();
  const inviteCopy = INVITE_FLOW_COPY[locale];

  const inviteCode = useMemo(() => {
    if (!router.isReady) return "";
    const raw = router.query.code;
    return typeof raw === "string" ? raw.trim() : "";
  }, [router.isReady, router.query.code]);

  const addLog = useCallback(
    async (type: string) => {
      const body = {
        local_id: landingId,
        type,
        is_mobile: isMobile,
        country_lang: countryLang,
      };
      await supabase.from("landing_logs").insert(body);
    },
    [countryLang, isMobile, landingId]
  );

  useEffect(() => {
    const localId = localStorage.getItem("harper_landing_id_0209");
    if (localId) {
      setLandingId(localId);
    }
  }, []);

  useEffect(() => {
    if (!landingId || hasLoggedEnterRef.current) return;

    hasLoggedEnterRef.current = true;
    const emailSuffix = companyUser?.email ? `:${companyUser.email}` : "";
    void addLog(`request_access_enter_${emailSuffix}`);
  }, [addLog, companyUser?.email, landingId]);

  useEffect(() => {
    if (!companyUser?.is_authenticated) return;

    if (landingId) {
      const emailSuffix = companyUser?.email ? `${companyUser.email}` : "";
      void addLog(`enter_my_page_${emailSuffix}`);
    }

    void router.push("/my");
  }, [
    addLog,
    companyUser?.email,
    companyUser?.is_authenticated,
    landingId,
    router,
  ]);

  const resolveInviteName = useCallback(
    (overrideName?: string) => {
      const normalizedOverride = String(overrideName ?? "").trim();
      if (normalizedOverride) return normalizedOverride;

      if (!isMissingDisplayName(companyUser?.name)) {
        return String(companyUser?.name ?? "").trim();
      }

      const metadataName = [
        user?.user_metadata?.full_name,
        user?.user_metadata?.name,
      ]
        .map((value) => String(value ?? "").trim())
        .find(Boolean);

      return metadataName ?? "";
    },
    [
      companyUser?.name,
      user?.user_metadata?.full_name,
      user?.user_metadata?.name,
    ]
  );

  useEffect(() => {
    const nextName = resolveInviteName();
    if (!nextName) return;

    setInviteName((current) => current || nextName);
  }, [resolveInviteName]);

  const buildAuthCallbackUrl = useCallback(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const redirectUrl = new URL("/auths/callback", window.location.origin);
    if (router.asPath.startsWith("/")) {
      redirectUrl.searchParams.set("next", router.asPath);
    }
    return redirectUrl.toString();
  }, [router.asPath]);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const mapInviteErrorMessage = useCallback(
    (errorCode?: string, fallbackMessage?: string) => {
      if (errorCode === "invalid_invite_code") {
        return m.invitation.errors.invalidCode;
      }
      if (errorCode === "invite_domain_mismatch") {
        return m.invitation.errors.domainMismatch;
      }
      if (errorCode === "invite_code_exhausted") {
        return inviteCopy.exhausted;
      }
      if (errorCode === "missing_name") {
        return inviteCopy.missingName;
      }
      return fallbackMessage || inviteCopy.genericError;
    },
    [
      inviteCopy.exhausted,
      inviteCopy.genericError,
      inviteCopy.missingName,
      m.invitation.errors.domainMismatch,
      m.invitation.errors.invalidCode,
    ]
  );

  const redeemInviteCode = useCallback(
    async (overrideName?: string) => {
      if (!inviteCode || !user) return false;

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setInviteStatus("needs_login");
        setInviteMessage(inviteCopy.loginPrompt);
        setIsOpenLoginModal(true);
        return false;
      }

      setInviteStatus("redeeming");
      setInviteMessage(inviteCopy.processing);

      const bootstrapRes = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const bootstrapJson = (await bootstrapRes.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!bootstrapRes.ok) {
        setInviteStatus("error");
        setInviteMessage(bootstrapJson.error || inviteCopy.bootstrapFailed);
        return false;
      }

      const resolvedName = resolveInviteName(overrideName);
      const redeemRes = await fetch("/api/invitation/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          code: inviteCode,
          name: resolvedName || undefined,
        }),
      });
      const redeemJson = (await redeemRes.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
      };

      if (!redeemRes.ok) {
        if (redeemJson.code === "missing_name") {
          setInviteStatus("needs_name");
          setInviteMessage(inviteCopy.missingName);
          setInviteName((current) => current || resolvedName);
          return false;
        }

        setInviteStatus("error");
        setInviteMessage(
          mapInviteErrorMessage(redeemJson.code, redeemJson.error)
        );
        return false;
      }

      setInviteStatus("redeeming");
      setInviteMessage(inviteCopy.success);
      autoRedeemKeyRef.current = `${user.id}:${inviteCode}:done`;

      try {
        await load(user.id);
      } catch (loadError) {
        console.error("[invitation] failed to refresh company user", loadError);
      }

      void router.replace("/my");
      return true;
    },
    [
      getAccessToken,
      inviteCode,
      inviteCopy.bootstrapFailed,
      inviteCopy.loginPrompt,
      inviteCopy.missingName,
      inviteCopy.processing,
      inviteCopy.success,
      load,
      mapInviteErrorMessage,
      resolveInviteName,
      router,
      user,
    ]
  );

  useEffect(() => {
    if (!router.isReady || !inviteCode || authLoading) return;

    if (!user) {
      setInviteStatus("needs_login");
      setInviteMessage(inviteCopy.loginPrompt);
      if (!hasPromptedInviteLoginRef.current) {
        hasPromptedInviteLoginRef.current = true;
        setIsOpenLoginModal(true);
      }
      return;
    }

    if (companyUser?.is_authenticated) {
      return;
    }

    const redeemKey = `${user.id}:${inviteCode}`;
    if (autoRedeemKeyRef.current === redeemKey) {
      return;
    }

    autoRedeemKeyRef.current = redeemKey;
    void redeemInviteCode();
  }, [
    authLoading,
    companyUser?.is_authenticated,
    inviteCode,
    inviteCopy.loginPrompt,
    redeemInviteCode,
    router.isReady,
    user,
  ]);

  const submitRequestAccess = async (values: RequestAccessValues) => {
    const normalizedValues = {
      name: values.name.trim(),
      company: values.company.trim(),
      role: values.role.trim(),
      hiringNeed: values.hiringNeed.trim(),
    };

    if (!normalizedValues.name || !normalizedValues.company) {
      showToast({
        message: m.invitation.requestAccess.errors.invalidForm,
        variant: "white",
      });
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      showToast({
        message: m.invitation.requestAccess.errors.missingSession,
        variant: "white",
      });
      return;
    }

    const response = await fetch("/api/request-access/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        ...normalizedValues,
        isMobile,
      }),
    });

    if (!response.ok) {
      showToast({
        message: m.invitation.requestAccess.errors.submitFailed,
        variant: "white",
      });
      return;
    }

    void addLog("submit_request_access");
    setHasSubmitted(true);
    showToast({
      message: m.invitation.requestAccess.submitted,
      variant: "white",
    });
  };

  const handleGoogleLogin = useCallback(async () => {
    const redirectTo = buildAuthCallbackUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      throw error;
    }

    if (data?.url && typeof window !== "undefined") {
      window.location.assign(data.url);
    }

    return data;
  }, [buildAuthCallbackUrl]);

  const handleEmailLogin = useCallback(
    async (email: string, password: string) => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          return { message: error.message };
        }

        const signedInUser = data.user;
        if (!signedInUser) {
          return { message: m.auth.invalidAccount };
        }

        const isEmailConfirmed = Boolean(
          signedInUser.email_confirmed_at ||
          signedInUser.user_metadata?.email_verified
        );

        if (!isEmailConfirmed) {
          return { message: m.auth.emailConfirmationSent };
        }

        const accessToken = await getAccessToken();
        if (!accessToken) {
          return {
            message: m.invitation.requestAccess.errors.missingSession,
          };
        }

        const bootstrapRes = await fetch("/api/auth/bootstrap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!bootstrapRes.ok) {
          const bootstrapJson = (await bootstrapRes
            .json()
            .catch(() => ({}))) as { error?: string };
          return {
            message: bootstrapJson.error || inviteCopy.bootstrapFailed,
          };
        }

        setIsOpenLoginModal(false);
        setInviteStatus("redeeming");
        setInviteMessage(inviteCopy.processing);
        return null;
      } catch (error) {
        if (error instanceof Error && error.message) {
          return { message: error.message };
        }
        return { message: m.auth.invalidAccount };
      }
    },
    [
      getAccessToken,
      inviteCopy.bootstrapFailed,
      inviteCopy.processing,
      m.auth.emailConfirmationSent,
      m.auth.invalidAccount,
      m.invitation.requestAccess.errors.missingSession,
    ]
  );

  const handleInviteRetry = useCallback(() => {
    if (!user) {
      setIsOpenLoginModal(true);
      return;
    }

    autoRedeemKeyRef.current = "";
    void redeemInviteCode(
      inviteStatus === "needs_name" ? inviteName : undefined
    );
  }, [inviteName, inviteStatus, redeemInviteCode, user]);

  const title = inviteCode ? inviteCopy.title : m.invitation.title;
  const description = inviteCode
    ? inviteCopy.description
    : m.invitation.description;

  return (
    <div className="relative flex min-h-screen h-full w-full items-center justify-center bg-black px-4 font-inter text-white">
      {isOpenLoginModal ? (
        <LoginModal
          open={isOpenLoginModal}
          onClose={() => setIsOpenLoginModal(false)}
          onGoogle={handleGoogleLogin}
          onConfirm={handleEmailLogin}
          language={locale}
          callbackPath={inviteCode ? router.asPath : undefined}
        />
      ) : null}

      <Header page="company" />
      <GradientBackground interactiveRef={interactiveRef} />

      <div className="z-20 py-12 flex w-full max-w-xl flex-col items-center space-y-4 md:space-y-8 text-center">
        <div className="h-9 w-9 rounded-full">
          <Image
            src="/svgs/logo_white.svg"
            alt="Harper"
            width={36}
            height={36}
          />
        </div>

        <div>
          <h1 className="text-2xl font-normal tracking-tight md:text-4xl">
            {title}
          </h1>
          <p className="mt-4 md:mt-8 text-sm font-light leading-relaxed text-xgray500 md:text-base">
            {description.split("\n").map((line) => (
              <React.Fragment key={line}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </p>
        </div>

        <div className="w-full max-w-lg">
          <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-6 shadow-xl backdrop-blur-md md:px-8 md:py-8">
            <div className="text-left">
              {companyUser?.email || user?.email ? (
                <div className="mb-4 text-sm text-white/70 font-light">
                  {companyUser?.email || user?.email}
                </div>
              ) : null}
            </div>

            <div className="mt-0">
              {inviteCode ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-5 text-left">
                  <div className="text-base font-medium text-white">
                    {inviteCopy.title}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    {inviteMessage || inviteCopy.loginPrompt}
                  </div>

                  {inviteStatus === "redeeming" ? (
                    <div className="mt-5 flex items-center gap-3 text-sm text-white/75">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      <span>{inviteCopy.processing}</span>
                    </div>
                  ) : null}

                  {inviteStatus === "needs_name" ? (
                    <div className="mt-5 space-y-3">
                      <label className="block text-sm font-medium text-white">
                        {inviteCopy.nameLabel}
                      </label>
                      <input
                        type="text"
                        value={inviteName}
                        onChange={(event) => setInviteName(event.target.value)}
                        placeholder={inviteCopy.namePlaceholder}
                        className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/20"
                      />
                      <button
                        type="button"
                        onClick={handleInviteRetry}
                        disabled={!inviteName.trim()}
                        className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {inviteCopy.nameSubmit}
                      </button>
                    </div>
                  ) : null}

                  {inviteStatus === "needs_login" ||
                  inviteStatus === "error" ? (
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => setIsOpenLoginModal(true)}
                        className="inline-flex flex-1 items-center justify-center rounded-full bg-white px-5 py-3.5 text-sm font-medium text-black transition hover:bg-white/90"
                      >
                        {inviteCopy.loginCta}
                      </button>
                      {user ? (
                        <button
                          type="button"
                          onClick={handleInviteRetry}
                          className="inline-flex flex-1 items-center justify-center rounded-full border border-white/15 bg-transparent px-5 py-3.5 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/5"
                        >
                          {inviteCopy.retry}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : hasSubmitted ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-5 text-left">
                  <div className="text-base font-medium text-white">
                    {m.invitation.requestAccess.title}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    {m.invitation.requestAccess.submitted}
                  </div>
                </div>
              ) : (
                <RequestAccessForm
                  onSubmit={submitRequestAccess}
                  copy={m.invitation.requestAccess}
                  initialValues={{
                    name: isMissingDisplayName(companyUser?.name)
                      ? ""
                      : (companyUser?.name ?? ""),
                    company: companyUser?.company ?? "",
                    role: companyUser?.role ?? "",
                  }}
                  className="space-y-4"
                  submitButtonClassName="mt-6 inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
                />
              )}
            </div>

            <button
              onClick={handleContactUs}
              className="mt-8 mb-2 w-full text-xs text-neutral-500 transition-all duration-200 hover:text-neutral-400 md:mb-4 md:text-sm"
            >
              {m.invitation.contact}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
