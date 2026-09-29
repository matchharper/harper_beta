import Head from "next/head";
import { useRouter } from "next/router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, LoaderCircle } from "lucide-react";
import Face from "@/components/common/Face";
import {
  ONBOARDING_BACKGROUND_CLASS,
  OnboardingConversationPreview,
  OnboardingFieldLabel,
  OnboardingFooter,
  OnboardingFrame,
  OnboardingReadyBody,
  OnboardingStepHeader,
  OnboardingTransition,
  type OnboardingStepDefinition,
} from "@/components/common/onboarding/Onboarding";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import RichText from "@/components/ui/rich-text";
import { ORG_SLACK_PRIVATE_CHANNEL_HELP } from "@/components/org/OrgSlackChannelPicker";
import { OrgTeamPage } from "@/components/org/workspace/pages/OrgTeamPage";
import { useUpdateOrgMemberProfile } from "@/hooks/org/useOrg";
import { useOrgSlackStatus } from "@/hooks/org/useOrgSlack";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useHtmlClass } from "@/hooks/useHtmlClass";
import {
  buildSlackChannelLinks,
  canProvideOrgCompanyContext,
  getOrgOnboardingRoleCopy,
  getOrgOnboardingRoles,
  getOrgOnboardingSteps,
  type OrgOnboardingStep,
} from "@/lib/org/onboarding";
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";
import { buildOrgHref } from "@/lib/org/routes";
import { queryKeys } from "@/lib/queryKeys";
import {
  OrgOnboardingSlack,
  type OrgOnboardingSlackPreview,
} from "./OrgOnboardingSlack";
import { postOrgOnboarding } from "./client";

type Draft = {
  step: OrgOnboardingStep;
  showSlack: boolean;
  name: string;
  role: string;
  companyText: string;
  submittedText: string;
  companyReply: string;
};

const definition = (
  title: string[],
  description: string | readonly string[]
): OnboardingStepDefinition => ({
  label: title.join(" "),
  title,
  description:
    typeof description === "string" ? [description] : [...description],
  headerClassName: "flex h-full flex-col justify-start pt-2 text-left pb-1",
  titleClassName:
    "text-[20px] md:text-[24px] font-normal leading-[1.5] text-neutral-primary",
  descriptionClassName: "mt-2 text-[13px] md:text-[15px] text-neutral-soft",
  bodyClassName: "",
});

function readDraft(key: string, fallback: Draft): Draft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!saved || typeof saved !== "object") return fallback;
    const steps: OrgOnboardingStep[] = [
      "profile",
      "slack",
      "company",
      "roles",
      "done",
    ];
    return {
      step: steps.includes(saved.step) ? saved.step : fallback.step,
      showSlack:
        typeof saved.showSlack === "boolean"
          ? saved.showSlack
          : fallback.showSlack,
      name: typeof saved.name === "string" ? saved.name : fallback.name,
      role: typeof saved.role === "string" ? saved.role : fallback.role,
      companyText:
        typeof saved.companyText === "string" ? saved.companyText : "",
      submittedText:
        typeof saved.submittedText === "string" ? saved.submittedText : "",
      companyReply:
        typeof saved.companyReply === "string" ? saved.companyReply : "",
    };
  } catch {
    return fallback;
  }
}

export function OrgOnboardingPage() {
  const { workspace, user } = useOrgWorkspace();
  const slack = useOrgSlackStatus({ workspaceId: workspace.workspaceId });
  if (!slack.data && !slack.isError)
    return (
      <main
        className={`flex min-h-svh items-center justify-center ${ONBOARDING_BACKGROUND_CLASS}`}
      >
        <LoaderCircle
          className="size-5 animate-spin text-neutral-muted"
          aria-label="온보딩을 준비하고 있어요"
        />
      </main>
    );
  return (
    <OrgOnboardingFlow
      key={`${user.id}:${workspace.workspaceId}`}
      initiallyConnected={slack.data?.connected ?? false}
    />
  );
}

