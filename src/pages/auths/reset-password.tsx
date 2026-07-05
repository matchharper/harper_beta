import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useMessages, type Locale } from "@/i18n/useMessage";

const MIN_PASSWORD_LENGTH = 8;

const RESET_PASSWORD_COPY: Record<
  Locale,
  {
    pageTitle: string;
    title: string;
    description: string;
    checking: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    confirmLabel: string;
    confirmPlaceholder: string;
    submit: string;
    submitting: string;
    backToLogin: string;
    invalidLink: string;
    passwordRequired: string;
    passwordTooShort: string;
    passwordMismatch: string;
    success: string;
  }
> = {
  ko: {
    pageTitle: "Harper 비밀번호 재설정",
    title: "새 비밀번호를 설정하세요",
    description:
      "메일의 재설정 링크를 확인했습니다. 앞으로 사용할 새 비밀번호를 입력해 주세요.",
    checking: "재설정 링크를 확인하는 중입니다.",
    passwordLabel: "새 비밀번호",
    passwordPlaceholder: "8자 이상 입력",
    confirmLabel: "새 비밀번호 확인",
    confirmPlaceholder: "한 번 더 입력",
    submit: "비밀번호 변경",
    submitting: "저장 중...",
    backToLogin: "로그인으로 돌아가기",
    invalidLink:
      "재설정 링크가 유효하지 않거나 만료되었습니다. 비밀번호 재설정 메일을 다시 요청해 주세요.",
    passwordRequired: "새 비밀번호를 입력해 주세요.",
    passwordTooShort: "비밀번호는 8자 이상이어야 합니다.",
    passwordMismatch: "비밀번호가 일치하지 않습니다.",
    success: "비밀번호가 변경되었습니다. 다시 로그인해 주세요.",
  },
  en: {
    pageTitle: "Harper Password Reset",
    title: "Set a new password",
    description:
      "Your reset link is ready. Enter the new password you want to use for Harper.",
    checking: "Checking your reset link.",
    passwordLabel: "New password",
    passwordPlaceholder: "At least 8 characters",
    confirmLabel: "Confirm new password",
    confirmPlaceholder: "Enter it again",
    submit: "Update password",
    submitting: "Saving...",
    backToLogin: "Back to login",
    invalidLink:
      "This reset link is invalid or expired. Please request a new password reset email.",
    passwordRequired: "Please enter a new password.",
    passwordTooShort: "Password must be at least 8 characters.",
    passwordMismatch: "Passwords do not match.",
    success: "Your password has been updated. Please sign in again.",
  },
};

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getSafeNextPath(value: string | string[] | undefined) {
  const raw = getQueryText(value);
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

function getRecoveryHashParams() {
  if (typeof window === "undefined") {
    return {
      accessToken: "",
      errorDescription: "",
      refreshToken: "",
    };
  }

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    accessToken: params.get("access_token") ?? "",
    errorDescription: params.get("error_description") ?? "",
    refreshToken: params.get("refresh_token") ?? "",
  };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const { locale } = useMessages();
  const copy = RESET_PASSWORD_COPY[locale];
  const invalidLinkMessageRef = useRef(copy.invalidLink);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [hasCheckedLink, setHasCheckedLink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const loginPath = useMemo(
    () => getSafeNextPath(router.query.next) ?? "/career_login",
    [router.query.next]
  );

  useEffect(() => {
    invalidLinkMessageRef.current = copy.invalidLink;
  }, [copy.invalidLink]);

  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;

    const prepareRecovery = async () => {
      setError("");
      setSuccess("");
      setIsReady(false);
      setHasCheckedLink(false);

      const queryError =
        getQueryText(router.query.error_description) ||
        getQueryText(router.query.error);
      const { accessToken, errorDescription, refreshToken } =
        getRecoveryHashParams();

      if (queryError || errorDescription) {
        if (!cancelled) {
          setError(
            queryError || errorDescription || invalidLinkMessageRef.current
          );
          setHasCheckedLink(true);
        }
        return;
      }

      const code = getQueryText(router.query.code);
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (!cancelled) {
            setError(invalidLinkMessageRef.current);
            setHasCheckedLink(true);
          }
          return;
        }
      } else if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          if (!cancelled) {
            setError(invalidLinkMessageRef.current);
            setHasCheckedLink(true);
          }
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) {
          setError(invalidLinkMessageRef.current);
          setHasCheckedLink(true);
        }
        return;
      }

      if (!cancelled) {
        setIsReady(true);
        setHasCheckedLink(true);
      }
    };

    void prepareRecovery();

    return () => {
      cancelled = true;
    };
  }, [
    router.isReady,
    router.query.code,
    router.query.error,
    router.query.error_description,
  ]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!password) {
      setError(copy.passwordRequired);
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(copy.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(copy.passwordMismatch);
      return;
    }

    setError("");
    setSuccess("");
    setIsSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setIsSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    await supabase.auth.signOut();
    setSuccess(copy.success);
    setTimeout(() => {
      void router.replace(loginPath);
    }, 1400);
  };

  const statusMessage = !hasCheckedLink && !isReady ? copy.checking : "";

  return (
    <>
      <Head>
        <title>{copy.pageTitle}</title>
        <link rel="icon" href="/images/logo.ico" />
      </Head>
      <main className="flex min-h-svh w-full font-sans items-center justify-center bg-bg-basement px-4 py-10 text-neutral-primary">
        <section className="w-full max-w-[420px] rounded-lg border border-neutral-1000-a05 bg-bg-floating p-5 sm:p-6">
          <Link
            href="/career_login"
            className="inline-flex font-hedvig text-[16px] font-medium leading-none text-neutral-primary outline-none transition hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
          >
            Harper
          </Link>

          <div className="mt-4">
            <Text as="h1" variant="head2" tone="primary">
              {copy.title}
            </Text>
            <Text variant="body" tone="muted" className="mt-2">
              {copy.description}
            </Text>

            {statusMessage ? (
              <div
                className="mt-4 rounded-md bg-bg-weak px-3 py-2"
                role="status"
                aria-live="polite"
              >
                <Text variant="caption" tone="muted">
                  {statusMessage}
                </Text>
              </div>
            ) : null}

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <TextField
                id="reset-password"
                type="password"
                label={copy.passwordLabel}
                placeholder={copy.passwordPlaceholder}
                autoComplete="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                disabled={!isReady || isSubmitting || Boolean(success)}
                size="medium"
              />
              <TextField
                id="reset-password-confirm"
                type="password"
                label={copy.confirmLabel}
                placeholder={copy.confirmPlaceholder}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setError("");
                }}
                disabled={!isReady || isSubmitting || Boolean(success)}
                size="medium"
              />

              {error ? (
                <div
                  className="rounded-md border border-critical/30 bg-critical-faded px-3 py-2"
                  role="alert"
                >
                  <Text as="p" variant="caption" className="text-critical">
                    {error}
                  </Text>
                </div>
              ) : null}

              {success ? (
                <div
                  className="rounded-md border border-positive/30 bg-positive-faded px-3 py-2"
                  role="status"
                  aria-live="polite"
                >
                  <Text as="p" variant="caption" className="text-positive">
                    {success}
                  </Text>
                </div>
              ) : null}

              <Button
                type="submit"
                variant="black"
                size="md"
                disabled={!isReady || isSubmitting || Boolean(success)}
                className="w-full mt-2"
              >
                {isSubmitting ? copy.submitting : copy.submit}
              </Button>
            </form>

            <Link
              href={loginPath}
              className="mt-4 inline-flex text-xs font-light text-neutral-muted underline underline-offset-4 transition hover:text-neutral-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
            >
              {copy.backToLogin}
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
