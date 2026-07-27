import { memo, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Eye,
  LoaderCircle,
  Mail,
  MailCheck,
  Send,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  useDeleteOpsMatchingProgress,
  useOpsMatchingProgress,
  useUpdateOpsMatchingConnectionConfirmationEmail,
} from "@/hooks/ops/useOpsMatching";
import type { OpsMatchingConnectionConfirmationEmail } from "@/lib/ops/connectionConfirmationEmail";
import type {
  OpsMatchingProgressItem,
  OpsMatchingRecommendationDelivery,
  OpsMatchingRecommendationSummary,
} from "@/lib/ops/matching";
import { formatKst } from "./utils";

type TalentProgressFeedProps = {
  emptyLabel?: string;
  enabled?: boolean;
  roleId?: string | null;
  showRoleContext?: boolean;
  talentId: string;
};

function isAcceptedFeedback(feedback: string | null | undefined) {
  const normalized = String(feedback ?? "").toLowerCase();
  return normalized === "like" || normalized === "positive";
}

function isRejectedFeedback(feedback: string | null | undefined) {
  const normalized = String(feedback ?? "").toLowerCase();
  return normalized === "dislike" || normalized === "negative";
}

function isCandidateRequestedConnection(item: OpsMatchingProgressItem) {
  return item.kind === "candidate_requested_connection";
}

function getPrimaryDelivery(
  recommendation: OpsMatchingRecommendationSummary
): OpsMatchingRecommendationDelivery | null {
  return (
    recommendation.deliveries.find(
      (delivery) =>
        delivery.channel === "email" &&
        Boolean(delivery.subject || delivery.bodyText)
    ) ??
    recommendation.deliveries.find((delivery) =>
      Boolean(delivery.subject || delivery.bodyText)
    ) ??
    null
  );
}

type TimelineItem =
  | {
      createdAt: string;
      delivery: OpsMatchingRecommendationDelivery | null;
      id: string;
      kind: "recommendation" | "feedback" | "viewed";
      roleContext: string;
      text: string;
      title: string;
    }
  | {
      createdAt: string;
      item: OpsMatchingConnectionConfirmationEmail;
      kind: "connection_email";
      roleContext: string;
    }
  | {
      createdAt: string;
      item: OpsMatchingProgressItem;
      kind: "progress";
      roleContext: string;
    };

function buildRecommendationTimelineItems(
  recommendations: OpsMatchingRecommendationSummary[]
): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const recommendation of recommendations) {
    const roleContext = [recommendation.companyName, recommendation.roleName]
      .filter(Boolean)
      .join(" · ");

    items.push({
      createdAt: recommendation.recommendedAt ?? recommendation.createdAt,
      delivery: getPrimaryDelivery(recommendation),
      id: `recommendation:${recommendation.recommendationId}`,
      kind: "recommendation",
      roleContext,
      text: recommendation.isManualInternalRecommendation
        ? "Ops에서 이 internal 기회를 직접 추천했습니다."
        : "Harper가 이 기회를 추천했습니다.",
      title: "추천 제안됨",
    });

    if (recommendation.viewedAt) {
      items.push({
        createdAt: recommendation.viewedAt,
        delivery: null,
        id: `viewed:${recommendation.recommendationId}`,
        kind: "viewed",
        roleContext,
        text: "추천된 역할을 확인했습니다.",
        title: "추천 확인",
      });
    }

    if (recommendation.feedback) {
      const accepted = isAcceptedFeedback(recommendation.feedback);
      const rejected = isRejectedFeedback(recommendation.feedback);
      items.push({
        createdAt:
          recommendation.feedbackAt ??
          recommendation.updatedAt ??
          recommendation.recommendedAt,
        delivery: null,
        id: `feedback:${recommendation.recommendationId}`,
        kind: "feedback",
        roleContext,
        text:
          recommendation.feedbackReason?.trim() ||
          (accepted
            ? "Talent가 이 추천을 수락했습니다."
            : rejected
              ? "Talent가 이 추천을 거절했습니다."
              : "Talent가 이 추천에 피드백을 남겼습니다."),
        title: accepted ? "추천 수락" : rejected ? "추천 거절" : "추천 피드백",
      });
    }
  }

  return items;
}

function DeliveryPreview({
  delivery,
}: {
  delivery: OpsMatchingRecommendationDelivery;
}) {
  return (
    <div className="mt-2 rounded-md border border-neutral-1000-a05 bg-bg-default/70 p-3 text-xs leading-5 text-neutral-muted">
      <div className="mb-2 flex items-center gap-1.5 font-medium text-neutral-primary">
        <Mail className="h-3.5 w-3.5 text-neutral-soft" />
        메일
      </div>
      {delivery.subject ? (
        <div className="mb-2 font-medium text-neutral-primary">
          {delivery.subject}
        </div>
      ) : null}
      {delivery.bodyText ? (
        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap pr-1">
          {delivery.bodyText}
        </div>
      ) : (
        <div>표시할 메일 본문이 없습니다.</div>
      )}
    </div>
  );
}

