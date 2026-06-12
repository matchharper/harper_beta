import Link from "next/link";
import { useRouter } from "next/router";
import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";

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
      <header className={["sticky z-10 backdrop-blur", topClassName].join(" ")}>
        <div className="mx-auto flex h-12 max-w-[1440px] items-center justify-between px-4 lg:px-8">
          <Link
            href="/talent"
            className="text-3xl font-bold font-hedvig tracking-tight text-neutral-primary"
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
                  : "text-neutral-muted hover:font-medium",
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
                  : "text-neutral-muted hover:font-medium",
              ].join(" ")}
            >
              Why Harper
            </Link>
            <BareButton
              type="button"
              onClick={() => setOpenAuthModal(true)}
              className="inline-flex h-9 items-center rounded-md px-3 text-neutral-primary transition-colors hover:border-primary hover:text-primary"
            >
              Login
            </BareButton>
          </nav>
        </div>
      </header>

      {openAuthModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <BareButton
            type="button"
            onClick={handleCloseModal}
            aria-label="Close login modal"
            className="absolute inset-0 bg-black/40"
          />

          <div className="relative z-10 w-full max-w-[460px] rounded-xl border border-neutral-1000-a10 bg-bg-default p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-neutral-primary">
                로그인
              </h2>
            </div>

            {user ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-neutral-muted">
                  현재 로그인된 계정:{" "}
                  <span className="font-medium text-neutral-primary">
                    {user.email}
                  </span>
                </p>
                <BareButton
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={authPending}
                  className="h-10 w-full rounded-md border border-neutral-400 bg-bg-default text-sm font-medium text-neutral-primary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  로그아웃
                </BareButton>
              </div>
            ) : (
              <>
                <BareButton
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  disabled={authPending}
                  className="mt-4 h-11 w-full rounded-md border border-neutral-1000-a05 bg-bg-basement text-sm font-normal text-neutral-primary transition-colors hover:bg-bg-weak"
                >
                  Google 로그인
                </BareButton>

                <p className="mt-4 text-xs font-medium uppercase tracking-widest text-neutral-soft">
                  이메일 {authMode === "signup" ? "회원가입" : "로그인"}
                </p>
                <form onSubmit={handleEmailAuth} className="mt-2 space-y-2">
                  <UiInput
                    unstyled
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    placeholder="이메일"
                    disabled={authPending}
                    className="h-10 w-full rounded-md border border-neutral-400 bg-bg-default px-3 text-sm text-neutral-primary outline-none transition-colors focus:border-primary"
                  />
                  <UiInput
                    unstyled
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    placeholder="비밀번호"
                    disabled={authPending}
                    className="h-10 w-full rounded-md border border-neutral-400 bg-bg-default px-3 text-sm text-neutral-primary outline-none transition-colors focus:border-primary"
                  />
                  <BareButton
                    type="submit"
                    disabled={authPending}
                    className="h-10 w-full rounded-md border border-primary bg-primary text-sm font-medium text-neutral-00 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authMode === "signup" ? "회원가입" : "로그인"}
                  </BareButton>
                </form>

                <p className="mt-3 text-sm text-neutral-muted">
                  {authMode === "signup"
                    ? "이미 계정이 있으신가요?"
                    : "첫 방문이신가요?"}{" "}
                  <BareButton
                    type="button"
                    onClick={() =>
                      setAuthMode((prev) =>
                        prev === "signin" ? "signup" : "signin"
                      )
                    }
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    {authMode === "signup" ? "로그인" : "회원가입"}
                  </BareButton>
                </p>
              </>
            )}

            {authError ? (
              <p className="mt-3 rounded-md border border-primary/30 bg-accent-200 px-3 py-2 text-sm text-primary">
                {authError}
              </p>
            ) : null}
            {authInfo ? (
              <p className="mt-3 rounded-md border border-neutral-1000-a10 bg-bg-weak px-3 py-2 text-sm text-neutral-muted">
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
