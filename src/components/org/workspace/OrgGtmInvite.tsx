import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { AnnouncementCard, type AnnouncementCardAction } from "@/components/common/AnnouncementCard";
import { OnboardingFrame } from "@/components/common/onboarding/Onboarding";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  forgetGtmCompanyInviteWatch,
  useGtmCompanyInviteProgress,
  useGtmCompanyInviteSource,
  type GtmCompanyInviteClaimPhase,
} from "@/hooks/org/useGtmCompanyInvite";
import { buildOrgHref } from "@/lib/org/routes";
import type { WorkspaceSignupState } from "@/lib/org/signup";

/** While the Role for a #2 회사 메일 is made (about 10 seconds), instead of onboarding. */
export function OrgGtmInviteClaimScreen({
  phase,
  onRetry,
  onSkip,
}: {
  phase: GtmCompanyInviteClaimPhase;
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
                ? c("역할을 만들지 못했어요", "We couldn’t set up the role")
                : c("메일로 받은 공고로 역할을 만들고 있어요", "Setting up the role from the posting you received")}
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
            {c("메일 속 후보도 이 역할에 올릴게요. 10초쯤 걸려요.", "The candidates from the email will follow. About 10 seconds.")}
          </div>
        )}
      </OnboardingFrame>
    </main>
  );
}

const hiddenThisVisit = new Set<string>();

/**
 * The card for a workspace opened from a #2 회사 메일: how the mail's people are coming into the Role, and
 * "온보딩 하기" while the person who signed up from it has not finished onboarding.
 */
export function OrgGtmInviteCard({
  workspaceId,
  userId,
  signupState,
  onboardingComplete,
}: {
  workspaceId: string;
  userId: string;
  signupState: WorkspaceSignupState | null | undefined;
  onboardingComplete: boolean;
}) {
  const { c } = useOrgLocale();
  const router = useRouter();
  const source = useGtmCompanyInviteSource({ workspaceId, userId, signupState });
  const state = useGtmCompanyInviteProgress({ workspaceId, mailId: source?.mailId ?? null });
  const [, setClosed] = useState(0);
  if (!source || !state || hiddenThisVisit.has(source.mailId)) return null;

  const finished = state.stage === "done" || state.stage === "role_limit";
  const needsOnboarding = !onboardingComplete;
  // #5 company mail: candidates who showed interest themselves and are not Harper members: nameless 외부 후보 cards.
  const interested = state.interested ?? [];
  const interestedOthers = state.interestedOthers ?? 0;
  const hasInterested = interested.length + interestedOthers > 0;
  if (finished && !needsOnboarding && state.stage === "done" && !state.published && !hasInterested) {
    // Nothing more to say once onboarding is done and no one could be shown.
    return null;
  }
  const roleHref = buildOrgHref({ orgId: workspaceId, page: "role", roleId: state.roleId });
  const onboardingHref = `/org/onboarding?${new URLSearchParams({ orgId: workspaceId, next: roleHref })}`;
  const onRole = router.query.roleId === state.roleId;

  const copy = state.stage === "role_limit"
    ? {
      title: c("역할을 켜지 못했어요", "The role isn’t on yet"),
      body: c("무료 플랜은 진행 중인 역할이 1개예요. 요금제에서 역할을 늘리면 켜져요.", "The free plan has one active role. Add a role in billing to turn it on."),
    }
    : state.stage === "done"
      ? state.published
        ? {
          title: c("후보 {n}명을 올렸어요", "{n} candidates added", { n: state.published }),
          body: c("‘연결을 요청할 후보’에서 보고 연결을 요청해 보세요.", "Review them under candidates to reach out to and request an intro."),
        }
        : interested.length
          ? {
            title: c("직접 관심을 보인 후보가 있어요", "Some candidates are interested in this role"),
            body: c("아직 Harper 회원이 아닌 분들이라 ‘외부 후보’에 이름을 가리고 올려 뒀어요. 연결을 요청하면 Harper가 그분께 알려요.",
              "They aren’t on Harper yet, so they’re under external candidates with their names hidden. Request an intro and Harper lets them know."),
          }
          : {
            title: c("메일 속 후보는 지금 연결할 수 없어요", "The emailed candidates aren’t available now"),
            body: c("Harper가 이 역할에 맞는 후보를 계속 찾아 드려요.", "Harper keeps finding candidates for this role."),
          }
      : {
        title: c("메일 속 후보를 확인하고 있어요", "Reviewing the emailed candidates"),
        body: c("Harper가 이 역할 기준으로 {n}명을 다시 보고 있어요. 몇 분 뒤 ‘연결을 요청할 후보’에 올라와요.",
          "Harper is checking {n} people against this role. They appear under candidates to reach out to in a few minutes.", { n: state.total }),
      };

  const action: AnnouncementCardAction | undefined = needsOnboarding
    ? { label: c("온보딩 하기", "Finish onboarding"), href: onboardingHref }
    : state.stage === "role_limit"
      ? { label: c("요금제 보기", "View billing"), href: buildOrgHref({ orgId: workspaceId, page: "billing" }) }
      : state.stage === "done" && state.published && !onRole
        ? { label: c("후보 보기", "See candidates"), href: roleHref }
        : state.stage === "done" && interested.length
          ? { label: c("외부 후보 보기", "See external candidates"),
            href: buildOrgHref({ orgId: workspaceId, page: "role", roleId: state.roleId, inboxStage: "external" }) }
          : undefined;

  return (
    <AnnouncementCard
      open
      title={copy.title}
      action={action}
      onClose={() => {
        hiddenThisVisit.add(source.mailId);
        // Followed in this browser only until its people are in and the card was seen.
        if (finished && !needsOnboarding) forgetGtmCompanyInviteWatch({ workspaceId, mailId: source.mailId });
        setClosed((value) => value + 1);
      }}
    >
      <p className="break-keep leading-5">{copy.body}</p>
      {hasInterested && !(state.stage === "done" && !state.published) ? (
        // The interested people themselves are cards in the Role's 외부 후보 (names hidden), not listed here.
        <p className="mt-2 break-keep leading-5 text-neutral-muted">
          {interested.length
            ? c("직접 관심을 보인 {n}명은 ‘외부 후보’에 이름을 가리고 올려 뒀어요.", "{n} interested people are under external candidates with their names hidden.", { n: interested.length })
            : null}
          {interestedOthers
            ? c(" 관심을 보인 분이 {n}명 더 있어요.", " {n} more people have shown interest.", { n: interestedOthers })
            : null}
        </p>
      ) : hasInterested && interestedOthers ? (
        <p className="mt-2 break-keep leading-5 text-neutral-muted">
          {c("관심을 보인 분이 {n}명 더 있어요.", "{n} more people have shown interest.", { n: interestedOthers })}
        </p>
      ) : null}
      {needsOnboarding ? (
        <p className="mt-2 break-keep leading-5 text-neutral-muted">
          {c("회사 정보와 요금제는 온보딩에서 정해 주세요.", "Set your company details and plan in onboarding.")}
        </p>
      ) : null}
    </AnnouncementCard>
  );
}
