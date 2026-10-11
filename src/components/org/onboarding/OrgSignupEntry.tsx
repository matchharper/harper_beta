import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { OnboardingFrame } from "@/components/common/onboarding/Onboarding";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { signupErrorMessage, type SignupEntry } from "@/lib/org/signup";
import { useAuthStore } from "@/store/useAuthStore";
import { BILLING_SUPPORT_HREF } from "@/lib/org/billing/types";

export function OrgSignupEntry({ email }: { email: string | undefined }) {
  const { locale } = useOrgLocale();
  const router = useRouter();
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const signOut = useAuthStore((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const autoStartedFor = useRef<string | null>(null);
  const entry = useQuery({
    queryKey: ["org", "signup-entry", email],
    queryFn: () => fetchWithInternalAuth<SignupEntry>("/api/org/signup"),
    retry: 1,
    staleTime: 0,
  });
  useEffect(() => {
    if (entry.data?.workspaceId)
      void router.replace(`/org?orgId=${entry.data.workspaceId}`);
  }, [entry.data?.workspaceId, router]);
  const refetchEntry = entry.refetch;
  const begin = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await fetchWithInternalAuth<SignupEntry>(
        "/api/org/signup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "begin" }),
        }
      );
      if (result.workspaceId)
        await router.replace(
          `/org/onboarding?orgId=${result.workspaceId}&interval=${router.query.interval === "month" ? "month" : "year"}`
        );
      else await refetchEntry();
    } catch (e) {
      setError(signupErrorMessage(e, locale));
    } finally {
      setBusy(false);
    }
  }, [locale, refetchEntry, router]);
  useEffect(() => {
    const account = email ?? "";
    if (
      !router.isReady ||
      entry.isFetching ||
      entry.isError ||
      entry.data?.status !== "new" ||
      autoStartedFor.current === account
    )
      return;
    // Start once per account; failures wait for an explicit retry.
    autoStartedFor.current = account;
    void begin();
  }, [
    begin,
    email,
    entry.data?.status,
    entry.isError,
    entry.isFetching,
    router.isReady,
  ]);
  const status = entry.data?.status;
  return (
    <main className="min-h-svh bg-bg-basement text-neutral-primary">
      <OnboardingFrame
        progressStep={0}
        totalSteps={4}
        showProgress={false}
        flexibleTitle
        title={
          <header className="pt-6">
            <h1 className="text-2xl font-normal leading-relaxed">
              {status === "invite_required"
                ? c("팀의 Workspace에 참여하세요", "Join your team’s workspace")
                : status === "work_email_required"
                  ? c("회사 이메일로 시작해 주세요", "Use your work email")
                  : c(
                      "팀의 첫 채용을 시작해 보세요",
                      "Start hiring with your team"
                    )}
            </h1>
          </header>
        }
        footer={
          <MuteButton variant="transparent" onClick={() => void signOut()}>
            {c("다른 계정으로 로그인", "Use another account")}
          </MuteButton>
        }
      >
        {/* <p className="mb-5 break-all text-sm text-neutral-soft">{email}</p> */}
        {entry.isPending ||
        entry.data?.workspaceId ||
        busy ||
        (status === "new" && !error && !entry.error) ? (
          <LoaderCircle
            className="size-5 animate-spin"
            aria-label={c(
              "회사 계정을 확인하고 있어요",
              "Checking your account"
            )}
          />
        ) : status === "new" && !entry.error ? (
          <MuteButton variant="neutral" onClick={() => void begin()}>
            {c("다시 시도하기", "Try again")}
          </MuteButton>
        ) : status === "invite_required" ? (
          <>
            <p className="text-sm leading-6 text-neutral-800">
              {c(
                "이미 이 회사의 Workspace가 있어요. 회사의 Harper 관리자에게 위 이메일로 초대해 달라고 요청해 주세요. 초대 링크를 열면 기존 팀에 참여할 수 있어요.",
                "Your company already has a workspace. Ask your Harper administrator to invite the email shown above, then open their invitation link."
              )}
            </p>
            <div className="mt-6 flex gap-3">
              <MuteButton
                variant="neutral"
                onClick={() => void entry.refetch()}
              >
                {c("초대 다시 확인", "Check for an invitation")}
              </MuteButton>
              <MuteButton asChild variant="transparent">
                <a href={BILLING_SUPPORT_HREF}>
                  {c("관리자를 모르겠어요", "Help me find my team")}
                </a>
              </MuteButton>
            </div>
          </>
        ) : status === "work_email_required" ? (
          <p className="text-sm leading-7 text-neutral-muted">
            {c(
              "새 Workspace는 인증된 회사 이메일로 만들 수 있어요. Gmail·네이버 등 개인 메일을 사용 중이라면 회사 계정으로 다시 로그인해 주세요. 이미 초대받았다면 초대 링크를 열어 주세요.",
              "A new workspace requires a verified company email. Switch from your personal email to a work account, or open your invitation link if you already have one."
            )}
          </p>
        ) : (
          <MuteButton variant="neutral" onClick={() => void entry.refetch()}>
            {c("다시 확인하기", "Try again")}
          </MuteButton>
        )}
        {error || entry.error ? (
          <p className="mt-4 text-sm text-critical" role="alert">
            {error || signupErrorMessage(entry.error, locale)}
          </p>
        ) : null}
      </OnboardingFrame>
    </main>
  );
}
