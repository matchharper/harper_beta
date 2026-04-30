import Image from "next/image";
import React, { useState } from "react";
import type { Locale } from "@/i18n/useMessage";
import { en } from "@/lang/en";
import { ko } from "@/lang/ko";
import { supabase } from "@/lib/supabase";

type LoginResult = { message?: string } | null;

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (email: string, password: string) => Promise<LoginResult>;
  language?: Locale;
  callbackPath?: string;

  onGoogle?: () => void;
  onForgotPassword?: (email?: string) => void;
  onSignUp?: () => void;
}

const LOGIN_MODAL_MESSAGES = {
  ko,
  en,
} as const;

const LOGIN_MODAL_COPY: Record<
  Locale,
  {
    closeAria: string;
    divider: string;
    emailLabel: string;
    passwordLabel: string;
    forgotPassword: string;
    emailRequired: string;
    passwordRequired: string;
    passwordMismatch: string;
    resetPasswordNeedsEmail: string;
    resetPasswordSent: string;
    noAccount: string;
    hasAccount: string;
  }
> = {
  ko: {
    closeAria: "닫기",
    divider: "또는",
    emailLabel: "이메일",
    passwordLabel: "비밀번호",
    forgotPassword: "비밀번호 재설정",
    emailRequired: "이메일을 입력해주세요.",
    passwordRequired: "비밀번호를 입력해주세요.",
    passwordMismatch: "비밀번호가 일치하지 않습니다.",
    resetPasswordNeedsEmail:
      "비밀번호 재설정을 위해 이메일을 먼저 입력해 주세요.",
    resetPasswordSent:
      "비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 열어 새 비밀번호를 설정해 주세요.",
    noAccount: "계정이 없으신가요?",
    hasAccount: "이미 계정이 있으신가요?",
  },
  en: {
    closeAria: "Close",
    divider: "OR",
    emailLabel: "Email",
    passwordLabel: "Password",
    forgotPassword: "Reset password",
    emailRequired: "Please enter your email.",
    passwordRequired: "Please enter your password.",
    passwordMismatch: "Passwords do not match.",
    resetPasswordNeedsEmail: "Enter your email first to reset your password.",
    resetPasswordSent:
      "We've sent a password reset email. Open the link in the email to set a new password.",
    noAccount: "Don't have an account?",
    hasAccount: "Already have an account?",
  },
};

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
  language = "ko",
  callbackPath,
}: LoginModalProps) => {
  const messages = LOGIN_MODAL_MESSAGES[language];
  const copy = LOGIN_MODAL_COPY[language];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) return null;

  const buildAuthCallbackUrl = () => {
    if (typeof window === "undefined") {
      return null;
    }

    const redirectUrl = new URL("/auths/callback", window.location.origin);
    const landingId = localStorage.getItem("harper_landing_id_0209");
    if (landingId) {
      redirectUrl.searchParams.set("lid", landingId);
    }

    const searchParams = new URLSearchParams(window.location.search);
    const countryLang = searchParams.get("cl");
    if (countryLang) {
      redirectUrl.searchParams.set("cl", countryLang);
    }

    const abtestType =
      searchParams.get("ab") ??
      localStorage.getItem("harper_company_abtest_type_2026_02");
    if (abtestType) {
      redirectUrl.searchParams.set("ab", abtestType);
    }

    if (callbackPath?.startsWith("/")) {
      redirectUrl.searchParams.set("next", callbackPath);
    }

    return redirectUrl;
  };

  const resetAuthForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setInfo("");
    setNeedsEmailConfirmation(false);
  };

  const switchToSignUp = () => {
    resetAuthForm();
    setIsSignUp(true);
  };

  const switchToLogin = () => {
    resetAuthForm();
    setIsSignUp(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError(copy.emailRequired);
      return;
    }
    if (!password) {
      setError(copy.passwordRequired);
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setError(copy.passwordMismatch);
      return;
    }

    setError("");
    setInfo("");
    setIsSubmitting(true);
    try {
      if (isSignUp) {
        const data = await signUpWithEmailPassword(normalizedEmail, password);
        if (!data) {
          return;
        }
        if (data.needsEmailConfirmation) {
          setNeedsEmailConfirmation(true);
          return;
        }

        if (typeof window !== "undefined") {
          const callbackUrl = buildAuthCallbackUrl();
          window.location.assign(callbackUrl?.toString() ?? "/auths/callback");
        }
        return;
      }

      const data = await onConfirm(normalizedEmail, password);
      if (data?.message) {
        setError(data.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError(copy.resetPasswordNeedsEmail);
      return;
    }

    setError("");
    setInfo("");
    setIsSubmitting(true);

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auths/reset-password`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo,
      }
    );

    setIsSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }

    setInfo(copy.resetPasswordSent);
  };

  const signUpWithEmailPassword = async (
    email: string,
    password: string
  ): Promise<any> => {
    let redirectTo: string | undefined;
    const callbackUrl = buildAuthCallbackUrl();
    if (callbackUrl) {
      redirectTo = callbackUrl.toString();
    }

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
        aria-label={copy.closeAria}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative z-50 w-full max-w-[460px] rounded-2xl bg-beige50 border border-beige900/8 shadow-2xl transition-all duration-300">
        <div className="p-6 pb-10">
          <div className="flex flex-col items-start justify-start mb-6">
            <Image
              src="/svgs/logo.svg"
              alt="logo"
              width={40}
              height={40}
              className="mb-6 h-10 w-10"
            />
            <div className="text-3xl font-bold tracking-tight text-beige900">
              {isSignUp ? messages.auth.signup : messages.auth.login}
            </div>
          </div>

          {needsEmailConfirmation ? (
            <div className="flex flex-col items-start justify-center">
              <div className="text-base text-beige900 my-4">
                {messages.auth.emailConfirmationSent}
              </div>
              <div
                className="cursor-pointer text-base text-beige900/55 hover:text-beige900 hover:underline transition w-full text-left mb-6"
                onClick={onClose}
              >
                {messages.system.close}
              </div>
            </div>
          ) : (
            <>
              {/* Social buttons */}
              <div className="space-y-3 mt-2">
                <button
                  type="button"
                  onClick={onGoogle}
                  disabled={isSubmitting}
                  className="w-full py-3 text-[13px] rounded-md bg-beige100 hover:bg-beige500/55 transition duration-300 flex items-center justify-center gap-3 text-beige900"
                >
                  <GoogleIcon />
                  <span className="font-medium">
                    {messages.auth.continueWithGoogle}
                  </span>
                </button>
              </div>

              <div className="mt-6 mb-2 flex items-center gap-4">
                <div className="h-px flex-1 bg-beige900/15" />
                <div className="text-xs font-normal tracking-widest text-beige900/35">
                  {copy.divider}
                </div>
                <div className="h-px flex-1 bg-beige900/15" />
              </div>

              {/* Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-beige900">
                    {copy.emailLabel}
                  </label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="email"
                    disabled={isSubmitting}
                    placeholder={"m@example.com"}
                    className="w-full rounded-md text-sm font-light bg-beige50 border border-beige900/8 px-3 py-2.5 text-beige900 placeholder:text-beige900/35 outline-none focus:border-beige900/15 focus:ring-2 focus:ring-beige900/8"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-beige900">
                      {copy.passwordLabel}
                    </label>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={isSubmitting}
                        className="text-xs text-beige900/45 underline underline-offset-2 hover:text-beige900 disabled:opacity-60"
                      >
                        {copy.forgotPassword}
                      </button>
                    )}
                  </div>

                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    placeholder=""
                    className="w-full rounded-md text-sm font-light bg-beige50 border border-beige900/8 px-3 py-2.5 text-beige900 placeholder:text-beige900/35 outline-none focus:border-beige900/15 focus:ring-2 focus:ring-beige900/8"
                  />
                </div>

                {isSignUp && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-beige900">
                      {messages.auth.confirmPassword}
                    </label>

                    <input
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      type="password"
                      autoComplete="current-password"
                      disabled={isSubmitting}
                      placeholder=""
                      className="w-full rounded-md text-sm font-light bg-beige50 border border-beige900/8 px-3 py-2.5 text-beige900 placeholder:text-beige900/35 outline-none focus:border-beige900/15 focus:ring-2 focus:ring-beige900/8"
                    />
                  </div>
                )}

                {error && (
                  <div className="text-sm text-red-500 mt-2">{error}</div>
                )}
                {info && (
                  <div className="text-sm text-green-400 mt-2">{info}</div>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 text-sm rounded-md bg-beige900 text-beige100 font-medium hover:bg-beige900/90 transition duration-300 mt-6 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSignUp ? messages.auth.signup : messages.auth.login}
                </button>
              </form>

              {isSignUp ? (
                <>
                  <div className="pt-1 text-center text-sm font-light text-beige900/55 mt-2">
                    {copy.hasAccount}{" "}
                    <button
                      type="button"
                      onClick={switchToLogin}
                      className="transition underline underline-offset-4 font-normal hover:text-beige900"
                    >
                      {messages.auth.login}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="pt-1 text-center text-sm font-light text-beige900/55 mt-2">
                    {copy.noAccount}{" "}
                    <button
                      type="button"
                      onClick={switchToSignUp}
                      className="transition underline underline-offset-4 font-normal hover:text-beige900"
                    >
                      {messages.auth.signup}
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

export default React.memo(LoginModal);
