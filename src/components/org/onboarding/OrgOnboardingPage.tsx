import { OrgSignupPlan } from "./OrgSignupPlan";
import {
  OrgOnboardingGuideBody,
  OrgOnboardingGuideHeader,
} from "./OrgOnboardingGuide";
import { signupRequest, useSignupCompany } from "./signupClient";
import {
  isAdditionalOrgCreator,
  isOrgOnboardingComplete,
  signupErrorMessage,
} from "@/lib/org/signup";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, LoaderCircle, MessageCircleText, Scan } from "lucide-react";
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
import {
  OrgOnboardingResultUnconfirmedError,
  type OrgOnboardingCompleteResult,
  postOrgOnboarding,
  submitOrgOnboardingCompany,
} from "./client";

export const ORG_SLACK_PRIVATE_CHANNEL_HELP = [
  "비공개 채널이 보이지 않나요?",
  "Slack의 해당 채널에서 /invite @Harper를 입력한 뒤 아래의 새로고침 버튼을 눌러 주세요.",
] as const;

type Draft = {
  step: OrgOnboardingStep;
  showSlack: boolean;
  name: string;
  role: string;
  companyText: string;
  companyName: string;
  companyDescription: string;
  companyLinkedinUrl: string;
  companyTouched: string[];
  submittedText: string;
  companyReply: string;
  submissionId: string;
  submissionText: string;
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
      "company-details",
      "company",
      "roles",
      "plan",
      "guide",
      "done",
    ];
    return {
      step: steps.includes(saved.step) ? saved.step : fallback.step,
      companyName:
        typeof saved.companyName === "string"
          ? saved.companyName
          : fallback.companyName,
      companyDescription:
        typeof saved.companyDescription === "string"
          ? saved.companyDescription
          : fallback.companyDescription,
      companyLinkedinUrl:
        typeof saved.companyLinkedinUrl === "string"
          ? saved.companyLinkedinUrl
          : fallback.companyLinkedinUrl,
      companyTouched: Array.isArray(saved.companyTouched)
        ? saved.companyTouched.filter((s: unknown) => typeof s === "string")
        : [],
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
      submissionId:
        typeof saved.submissionId === "string" ? saved.submissionId : "",
      submissionText:
        typeof saved.submissionText === "string" ? saved.submissionText : "",
    };
  } catch {
    return fallback;
  }
}

