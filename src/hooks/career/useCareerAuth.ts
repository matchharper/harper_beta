import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import { normalizeCareerUtmSource } from "@/lib/careerUtm";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";

type CareerMessageFormatter = ReturnType<typeof useCareerMessageFormatter>;

const resolveSafeNextPath = (value: string | null) => {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
};

function getAuthErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: "", code: "", status: undefined as number | undefined };
  }

  const typedError = error as Error & {
    code?: string;
    status?: number;
  };

  return {
    code: String(typedError.code ?? "").toLowerCase(),
    message: typedError.message.toLowerCase(),
    status: typedError.status,
  };
}

function getCareerEmailAuthErrorMessage(
  error: unknown,
  mode: "signin" | "signup",
  tCareer: CareerMessageFormatter
) {
  const { code, message, status } = getAuthErrorDetails(error);
  const combined = `${code} ${message}`;

  if (
    mode === "signin" &&
    (combined.includes("invalid login credentials") ||
      combined.includes("invalid_credentials") ||
      status === 400)
  ) {
    return tCareer(H.authEmailSigninFailed);
  }

  if (
    combined.includes("email not confirmed") ||
    combined.includes("email_not_confirmed")
  ) {
    return tCareer(H.authEmailNotConfirmed);
  }

  if (
    mode === "signup" &&
    (combined.includes("already") ||
      combined.includes("registered") ||
      combined.includes("user_already_exists"))
  ) {
    return tCareer(H.authEmailAlreadyRegistered);
  }

  if (combined.includes("password") && combined.includes("6")) {
    return tCareer(H.authPasswordMinLength);
  }

  if (
    combined.includes("rate limit") ||
    combined.includes("too many") ||
    status === 429
  ) {
    return tCareer(H.authRateLimited);
  }

  return tCareer(H.authGenericFailed);
}

function isAlreadyRegisteredSignUpResponse(data: {
  user?: { identities?: unknown[] | null } | null;
}) {
  return (
    Boolean(data.user) &&
    Array.isArray(data.user?.identities) &&
    data.user.identities.length === 0
  );
}

export const useCareerAuth = () => {
  const { user, loading: authLoading, signOut } = useAuthStore();
  const tCareer = useCareerMessageFormatter();

  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");

  const buildCareerAuthCallbackUrl = useCallback(() => {
    if (typeof window === "undefined") return undefined;

    const currentUrl = new URL(window.location.href);
    const explicitNextPath = resolveSafeNextPath(
      currentUrl.searchParams.get("next")
    );
    const nextPath =
      explicitNextPath ||
      (currentUrl.pathname === "/career" ||
      currentUrl.pathname.startsWith("/career/")
        ? `${currentUrl.pathname}${currentUrl.search}`
        : "/career");
    const nextUrl = new URL(nextPath, window.location.origin);
    const inviteToken =
      currentUrl.searchParams.get("invite") ||
      nextUrl.searchParams.get("invite");
    const mail =
      currentUrl.searchParams.get("mail") || nextUrl.searchParams.get("mail");
    const source = normalizeCareerUtmSource(
      currentUrl.searchParams.get("source") ||
        nextUrl.searchParams.get("source")
    );
    const localId =
      currentUrl.searchParams.get("lid") || nextUrl.searchParams.get("lid");
    const emailOnboardingToken =
      currentUrl.searchParams.get(CAREER_EMAIL_ONBOARDING_TOKEN_PARAM) ||
      nextUrl.searchParams.get(CAREER_EMAIL_ONBOARDING_TOKEN_PARAM);
    if (inviteToken) {
      nextUrl.searchParams.set("invite", inviteToken);
    }
    if (mail) {
      nextUrl.searchParams.set("mail", mail);
    }
    if (source) {
      nextUrl.searchParams.set("source", source);
    }
    if (localId) {
      nextUrl.searchParams.set("lid", localId);
    }
    if (emailOnboardingToken) {
      nextUrl.searchParams.set(
        CAREER_EMAIL_ONBOARDING_TOKEN_PARAM,
        emailOnboardingToken
      );
    }

    const callbackUrl = new URL("/auths/callback", window.location.origin);
    callbackUrl.searchParams.set("flow", "talent_capture");
    callbackUrl.searchParams.set(
      "next",
      `${nextUrl.pathname}${nextUrl.search}`
    );

    if (inviteToken) {
      callbackUrl.searchParams.set("invite", inviteToken);
    }
    if (mail) {
      callbackUrl.searchParams.set("mail", mail);
    }
    if (source) {
      callbackUrl.searchParams.set("source", source);
    }
    if (localId) {
      callbackUrl.searchParams.set("lid", localId);
    }
    if (emailOnboardingToken) {
      callbackUrl.searchParams.set(
        CAREER_EMAIL_ONBOARDING_TOKEN_PARAM,
        emailOnboardingToken
      );
    }

    return callbackUrl.toString();
  }, []);

  const handleGoogleLogin = useCallback(async () => {
    if (authPending) return;
    setAuthPending(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const redirectTo = buildCareerAuthCallbackUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
      if (data?.url && typeof window !== "undefined") {
        window.location.assign(data.url);
      }
    } catch {
      setAuthError(tCareer(H.authGoogleLoginFailed));
    } finally {
      setAuthPending(false);
    }
  }, [authPending, buildCareerAuthCallbackUrl, tCareer]);

  const handleEmailAuth = useCallback(
    async (args: {
      mode: "signin" | "signup";
      email: string;
      password: string;
    }) => {
      if (authPending) return false;

      const email = args.email.trim();
      if (!email || !args.password) {
        setAuthError(tCareer(H.authEmailPasswordRequired));
        return false;
      }

      setAuthPending(true);
      setAuthError("");
      setAuthInfo("");
      try {
        if (args.mode === "signup") {
          const redirectTo = buildCareerAuthCallbackUrl();
          const { data, error } = await supabase.auth.signUp({
            email,
            password: args.password,
            options: {
              emailRedirectTo: redirectTo,
            },
          });
          if (error) throw error;
          if (isAlreadyRegisteredSignUpResponse(data)) {
            setAuthError(tCareer(H.authEmailAlreadyRegistered));
            return false;
          }
          if (!data.session) {
            setAuthInfo(tCareer(H.authEmailConfirmationSent));
            return false;
          }
        } else {
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password: args.password,
          });
          if (error) throw error;
        }
        return true;
      } catch (error) {
        setAuthError(getCareerEmailAuthErrorMessage(error, args.mode, tCareer));
        return false;
      } finally {
        setAuthPending(false);
      }
    },
    [authPending, buildCareerAuthCallbackUrl, tCareer]
  );

  const handleLogout = useCallback(async () => {
    await signOut();
  }, [signOut]);

  return {
    user,
    authLoading,
    authPending,
    authError,
    authInfo,
    handleGoogleLogin,
    handleEmailAuth,
    handleLogout,
  };
};
