import React, { useMemo, useState } from "react";
import { useMessages } from "@/i18n/useMessage";
import { supabase } from "@/lib/supabase";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (email: string, password: string) => Promise<any>;

  // (optional) 소셜 로그인 핸들러가 있으면 넘겨서 사용
  onGoogle?: () => void;
  onForgotPassword?: (email?: string) => void;
  onSignUp?: () => void;
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303C33.653 32.657 29.159 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.963 3.037l5.657-5.657C34.045 6.053 29.273 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 16.108 19.009 12 24 12c3.059 0 5.842 1.154 7.963 3.037l5.657-5.657C34.045 6.053 29.273 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.196l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.138 0-9.62-3.323-11.283-7.946l-6.522 5.025C9.507 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303a12.06 12.06 0 0 1-4.084 5.566l.003-.002 6.19 5.238C36.973 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
    />
  </svg>
);

const LoginModal = ({
  open,
  onClose,
  onConfirm,
  onGoogle,
  onForgotPassword,
  onSignUp,
}: LoginModalProps) => {
  const { m } = useMessages();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

  if (!open) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp) {
      const data = await signUpWithEmailPassword(email, password);
      if (data && data.needsEmailConfirmation) {
        setNeedsEmailConfirmation(true);
        return;
      }
    } else {
      const data = await onConfirm(email, password);
      if (data) {
        setError("존재하지 않는 계정입니다.");
      }
    }
  };

  const signUpWithEmailPassword = async (
    email: string,
    password: string
  ): Promise<any> => {
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setError(error.message);
      return null;
    }

    // Confirm Email이 켜져 있으면 session이 null로 오는 경우가 많음
    const needsEmailConfirmation = !data.session;

    return {
      userId: data.user?.id ?? null,
      email: data.user?.email ?? null,
      needsEmailConfirmation,
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 w-full">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative z-50 w-full max-w-[460px] rounded-2xl bg-hgray100 border border-hgray200 shadow-2xl transition-all duration-300">
        <div className="p-6">
          <div className="flex flex-col items-start justify-start mb-6">
            {isSignUp && (
              <img src="/svgs/logo.svg" alt="logo" className="w-10 h-10 mb-6" />
            )}
            <div className="text-3xl font-bold tracking-tight text-hgray700">
              {isSignUp ? "회원가입" : "로그인"}
            </div>
          </div>

          {needsEmailConfirmation ? (
            <div className="flex flex-col items-start justify-center">
              <div className="text-base text-hgray900 my-4">
                인증 메일을 발송했습니다. 이메일을 확인해주세요.
              </div>
              <div
                className="cursor-pointer text-base text-hgray600 hover:text-hgray700 hover:underline transition w-full text-left mb-6"
                onClick={onClose}
              >
                닫기
              </div>
            </div>
          ) : (
            <>
              {!isSignUp && (
                <>
                  {/* Social buttons */}
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={onGoogle}
                      className="w-full py-2 text-[13px] rounded-md bg-white hover:bg-accenta1 transition duration-300 flex items-center justify-center gap-3 text-hgray100"
                    >
                      <GoogleIcon />
                      <span className="font-medium">Continue with Google</span>
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="mt-6 mb-2 flex items-center gap-4">
                    <div className="h-px flex-1 bg-hgray500" />
                    <div className="text-xs font-normal tracking-widest text-hgray500">
                      OR
                    </div>
                    <div className="h-px flex-1 bg-hgray500" />
                  </div>
                </>
              )}

              {/* Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-white">
                    이메일
                  </label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="email"
                    placeholder={"m@example.com"}
                    className="w-full rounded-md text-sm font-light bg-hgray200 px-3 py-2.5 text-white placeholder:text-hgray500 outline-none focus:border-hgray500 focus:ring-2 focus:ring-hgray600/40"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-white">
                      비밀번호
                    </label>
                  </div>

                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    autoComplete="current-password"
                    placeholder=""
                    className="w-full rounded-md text-sm font-light bg-hgray200 px-3 py-2.5 text-white placeholder:text-hgray500 outline-none focus:border-hgray500 focus:ring-2 focus:ring-hgray600/40"
                  />
                </div>

                {isSignUp && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-white">
                      비밀번호 확인
                    </label>

                    <input
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      type="password"
                      autoComplete="current-password"
                      placeholder=""
                      className="w-full rounded-md text-sm font-light bg-hgray200 px-3 py-2.5 text-white placeholder:text-hgray500 outline-none focus:border-hgray500 focus:ring-2 focus:ring-hgray600/40"
                    />
                  </div>
                )}
                {/* <button
              type="button"
              onClick={() => onForgotPassword?.(email)}
              className="text-sm text-hgray500 hover:text-hgray200 transition underline underline-offset-4"
            >
              Forgot your password?
            </button> */}
              </form>

              {error && (
                <div className="text-sm text-red-500 mt-2">{error}</div>
              )}
              <button
                type="submit"
                onClick={handleLogin}
                className="w-full py-2.5 text-sm rounded-md bg-accenta1 text-black font-medium hover:bg-accenta2 transition duration-300 mt-6"
              >
                {isSignUp ? "Sign up" : "Login"}
              </button>

              {!isSignUp ? (
                <>
                  <div className="pt-1 text-center text-sm font-light text-hgray700 mt-2">
                    계정이 없으신가요?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setEmail("");
                        setPassword("");
                        setError("");
                        setIsSignUp(true);
                      }}
                      className="transition underline underline-offset-4 font-normal hover:text-white"
                    >
                      Sign up
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="pt-1 text-center text-sm font-light text-hgray700 mt-2">
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setEmail("");
                        setPassword("");
                        setConfirmPassword("");
                        setError("");
                        setIsSignUp(false);
                      }}
                      className="transition underline underline-offset-4 font-normal hover:text-white"
                    >
                      Login
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