export type OrgOnboardingPreviewOptions = {
  step: OrgOnboardingStep;
  companyReply: string;
  onStepChange: (step: OrgOnboardingStep) => void;
  onComplete: () => void;
  slack: OrgOnboardingSlackPreview;
};

export function OrgOnboardingFlow({
  initiallyConnected,
  preview: previewOptions,
}: {
  initiallyConnected: boolean;
  preview?: OrgOnboardingPreviewOptions;
}) {
  const preview =
    process.env.NODE_ENV !== "production" ? previewOptions : undefined;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspace, user, currentUser, bootstrap, permissions } =
    useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const slack = useOrgSlackStatus({ workspaceId, enabled: !preview });
  const updateProfile = useUpdateOrgMemberProfile();
  const sessionKey = `org-onboarding:${user.id}:${workspaceId}`;
  const [draft, setDraft] = useState<Draft>(() => {
    const name = currentUser?.name?.trim() ?? "";
    const initial: Draft = {
      step: preview?.step ?? "profile",
      showSlack: Boolean(preview) || !initiallyConnected,
      name: name === currentUser?.email || name === "Anonymous" ? "" : name,
      role: currentUser?.role || "",
      companyText: "",
      submittedText: "",
      companyReply: "",
    };
    if (preview) return initial;
    const saved = readDraft(sessionKey, initial);
    if (router.query.step === "slack") {
      saved.showSlack = true;
      saved.step = "slack";
    }
    return saved;
  });
  const [error, setError] = useState(() =>
    router.query.slack === "error" &&
    typeof router.query.slackMessage === "string"
      ? router.query.slackMessage
      : ""
  );
  const [pending, setPending] = useState(false);
  const [slackBusy, setSlackBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(
    preview?.slack.inviteOpen ?? false
  );
  const submitting = useRef(false);
  const [completionStarted, setCompletionStarted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useHtmlClass("bg-bg-basement");

  const homeHref = buildOrgHref({ orgId: workspaceId, page: "home" });
  const nextValue =
    typeof router.query.next === "string" ? router.query.next : "";
  let nextHref = homeHref;
  try {
    const next = new URL(nextValue, "https://harper.local");
    if (
      nextValue &&
      next.origin === "https://harper.local" &&
      (next.pathname === "/org" || next.pathname.startsWith("/org/")) &&
      next.pathname !== "/org/onboarding"
    ) {
      next.searchParams.set("orgId", workspaceId);
      nextHref = `${next.pathname}${next.search}${next.hash}`;
    }
  } catch {
    /* Use the current workspace home. */
  }

  useEffect(() => {
    if (currentUser?.onboardingCompletedAt && !completionStarted)
      void router.replace(nextHref);
  }, [completionStarted, currentUser?.onboardingCompletedAt, nextHref, router]);

  useEffect(() => {
    if (preview) return;
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(draft));
    } catch {
      /* Persistence is optional; completion is server-owned. */
    }
  }, [draft, sessionKey, preview]);

  useEffect(() => {
    if (preview || router.query.step !== "slack") return;
    const query = { ...router.query };
    delete query.step;
    delete query.slack;
    delete query.slackMessage;
    void router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  }, [router, preview]);

  const visibleRoles = getOrgOnboardingRoles(bootstrap.roles);
  const showCompany = Boolean(
    currentUser && canProvideOrgCompanyContext(bootstrap.members, currentUser)
  );
  const steps = getOrgOnboardingSteps({
    showSlack: draft?.showSlack ?? false,
    showCompany,
    roles: visibleRoles,
  });
  const step = draft && steps.includes(draft.step) ? draft.step : "profile";
  const stepIndex = steps.indexOf(step);
  const connectedChannel = slack.data?.channels.find(
    (channel) => channel.isEnabled
  );
  const slackLinks = buildSlackChannelLinks(
    slack.data?.teamId,
    connectedChannel?.channelId
  );
  const companySubmitted = Boolean(
    draft?.companyReply && draft.submittedText === draft.companyText.trim()
  );
  const busy = pending || updateProfile.isPending || slackBusy;
  const roleCopy = getOrgOnboardingRoleCopy(visibleRoles);
  const stepDefinition =
    step === "profile"
      ? definition(
          ["Welcome to", "Harper"],
          "Harper와 함께하게 되신 것을 환영합니다. 가벼운 정보를 알려주세요."
        )
      : step === "slack"
        ? definition(
            ["Harper와 슬랙을 통해", "소통하세요."],
            slack.data?.connected &&
              !connectedChannel &&
              permissions.canManageIntegrations
              ? ORG_SLACK_PRIVATE_CHANNEL_HELP
              : "Slack을 통해 실제 리크루터처럼 소통하실 수 있어요."
          )
        : step === "company"
          ? definition(
              ["회사에 대해서 더 알려주세요."],
              "인재에게 회사를 소개할 때 사용할 정보를 알려주세요. 외부에 공개되지 않은 특별한 포인트라면 더 좋아요. 직접적으로 공개되지 않고, Harper가 적절한 순간에 활용합니다."
            )
          : definition([roleCopy.title], roleCopy.description);

  function go(nextStep: OrgOnboardingStep) {
    if (preview) {
      preview.onStepChange(nextStep);
      return;
    }
    setError("");
    setDraft((value) => (value ? { ...value, step: nextStep } : value));
  }
  const advance = () => go(steps[stepIndex + 1] ?? "done");
  const patch = (values: Partial<Draft>) =>
    setDraft((value) => (value ? { ...value, ...values } : value));

  async function finish() {
    if (submitting.current) return;
    if (preview) {
      preview.onComplete();
      return;
    }
    submitting.current = true;
    setCompletionStarted(true);
    setPending(true);
    setError("");
    // Dispatch inside the click, before awaiting any network request.
    if (slackLinks) window.location.assign(slackLinks.app);
    try {
      await postOrgOnboarding(workspaceId, { action: "complete" });
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {
        /* Optional draft cache. */
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org.bootstrapAll,
      });
      await router.replace(nextHref);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "온보딩을 완료하지 못했어요. 다시 시도해 주세요."
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  async function next() {
    if (!draft || submitting.current || busy) return;
    if (step === "done") {
      void finish();
      return;
    }
    if (step === "slack") {
      if (connectedChannel) advance();
      return;
    }
    if (step === "roles") {
      advance();
      return;
    }
    if (!formRef.current?.reportValidity()) return;
    if (step === "company" && companySubmitted) {
      advance();
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      if (step === "profile") {
        if (!preview) {
          await updateProfile.mutateAsync({
            name: draft.name.trim(),
            role: draft.role.trim(),
            workspaceId,
          });
        }
        advance();
      } else {
        const result = preview
          ? { reply: preview.companyReply }
          : await postOrgOnboarding<{ reply: string }>(workspaceId, {
              action: "company",
              message: draft.companyText.trim(),
            });
        patch({
          companyReply: result.reply,
          submittedText: draft.companyText.trim(),
        });
        if (!preview) {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.org.bootstrapAll,
          });
        }
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "저장하지 못했어요. 다시 시도해 주세요."
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  if (!draft || (currentUser?.onboardingCompletedAt && !completionStarted)) {
    return (
      <main
        className={`flex min-h-svh items-center justify-center ${ONBOARDING_BACKGROUND_CLASS}`}
      >
        <LoaderCircle
          className="size-5 animate-spin text-neutral-muted"
          aria-label="온보딩을 준비하고 있어요"
        />
      </main>
    );
  }
  const slackReturnParams = new URLSearchParams({
    orgId: workspaceId,
    step: "slack",
    next: nextHref,
  });
  return (
    <>
      <Head>
        <title>{workspace.companyName} · Welcome to Harper</title>
      </Head>
      <main
        className={`min-h-svh font-sans text-neutral-primary ${ONBOARDING_BACKGROUND_CLASS}`}
      >
        <OnboardingFrame
          flexibleTitle
          asideAfterTitle={step === "company"}
          progressStep={stepIndex}
          totalSteps={steps.length - 1}
          showProgress={step !== "done"}
          expandContent={step === "company"}
          title={
            step === "done" ? null : (
              <OnboardingTransition
                stepKey={`header-${step}`}
                className="h-full"
              >
                <OnboardingStepHeader stepDefinition={stepDefinition} />
              </OnboardingTransition>
            )
          }
          aside={
            step === "company" ? (
              <aside className="w-full rounded-xl border border-neutral-1000-a05 bg-bg-default p-5 lg:max-h-[calc(100svh-8rem)] lg:overflow-y-auto scrollbar-thin">
                <OrgTeamPage
                  companyOnly
                  readOnlyCompany
                  hideEmptyDescription
                  inlineDescription
                />
              </aside>
            ) : step === "done" ? (
              <div className="flex w-full flex-col gap-4">
                <p className="text-center text-[12px] text-neutral-soft">
                  이렇게 이야기를 시작해 보세요
                </p>
                <OnboardingConversationPreview
                  userMessage="우리 팀에 맞는 백엔드 엔지니어를 찾고 있어요."
                  assistantText={
                    "어떤 일을 맡을 분인가요? 지금 팀에서 가장 먼저 해결하고 싶은 문제부터 알려주세요.\n\n꼭 필요한 경험과 함께 일하는 방식을 듣고, 찾는 분의 기준을 같이 정리할게요."
                  }
                />
              </div>
            ) : undefined
          }
          footer={
            <>
              {error ? (
                <p
                  className="mb-3 text-[13px] leading-5 text-critical"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              {step === "slack" && permissions.canManageIntegrations ? (
                <div className="mb-3 text-center">
                  <MuteButton
                    size="sm"
                    variant="transparent"
                    onClick={() => setInviteOpen(true)}
                    disabled={busy}
                  >
                    혹시 Slack이 다른 계정에 연결되어 있으신가요?
                  </MuteButton>
                </div>
              ) : null}
              <OnboardingFooter
                onNext={() => void next()}
                onPrev={
                  stepIndex > 0 && step !== "done"
                    ? () => go(steps[stepIndex - 1])
                    : undefined
                }
                pending={busy}
                disabled={step === "slack" && !connectedChannel}
                nextLabel={
                  pending
                    ? step === "company"
                      ? "회사 이야기를 읽고 있어요…"
                      : "저장 중…"
                    : step === "profile"
                      ? "시작하기"
                      : step === "company" && !companySubmitted
                        ? "회사 정보에 반영하기"
                        : step === "done"
                          ? "완료"
                          : "다음"
                }
                hint={
                  step === "profile" ? (
                    <>
                      press <Badge>Enter</Badge>
                    </>
                  ) : undefined
                }
              >
                {step === "slack" || step === "company" ? (
                  <div className="mt-3 text-center">
                    <MuteButton
                      variant="transparent"
                      onClick={advance}
                      disabled={busy}
                    >
                      건너뛰기
                    </MuteButton>
                  </div>
                ) : null}
              </OnboardingFooter>
            </>
          }
        >
          <OnboardingTransition
            stepKey={`body-${step}`}
            className={`flex w-full flex-col items-stretch ${step === "slack" ? "h-full min-h-0" : "min-h-full"}`}
          >
            {step === "profile" ? (
              <form
                ref={formRef}
                className="grid gap-5"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void next();
                  }
                }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void next();
                }}
              >
                <div className="grid gap-2">
                  <OnboardingFieldLabel htmlFor="org-onboarding-name">
                    이름
                  </OnboardingFieldLabel>
                  <Input
                    autoFocus
                    autoComplete="name"
                    id="org-onboarding-name"
                    value={draft.name}
                    onChange={(event) => patch({ name: event.target.value })}
                    maxLength={200}
                    required
                    disabled={busy}
                  />
                </div>
                <div className="grid gap-2">
                  <OnboardingFieldLabel htmlFor="org-onboarding-role">
                    직함
                  </OnboardingFieldLabel>
                  <Input
                    autoComplete="organization-title"
                    id="org-onboarding-role"
                    value={draft.role}
                    onChange={(event) => patch({ role: event.target.value })}
                    placeholder="예: CEO, CTO, 채용 매니저"
                    maxLength={160}
                    required
                    disabled={busy}
                  />
                </div>
              </form>
            ) : null}
            {step === "slack" ? (
              <>
                {slack.isError ? (
                  <div className="mb-4 text-[13px] text-critical" role="alert">
                    Slack 연결 정보를 불러오지 못했어요.{" "}
                    <MuteButton
                      variant="transparent"
                      onClick={() => void slack.refetch()}
                    >
                      다시 불러오기
                    </MuteButton>
                  </div>
                ) : null}
                <OrgOnboardingSlack
                  preview={preview?.slack}
                  inviteOpen={inviteOpen}
                  onInviteOpenChange={setInviteOpen}
                  status={slack.data}
                  refreshing={slack.isFetching}
                  returnTo={`/org/onboarding?${slackReturnParams}`}
                  onBusyChange={setSlackBusy}
                  onRefresh={() => {
                    if (!preview) void slack.refetch();
                  }}
                />
              </>
            ) : null}
            {step === "company" ? (
              <form
                ref={formRef}
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void next();
                }}
              >
                <div className="grid gap-2">
                  <OnboardingFieldLabel htmlFor="org-onboarding-company">
                    Pitch
                  </OnboardingFieldLabel>
                  <Textarea
                    autoFocus
                    id="org-onboarding-company"
                    value={draft.companyText}
                    onChange={(event) =>
                      patch({ companyText: event.target.value })
                    }
                    placeholder="ex. 최근에 공격적으로 팀을 확장하고 있습니다. 미국 비자 Sponsorship 가능합니다. 등"
                    className="min-h-[220px]"
                    rows={8}
                    required
                    maxLength={8000}
                    disabled={pending}
                  />
                </div>
                {pending ? (
                  <div
                    className="flex items-center gap-3 text-[13px] text-neutral-muted"
                    role="status"
                  >
                    <Face status="closing" size={40} />
                    회사 이야기를 읽고, 기존 정보와 함께 정리하고 있어요.
                  </div>
                ) : null}
                {draft.companyReply ? (
                  <div
                    className="border-t border-neutral-1000-a10 pt-5"
                    aria-live="polite"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Face status="idle" size={32} />
                      <span className="text-[13px]">Harper</span>
                    </div>
                    <RichText
                      content={draft.companyReply}
                      className="text-[14px] leading-6"
                    />
                  </div>
                ) : null}
              </form>
            ) : null}
            {step === "roles" ? (
              <div className="space-y-3">
                {visibleRoles.map((role) => {
                  const status = getOrgRoleStatusPresentation(role.status);
                  return (
                    <article
                      key={role.roleId}
                      className="rounded-xl border border-neutral-1000-a10 bg-neutral-50 p-4 shadow-xs"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        {/* <BriefcaseBusiness className="size-4 text-neutral-muted" /> */}
                        <h2 className="text-[16px] font-medium">{role.name}</h2>
                        <Badge
                          tone={
                            status.tone === "action" ? "positive" : status.tone
                          }
                          variant="faded"
                          radius="full"
                        >
                          {status.status === "draft"
                            ? "준비된 초안"
                            : status.label}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[12px] leading-5 text-neutral-soft">
                        {[
                          role.locationText,
                          role.workMode,
                          ...role.employmentTypes,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {role.description ? (
                        <div className="mt-3 line-clamp-2 text-[13px] leading-6 text-neutral-muted">
                          <RichText content={role.description} />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
            {step === "done" ? (
              <OnboardingReadyBody
                title={`${draft.name.trim()}님, 환영합니다.`}
                description={
                  slackLinks
                    ? "이제 채용 이야기를 함께 시작해요.\n연결한 채널에서 @Harper를 불러주세요.\n찾는 인재, 후보자에 대한 의견, 궁금한 점까지 편하게 말씀해 주세요."
                    : "이제 채용 이야기를 함께 시작해요.\n회사 화면에서 역할을 열고 Harper에게 말씀해 주세요.\n원하는 인재의 기준부터 함께 정리할 수 있어요."
                }
              />
            ) : null}
          </OnboardingTransition>
        </OnboardingFrame>
      </main>
    </>
  );
}
