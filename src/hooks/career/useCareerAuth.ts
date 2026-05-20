import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";

const EMAIL_SIGNIN_ERROR_MESSAGE = "이메일 혹은 비밀번호가 올바르지 않습니다.";
const EMAIL_NOT_CONFIRMED_MESSAGE =
  "아직 이메일 인증이 완료되지 않았습니다. 받은 메일의 인증 링크를 먼저 확인해 주세요.";
const EMAIL_ALREADY_REGISTERED_MESSAGE =
  "이미 가입된 이메일입니다. 로그인으로 계속해 주세요.";
const EMAIL_CONFIRMATION_SENT_MESSAGE =
  "인증 메일을 보냈습니다. 메일의 링크를 열어 회원가입을 완료한 뒤 다시 로그인해 주세요.";

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
  mode: "signin" | "signup"
) {
  const { code, message, status } = getAuthErrorDetails(error);
  const combined = `${code} ${message}`;

  if (
    mode === "signin" &&
    (combined.includes("invalid login credentials") ||
      combined.includes("invalid_credentials") ||
      status === 400)
  ) {
    return EMAIL_SIGNIN_ERROR_MESSAGE;
  }

  if (
    combined.includes("email not confirmed") ||
    combined.includes("email_not_confirmed")
  ) {
    return EMAIL_NOT_CONFIRMED_MESSAGE;
  }

  if (
    mode === "signup" &&
    (combined.includes("already") ||
      combined.includes("registered") ||
      combined.includes("user_already_exists"))
  ) {
    return EMAIL_ALREADY_REGISTERED_MESSAGE;
  }

  if (combined.includes("password") && combined.includes("6")) {
    return "비밀번호는 6자 이상 입력해 주세요.";
  }

  if (
    combined.includes("rate limit") ||
    combined.includes("too many") ||
    status === 429
  ) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }

  return "인증 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
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

  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");

  const buildCareerRedirectPath = useCallback(() => {
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
    const emailOnboardingToken =
      currentUrl.searchParams.get(CAREER_EMAIL_ONBOARDING_TOKEN_PARAM) ||
      nextUrl.searchParams.get(CAREER_EMAIL_ONBOARDING_TOKEN_PARAM);
    if (inviteToken) {
      nextUrl.searchParams.set("invite", inviteToken);
    }
    if (mail) {
      nextUrl.searchParams.set("mail", mail);
    }
    if (emailOnboardingToken) {
      nextUrl.searchParams.set(
        CAREER_EMAIL_ONBOARDING_TOKEN_PARAM,
        emailOnboardingToken
      );
    }

    return nextUrl.toString();
  }, []);

  const handleGoogleLogin = useCallback(async () => {
    if (authPending) return;
    setAuthPending(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const redirectTo = buildCareerRedirectPath();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
      if (data?.url && typeof window !== "undefined") {
        window.location.assign(data.url);
      }
    } catch {
      setAuthError("Google 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setAuthPending(false);
    }
  }, [authPending, buildCareerRedirectPath]);

  const handleEmailAuth = useCallback(
    async (args: {
      mode: "signin" | "signup";
      email: string;
      password: string;
    }) => {
      if (authPending) return false;

      const email = args.email.trim();
      if (!email || !args.password) {
        setAuthError("이메일과 비밀번호를 입력해 주세요.");
        return false;
      }

      setAuthPending(true);
      setAuthError("");
      setAuthInfo("");
      try {
        if (args.mode === "signup") {
          const redirectTo = buildCareerRedirectPath();
          const { data, error } = await supabase.auth.signUp({
            email,
            password: args.password,
            options: {
              emailRedirectTo: redirectTo,
            },
          });
          if (error) throw error;
          if (isAlreadyRegisteredSignUpResponse(data)) {
            setAuthError(EMAIL_ALREADY_REGISTERED_MESSAGE);
            return false;
          }
          if (!data.session) {
            setAuthInfo(EMAIL_CONFIRMATION_SENT_MESSAGE);
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
        setAuthError(getCareerEmailAuthErrorMessage(error, args.mode));
        return false;
      } finally {
        setAuthPending(false);
      }
    },
    [authPending, buildCareerRedirectPath]
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
