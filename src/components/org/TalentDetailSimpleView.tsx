import {
  orgCandidateActivityKind,
  orgCandidateActivityTitle,
} from "@/lib/org/candidateActivityFeed";
import { TalentDetailPager } from "./TalentDetailPager";
import { OrgPassPopover } from "./OrgPassPopover";
import { OrgCandidateReview } from "./OrgCandidateReview";
import { OrgCandidateProfilePreview } from "./OrgCandidateProfilePreview";
import { useOrgCandidateSave } from "@/hooks/org/useOrgCandidateSave";
import { isOrgQueryAccessError } from "@/lib/org/queryError";
import { isOrgCandidateProfilePreview } from "@/lib/org/candidatePreview";
import { OrgTalentProfile } from "./OrgTalentProfile";
import { getHarperProgressText } from "@/components/org/harperProgressPresentation";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import dynamic from "next/dynamic";
import {
  FolderInput,
  ChevronDown,
  ChevronLeft,
  LoaderCircle,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { opsTheme } from "@/components/ops/theme";
import {
  ProgressFeed,
  type ProgressFeedIcon,
  type ProgressFeedItem,
  type ProgressFeedLabels,
} from "@/components/progress-feed/ProgressFeed";
import { ConnectionConfirmationEmailFeedCard } from "@/components/progress-feed/ConnectionConfirmationEmailFeedCard";
import { useOrgCandidateProgressStages } from "@/components/org/OrgCandidateProgressLine";
import { CompanyTalentRequestFeedCard } from "@/components/progress-feed/CompanyTalentRequestFeedCard";
import { OrgIntroEmailFeedCard } from "@/components/progress-feed/OrgIntroEmailFeedCard";
import { MuteButton } from "@/components/ui/button";
import { Tooltips } from "@/components/ui/tooltip";
import { OrgCandidateRoleMoveDialog } from "@/components/org/OrgCandidateRoleMoveDialog";

import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StopCandidateDialog } from "@/components/org/OrgCandidateDecisionDialogs";
import { OrgStageMoveDialog } from "@/components/org/OrgStageMoveDialog";
import { CompanyIntroRequestDialog } from "@/components/org/CompanyIntroDecisionDialogs";
import {
  InternalOnlyHatch,
  InternalOnlySurface,
} from "@/components/org/internal/InternalOnlySurface";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { formatKst } from "@/components/ops/career/utils";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { PendingConnectionDialog } from "@/components/review-pipeline/PendingConnectionDialog";
import { useOpsCareerDetail } from "@/hooks/ops/useOpsCareer";
import {
  useCancelOrgCompanyTalentRequest,
  useCreateOrgFeedItem,
  useDeleteOrgFeedItem,
  useOpenOrgResume,
  usePassOrgCompanyIntro,
  useRequestOrgCompanyIntro,
  useUpdateOrgConnectionConfirmationEmail,
  useUpdateOrgFeedItem,
} from "@/hooks/org/useOrg";
import {
  useOrgJobsCandidateActions,
  useOrgJobsDetail,
  useOrgJobsNavigation,
  useOptionalOrgJobsBoard,
} from "@/hooks/org/useOrgJobs";
import type { OrgTalentSelection } from "@/hooks/org/useOrgJobsRoute";
import { useOrgInternalTalentSystem } from "@/hooks/org/useOrgInternalTalent";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import type { CareerTalentOpsProfileMemo } from "@/lib/ops/careerServer";
import { extractEmailAddress } from "@/lib/email/parse";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OrgInternalTalentSystemResponse } from "@/lib/org/internalTalentTypes";
import {
  canStopOrgCandidateProcess,
  CANDIDATE_DECISION_LABELS,
} from "@/lib/org/candidateDecision";
import { getOrgTalentDetailNavigationState } from "@/lib/org/detailNavigation";
import {
  humanizeOrgStage,
} from "@/lib/org/pipelineStage";
import { companyPresentationFinalFitLabel } from "@/lib/org/companyCriteriaEvaluations";
import type {
  OrgOtherRoleFeedResponse,
  OrgTalentDetailResponse,
} from "@/lib/org/server";
import { cn } from "@/lib/utils";
import { suggestOrgStopReasons } from "@/lib/org/evaluationSuggestions";
import { useToastStore } from "@/store/useToastStore";
import { useOrgCandidateDecisionRunner } from "@/hooks/org/useOrgCandidateDecisionRunner";
import Face from "../common/Face";

const OrgInternalTalentPanel = dynamic(
  () => import("@/components/org/internal/OrgInternalTalentPanel"),
  {
    loading: () => (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    ),
    ssr: false,
  }
);

