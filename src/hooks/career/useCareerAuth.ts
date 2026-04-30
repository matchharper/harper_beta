import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";

const resolveSafeNextPath = (value: string | null) => {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
};

export const useCareerAuth = () => {
  const { user, loading: authLoading } = useAuthStore();

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
    if (inviteToken) {
      nextUrl.searchParams.set("invite", inviteToken);
    }
    if (mail) {
      nextUrl.searchParams.set("mail", mail);
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
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Google 로그인에 실패했습니다."
      );
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
          if (!data.session) {
            setAuthInfo("회원가입 완료. 이메일 인증 후 다시 로그인해 주세요.");
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
        setAuthError(
          error instanceof Error ? error.message : "인증에 실패했습니다."
        );
        return false;
      } finally {
        setAuthPending(false);
      }
    },
    [authPending, buildCareerRedirectPath]
  );

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

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