export const TalentProgressFeed = memo(function TalentProgressFeed({
  emptyLabel = "아직 Progress가 없습니다.",
  enabled = true,
  roleId,
  showRoleContext = false,
  talentId,
}: TalentProgressFeedProps) {
  const progressQuery = useOpsMatchingProgress({
    enabled,
    roleId,
    talentId,
  });
  const deleteProgress = useDeleteOpsMatchingProgress();
  const updateConnectionEmail =
    useUpdateOpsMatchingConnectionConfirmationEmail();
  const [pollingQueueId, setPollingQueueId] = useState<string | null>(null);
  const pendingDeleteId = deleteProgress.variables?.progressId ?? null;
  const pendingConnectionQueueId =
    updateConnectionEmail.variables?.queueId ?? null;
  const refetchProgress = progressQuery.refetch;

  useEffect(() => {
    if (!pollingQueueId) return;
    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      const result = await refetchProgress();
      const current = result.data?.connectionConfirmationEmails.find(
        (item) => item.id === pollingQueueId
      );
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
  }, [pollingQueueId, refetchProgress]);

  if (progressQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
      </div>
    );
  }

  if (progressQuery.error) {
    return (
      <div className={opsTheme.errorNotice}>
        {progressQuery.error instanceof Error
          ? progressQuery.error.message
          : "Progress를 불러오지 못했습니다."}
      </div>
    );
  }

  const items = progressQuery.data?.items ?? [];
  const recommendations = progressQuery.data?.recommendations ?? [];
  const connectionConfirmationEmails =
    progressQuery.data?.connectionConfirmationEmails ?? [];
  const timelineItems = [
    ...buildRecommendationTimelineItems(recommendations),
    ...connectionConfirmationEmails.map((item) => ({
      createdAt: item.sentAt ?? item.createdAt,
      item,
      kind: "connection_email" as const,
      roleContext: [item.companyName, item.roleName]
        .filter(Boolean)
        .join(" · "),
    })),
    ...items.map((item) => ({
      createdAt: item.createdAt,
      item,
      kind: "progress" as const,
      roleContext: [item.companyName, item.roleName]
        .filter(Boolean)
        .join(" · "),
    })),
  ].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0;
    return safeRightTime - safeLeftTime;
  });

  if (timelineItems.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-6 text-center text-sm text-neutral-soft">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {timelineItems.map((timelineItem) => {
        if (timelineItem.kind === "connection_email") {
          const item = timelineItem.item;
          const isUpdating =
            updateConnectionEmail.isPending &&
            pendingConnectionQueueId === item.id;
          const statusMeta =
            item.status === "sent"
              ? {
                  Icon: MailCheck,
                  detail: `${formatKst(item.sentAt)} 발송 완료`,
                  title: "연결 확정 안내 메일 발송",
                }
              : item.status === "sending"
                ? {
                    Icon: LoaderCircle,
                    detail: "발송을 처리하고 있습니다.",
                    title: "연결 확정 안내 메일 발송 중",
                  }
                : item.status === "cancelled"
                  ? {
                      Icon: XCircle,
                      detail: `${formatKst(item.cancelledAt)} 취소`,
                      title: "연결 확정 안내 메일 취소",
                    }
                  : item.status === "failed"
                    ? {
                        Icon: XCircle,
                        detail:
                          item.lastError?.trim() ||
                          "발송에 실패했습니다. 오류를 확인해 주세요.",
                        title: "연결 확정 안내 메일 실패",
                      }
                    : {
                        Icon: Clock3,
                        detail: `${formatKst(item.scheduledAt)} 발송 예정`,
                        title: "연결 확정 안내 메일 예정",
                      };
          const StatusIcon = statusMeta.Icon;

          return (
            <article
              key={`connection-email:${item.id}`}
              className="rounded-md border border-neutral-1000-a05 bg-bg-floating px-3.5 py-3 text-sm text-neutral-primary"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-weak text-neutral-muted">
                  <StatusIcon
                    className={cx(
                      "h-3.5 w-3.5",
                      item.status === "sending" && "animate-spin"
                    )}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  {showRoleContext && timelineItem.roleContext ? (
                    <div className="truncate text-xs font-medium text-neutral-primary">
                      {timelineItem.roleContext}
                    </div>
                  ) : null}
                  <div
                    className={cx(
                      "font-medium text-neutral-primary",
                      showRoleContext && timelineItem.roleContext && "mt-1"
                    )}
                  >
                    {statusMeta.title}
                  </div>
                  <div
                    className={cx(
                      "mt-1 text-xs leading-5",
                      item.status === "failed"
                        ? "text-critical"
                        : "text-neutral-muted"
                    )}
                  >
                    {statusMeta.detail}
                  </div>
                  {item.recipientResponse?.status === "stopped" && (
                    <div className="mt-2 rounded-md bg-critical-faded px-2.5 py-2 text-xs leading-5 text-critical">
                      <div className="font-medium">
                        인재가 이메일로 진행 종료를 요청했습니다.
                      </div>
                      <div>
                        {formatKst(item.recipientResponse.receivedAt)} 처리 완료
                      </div>
                      {item.recipientResponse.reason && (
                        <div className="mt-1 text-neutral-muted">
                          사유: {item.recipientResponse.reason}
                        </div>
                      )}
                    </div>
                  )}
                  {(item.canCancel || item.canSendNow) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.canCancel && (
                        <BareButton
                          type="button"
                          disabled={updateConnectionEmail.isPending}
                          onClick={() => {
                            if (
                              !window.confirm(
                                "예정된 연결 확정 안내 메일을 취소할까요?"
                              )
                            ) {
                              return;
                            }
                            updateConnectionEmail.mutate({
                              action: "cancel",
                              queueId: item.id,
                              roleId: item.roleId,
                              talentId: item.talentId,
                            });
                          }}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-bg-weak px-3 text-xs font-medium text-neutral-muted transition hover:text-critical disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isUpdating &&
                          updateConnectionEmail.variables?.action ===
                            "cancel" ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          취소
                        </BareButton>
                      )}
                      {item.canSendNow && (
                        <BareButton
                          type="button"
                          disabled={updateConnectionEmail.isPending}
                          onClick={() => {
                            if (
                              !window.confirm(
                                "자동 발송의 24시간/working time 조건을 무시하고 지금 발송할까요?"
                              )
                            ) {
                              return;
                            }
                            updateConnectionEmail.mutate(
                              {
                                action: "send_now",
                                queueId: item.id,
                                roleId: item.roleId,
                                talentId: item.talentId,
                              },
                              {
                                onSuccess: () => setPollingQueueId(item.id),
                              }
                            );
                          }}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-black px-3 text-xs font-medium text-neutral-00 transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isUpdating &&
                          updateConnectionEmail.variables?.action ===
                            "send_now" ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          바로 발송
                        </BareButton>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        }

        if (timelineItem.kind !== "progress") {
          const Icon =
            timelineItem.kind === "feedback"
              ? timelineItem.title.includes("거절")
                ? XCircle
                : CheckCircle2
              : timelineItem.kind === "viewed"
                ? Eye
                : Sparkles;
          return (
            <article
              key={timelineItem.id}
              className="rounded-md border border-neutral-1000-a05 bg-bg-floating px-3.5 py-3 text-sm text-neutral-primary"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-weak text-neutral-muted">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  {showRoleContext && timelineItem.roleContext ? (
                    <div className="truncate text-xs font-medium text-neutral-primary">
                      {timelineItem.roleContext}
                    </div>
                  ) : null}
                  <div
                    className={cx(
                      "flex flex-wrap items-center gap-x-2 gap-y-1",
                      showRoleContext && timelineItem.roleContext && "mt-1"
                    )}
                  >
                    <div className="text-sm font-medium text-neutral-primary">
                      {timelineItem.title}
                    </div>
                    <div className="text-[11px] text-neutral-soft">
                      {formatKst(timelineItem.createdAt)}
                    </div>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap leading-6 text-neutral-muted">
                    {timelineItem.text}
                  </div>
                  {timelineItem.delivery ? (
                    <DeliveryPreview delivery={timelineItem.delivery} />
                  ) : null}
                </div>
              </div>
            </article>
          );
        }

        const item = timelineItem.item;
        const candidateRequestedConnection =
          isCandidateRequestedConnection(item);
        const isDeleting =
          deleteProgress.isPending && pendingDeleteId === item.id;
        return (
          <article
            key={item.id}
            className="rounded-md border border-neutral-1000-a05 bg-bg-floating px-3.5 py-3 text-sm text-neutral-primary"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {showRoleContext && timelineItem.roleContext ? (
                  <div className="truncate text-xs font-medium text-neutral-primary">
                    {timelineItem.roleContext}
                  </div>
                ) : null}
                <div
                  className={cx(
                    "text-[11px] text-neutral-soft",
                    showRoleContext && timelineItem.roleContext && "mt-1"
                  )}
                >
                  {formatKst(item.createdAt)}
                </div>
              </div>
              <BareButton
                type="button"
                onClick={() => {
                  if (deleteProgress.isPending) return;
                  if (!window.confirm("이 Progress를 삭제할까요?")) return;
                  deleteProgress.mutate({
                    progressId: item.id,
                    roleId: item.roleId,
                    talentId: item.talentId,
                  });
                }}
                disabled={deleteProgress.isPending}
                aria-label="Progress 삭제"
                title="Progress 삭제"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-soft transition hover:bg-critical-faded hover:text-critical disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </BareButton>
            </div>
            <div className="mt-2 whitespace-pre-wrap leading-6 text-neutral-primary">
              {candidateRequestedConnection ? "관심 표시" : item.text}
            </div>
          </article>
        );
      })}
      {deleteProgress.error ? (
        <div className={opsTheme.errorNotice}>
          {deleteProgress.error instanceof Error
            ? deleteProgress.error.message
            : "Progress 삭제에 실패했습니다."}
        </div>
      ) : null}
      {updateConnectionEmail.error ? (
        <div className={opsTheme.errorNotice}>
          {updateConnectionEmail.error instanceof Error
            ? updateConnectionEmail.error.message
            : "연결 확정 안내 메일 상태 변경에 실패했습니다."}
        </div>
      ) : null}
    </div>
  );
});