function HarperMemoSection({
  error,
  isLoading,
  memos,
}: {
  error: Error | null;
  isLoading: boolean;
  memos: CareerTalentOpsProfileMemo[];
}) {
  const { locale, c } = useOrgLocale();
  const sortedMemos = [...memos].sort((left, right) =>
    (right.updatedAt ?? right.createdAt ?? "").localeCompare(
      left.updatedAt ?? left.createdAt ?? ""
    )
  );

  return (
    <InternalOnlySurface
      className="rounded-md bg-positive-faded px-4 py-4"
      showLabel={false}
    >
      <div className="relative z-20">
        <div className="text-[14px] font-medium text-neutral-primary">
          {c("Harper 메모", "Harper notes")}
        </div>
        {isLoading ? (
          <div aria-busy="true" className="mt-3 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : error ? (
          <div className="mt-3 text-sm leading-5 text-critical">
            {error.message}
          </div>
        ) : sortedMemos.length > 0 ? (
          <div className="mt-3 space-y-3">
            {sortedMemos.map((memo) => (
              <div key={memo.id}>
                <div className="whitespace-pre-wrap text-[14px] leading-5 text-neutral-primary">
                  {memo.content}
                </div>
                <div className="mt-1 text-[12px] text-neutral-muted">
                  {formatKst(memo.updatedAt ?? memo.createdAt, { locale })}
                  {memo.updatedBy ? ` · ${memo.updatedBy}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-sm text-neutral-muted">
            {c("등록된 Harper 메모가 없습니다.", "No Harper notes found.")}
          </div>
        )}
      </div>
    </InternalOnlySurface>
  );
}

function SystemActivitySummary({
  account,
  error,
  isLoading,
}: {
  account?: OrgInternalTalentSystemResponse["account"];
  error: Error | null;
  isLoading: boolean;
}) {
  const { locale, c } = useOrgLocale();
  const metrics = [
    {
      label: c("가입 날짜", "Date joined"),
      value: account?.createdAt,
    },
    {
      label: c("최근 로그인", "Last login"),
      value: account?.lastLoginAt,
    },
    {
      label: c("최근 사용", "Last used"),
      value: account?.lastActiveAt,
    },
  ];

  return (
    <InternalOnlySurface
      className="rounded-sm border border-neutral-1000-a05 bg-bg-weak/70 px-3 py-2"
      showLabel={false}
    >
      <div className="relative z-20">
        {isLoading ? (
          <div aria-busy="true" className="space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ) : error ? (
          <div className="text-[11px] text-neutral-soft">
            {c(
              "시스템 활동을 불러오지 못했습니다.",
              "Failed to load system activity."
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] leading-4 text-neutral-muted">
            {metrics.map((metric) => (
              <span className="whitespace-nowrap" key={metric.label}>
                <span className="font-medium text-neutral-primary">
                  {metric.label}
                </span>{" "}
                {formatKstRelativeDate(metric.value, { locale })}
              </span>
            ))}
          </div>
        )}
      </div>
    </InternalOnlySurface>
  );
}

function CandidateDecisionActions({
  acceptDisabled,
  candidateName,
  className,
  currentStage,
  decisionPending,
  onAcceptClick,
  onMoveToPendingConnection,
  onRejectClick,
}: {
  acceptDisabled?: boolean;
  candidateName: string;
  className?: string;
  currentStage: OrgTalentDetailResponse["recommendation"]["stage"];
  decisionPending?: boolean;
  onAcceptClick?: () => void;
  onMoveToPendingConnection?: () => void;
  onRejectClick?: () => void;
}) {
  const { c } = useOrgLocale();
  if (currentStage === "process_stopped") return null;

  if (currentStage === "accepted") {
    if (!onMoveToPendingConnection) return null;
    return (
      <section
        aria-label={c("연결 수락한 후보로 이동", "Move to Ready to connect")}
        className={cn("rounded-md bg-bg-weak px-4 py-4", className)}
      >
        <div className="text-[16px] font-medium text-neutral-primary">
          {c("연결 수락한 후보로 옮기시겠습니까?", "Move to Ready to connect?")}
        </div>
        <p className="mt-1 text-sm font-normal leading-5 text-neutral-muted">
          {c(
            "회사 측의 페이지에 현재 후보자가 표시되며, 회사 측에서 연결을 받을지 결정하는 단계로 넘어갑니다.",
            "The candidate appears on the company's page so the company can decide whether to accept the connection."
          )}
        </p>
        <MuteButton
          className="mt-4"
          disabled={decisionPending}
          onClick={onMoveToPendingConnection}
          size="md"
          type="button"
          variant="primary"
        >
          {c("연결 수락한 후보로 이동", "Move to Ready to connect")}
        </MuteButton>
      </section>
    );
  }

  if (
    currentStage !== "pending_connection" &&
    canStopOrgCandidateProcess(currentStage)
  ) {
    if (!onRejectClick) return null;
    return (
      <section
        aria-label={c("진행 중인 후보자 연결 종료", "End active connection")}
        className={cn("rounded-md bg-critical-faded px-4 py-4", className)}
      >
        <div className="text-[15px] font-medium text-critical">
          {c(
            "진행 중인 프로세스를 종료하시겠습니까?",
            "End the ongoing process?"
          )}
        </div>
        <p className="mt-1 text-sm font-normal leading-5">
          {c(
            "연결을 종료하면 Harper가 후보자에게 회사의 종료 결정을 안내해요. 이미 보이거나 전달된 안내는 회수할 수 없어요.",
            "Ending the connection notifies the candidate that the company has ended the process. Messages already shown or sent cannot be recalled."
          )}
        </p>
        <MuteButton
          className="mt-4"
          disabled={decisionPending}
          onClick={onRejectClick}
          size="md"
          type="button"
          variant="warn"
        >
          {c("연결 종료하기", "End connection")}
        </MuteButton>
      </section>
    );
  }

  if (
    currentStage !== "pending_connection" ||
    (!onAcceptClick && !onRejectClick)
  ) {
    return null;
  }

  return (
    <section
      aria-label={c("후보자 연결 결정", "Connection decision")}
      className={cn(
        "rounded-lg border border-neutral-1000-a05 bg-bg-default px-4 py-4",
        className
      )}
    >
      <div className="text-[16px] font-medium text-neutral-primary">
        {c("연결 여부를 결정해 주세요", "Decide whether to connect")}
      </div>
      <p className="mt-1 text-sm font-normal text-neutral-muted">
        {c("{name}님을 만나보시겠어요?", "{name}?", {
          name: candidateName,
        })}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <MuteButton
          type="button"
          size="lg"
          variant="positive"
          onClick={onAcceptClick}
          disabled={decisionPending || acceptDisabled || !onAcceptClick}
          className="min-h-10 w-full"
        >
          {CANDIDATE_DECISION_LABELS.connect}
        </MuteButton>
        <MuteButton
          type="button"
          size="lg"
          variant="critical"
          onClick={onRejectClick}
          disabled={decisionPending || !onRejectClick}
          className="min-h-10 w-full"
        >
          {CANDIDATE_DECISION_LABELS.reject}
        </MuteButton>
      </div>
    </section>
  );
}

function CompanyIntroDecisionActions({
  detail,
  onPass,
  onRequest,
  pending,
}: {
  detail: OrgTalentDetailResponse;
  onPass: (reason: string) => Promise<void>;
  onRequest: () => void;
  pending: boolean;
}) {
  const { c } = useOrgLocale();
  const [passOpen, setPassOpen] = useState(false);
  // After the request, its state shows in the profile's 채용 진행 line.
  if (detail.companyIntro?.status !== "ready") return null;
  return (
    <section className="rounded-md border border-neutral-1000-a05 bg-bg-default px-4 py-4">
      <div className="grid grid-cols-2 gap-2">
        <OrgPassPopover
          open={passOpen}
          onOpenChange={setPassOpen}
          onSubmit={onPass}
          pending={pending}
          shortcut={false}
        />
        <MuteButton
          disabled={pending}
          onClick={onRequest}
          size="md"
          variant="dark"
        >
          {c("Send Intro", "Send Intro")}
        </MuteButton>
      </div>
    </section>
  );
}

function getOrgFeedTitle(item: OrgTalentDetailResponse["feed"][number]) {
  if (
    item.kind === "intro_to_company" ||
    item.kind === "company_candidate_presented" ||
    item.kind === "internal_followup_sent" ||
    item.kind === "company_followup" ||
    item.kind === "company_intro_followup_policy"
  )
    return "Harper";
  if (item.kind === "company_request_followup_sent") {
    return "후보자에게 회사 요청을 다시 안내했어요";
  }
  if (item.kind === "internal_process_stopped_notified") {
    return "프로세스 종료 안내";
  }
  if (item.activity) {
    return orgCandidateActivityTitle(
      orgCandidateActivityKind(item.activity),
      (ko) => ko
    );
  }
  const { kind } = item;
  if (kind === "org_note") return "메모";
  if (kind === "org_acceptance" || kind === "talent_recommendation_accepted") {
    return "연결 시작";
  }
  if (kind === "org_rejection" || kind === "talent_recommendation_rejected") {
    return "연결 거절";
  }
  if (kind === "org_stage_change") return "상태 변경";
  if (kind === "org_candidate_role_move") return "역할 변경";
  if (kind === "org_resume_opened") return "이력서 열람";
  return "활동";
}

function getOrgFeedIcon(
  item: OrgTalentDetailResponse["feed"][number]
): ProgressFeedIcon {
  if (
    item.kind === "intro_to_company" ||
    item.kind === "company_candidate_presented" ||
    item.kind === "internal_followup_sent" ||
    item.kind === "company_followup" ||
    item.kind === "company_intro_followup_policy"
  )
    return "harper";
  if (item.kind === "company_request_followup_sent") return "mail";
  if (item.kind === "internal_process_stopped_notified") return "mail";
  if (item.activity?.eventType === "candidate_contact_sent") return "mail";
  if (item.activity?.eventType === "candidate_response_received") {
    return "sparkles";
  }
  if (item.activity?.eventType === "candidate_message_delivered") {
    return "sparkles";
  }
  const { kind } = item;
  if (kind === "org_acceptance" || kind === "talent_recommendation_accepted") {
    return "check";
  }
  if (kind === "org_rejection" || kind === "talent_recommendation_rejected") {
    return "x";
  }
  if (kind === "org_stage_change") return "note";
  if (kind === "org_candidate_role_move") return "note";
  if (kind === "org_resume_opened") return "eye";
  return "note";
}

function getOrgEmailAddressLabel(
  value: string | null | undefined,
  detail: OrgTalentDetailResponse
) {
  const rawValue = String(value ?? "").trim();
  const email = extractEmailAddress(rawValue)?.toLowerCase() ?? "";
  const talentEmail = detail.talent.email?.trim().toLowerCase() ?? "";
  const member = detail.members.find(
    (item) => item.email?.trim().toLowerCase() === email
  );
  const explicitName = rawValue
    .match(/^\s*([^<]+?)\s*</)?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, "");
  const name =
    (email && email === talentEmail ? detail.talent.name : null) ||
    member?.name ||
    explicitName ||
    null;

  if (name && email && name.toLowerCase() !== email) {
    return `${name} · ${email}`;
  }
  return email || name || rawValue || "발신자 정보 없음";
}

function FeedPanel({
  canManageCandidates,
  currentUserId,
  decisionActions,
  detail,
  internalOpsAccess,
  talentId,
  workspaceId,
}: {
  canManageCandidates: boolean;
  currentUserId?: string | null;
  decisionActions?: ReactNode;
  detail: OrgTalentDetailResponse;
  internalOpsAccess: boolean;
  talentId?: string | null;
  workspaceId: string;
}) {
  const sourceT = useOrgSourceT();
  const { locale, c } = useOrgLocale();
  const feedLabels = useMemo<ProgressFeedLabels>(
    () => ({
      actorFallback: c("팀원", "Team member"),
      body: c("본문", "Body"),
      cancel: c("취소", "Cancel"),
      delete: c("삭제", "Delete"),
      deleteProgress: c("Progress 삭제", "Delete activity"),
      edit: c("수정", "Edit"),
      failure: c("처리하지 못했습니다.", "Couldn't complete this action."),
      feedActions: c("피드 작업", "Activity actions"),
      save: c("저장", "Save"),
      subject: c("제목", "Subject"),
      viewContent: c("내용 보기", "View message"),
    }),
    [c]
  );
  const feedError = (error: unknown) =>
    error instanceof Error
      ? new Error(localizedOrgErrorMessage(error, locale, feedLabels.failure))
      : null;
  const { detailQuery } = useOrgJobsDetail();
  // The hiring progress, with the records hung between its stages.
  const stages = useOrgCandidateProgressStages(detail);
  const [draft, setDraft] = useState("");
  const [pollingQueueId, setPollingQueueId] = useState<string | null>(null);
  const [otherRolesOpen, setOtherRolesOpen] = useState(false);
  const [otherRoleFeedOpenScope, setOtherRoleFeedOpenScope] = useState<
    string | null
  >(null);
  const [otherRoleFeed, setOtherRoleFeed] = useState<{
    payload: OrgOtherRoleFeedResponse;
    scope: string;
  } | null>(null);
  const [otherRoleFeedError, setOtherRoleFeedError] = useState<{
    message: string;
    scope: string;
  } | null>(null);
  const [otherRoleFeedLoadingScope, setOtherRoleFeedLoadingScope] = useState<
    string | null
  >(null);
  const otherRoleFeedScope = `${workspaceId}:${talentId ?? detail.talent.userId}:${detail.role.roleId}`;
  const scopedOtherRoleFeed =
    otherRoleFeed?.scope === otherRoleFeedScope ? otherRoleFeed.payload : null;
  const scopedOtherRoleFeedError =
    otherRoleFeedError?.scope === otherRoleFeedScope
      ? otherRoleFeedError.message
      : null;
  const otherRoleFeedLoading = otherRoleFeedLoadingScope === otherRoleFeedScope;
  const scopedOtherRolesOpen =
    otherRolesOpen && otherRoleFeedOpenScope === otherRoleFeedScope;
  const createFeed = useCreateOrgFeedItem();
  const updateFeed = useUpdateOrgFeedItem();
  const deleteFeed = useDeleteOrgFeedItem();
  const cancelCompanyRequest = useCancelOrgCompanyTalentRequest();
  const updateConnectionEmail = useUpdateOrgConnectionConfirmationEmail();
  const trimmedDraft = draft.trim();
  const refetchDetail = detailQuery.refetch;
  const pendingConnectionQueueId =
    updateConnectionEmail.variables?.queueId ?? null;
  const pendingCompanyRequestId =
    cancelCompanyRequest.variables?.requestId ?? null;
  const cancelCompanyRequestMutate = cancelCompanyRequest.mutate;

  useEffect(() => {
    if (!pollingQueueId) return;
    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      const result = await refetchDetail();
      const current = !isOrgCandidateProfilePreview(result.data)
        ? result.data?.connectionConfirmationEmails.find(
            (item) => item.id === pollingQueueId
          )
        : undefined;
      if (
        !cancelled &&
        current &&
        current.status !== "scheduled" &&
        current.status !== "sending"
      ) {
        setPollingQueueId(null);
      }
    }, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pollingQueueId, refetchDetail]);

  const pendingConnectionAction =
    updateConnectionEmail.variables?.action ?? null;
  const updateConnectionEmailMutate = updateConnectionEmail.mutate;
  const loadOtherRoleFeed = async () => {
    if (otherRoleFeedLoading || scopedOtherRoleFeed) return;
    const requestedScope = otherRoleFeedScope;
    setOtherRoleFeedLoadingScope(requestedScope);
    setOtherRoleFeedError(null);
    try {
      const params = new URLSearchParams({
        excludeRoleId: detail.role.roleId,
        talentId: talentId ?? detail.talent.userId,
        workspaceId,
      });
      const payload = await fetchWithInternalAuth<OrgOtherRoleFeedResponse>(
        `/api/org/detail/other-role-feed?${params.toString()}`
      );
      setOtherRoleFeed({ payload, scope: requestedScope });
    } catch (error) {
      setOtherRoleFeedError({
        message: localizedOrgErrorMessage(
          error,
          locale,
          c(
            "다른 역할의 기록을 불러오지 못했습니다.",
            "Couldn't load records for another role"
          )
        ),
        scope: requestedScope,
      });
    } finally {
      setOtherRoleFeedLoadingScope((current) =>
        current === requestedScope ? null : current
      );
    }
  };
  const feedItems = useMemo<ProgressFeedItem[]>(() => {
    const requestsWithContactProgress = new Set(
      detail.feed.flatMap((item) =>
        item.activity?.eventType === "candidate_contact_sent" &&
        item.activity.requestId
          ? [item.activity.requestId]
          : []
      )
    );
    return [
      ...detail.feed.map((item) => ({
        actor: item.actor,
        createdAt: item.createdAt,
        deletable:
          canManageCandidates &&
          item.kind === "org_note" &&
          item.companyUserId === currentUserId,
        editable:
          canManageCandidates &&
          item.kind === "org_note" &&
          item.companyUserId === currentUserId,
        delivery: item.delivery
          ? {
              bodyText: item.delivery.bodyText,
              id: item.delivery.id,
              label: item.delivery.disclosureLabel,
              subject: item.delivery.subject,
            }
          : null,
        icon: getOrgFeedIcon(item),
        id: item.id,
        text:
          getHarperProgressText(
            item.kind,
            detail.talent.name,
            c,
            item.followup
          ) ?? item.text,
        title: sourceT(getOrgFeedTitle(item)),
      })),
      ...detail.meetingEvents.map((item) => ({
        createdAt: item.createdAt,
        icon:
          item.kind === "meeting_confirmed"
            ? ("check" as const)
            : ("note" as const),
        id: item.id,
        text: item.scheduledAt
          ? `${formatKst(item.scheduledAt, { locale })} · ${item.text}`
          : item.text,
        title: item.title,
      })),
      ...detail.connectionConfirmationEmails.map((item) => {
        const pendingAction =
          updateConnectionEmail.isPending &&
          pendingConnectionQueueId === item.id
            ? pendingConnectionAction
            : null;
        return {
          createdAt: item.sentAt ?? item.createdAt,
          customContent: (
            <ConnectionConfirmationEmailFeedCard
              item={item}
              onCancel={
                canManageCandidates
                  ? () =>
                      updateConnectionEmailMutate({
                        action: "cancel",
                        queueId: item.id,
                        roleId: item.roleId ?? detail.role.roleId,
                        talentId: item.talentId,
                        workspaceId,
                      })
                  : undefined
              }
              onSendNow={
                canManageCandidates
                  ? () =>
                      updateConnectionEmailMutate(
                        {
                          action: "send_now",
                          queueId: item.id,
                          roleId: item.roleId ?? detail.role.roleId,
                          talentId: item.talentId,
                          workspaceId,
                        },
                        {
                          onSuccess: () => setPollingQueueId(item.id),
                        }
                      )
                  : undefined
              }
              pendingAction={pendingAction}
            />
          ),
          id: `connection-email:${item.id}`,
          text: c("", ""),
        };
      }),
      ...detail.companyRequestHistory
        .filter((item) => !requestsWithContactProgress.has(item.id))
        .map((item) => ({
          createdAt: item.sentAt ?? item.cancelledAt ?? item.createdAt,
          customContent: (
            <CompanyTalentRequestFeedCard
              item={item}
              onCancel={
                canManageCandidates && item.canCancel
                  ? () =>
                      cancelCompanyRequestMutate({
                        requestId: item.id,
                        roleId: item.roleId,
                        talentId: talentId ?? detail.talent.userId,
                        workspaceId,
                      })
                  : undefined
              }
              pending={
                cancelCompanyRequest.isPending &&
                pendingCompanyRequestId === item.id
              }
            />
          ),
          id: `company-request:${item.id}`,
          text: c("", ""),
        })),
      ...(internalOpsAccess
        ? detail.introEmails.map((item) => ({
            createdAt: item.createdAt,
            customContent: (
              <OrgIntroEmailFeedCard
                item={item}
                recipientLabels={item.toEmails.map((email) =>
                  sourceT(getOrgEmailAddressLabel(email, detail))
                )}
                senderLabel={sourceT(
                  getOrgEmailAddressLabel(item.fromEmail, detail)
                )}
              />
            ),
            id: `org-intro-email:${item.id}`,
            text: c("", ""),
          }))
        : []),
    ].sort((left, right) => {
      const leftTime = Date.parse(left.createdAt);
      const rightTime = Date.parse(right.createdAt);
      return (
        (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0)
      );
    });
  }, [
    canManageCandidates,
    cancelCompanyRequest.isPending,
    cancelCompanyRequestMutate,
    currentUserId,
    detail,
    internalOpsAccess,
    locale,
    pendingCompanyRequestId,
    pendingConnectionAction,
    pendingConnectionQueueId,
    sourceT,
    c,
    updateConnectionEmail.isPending,
    updateConnectionEmailMutate,
    talentId,
    workspaceId,
  ]);

  return (
    <div className="min-w-0 space-y-2.5">
      {decisionActions ? (
        <div className="sticky top-0 z-20 -mx-1 bg-bg-default px-1 pb-1">
          {decisionActions}
        </div>
      ) : null}
      <div className="text-[14px] font-medium text-neutral-primary">
        {c("피드", "Feed")}
      </div>
      <ProgressFeed
        actionsVariant="menu"
        deleteConfirmMessage={c("이 메모를 삭제할까요?", "Delete this note?")}
        deleteError={feedError(deleteFeed.error)}
        draft={draft}
        editError={feedError(updateFeed.error)}
        emptyLabel={c("아직 기록이 없어요", "Nothing here yet")}
        items={feedItems}
        labels={feedLabels}
        onDelete={
          canManageCandidates
            ? (item) => {
                if (deleteFeed.isPending) return;
                deleteFeed.mutate({
                  progressId: item.id,
                  workspaceId,
                });
              }
            : undefined
        }
        onDraftChange={canManageCandidates ? setDraft : undefined}
        onEdit={
          canManageCandidates
            ? async (item, text) => {
                await updateFeed.mutateAsync({
                  progressId: item.id,
                  text,
                  workspaceId,
                });
              }
            : undefined
        }
        onSubmit={
          canManageCandidates
            ? () => {
                if (!talentId || !trimmedDraft || createFeed.isPending) return;
                createFeed.mutate(
                  {
                    recommendationId: detail.recommendation.recommendationId,
                    roleId: detail.role.roleId,
                    talentId,
                    text: trimmedDraft,
                    workspaceId,
                  },
                  {
                    onSuccess: () => setDraft(""),
                  }
                );
              }
            : undefined
        }
        pendingDeleteId={deleteFeed.variables?.progressId ?? null}
        pendingEditId={updateFeed.variables?.progressId ?? null}
        pendingSubmit={createFeed.isPending}
        placeholder={c("메모.", "Note")}
        stages={stages}
        submitError={feedError(createFeed.error)}
        submitLabel={c("메모 추가", "Add note")}
      />
      <div className="pt-4">
        <MuteButton
          aria-expanded={scopedOtherRolesOpen}
          className="w-full justify-between"
          onClick={() => {
            const nextOpen = !scopedOtherRolesOpen;
            setOtherRolesOpen(nextOpen);
            setOtherRoleFeedOpenScope(otherRoleFeedScope);
            if (nextOpen) void loadOtherRoleFeed();
          }}
          size="sm"
          type="button"
          variant="transparent"
        >
          {c(
            "다른 역할에서 기록된 내용 보기",
            "View records from another role"
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 transition-transform",
              scopedOtherRolesOpen && "rotate-180"
            )}
          />
        </MuteButton>
        {scopedOtherRolesOpen ? (
          <div className="mt-2">
            {otherRoleFeedLoading ? (
              <div className="flex items-center gap-2 py-4 text-[12px] text-neutral-muted">
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
                {c(
                  "다른 역할의 기록을 불러오는 중",
                  "Loading records from another role"
                )}
              </div>
            ) : scopedOtherRoleFeedError ? (
              <div className="rounded-md bg-critical-faded p-3 text-[12px] text-critical">
                <div>{scopedOtherRoleFeedError}</div>
                <MuteButton
                  className="mt-2"
                  onClick={() => {
                    setOtherRoleFeed(null);
                    setOtherRoleFeedError(null);
                    void loadOtherRoleFeed();
                  }}
                  size="sm"
                  type="button"
                  variant="transparent"
                >
                  {c("다시 시도", "Retry")}
                </MuteButton>
              </div>
            ) : scopedOtherRoleFeed && scopedOtherRoleFeed.items.length > 0 ? (
              <ProgressFeed
                emptyLabel={c(
                  "다른 역할에서 기록된 내용이 없어요.",
                  "No records for another role"
                )}
                items={scopedOtherRoleFeed.items.map((item) => ({
                  createdAt: item.createdAt,
                  icon:
                    item.progressKind === "intro_to_company" ||
                    item.progressKind === "company_candidate_presented" ||
                    item.progressKind === "internal_followup_sent" ||
                    item.progressKind === "company_followup" ||
                    item.progressKind === "company_intro_followup_policy"
                      ? "harper"
                      : item.kind === "connection_notice" ||
                          item.kind === "meeting"
                        ? "check"
                        : item.kind === "intro_email"
                          ? "mail"
                          : "note",
                  id: item.id,
                  roleContext: item.roleName,
                  text:
                    getHarperProgressText(
                      item.progressKind,
                      detail.talent.name,
                      c,
                      item.followup
                    ) ?? item.text,
                  title:
                    item.progressKind === "intro_to_company" ||
                    item.progressKind === "company_candidate_presented" ||
                    item.progressKind === "internal_followup_sent" ||
                    item.progressKind === "company_followup" ||
                    item.progressKind === "company_intro_followup_policy"
                      ? "Harper"
                      : item.title,
                }))}
                labels={feedLabels}
              />
            ) : (
              <div className="py-4 text-[12px] text-neutral-muted">
                {c(
                  "다른 역할에서 기록된 내용이 없어요.",
                  "No records for another role"
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
      {updateConnectionEmail.error ? (
        <div className={opsTheme.errorNotice}>
          {localizedOrgErrorMessage(
            updateConnectionEmail.error,
            locale,
            c(
              "메일 상태를 변경하지 못했습니다.",
              "Failed to change mail status"
            )
          )}
        </div>
      ) : null}
      {cancelCompanyRequest.error ? (
        <div className={opsTheme.errorNotice}>
          {localizedOrgErrorMessage(
            cancelCompanyRequest.error,
            locale,
            c(
              "후보자 문의를 취소하지 못했습니다.",
              "Failed to cancel candidate inquiry"
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

function getTalentNavigationStageLabel(label: string, roleName: string) {
  const normalizedLabel = label.trim();
  const normalizedRoleName = roleName.trim();
  const rolePrefix = normalizedRoleName ? `${normalizedRoleName} · ` : "";

  return rolePrefix && normalizedLabel.startsWith(rolePrefix)
    ? normalizedLabel.slice(rolePrefix.length)
    : normalizedLabel;
}

export function TalentDetailSimpleView({
  presentation = "modal",
  showBack = true,
  navigationItems,
  navigationTotal,
  onNextPage,
  nextPagePending = false,
  nextNavigation,
  advanceAfterAction = false,
  onReviewClose,
  backLabel,
  navigationTitle,
}: {
  presentation?: "modal" | "inline";
  showBack?: boolean;
  navigationItems?: readonly OrgTalentSelection[];
  navigationTotal?: number;
  onNextPage?: () => void;
  nextPagePending?: boolean;
  nextNavigation?: {
    item: OrgTalentSelection;
    onNavigate: () => void;
  };
  advanceAfterAction?: boolean;
  onReviewClose?: () => void;
  backLabel?: string;
  navigationTitle?: string;
}) {
  const { c, locale } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const {
    closeTalentDetail,
    selectTalent,
    talentNavigationItems,
    talentNavigationLabel,
    workspaceId,
  } = useOrgJobsNavigation();
  const optionalBoard = useOptionalOrgJobsBoard();
  const {
    activeDetailRecommendationId,
    activeDetailRoleId,
    activeDetailTalentId,
    detailOpen,
    detailQuery,
    profilePreview,
    selectedAcceptStageId,
  } = useOrgJobsDetail();
  const {
    acceptTalent,
    isCandidateStagePending,
    moveTalentToPendingConnection,
    rejectTalent,
  } = useOrgJobsCandidateActions();
  const {
    bootstrap,
    currentUser,
    currentUserEmail,
    internalOpsAccess,
    permissions,
    user,
    workspace,
  } = useOrgWorkspace();
  const detail = isOrgQueryAccessError(detailQuery.error)
    ? undefined
    : detailQuery.data;
  const members = detail?.members ?? bootstrap.members;
  const requestCompanyIntro = useRequestOrgCompanyIntro();
  const passCompanyIntro = usePassOrgCompanyIntro();
  const saveCandidate = useOrgCandidateSave();
  const addToast = useToastStore((state) => state.add);
  const decisions = useOrgCandidateDecisionRunner(workspaceId);
  const acceptStageId = selectedAcceptStageId;
  const canManageCandidates = permissions.canManageCandidates;
  const companyName = detail?.workspace.companyName ?? workspace.companyName;
  const currentUserId = currentUser?.userId ?? user.id;
  const decisionPending = Boolean(
    activeDetailRoleId &&
    activeDetailTalentId &&
    isCandidateStagePending({
      roleId: activeDetailRoleId,
      talentId: activeDetailTalentId,
    })
  );
  const error = detailQuery.error instanceof Error ? detailQuery.error : null;
  const isLoading = detailQuery.isLoading;
  const canUseExistingCandidateActions =
    canManageCandidates && detail?.capabilities.moveStage !== false;
  const onAcceptCandidate = canUseExistingCandidateActions
    ? acceptTalent
    : undefined;
  const onRejectCandidate = canUseExistingCandidateActions
    ? rejectTalent
    : undefined;
  const onRetry = () => void detailQuery.refetch();
  const open = detailOpen;
  const talentId = activeDetailTalentId || null;
  const viewedTalentId = detail?.talent.userId;
  const viewedRoleId = detail?.role.roleId;
  const viewedWorkspaceId = detail?.workspace.workspaceId;
  const viewedRecommendationId = detail?.recommendation.recommendationId;
  useEffect(() => {
    if (
      !open ||
      internalOpsAccess ||
      !viewedTalentId ||
      !viewedRoleId ||
      !viewedWorkspaceId ||
      viewedTalentId !== talentId
    )
      return;
    void fetchWithInternalAuth("/api/org/detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        talentId: viewedTalentId,
        roleId: viewedRoleId,
        workspaceId: viewedWorkspaceId,
        recommendationId: viewedRecommendationId,
      }),
    }).catch((error) => console.warn("[org/candidate-profile-view]", error));
  }, [
    open,
    internalOpsAccess,
    talentId,
    viewedTalentId,
    viewedRoleId,
    viewedWorkspaceId,
    viewedRecommendationId,
  ]);

  const [roleMoveOpen, setRoleMoveOpen] = useState(false);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const closeAcceptDialog = () => {
    setAcceptDialogOpen(false);
  };
  const [pendingConnectionDialogOpen, setPendingConnectionDialogOpen] =
    useState(false);
  const [mobileTab, setMobileTab] = useState<"profile" | "feed">("profile");
  const [profileTab, setProfileTab] = useState<"internal" | "profile">(
    "profile"
  );
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [companyIntroRequestOpen, setCompanyIntroRequestOpen] = useState(false);
  const [companyIntroPassOpen, setCompanyIntroPassOpen] = useState(false);
  const [resumeRequest, setResumeRequest] = useState<{
    documentId?: string | null;
    kind: "storage" | "link" | "document";
    link?: string | null;
  } | null>(null);
  const [resumeError, setResumeError] = useState("");
  const openResume = useOpenOrgResume();
  const harperMemoQuery = useOpsCareerDetail(
    talentId,
    Boolean(open && internalOpsAccess && talentId && profileTab === "internal")
  );
  const systemActivityQuery = useOrgInternalTalentSystem({
    enabled: Boolean(
      open && internalOpsAccess && talentId && profileTab === "internal"
    ),
    talentId,
    workspaceId,
  });
  const harperMemoError =
    harperMemoQuery.error instanceof Error ? harperMemoQuery.error : null;
  const harperMemos = harperMemoQuery.data?.opsProfileMemos ?? [];
  const systemActivityError =
    systemActivityQuery.error instanceof Error
      ? systemActivityQuery.error
      : null;
  const { markViewed } = useOrgViewedRecommendations({
    currentUserEmail,
    workspaceId,
  });
  const onMoveToPendingConnection = canUseExistingCandidateActions
    ? () => setPendingConnectionDialogOpen(true)
    : undefined;
  const roleMoveButton =
    canManageCandidates && detail ? (
      <Tooltips text={c("다른 Role로 이동", "Move to another role")}>
        <MuteButton
          aria-label={c("다른 Role로 이동", "Move to another role")}
          size="md"
          type="button"
          variant="transparent"
          disabled={decisionPending}
          onClick={() => setRoleMoveOpen(true)}
        >
          <FolderInput aria-hidden className="size-4" />
        </MuteButton>
      </Tooltips>
    ) : null;
  const handleClose = () => {
    setRoleMoveOpen(false);
    setMobileTab("profile");
    closeTalentDetail();
  };

  const handleConfirmResume = () => {
    if (!resumeRequest || !talentId) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setResumeError(
        c(
          "새 창을 열지 못했습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.",
          "Unable to open a new window. Enable pop-ups in the browser and try again."
        )
      );
      return;
    }
    popup.opener = null;
    setResumeError("");
    openResume.mutate(
      {
        documentId: resumeRequest.documentId ?? null,
        roleId: detail?.role.roleId ?? activeDetailRoleId,
        kind: resumeRequest.kind,
        link: resumeRequest.link ?? null,
        talentId,
        workspaceId,
      },
      {
        onError: (requestError) => {
          popup.close();
          setResumeError(
            requestError instanceof Error
              ? requestError.message
              : c(
                  "이력서를 열지 못했습니다. 다시 시도해 주세요.",
                  "Unable to open resume. Try again."
                )
          );
        },
        onSuccess: (payload) => {
          popup.location.href = payload.url;
          setResumeRequest(null);
          setResumeError("");
        },
      }
    );
  };

  const closeResumeDialog = () => {
    if (openResume.isPending) return;
    setResumeRequest(null);
    setResumeError("");
    openResume.reset();
  };

  if (!open || typeof document === "undefined") return null;
  if (profilePreview && !isOrgQueryAccessError(detailQuery.error)) {
    return (
      <OrgCandidateProfilePreview
        preview={profilePreview}
        onClose={handleClose}
        inline={presentation === "inline"}
      />
    );
  }

  const title =
    detail?.talent.name ||
    detail?.talent.email ||
    (isLoading ? "Talent" : "Talent");
  const detailMoveCandidate = detail
    ? {
        email: detail.talent.email?.trim().toLowerCase() || null,
        name: title,
        recommendationId: detail.recommendation.recommendationId,
        stage: detail.recommendation.stage,
      }
    : null;
  const subtitle = detail
    ? `${companyName} · ${detail.role.name}`
    : companyName;
  const resolvedTalentNavigationItems: readonly OrgTalentSelection[] =
    navigationItems ??
    (talentNavigationItems.length > 0 || !detail
      ? talentNavigationItems
      : (optionalBoard?.board?.items ?? [])
          .filter((item) => item.stage === detail.recommendation.stage)
          .sort((left, right) =>
            right.recommendedAt.localeCompare(left.recommendedAt)
          ));
  const currentBoardStage = optionalBoard?.board?.stages.find(
    (stage) => stage.id === detail?.recommendation.stage
  );
  const resolvedTalentNavigationLabel = detail
    ? sourceT(
        getTalentNavigationStageLabel(
          talentNavigationLabel ||
            currentBoardStage?.label ||
            humanizeOrgStage(detail.recommendation.stage),
          detail.role.name
        )
      )
    : talentNavigationLabel;
  const detailNavigation = getOrgTalentDetailNavigationState(
    resolvedTalentNavigationItems,
    {
      recommendationId: activeDetailRecommendationId,
      roleId: activeDetailRoleId,
      talentId: activeDetailTalentId,
    },
    nextNavigation?.item
  );
  if (detailNavigation && navigationTotal !== undefined) {
    detailNavigation.total = navigationTotal;
  }
  const navigateToTalent = (
    target: (typeof resolvedTalentNavigationItems)[number] | null
  ) => {
    if (!target) return;
    setMobileTab("profile");
    markViewed(target.recommendationId);
    if (nextNavigation && target === nextNavigation.item) {
      nextNavigation.onNavigate();
      return;
    }
    selectTalent(
      target,
      resolvedTalentNavigationItems,
      resolvedTalentNavigationLabel
    );
  };
  const showMobileDecisionActions = Boolean(
    (detail?.recommendation.stage === "pending_connection" ||
      (detail?.recommendation.stage === "company_intro" &&
        detail.companyIntro?.status === "ready")) &&
    canManageCandidates
  );
  const submitCompanyIntroPass = async (reason: string) => {
    if (!detail?.companyIntro) return;
    await passCompanyIntro.mutateAsync({
      introCandidateId: detail.companyIntro.id,
      workspaceId,
      reason,
    });
    setCompanyIntroPassOpen(false);
    handleClose();
  };
  const finishReview = () => {
    if (advanceAfterAction && detailNavigation?.next) navigateToTalent(detailNavigation.next);
    else if (advanceAfterAction && onNextPage) onNextPage();
    else if (advanceAfterAction && detailNavigation?.previous) navigateToTalent(detailNavigation.previous);
    else (onReviewClose ?? handleClose)();
  };

  return (
    <>
      {presentation === "inline" ? (
        <OrgCandidateReview
          key={`review:${activeDetailRecommendationId}`}
          detail={detail}
          error={error}
          onRetry={onRetry}
          navigation={detailNavigation}
          onNavigate={navigateToTalent}
          onNextPage={onNextPage}
          nextPagePending={nextPagePending}
          onBack={showBack ? (onReviewClose ?? handleClose) : undefined}
          backLabel={backLabel}
          navigationTitle={navigationTitle}
          roleMoveButton={roleMoveButton}
          canManage={canManageCandidates}
          pending={
            nextPagePending || decisionPending ||
            requestCompanyIntro.isPending ||
            passCompanyIntro.isPending ||
            saveCandidate.isPending
          }
          saved={Boolean(
            optionalBoard?.board?.items.find(
              (item) => item.recommendationId === activeDetailRecommendationId
            )?.savedAt
          )}
          onSave={async () => {
            if (!detail) return;
            const saved = Boolean(
              optionalBoard?.board?.items.find(
                (item) => item.recommendationId === activeDetailRecommendationId
              )?.savedAt
            );
            await saveCandidate.mutateAsync({
              workspaceId,
              roleId: detail.role.roleId,
              talentId: detail.talent.userId,
              recommendationId: detail.recommendation.recommendationId,
              saved: !saved,
            });
            finishReview();
          }}
          onPass={async (reason) => {
            if (!detail?.companyIntro) return;
            await passCompanyIntro.mutateAsync({
              introCandidateId: detail.companyIntro.id,
              workspaceId,
              reason,
            });
            finishReview();
          }}
          onReject={() => setRejectDialogOpen(true)}
          onAccept={() =>
            detail?.companyIntro
              ? setCompanyIntroRequestOpen(true)
              : setAcceptDialogOpen(true)
          }
          onResume={(kind, link, documentId) => {
            if (detail?.capabilities.viewResume)
              setResumeRequest({ documentId, kind, link });
          }}
        />
      ) : (
        <TalentCareerModal
          open={open}
          onClose={handleClose}
          ariaLabel={title}
          showCloseButton={false}
          // Adjust only --candidate-profile-width to resize the desktop profile pane.
          // The feed stays 480px; the panel is capped at the available viewport width.
          overlayClassName="z-[70] items-stretch justify-end overflow-hidden p-0 sm:px-0 [--candidate-profile-width:calc(80vw-480px)] [--candidate-feed-width:480px]"
          backdropClassName="z-[70] bg-black/35 backdrop-blur-none"
          panelClassName={cn(
            "h-dvh max-h-none max-w-full min-w-0 rounded-none border-0 pb-[env(safe-area-inset-bottom)] sm:w-[92vw] md:w-[calc(var(--candidate-profile-width)+var(--candidate-feed-width))] md:pb-0",
            "duration-150 ease-out data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
            "max-md:data-[state=open]:slide-in-from-bottom max-md:data-[state=closed]:slide-out-to-bottom",
            "md:data-[state=open]:slide-in-from-right md:data-[state=closed]:slide-out-to-right",
            "motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none"
          )}
          bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="shrink-0 border-b border-neutral-1000-a05 bg-bg-default md:hidden">
            <div className="flex min-h-12 min-w-0 items-center w-full justify-between gap-1 px-2">
              <div className="flex shrink-0 items-center gap-1">
                <MuteButton
                  aria-label={c("닫기", "Close")}
                  className="rounded-full px-1"
                  onClick={handleClose}
                  size="md"
                  type="button"
                  variant="transparent"
                >
                  <ChevronLeft aria-hidden className="size-4.5" />
                </MuteButton>
                <div className="flex min-w-0 flex-1 justify-center">
                  {detailNavigation ? (
                    <TalentDetailPager
                      compact
                      navigation={detailNavigation}
                      onNavigate={navigateToTalent}
                    />
                  ) : null}
                </div>
              </div>
              {showMobileDecisionActions ? (
                <div className="flex min-w-0 items-center gap-1 [&_button]:whitespace-nowrap [&_button]:px-2 [&_button]:text-[13px] max-[360px]:[&_button]:px-1!">
                  <MuteButton
                    variant="neutral"
                    disabled={saveCandidate.isPending}
                    onClick={() => {
                      if (!detail) return;
                      saveCandidate.mutate({
                        workspaceId,
                        roleId: detail.role.roleId,
                        talentId: detail.talent.userId,
                        recommendationId: detail.recommendation.recommendationId,
                        saved: !optionalBoard?.board?.items.find(
                          (item) => item.recommendationId === activeDetailRecommendationId
                        )?.savedAt,
                      });
                    }}
                  >
                    {optionalBoard?.board?.items.find(
                      (item) => item.recommendationId === activeDetailRecommendationId
                    )?.savedAt ? c("저장 해제", "Unsave") : "Save"}
                  </MuteButton>
                  {detail?.companyIntro ? (
                    <OrgPassPopover
                      open={companyIntroPassOpen}
                      onOpenChange={setCompanyIntroPassOpen}
                      onSubmit={submitCompanyIntroPass}
                      pending={passCompanyIntro.isPending}
                      shortcut={false}
                    />
                  ) : (
                    <MuteButton
                      className="min-w-11 border-critical bg-critical text-neutral-00 hover:border-critical/90 hover:bg-critical/90 hover:text-neutral-00 active:bg-critical/80"
                      disabled={decisionPending || !onRejectCandidate}
                      onClick={() => setRejectDialogOpen(true)}
                      size="md"
                      type="button"
                      variant="transparent"
                    >
                      {CANDIDATE_DECISION_LABELS.reject}
                    </MuteButton>
                  )}
                  <MuteButton
                    className="min-w-11 border-positive bg-positive text-neutral-00 hover:border-positive/90 hover:bg-positive/90 hover:text-neutral-00 active:bg-positive/80"
                    disabled={
                      decisionPending ||
                      (detail?.recommendation.stage !== "company_intro" &&
                        (!acceptStageId || !onAcceptCandidate))
                    }
                    onClick={() =>
                      detail?.recommendation.stage === "company_intro"
                        ? setCompanyIntroRequestOpen(true)
                        : setAcceptDialogOpen(true)
                    }
                    size="md"
                    type="button"
                    variant="transparent"
                  >
                    {detail?.recommendation.stage === "company_intro"
                      ? c("Send Intro", "Send Intro")
                      : CANDIDATE_DECISION_LABELS.connect}
                  </MuteButton>
                </div>
              ) : null}
            </div>
            {roleMoveButton && <div className="flex items-center px-2 pb-1">{roleMoveButton}</div>}
            {saveCandidate.error instanceof Error && (
              <p role="alert" className="px-2 pb-2 text-xs text-critical">{saveCandidate.error.message}</p>
            )}
          </div>

          <div className="hidden shrink-0 items-center justify-between border-b border-neutral-1000-a05 px-5 py-3 font-normal md:flex">
            {detailNavigation ? (
              <div className="flex min-w-0 items-center gap-3">
                <TalentDetailPager
                  navigation={detailNavigation}
                  onNavigate={navigateToTalent}
                />
                {roleMoveButton}
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-normal text-neutral-primary">
                    {title}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-neutral-muted">
                    {subtitle}
                  </div>
                </div>
                {roleMoveButton}
              </div>
            )}
            <MuteButton
              aria-label={c("닫기", "Close")}
              onClick={handleClose}
              size="md"
              type="button"
              variant="transparent"
            >
              <X aria-hidden className="size-4" />
            </MuteButton>
          </div>

          {error && detail && (
            <OrgErrorState
              className="mx-5"
              message={error.message}
              onRetry={onRetry}
            />
          )}
          {!detail && !error ? (
            <div
              aria-busy="true"
              className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_var(--candidate-feed-width)]"
            >
              <div className="space-y-8 overflow-y-auto p-4 sm:p-5">
                <div className="flex items-center gap-4">
                  <Skeleton className="size-16 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
                {[0, 1, 2].map((section) => (
                  <div key={section} className="space-y-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-3/5" />
                  </div>
                ))}
              </div>
              <div className="hidden space-y-6 overflow-y-auto border-l border-neutral-1000-a05 p-5 md:block">
                <Skeleton className="h-8 w-28" />
                {[0, 1, 2].map((item) => (
                  <div key={item} className="space-y-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                ))}
              </div>
            </div>
          ) : error && !detail ? (
            <OrgErrorState
              className="m-5"
              message={error.message}
              onRetry={onRetry}
            />
          ) : detail ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_var(--candidate-feed-width)]">
              <div className="min-h-0 overflow-y-auto">
                <div className="bg-bg-default px-4 py-2 md:hidden">
                  <Tabs
                    activeValue={mobileTab}
                    aria-label={c("후보자 상세 보기", "View candidate details")}
                    className="w-fit"
                    items={[
                      {
                        label: c("프로필", "Profile"),
                        value: "profile",
                      },
                      {
                        label: c("피드", "Feed"),
                        value: "feed",
                      },
                    ]}
                    onValueChange={(value) => {
                      if (value === "profile" || value === "feed") {
                        setMobileTab(value);
                      }
                    }}
                    size="small"
                    variant="pills-elevated"
                  />
                </div>
                {internalOpsAccess ? (
                  <div
                    className={cn(
                      "border-b border-neutral-1000-a05 bg-bg-default px-5",
                      mobileTab !== "profile" && "hidden md:block"
                    )}
                  >
                    <div className="flex">
                      <MuteButton
                        className={cn(
                          "rounded-none border-b-2 px-3 text-sm",
                          profileTab === "profile"
                            ? "border-neutral-1000 text-neutral-primary"
                            : "border-transparent text-neutral-muted"
                        )}
                        onClick={() => setProfileTab("profile")}
                        size="sm"
                        variant="transparent"
                      >
                        {c("회사 공개 프로필", "Public company profile")}
                      </MuteButton>
                      <MuteButton
                        className={cn(
                          "relative isolate overflow-hidden rounded-none border-b-2 px-3 text-sm",
                          profileTab === "internal"
                            ? "border-neutral-1000 text-neutral-primary"
                            : "border-transparent text-neutral-muted"
                        )}
                        onClick={() => setProfileTab("internal")}
                        size="sm"
                        variant="transparent"
                      >
                        <InternalOnlyHatch />
                        {c("Harper 내부 정보", "Harper internal info")}
                      </MuteButton>
                    </div>
                  </div>
                ) : null}
                <div className="p-4 sm:p-5">
                  <div
                    className={cn(mobileTab !== "profile" && "hidden md:block")}
                  >
                    {profileTab === "internal" && internalOpsAccess ? (
                      <div className="space-y-2">
                        <SystemActivitySummary
                          account={systemActivityQuery.data?.account}
                          error={systemActivityError}
                          isLoading={systemActivityQuery.isLoading}
                        />
                        <HarperMemoSection
                          error={harperMemoError}
                          isLoading={harperMemoQuery.isLoading}
                          memos={harperMemos}
                        />
                        <OrgInternalTalentPanel
                          roleId={detail.role.roleId}
                          talentId={detail.talent.userId}
                          workspaceId={workspaceId}
                        />
                      </div>
                    ) : (
                      <OrgTalentProfile
                        detail={detail}
                        onResumeClick={(kind, link, documentId) => {
                          if (!detail.capabilities.viewResume) return;
                          setResumeRequest({ documentId, kind, link });
                        }}
                      />
                    )}
                  </div>
                  <div
                    className={cn(
                      mobileTab !== "feed" && "hidden",
                      "md:hidden"
                    )}
                  >
                    <FeedPanel
                      canManageCandidates={canUseExistingCandidateActions}
                      currentUserId={currentUserId}
                      detail={detail}
                      internalOpsAccess={internalOpsAccess}
                      talentId={talentId}
                      workspaceId={workspaceId}
                    />
                  </div>
                </div>
              </div>
              <div className="hidden min-h-0 overflow-y-auto border-l border-neutral-1000-a05 bg-bg-default px-5 pt-5 pb-20 md:block">
                <FeedPanel
                  canManageCandidates={canUseExistingCandidateActions}
                  currentUserId={currentUserId}
                  decisionActions={
                    detail.companyIntro ? (
                      <CompanyIntroDecisionActions
                        detail={detail}
                        onPass={submitCompanyIntroPass}
                        onRequest={() => setCompanyIntroRequestOpen(true)}
                        pending={
                          requestCompanyIntro.isPending ||
                          passCompanyIntro.isPending
                        }
                      />
                    ) : (
                      <CandidateDecisionActions
                        acceptDisabled={
                          !acceptStageId || !canUseExistingCandidateActions
                        }
                        candidateName={title}
                        currentStage={detail.recommendation.stage}
                        decisionPending={decisionPending}
                        onAcceptClick={
                          canUseExistingCandidateActions
                            ? () => setAcceptDialogOpen(true)
                            : undefined
                        }
                        onMoveToPendingConnection={onMoveToPendingConnection}
                        onRejectClick={
                          canUseExistingCandidateActions
                            ? () => setRejectDialogOpen(true)
                            : undefined
                        }
                      />
                    )
                  }
                  detail={detail}
                  internalOpsAccess={internalOpsAccess}
                  talentId={talentId}
                  workspaceId={workspaceId}
                />
              </div>
            </div>
          ) : null}
        </TalentCareerModal>
      )}

      <TalentCareerModal
        open={Boolean(resumeRequest)}
        onClose={() => closeResumeDialog()}
        mobileBottomSheet
        title={
          <>
            {resumeRequest?.kind === "document"
              ? c("문서 열기", "Open document")
              : c("이력서 열기", "Open resume")}
          </>
        }
        panelClassName="z-[90] max-w-md"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton
              type="button"
              size="md"
              onClick={closeResumeDialog}
              disabled={openResume.isPending}
            >
              {c("취소", "Cancel")}
            </MuteButton>
            <MuteButton
              type="button"
              variant="primary"
              size="md"
              onClick={handleConfirmResume}
              disabled={openResume.isPending}
            >
              {openResume.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              {c("확인 후 열기", "Open after confirmation")}
            </MuteButton>
          </div>
        }
        backdropClassName={"z-[80]"}
      >
        <div className="mt-1 text-sm leading-5 text-neutral-primary">
          {c(
            "이 자료는 채용 검토 목적으로만 사용하고 회사 외부에 공유하지 마세요.",
            "This material is for hiring review only. Do not share outside the company."
          )}
        </div>
        {resumeError ? (
          <div className="text-[12px] text-critical" role="alert">
            {resumeError}
          </div>
        ) : null}
      </TalentCareerModal>

      {roleMoveOpen && detail && (
        <OrgCandidateRoleMoveDialog
          key={`${detail.role.roleId}:${detail.recommendation.recommendationId}`}
          detail={detail}
          roles={bootstrap.roles}
          onClose={() => setRoleMoveOpen(false)}
          onMoved={(selection) => {
            setRoleMoveOpen(false);
            selectTalent(selection);
          }}
        />
      )}
      <OrgStageMoveDialog
        key={detail?.recommendation.recommendationId ?? "stage-move-dialog"}
        allowContactDirectly={isInternalDomainEmail(currentUserEmail)}
        candidates={detailMoveCandidate ? [detailMoveCandidate] : []}
        initialStage={acceptStageId ?? "connected"}
        members={members}
        onClose={closeAcceptDialog}
        onSubmit={(submit) => {
          if (!detail || !detailMoveCandidate || !onAcceptCandidate) return;
          const options = submit.options(detailMoveCandidate);
          decisions.moveOpenCandidate({
            name: title,
            recommendationId: detail.recommendation.recommendationId,
            run: () =>
              onAcceptCandidate(
                {
                  acceptReason: null,
                  attendeeEmails: options.attendeeEmails,
                  contactDirectly: options.contactDirectly ?? false,
                  durationMinutes: options.durationMinutes,
                  introEmailDraft: options.introEmailDraft,
                  introBookingLink: options.introBookingLink,
                  introEmails: options.introEmails ?? [],
                  meetingCandidateMessage: options.meetingCandidateMessage,
                  meetingPurpose: options.meetingPurpose,
                  scheduleInterview: options.scheduleInterview,
                  stage: submit.stage,
                  title: options.title,
                },
                "silent"
              ),
            submit,
          });
          closeAcceptDialog();
          if (presentation === "inline") finishReview();
        }}
        open={acceptDialogOpen && Boolean(detail)}
        roleId={detail?.role.roleId ?? null}
        roleTitle={detail?.role.name ?? ""}
        stages={
          optionalBoard?.board?.stages ?? [
            { id: "connected", label: "연결됨", sortOrder: 1 },
          ]
        }
      />

      <PendingConnectionDialog
        candidateName={title}
        onClose={() => setPendingConnectionDialogOpen(false)}
        onConfirm={async (emailMode) => {
          const request = moveTalentToPendingConnection(emailMode);
          setPendingConnectionDialogOpen(false);
          await request;
        }}
        open={pendingConnectionDialogOpen && Boolean(detail)}
        pending={decisionPending}
        recipientEmail={detail?.talent.email}
      />

      <CompanyIntroRequestDialog
        key={detail?.companyIntro?.id ?? "closed"}
        candidateName={title}
        roleId={detail?.role.roleId}
        workspaceId={workspaceId}
        members={members}
        defaultEmail={currentUserEmail}
        onClose={() => setCompanyIntroRequestOpen(false)}
        onSubmit={async ({ companyAppeal, introRecipientEmails }) => {
          if (!detail?.companyIntro) return;
          await requestCompanyIntro.mutateAsync({
            companyAppeal,
            introCandidateId: detail.companyIntro.id,
            introRecipientEmails,
            workspaceId,
          });
          setCompanyIntroRequestOpen(false);
          if (presentation === "inline") finishReview();
          addToast({
            message: c("Intro를 요청했어요.", "Intro requested."),
            variant: "success",
          });
        }}
        open={companyIntroRequestOpen && Boolean(detail?.companyIntro)}
        pending={requestCompanyIntro.isPending}
      />

      <StopCandidateDialog
        candidateName={title}
        connectionStarted={Boolean(
          detail && detail.recommendation.stage !== "pending_connection"
        )}
        open={rejectDialogOpen && Boolean(detail)}
        pending={decisionPending}
        onClose={() => setRejectDialogOpen(false)}
        onSubmit={({ note, notifyCandidateOnClosure }) => {
          if (!onRejectCandidate || !detail) return;
          decisions.rejectOpenCandidate({
            ended: detail.recommendation.stage !== "pending_connection",
            name: title,
            notifyCandidateOnClosure,
            recommendationId: detail.recommendation.recommendationId,
            run: () =>
              onRejectCandidate(
                { notifyCandidateOnClosure, stopNote: note },
                "silent"
              ),
          });
          setRejectDialogOpen(false);
          if (presentation === "inline") finishReview();
        }}
        suggestedReasons={
          detail
            ? [suggestOrgStopReasons(detail.criteriaEvaluations, locale)]
            : undefined
        }
      />
    </>
  );
}
