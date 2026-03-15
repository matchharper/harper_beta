import Link from "next/link";
import { useRouter } from "next/router";
import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";

type AuthMode = "signin" | "signup";

type AppHeaderProps = {
  topClassName?: string;
};

const isEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

const AppHeader = ({ topClassName = "top-0" }: AppHeaderProps) => {
  const router = useRouter();
  const { user, signOut } = useAuthStore();

  const [openAuthModal, setOpenAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");

  const activePath = useMemo(() => router.pathname, [router.pathname]);
  const isHome = activePath === "/talent";
  const isWhy = activePath === "/career/why";

  const resetAuthState = () => {
    setEmail("");
    setPassword("");
    setAuthError("");
    setAuthInfo("");
    setAuthMode("signin");
  };

  const handleCloseModal = () => {
    setOpenAuthModal(false);
    resetAuthState();
  };

  const handleGoogleLogin = async () => {
    if (authPending) return;
    setAuthPending(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}${router.asPath}`
          : undefined;
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
      setAuthPending(false);
    }
  };

  const handleEmailAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authPending) return;

    const normalizedEmail = email.trim();
    if (!isEmail(normalizedEmail)) {
      setAuthError("올바른 이메일을 입력해 주세요.");
      return;
    }
    if (!password) {
      setAuthError("비밀번호를 입력해 주세요.");
      return;
    }

    setAuthPending(true);
    setAuthError("");
    setAuthInfo("");
    try {
      if (authMode === "signup") {
        const redirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}${router.asPath}`
            : undefined;
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: redirectTo,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setAuthInfo("회원가입 완료. 이메일 인증 후 로그인해 주세요.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
      }

      handleCloseModal();
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "인증 처리 중 오류가 발생했습니다."
      );
    } finally {
      setAuthPending(false);
    }
  };

  const handleLogout = async () => {
    if (authPending) return;
    setAuthPending(true);
    try {
      await signOut();
      handleCloseModal();
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "로그아웃 처리에 실패했습니다."
      );
    } finally {
      setAuthPending(false);
    }
  };

  return (
    <>
      <header
        className={[
          "sticky z-10 bg-hblack000/95 backdrop-blur",
          topClassName,
        ].join(" ")}
      >
        <div className="mx-auto flex h-12 max-w-[1440px] items-center justify-between px-4 lg:px-8">
          <Link
            href="/talent"
            className="text-3xl font-bold font-hedvig tracking-tight text-hblack1000"
          >
            Harper
          </Link>

          <nav className="flex items-center gap-2 text-md">
            <Link
              href="/talent"
              className={[
                "inline-flex h-9 items-center rounded-md px-3 transition-colors underline-offset-8",
                isHome
                  ? "underline font-medium"
                  : "text-hblack700 hover:font-medium",
              ].join(" ")}
            >
              Home
            </Link>
            <Link
              href="/career/why"
              className={[
                "inline-flex h-9 items-center rounded-md px-3 transition-colors underline-offset-8",
                isWhy
                  ? "underline font-medium"
                  : "text-hblack700 hover:font-medium",
              ].join(" ")}
            >
              Why Harper
            </Link>
            <button
              type="button"
              onClick={() => setOpenAuthModal(true)}
              className="inline-flex h-9 items-center rounded-md px-3 text-hblack800 transition-colors hover:border-xprimary hover:text-xprimary"
            >
              Login
            </button>
          </nav>
        </div>
      </header>

      {openAuthModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            onClick={handleCloseModal}
            aria-label="Close login modal"
            className="absolute inset-0 bg-hblack900/40"
          />

          <div className="relative z-10 w-full max-w-[460px] rounded-xl border border-hblack200 bg-hblack000 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-hblack1000">로그인</h2>
            </div>

            {user ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-hblack700">
                  현재 로그인된 계정:{" "}
                  <span className="font-medium text-hblack900">
                    {user.email}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={authPending}
                  className="h-10 w-full rounded-md border border-hblack300 bg-hblack000 text-sm font-medium text-hblack800 transition-colors hover:border-xprimary hover:text-xprimary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  disabled={authPending}
                  className="mt-4 h-11 w-full rounded-md border border-hblack100 bg-hblack50 text-sm font-normal text-hblack900 transition-colors hover:bg-hblack100"
                >
                  Google 로그인
                </button>

                <p className="mt-4 text-xs font-medium uppercase tracking-[0.1em] text-hblack500">
                  이메일 {authMode === "signup" ? "회원가입" : "로그인"}
                </p>
                <form onSubmit={handleEmailAuth} className="mt-2 space-y-2">
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    placeholder="이메일"
                    disabled={authPending}
                    className="h-10 w-full rounded-md border border-hblack300 bg-hblack000 px-3 text-sm text-hblack900 outline-none transition-colors focus:border-xprimary"
                  />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    placeholder="비밀번호"
                    disabled={authPending}
                    className="h-10 w-full rounded-md border border-hblack300 bg-hblack000 px-3 text-sm text-hblack900 outline-none transition-colors focus:border-xprimary"
                  />
                  <button
                    type="submit"
                    disabled={authPending}
                    className="h-10 w-full rounded-md border border-xprimary bg-xprimary text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authMode === "signup" ? "회원가입" : "로그인"}
                  </button>
                </form>

                <p className="mt-3 text-sm text-hblack600">
                  {authMode === "signup"
                    ? "이미 계정이 있으신가요?"
                    : "첫 방문이신가요?"}{" "}
                  <button
                    type="button"
                    onClick={() =>
                      setAuthMode((prev) =>
                        prev === "signin" ? "signup" : "signin"
                      )
                    }
                    className="font-medium text-xprimary underline underline-offset-4"
                  >
                    {authMode === "signup" ? "로그인" : "회원가입"}
                  </button>
                </p>
              </>
            )}

            {authError ? (
              <p className="mt-3 rounded-md border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
                {authError}
              </p>
            ) : null}
            {authInfo ? (
              <p className="mt-3 rounded-md border border-hblack200 bg-hblack100 px-3 py-2 text-sm text-hblack700">
                {authInfo}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
};

export default AppHeader;