export function OrgOnboardingPage() {
  const { c } = useOrgLocale();
  const { workspace, user } = useOrgWorkspace();
  const slack = useOrgSlackStatus({ workspaceId: workspace.workspaceId, enabled: !workspace.isReviewing });
  if (!workspace.isReviewing && !slack.data && !slack.isError)
    return (
      <main
        className={`flex min-h-svh items-center justify-center ${ONBOARDING_BACKGROUND_CLASS}`}
      >
        <LoaderCircle
          className="size-5 animate-spin text-neutral-muted"
          aria-label={c("온보딩을 준비하고 있어요", "Preparing onboarding")}
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
  const { locale: responseLocale, c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const preview = previewOptions;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspace, user, currentUser, bootstrap, permissions } =
    useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const selfServe = workspace.signupState?.createdBy === user.id;
  const additionalOrg = isAdditionalOrgCreator(workspace.signupState, user.id);
  const hasProfile = Boolean(
    currentUser?.name?.trim() && currentUser?.role?.trim()
  );
  const onboardingComplete = isOrgOnboardingComplete(
    workspace.signupState,
    currentUser,
    user.id
  );
  const research = useSignupCompany(workspaceId, selfServe && !preview);
  const slack = useOrgSlackStatus({ workspaceId, enabled: !preview && !workspace.isReviewing });
  const updateProfile = useUpdateOrgMemberProfile();
  const sessionKey = `org-onboarding:${user.id}:${workspaceId}`;
  const [draft, setDraft] = useState<Draft>(() => {
    const name = currentUser?.name?.trim() ?? "";
    const initial: Draft = {
      step:
        preview?.step ??
        (selfServe && currentUser?.name?.trim() && currentUser?.role?.trim()
          ? workspace.signupState?.companyConfirmedAt
            ? !additionalOrg && workspace.signupState.planSelectedAt
              ? "guide"
              : "company"
            : "company-details"
          : "profile"),
      showSlack: Boolean(preview) || !initiallyConnected,
      name: name === currentUser?.email || name === "Anonymous" ? "" : name,
      role: currentUser?.role || "",
      companyText: "",
      companyName: workspace.signupState?.companyConfirmedAt
        ? workspace.companyName
        : "",
      companyDescription: workspace.signupState?.companyConfirmedAt
        ? (workspace.companyDescription ?? "")
        : "",
      companyLinkedinUrl: workspace.signupState?.companyConfirmedAt
        ? (workspace.companyProfile?.linkedinUrl ?? "")
        : "",
      companyTouched: [],
      submittedText: "",
      companyReply: "",
      submissionId: "",
      submissionText: "",
    };
    if (preview) return initial;
    const saved = readDraft(sessionKey, initial);
    if (router.query.step === "plan" && !additionalOrg)
      saved.step = workspace.signupState?.companyConfirmedAt
        ? "plan"
        : "company-details";
    if (router.query.step === "slack") {
      saved.showSlack = true;
      saved.step = "slack";
    }
    if (selfServe) {
      if (!currentUser?.name?.trim() || !currentUser?.role?.trim())
        saved.step = "profile";
      else if (
        saved.step !== "profile" &&
        !workspace.signupState?.companyConfirmedAt
      )
        saved.step = "company-details";
      else if (
        !additionalOrg &&
        saved.step === "done" &&
        !workspace.signupState?.planSelectedAt
      )
        saved.step = "plan";
      if (
        additionalOrg &&
        hasProfile &&
        (saved.step === "profile" || saved.step === "plan")
      )
        saved.step = workspace.signupState?.companyConfirmedAt
          ? "company"
          : "company-details";
    }
    if (workspace.isReviewing && (saved.step === "slack" || saved.step === "plan"))
      saved.step = workspace.signupState?.companyConfirmedAt ? "company" : "company-details";
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
  const [planBusy, setPlanBusy] = useState(false);
  useEffect(() => {
    if (!selfServe || preview) return;
    void signupRequest(workspaceId, "research")
      .then(() => research.refetch())
      .catch(() => {});
    // One claim per mount; the server owns concurrency, retry limits and progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfServe, workspaceId, preview]);
  useEffect(() => {
    const company = research.data?.company;
    if (!selfServe || !company) return;
    setDraft((value) => ({
      ...value,
      companyName: value.companyTouched.includes("name")
        ? value.companyName
        : company.name,
      companyDescription: value.companyTouched.includes("description")
        ? value.companyDescription
        : company.description,
      companyLinkedinUrl: value.companyTouched.includes("linkedinUrl")
        ? value.companyLinkedinUrl
        : company.linkedinUrl,
    }));
  }, [research.data?.company, selfServe]);

  const homeHref = buildOrgHref({ orgId: workspaceId, page: "home" });
  const nextValue =
    typeof router.query.next === "string" ? router.query.next : "";
  let nextHref = homeHref;
  try {
    const next = new URL(nextValue, "https://harper.local");
    if (
      !workspace.isReviewing && !selfServe &&
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
    if (onboardingComplete && !completionStarted) void router.replace(nextHref);
  }, [completionStarted, onboardingComplete, nextHref, router]);

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
  const showCompany =
    additionalOrg ||
    Boolean(
      currentUser && canProvideOrgCompanyContext(bootstrap.members, currentUser)
    );
  const steps = getOrgOnboardingSteps({
    showSlack: !workspace.isReviewing && (draft?.showSlack ?? false),
    showCompany,
    showCompanyDetails: selfServe,
    roles: visibleRoles,
    showPlan: selfServe && !additionalOrg && !workspace.isReviewing,
    showProfile: !(additionalOrg && hasProfile),
  });
  const step = draft && steps.includes(draft.step) ? draft.step : steps[0];
  const stepIndex = steps.indexOf(step);
  const progressSteps: OrgOnboardingStep[] = steps.filter(
    (item) => item !== "guide" && item !== "done"
  );
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
  const busy = pending || updateProfile.isPending || slackBusy || planBusy;
  const roleCopy = getOrgOnboardingRoleCopy(visibleRoles);
  const guideItems = [
    {
      id: "search",
      icon: Scan,
      title: c("원하는 인재 찾기", "Find the right people"),
      description: c(
        "어떤 일을 맡길지, 꼭 필요한 기준은 무엇인지 알려주세요. JD가 없더라도 시작할 수 있어요.",
        "Tell Harper what the person will do and the requirements that matter most. You can get started even without a job description."
      ),
    },
    {
      id: "criteria",
      icon: Calendar,
      title: c(
        "인터뷰를 잡거나 대신 질문도 전달해요.",
        "Schedule interviews and send questions"
      ),
      description: c(
        "Calendar를 등록하시면, 요청시 바로 가능한 일정을 후보자에게 보내 인터뷰를 확정할 수 있어요.\n대신 후보자에게 질문도 전달할 수 있어요. ex) @Harper 혹시 지금 당장 이직 가능하신가요?",
        "Connect your calendar, and Harper can share your available times with candidates to arrange an interview when you ask.\nHarper can also pass along your questions. For example: @Harper, could you ask whether they’re open to a move right now?"
      ),
    },
    {
      id: "feedback",
      icon: MessageCircleText,
      title: c("후보자에 대해 질문하기", "Ask about candidates"),
      description: c(
        "Harper가 후보자에 대해 아는 내용을 바탕으로, 공개가능한 정보라면 답변드릴 수 있어요. ex) @Harper 이 분 지금 왜 이직하려고 하시는거야?",
        "Harper can answer questions based on what it knows about a candidate, using information that can be shared. For example: @Harper, why are they considering a move?"
      ),
    },
  ];
  const stepDefinition =
    step === "guide"
      ? definition(
          [
            c("Harper에게 이런 걸", "Here’s what you can ask"),
            c("요청할 수 있어요.", "Harper to do."),
          ],
          ""
        )
      : step === "plan"
        ? definition(
            [
              c(
                "채용에 맞는 요금제를 선택하세요",
                "Choose a plan for your team"
              ),
            ],
            c(
              "무료로 시작하고, 필요할 때 슬롯을 추가할 수 있어요.",
              "Start free, and add slots when you need them."
            )
          )
        : step === "company-details"
          ? definition(
              [c("회사 정보를 확인해 주세요", "Confirm your company details")],
              research.data?.company
                ? c(
                    "회사 이메일을 바탕으로 찾은 정보예요. 틀린 부분은 수정해 주세요.",
                    "We found these details using your work email domain. Review them and make any corrections."
                  )
                : c(
                    "회사 이름을 확인해 주세요. 회사 소개는 선택 사항이며, 나중에도 수정할 수 있어요.",
                    "Confirm your company’s name. A description is optional, and you can edit these details later."
                  )
            )
          : step === "profile"
            ? definition(
                ["Welcome to Harper"],
                c(
                  "Harper와 함께하게 되신 것을 환영합니다. 가벼운 정보를 알려주세요.",
                  "Welcome to Harper. Share a few quick details."
                )
              )
            : step === "slack"
              ? definition(
                  [
                    c("Harper와 슬랙을 통해", "Chat with Harper"),
                    c("소통하세요.", "in Slack"),
                  ],
                  slack.data?.connected &&
                    !connectedChannel &&
                    permissions.canManageIntegrations
                    ? ORG_SLACK_PRIVATE_CHANNEL_HELP.map(sourceT)
                    : c(
                        "Slack을 통해 실제 리크루터처럼 소통하실 수 있어요.",
                        "Chat with Harper in Slack as you would with a recruiter."
                      )
                )
              : step === "company"
                ? definition(
                    [
                      c(
                        "회사에 대해서 더 알려주세요.",
                        "Tell us about your company"
                      ),
                    ],
                    c(
                      "인재에게 회사를 소개할 때 사용할 정보를 알려주세요. 외부에 공개되지 않은 특별한 포인트라면 더 좋아요. 직접적으로 공개되지 않고, Harper가 적절한 순간에 활용합니다.",
                      "Add details Harper can use when introducing your company to candidates, especially points they won't find elsewhere. Harper will use them where relevant rather than publishing this text as written."
                    )
                  )
                : definition(
                    [sourceT(roleCopy.title)],
                    sourceT(roleCopy.description)
                  );

  const go = useCallback(
    (nextStep: OrgOnboardingStep) => {
      if (preview) {
        preview.onStepChange(nextStep);
        return;
      }
      setError("");
      setDraft((value) => (value ? { ...value, step: nextStep } : value));
    },
    [preview]
  );
  const planSelected = useCallback(() => go("guide"), [go]);
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
    try {
      const result = await postOrgOnboarding<OrgOnboardingCompleteResult>(
        workspaceId,
        {
          action: "complete",
          responseLocale,
        }
      );
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {
        /* Optional draft cache. */
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org.bootstrapAll,
      });
      await router.replace(nextHref);
      if (!workspace.isReviewing && result.slackUrl) window.location.assign(result.slackUrl);
    } catch (error) {
      setError(
        selfServe
          ? signupErrorMessage(error, responseLocale)
          : localizedOrgErrorMessage(
              error,
              responseLocale,
              c(
                "온보딩을 완료하지 못했어요. 다시 시도해 주세요.",
                "Failed to complete onboarding. Try again."
              )
            )
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
    if (step === "plan") return;
    if (step === "roles" || step === "guide") {
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
      } else if (step === "company-details") {
        if (!preview) {
          await signupRequest(workspaceId, "company", {
            name: draft.companyName,
            description: draft.companyDescription,
            linkedinUrl: draft.companyLinkedinUrl,
          });
          await queryClient.invalidateQueries({
            queryKey: queryKeys.org.bootstrapAll,
          });
        }
        advance();
      } else {
        const message = draft.companyText.trim();
        const submissionId =
          draft.submissionText === message && draft.submissionId
            ? draft.submissionId
            : crypto.randomUUID();
        patch({ submissionId, submissionText: message });
        if (!preview) {
          try {
            sessionStorage.setItem(
              sessionKey,
              JSON.stringify({
                ...draft,
                submissionId,
                submissionText: message,
              })
            );
          } catch {
            /* The in-memory request identity still protects this tab. */
          }
        }
        const reply = preview
          ? preview.companyReply
          : await submitOrgOnboardingCompany({
              message,
              responseLocale,
              submissionId,
              workspaceId,
            });
        patch({
          companyReply: reply,
          submittedText: message,
        });
        if (!preview) {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.org.bootstrapAll,
          });
        }
      }
    } catch (error) {
      setError(
        error instanceof OrgOnboardingResultUnconfirmedError
          ? c(
              "회사 정보 반영 결과를 아직 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
              "We couldn't confirm whether your company information was saved. Try again shortly to check the same request."
            )
          : step === "company-details"
            ? signupErrorMessage(error, responseLocale)
            : localizedOrgErrorMessage(
                error,
                responseLocale,
                c(
                  "저장하지 못했어요. 다시 시도해 주세요.",
                  "Failed to save. Try again."
                )
              )
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  if (!draft || (onboardingComplete && !completionStarted)) {
    return (
      <main
        className={`flex min-h-svh items-center justify-center ${ONBOARDING_BACKGROUND_CLASS}`}
      >
        <LoaderCircle
          className="size-5 animate-spin text-neutral-muted"
          aria-label={c("온보딩을 준비하고 있어요", "Preparing onboarding")}
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
        <title>
          {workspace.companyName}{" "}
          {c(" · Welcome to Harper", " · Welcome to Harper")}
        </title>
      </Head>
      <main
        className={`min-h-svh font-sans text-neutral-primary ${ONBOARDING_BACKGROUND_CLASS}`}
      >
        <OnboardingFrame
          flexibleTitle
          wide={step === "plan"}
          asideAfterTitle={step === "company"}
          progressStep={Math.max(0, progressSteps.indexOf(step))}
          totalSteps={progressSteps.length}
          showProgress={progressSteps.includes(step)}
          expandContent={
            step === "company-details" || step === "company" || step === "plan"
          }
          title={
            step === "done" ? null : (
              <OnboardingTransition
                stepKey={`header-${step}`}
                className="h-full"
              >
                {step === "guide" ? (
                  <OrgOnboardingGuideHeader
                    title={stepDefinition.title.join(" ")}
                  />
                ) : (
                  <OnboardingStepHeader
                    stepDefinition={stepDefinition}
                    titleLeading={
                      step === "profile" ? (
                        <Image
                          src="/svgs/face.svg"
                          alt=""
                          aria-hidden
                          width={40}
                          height={47}
                          className="mt-1.5 size-6 shrink-0 object-contain"
                          loading="eager"
                        />
                      ) : undefined
                    }
                  />
                )}
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
            ) : step === "done" && !workspace.isReviewing ? (
              <div className="flex w-full flex-col gap-4">
                <p className="text-center text-[12px] text-neutral-soft">
                  {c("이렇게 이야기를 시작해 보세요", "Try this opener")}
                </p>
                <OnboardingConversationPreview
                  userMessage={c(
                    "뛰어난 엔지니어를 찾고 있어요.",
                    "Looking for a stellar engineer."
                  )}
                  assistantText={c(
                    "어떤 일을 맡을 분인가요? 지금 팀에서 가장 먼저 해결하고 싶은 문제부터 알려주세요.\n\n꼭 필요한 경험과 함께 일하는 방식을 듣고, 찾는 분의 기준을 같이 정리할게요.",
                    "What will this person do? Start with the biggest problem your team needs to solve now.\n\nTell us must-have experience and working style, and we'll help define the candidate criteria."
                  )}
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
                    {c(
                      "혹시 Slack이 다른 계정에 연결되어 있으신가요?",
                      "Is Slack connected to another account?"
                    )}
                  </MuteButton>
                </div>
              ) : null}
              {step !== "plan" ? (
                <OnboardingFooter
                  onNext={() => void next()}
                  previousLabel={c("이전", "Back")}
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
                        ? c(
                            "회사 이야기를 읽고 있어요…",
                            "Reading company info…"
                          )
                        : step === "done" && slackLinks
                          ? c(
                              "Harper가 인사를 준비하고 있어요…",
                              "Preparing your welcome…"
                            )
                          : c("저장 중…", "Saving…")
                      : step === "profile"
                        ? c("시작하기", "Get started")
                        : step === "company-details"
                          ? c("확인하고 계속하기", "Confirm and continue")
                          : step === "company" && !companySubmitted
                            ? c(
                                "회사 정보에 반영하기",
                                "Apply to company profile"
                              )
                            : step === "done"
                              ? c("완료", "Complete")
                              : c("다음", "Next")
                  }
                  hint={
                    step === "profile" ? (
                      <>
                        {c("press", "press")}
                        <Badge>{c("Enter", "Enter")}</Badge>
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
                        {c("건너뛰기", "Skip")}
                      </MuteButton>
                    </div>
                  ) : null}
                </OnboardingFooter>
              ) : (
                <MuteButton
                  variant="transparent"
                  disabled={busy}
                  onClick={() => go(steps[stepIndex - 1])}
                >
                  {c("이전", "Back")}
                </MuteButton>
              )}
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
                    {c("이름", "Name")}
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
                    {c("직함", "Title")}
                  </OnboardingFieldLabel>
                  <Input
                    autoComplete="organization-title"
                    id="org-onboarding-role"
                    value={draft.role}
                    onChange={(event) => patch({ role: event.target.value })}
                    placeholder={c(
                      "예: CEO, CTO, 채용 매니저",
                      "e.g., CEO, CTO, hiring manager"
                    )}
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
                    {c(
                      "Slack 연결 정보를 불러오지 못했어요.",
                      "Couldn't load Slack connection info."
                    )}{" "}
                    <MuteButton
                      variant="transparent"
                      onClick={() => void slack.refetch()}
                    >
                      {c("다시 불러오기", "Reload")}
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
            {step === "company-details" ? (
              <form
                ref={formRef}
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void next();
                }}
              >
                {(
                  [
                    [
                      "name",
                      c("회사명", "Company name"),
                      draft.companyName,
                      "companyName",
                    ],
                    [
                      "linkedinUrl",
                      c(
                        "LinkedIn 회사 페이지 · 선택",
                        "LinkedIn company page · optional"
                      ),
                      draft.companyLinkedinUrl,
                      "companyLinkedinUrl",
                    ],
                    [
                      "description",
                      c(
                        "회사 소개 · 선택",
                        "What does your company do? · optional"
                      ),
                      draft.companyDescription,
                      "companyDescription",
                    ],
                  ] as const
                ).map(([key, label, value, field]) => (
                  <div key={key} className="grid gap-2">
                    <OnboardingFieldLabel htmlFor={`signup-company-${key}`}>
                      {label}
                    </OnboardingFieldLabel>
                    {key === "description" ? (
                      <Textarea
                        id={`signup-company-${key}`}
                        rows={6}
                        maxLength={8000}
                        value={value}
                        disabled={busy}
                        onChange={(event) =>
                          setDraft((d) => ({
                            ...d,
                            [field]: event.target.value,
                            companyTouched: [
                              ...new Set([...d.companyTouched, key]),
                            ],
                          }))
                        }
                      />
                    ) : (
                      <Input
                        id={`signup-company-${key}`}
                        value={value}
                        required={key === "name"}
                        maxLength={key === "name" ? 160 : 400}
                        placeholder={
                          key === "linkedinUrl"
                            ? "https://www.linkedin.com/company/…"
                            : undefined
                        }
                        disabled={busy}
                        onChange={(event) =>
                          setDraft((d) => ({
                            ...d,
                            [field]: event.target.value,
                            companyTouched: [
                              ...new Set([...d.companyTouched, key]),
                            ],
                          }))
                        }
                      />
                    )}
                  </div>
                ))}
                {research.data?.state.researchStatus === "pending" ? (
                  <p
                    role="status"
                    className="text-xs leading-6 text-neutral-muted"
                  >
                    {c(
                      "회사 정보를 찾고 있어요. 기다리지 않고 직접 입력해도 괜찮아요.",
                      "We’re looking up your company. You can also fill in the details now."
                    )}
                  </p>
                ) : null}
                {research.isError ||
                research.data?.state.researchStatus === "failed" ? (
                  <p className="text-xs leading-6 text-neutral-muted"></p>
                ) : null}
                {research.data?.company?.sources.length ? (
                  <p className="text-xs text-neutral-soft">
                    {c("참고한 페이지: ", "Source: ")}
                    {research.data.company.sources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4"
                      >
                        {source.title}
                      </a>
                    ))}
                  </p>
                ) : null}
              </form>
            ) : null}
            {step === "plan" && selfServe ? (
              <OrgSignupPlan
                workspaceId={workspaceId}
                preview={Boolean(preview)}
                onSelected={planSelected}
                onBusyChange={setPlanBusy}
              />
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
                    {c("Pitch", "Pitch")}
                  </OnboardingFieldLabel>
                  <Textarea
                    autoFocus
                    id="org-onboarding-company"
                    value={draft.companyText}
                    onChange={(event) =>
                      patch({ companyText: event.target.value })
                    }
                    placeholder={c(
                      "ex. 최근에 공격적으로 팀을 확장하고 있습니다. 미국 비자 Sponsorship 가능합니다. 등",
                      "ex. Recently scaling aggressively. US visa sponsorship available."
                    )}
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
                    {c(
                      "회사 이야기를 읽고, 기존 정보와 함께 정리하고 있어요.",
                      "Reading company story and consolidating with existing info…"
                    )}
                  </div>
                ) : null}
                {draft.companyReply ? (
                  <div
                    className="border-t border-neutral-1000-a10 pt-5"
                    aria-live="polite"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Face status="idle" size={32} />
                      <span className="text-[13px]">
                        {c("Harper", "Harper")}
                      </span>
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
                            ? c("준비된 초안", "Draft ready")
                            : sourceT(status.label)}
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
            {step === "guide" ? (
              <OrgOnboardingGuideBody items={guideItems} />
            ) : null}
            {step === "done" ? (
              <OnboardingReadyBody
                title={c("{p0}님, 환영합니다.", "Welcome, {p0}.", {
                  p0: draft.name.trim(),
                })}
                description={
                  workspace.isReviewing ? (
                    c("입력한 정보를 저장했어요. 완료 후 가입 검토 상태를 확인할 수 있어요.", "Your information is saved. Complete onboarding to view your account review status.")
                  ) : slackLinks ? (
                    <>
                      <span className="block">
                        {c(
                          "이제 채용 이야기를 함께 시작해요.",
                          "Now start the hiring conversation."
                        )}
                      </span>
                      <span className="block">
                        {c(
                          "참여 중인 연결 채널이 있으면, Slack에서 Harper가 먼저 인사드릴게요.",
                          "If you’re in a connected channel, Harper will welcome you in Slack."
                        )}
                      </span>
                      <span className="block">
                        {c(
                          "찾는 인재, 후보자에 대한 의견, 궁금한 점까지 편하게 말씀해 주세요.",
                          "Share the kind of candidate you want, feedback, or any questions."
                        )}
                      </span>
                    </>
                  ) : selfServe ? (
                    c(
                      "준비가 끝났어요. 첫 채용을 등록하고\nHarper와 원하는 인재의 기준을 함께 정리해 보세요.",
                      "You’re ready. Create your first role and\nwork with Harper to define who you’re looking for."
                    )
                  ) : (
                    c(
                      "이제 채용 이야기를 함께 시작해요.\n회사 화면에서 역할을 열고 Harper에게 말씀해 주세요.\n원하는 인재의 기준부터 함께 정리할 수 있어요.",
                      "Now start the hiring conversation.\nOpen a role in the company view and message Harper.\nStart by defining the desired candidate criteria together."
                    )
                  )
                }
              />
            ) : null}
          </OnboardingTransition>
        </OnboardingFrame>
      </main>
    </>
  );
}
