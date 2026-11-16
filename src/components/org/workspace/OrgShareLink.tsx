import { LoaderCircle } from "lucide-react";
import { OnboardingFrame } from "@/components/common/onboarding/Onboarding";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { ShareLinkClaimPhase } from "@/hooks/org/useShareLinkClaim";

/** While the posting's Role is made and the candidate from a 후보자 링크 is put on it, instead of onboarding. */
export function OrgShareLinkClaimScreen({
  phase,
  onRetry,
  onSkip,
}: {
  phase: ShareLinkClaimPhase;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const { c } = useOrgLocale();
  return (
    <main className="min-h-svh bg-bg-basement text-neutral-primary">
      <OnboardingFrame
        progressStep={0}
        showProgress={false}
        flexibleTitle
        title={
          <header className="pt-6">
            <h1 className="text-2xl font-normal leading-relaxed">
              {phase === "error"
                ? c("후보를 불러오지 못했어요", "We couldn’t open the candidate")
                : c("후보를 볼 수 있게 역할을 만들고 있어요", "Setting up a role for this candidate")}
            </h1>
          </header>
        }
        footer={
          phase === "error" ? (
            <MuteButton variant="transparent" onClick={onSkip}>
              {c("건너뛰기", "Skip")}
            </MuteButton>
          ) : null
        }
      >
        {phase === "error" ? (
          <MuteButton variant="neutral" onClick={onRetry}>
            {c("다시 시도하기", "Try again")}
          </MuteButton>
        ) : (
          <div className="flex items-center gap-3 text-sm text-neutral-muted" role="status">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            {c("끝나면 후보 프로필이 바로 열려요. 10초쯤 걸려요.", "The candidate’s profile opens next. About 10 seconds.")}
          </div>
        )}
      </OnboardingFrame>
    </main>
  );
}
