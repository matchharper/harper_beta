import { memo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  LoaderCircle,
  Mail,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { ManualInternalRecommendationModal } from "@/components/ops/career/RecommendationsTab";
import { formatKst } from "@/components/ops/career/utils";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import {
  FitLabelBadge,
  FitReasonCell,
} from "@/components/ops/matching/MatchingFitLabelControls";
import {
  useCreateOpsMatchingProgress,
  useDeleteOpsMatchingProgress,
  useOpsMatchingProgress,
} from "@/hooks/ops/useOpsMatching";
import type { OpsManualInternalRecommendationRole } from "@/lib/ops/careerServer";
import type {
  OpsMatchingProgressItem,
  OpsMatchingRecommendationDelivery,
  OpsMatchingRecommendationSummary,
  OpsMatchingRoleOption,
  OpsMatchingTalentFitSummary,
} from "@/lib/ops/matching";

type MatchingRoleProgressPanelProps = {
  initialFit?: OpsMatchingTalentFitSummary | null;
  role: OpsMatchingRoleOption;
  talentDisplayName: string;
  talentId: string;
};

function toManualRole(
  role: OpsMatchingRoleOption
): OpsManualInternalRecommendationRole {
  return {
    alreadyRecommended: false,
    companyName: role.companyName,
    companyWorkspaceId: role.companyWorkspaceId,
    description: role.description,
    descriptionSummary: role.descriptionSummary,
    locationText: role.locationText,
    roleId: role.roleId,
    roleName: role.roleName,
    status: role.status,
    updatedAt: role.updatedAt,
  };
}

function isAcceptedFeedback(feedback: string | null | undefined) {
  const normalized = String(feedback ?? "").toLowerCase();
  return normalized === "like" || normalized === "positive";
}

function isRejectedFeedback(feedback: string | null | undefined) {
  const normalized = String(feedback ?? "").toLowerCase();
  return normalized === "dislike" || normalized === "negative";
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
      kind: "recommendation" | "feedback" | "queued" | "viewed";
      text: string;
      title: string;
    }
  | {
      createdAt: string;
      item: OpsMatchingProgressItem;
      kind: "progress";
    };

function buildRecommendationTimelineItems(args: {
  queuedAt: string | null;
  recommendation: OpsMatchingRecommendationSummary | null;
  role: OpsMatchingRoleOption;
}): TimelineItem[] {
  const items: TimelineItem[] = [];
  const recommendation = args.recommendation;

  if (recommendation) {
    const delivery = recommendation.isManualInternalRecommendation
      ? getPrimaryDelivery(recommendation)
      : null;
    items.push({
      createdAt: recommendation.recommendedAt ?? recommendation.createdAt,
      delivery,
      id: `recommendation:${recommendation.recommendationId}`,
      kind: "recommendation",
      text: recommendation.isManualInternalRecommendation
        ? "Ops에서 이 internal 기회를 직접 추천했습니다."
        : "Harper가 이 internal 기회를 추천했습니다.",
      title: "추천 제안됨",
    });

    if (recommendation.viewedAt) {
      items.push({
        createdAt: recommendation.viewedAt,
        delivery: null,
        id: `viewed:${recommendation.recommendationId}`,
        kind: "viewed",
        text: "추천된 역할을 확인했습니다.",
        title: "추천 확인",
      });
    }

    if (recommendation.feedback) {
      const accepted = isAcceptedFeedback(recommendation.feedback);
      const rejected = isRejectedFeedback(recommendation.feedback);
      const title = accepted
        ? "추천 수락"
        : rejected
          ? "추천 거절"
          : "추천 피드백";
      items.push({
        createdAt:
          recommendation.feedbackAt ??
          recommendation.updatedAt ??
          recommendation.recommendedAt,
        delivery: null,
        id: `feedback:${recommendation.recommendationId}`,
        kind: "feedback",
        text:
          recommendation.feedbackReason?.trim() ||
          (accepted
            ? "Talent가 이 추천을 수락했습니다."
            : rejected
              ? "Talent가 이 추천을 거절했습니다."
              : "Talent가 이 추천에 피드백을 남겼습니다."),
        title,
      });
    }
  } else if (args.queuedAt) {
    items.push({
      createdAt: args.queuedAt,
      delivery: null,
      id: `queued:${args.role.roleId}:${args.queuedAt}`,
      kind: "queued",
      text: "추천 등록이 큐에 들어갔습니다. 추천 생성이 완료되면 추천 이력으로 표시됩니다.",
      title: "추천 등록됨",
    });
  }

  return items;
}

function RoleFitJudgmentPanel({
  fit,
}: {
  fit: OpsMatchingTalentFitSummary | null;
}) {
  if (!fit) return null;

  return (
    <section className="mt-4 rounded-md border border-neutral-1000-a05 bg-bg-floating p-4">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-neutral-primary">
              LLM 판단
            </div>
            <FitLabelBadge label={fit.label} prefix="LLM" />
            {typeof fit.score === "number" ? (
              <span className="rounded-sm bg-bg-weak px-2 py-0.5 text-[11px] font-medium text-neutral-muted">
                Score {fit.score}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-[11px] text-neutral-soft">
            {fit.lastEvaluatedAt
              ? `평가 ${formatKst(fit.lastEvaluatedAt)}`
              : "평가 시각 없음"}
          </div>
          <div className="mt-3">
            <FitReasonCell
              expanded
              criteria={fit.reevaluationCriteria}
              reason={fit.reason}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export const MatchingRoleProgressPanel = memo(
  function MatchingRoleProgressPanel({
    initialFit = null,
    role,
    talentDisplayName,
    talentId,
  }: MatchingRoleProgressPanelProps) {
    const [draft, setDraft] = useState("");
    const [manualModalOpen, setManualModalOpen] = useState(false);
    const [queuedRecommendationAt, setQueuedRecommendationAt] = useState<
      string | null
    >(null);
    const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(
      null
    );
    const progressQuery = useOpsMatchingProgress({
      roleId: role.roleId,
      talentId,
    });
    const createProgress = useCreateOpsMatchingProgress();
    const deleteProgress = useDeleteOpsMatchingProgress();
    const items = progressQuery.data?.items ?? [];
    const fit = progressQuery.data?.fit ?? initialFit;
    const recommendation = progressQuery.data?.recommendation ?? null;
    const hasApplication = Boolean(recommendation);
    const hasQueuedProgress = items.some((item) =>
      item.text.includes("연결 제안")
    );
    const pendingDeleteId = deleteProgress.variables?.progressId ?? null;
    const trimmedDraft = draft.trim();
    const showConnectionButton =
      !progressQuery.isLoading &&
      !hasApplication &&
      !hasQueuedProgress &&
      !queuedRecommendationAt;
    const manualRole = toManualRole(role);
    const timelineItems = [
      ...buildRecommendationTimelineItems({
        queuedAt:
          hasApplication || hasQueuedProgress ? null : queuedRecommendationAt,
        recommendation,
        role,
      }),
      ...items.map((item) => ({
        createdAt: item.createdAt,
        item,
        kind: "progress" as const,
      })),
    ].sort((left, right) => {
      const leftTime = Date.parse(left.createdAt);
      const rightTime = Date.parse(right.createdAt);
      const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
      const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0;
      return safeRightTime - safeLeftTime;
    });

    const addProgress = (text: string, onSuccess?: () => void) => {
      const trimmed = text.trim();
      if (!trimmed || createProgress.isPending) return;
      createProgress.mutate(
        {
          roleId: role.roleId,
          talentId,
          text: trimmed,
        },
        {
          onSuccess,
        }
      );
    };

    const handleDeleteProgress = (progressId: string) => {
      if (deleteProgress.isPending) return;
      if (!window.confirm("이 Progress를 삭제할까요?")) return;
      deleteProgress.mutate({
        progressId,
        roleId: role.roleId,
        talentId,
      });
    };

    return (
      <aside className="flex min-h-0 flex-col border-l border-neutral-1000-a05 bg-bg-default">
        <div className="shrink-0 border-b border-neutral-1000-a05 bg-bg-floating px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-base font-medium text-neutral-primary">
                {role.companyName} · {role.roleName}
              </div>
              <div className="mt-1 truncate text-xs text-neutral-muted">
                {role.locationText || "Location 없음"} · {role.status}
              </div>
            </div>
          </div>
          <div className="mt-4 flex border-b border-neutral-1000-a05">
            <BareButton
              type="button"
              className="border-b-2 border-neutral-800 px-3 py-2 text-sm font-medium text-neutral-primary"
            >
              피드
            </BareButton>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="rounded-md border border-neutral-1000-a05 bg-bg-floating p-3">
            <UiTextarea
              unstyled
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-[104px] w-full resize-y rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 py-3 text-sm leading-6 text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a10"
              placeholder="이 role과 관련된 메모를 남겨주세요."
              maxLength={2000}
            />
            <div className="mt-2 flex justify-end">
              <BareButton
                type="button"
                onClick={() =>
                  addProgress(trimmedDraft, () => {
                    setDraft("");
                  })
                }
                disabled={!trimmedDraft || createProgress.isPending}
                className={cx(opsTheme.buttonPrimary, "h-9 px-3 text-xs")}
              >
                {createProgress.isPending ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                메모 추가
              </BareButton>
            </div>
          </div>

          {showConnectionButton ? (
            <BareButton
              type="button"
              onClick={() => setManualModalOpen(true)}
              className={cx(
                opsTheme.buttonPrimary,
                "mt-3 h-9 px-3 text-xs my-4"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {talentDisplayName}에게 {role.companyName} - {role.roleName} 연결
              제안하기
            </BareButton>
          ) : null}

          {createProgress.error || deleteProgress.error ? (
            <div className={cx(opsTheme.errorNotice, "mt-4")}>
              {createProgress.error instanceof Error
                ? createProgress.error.message
                : deleteProgress.error instanceof Error
                  ? deleteProgress.error.message
                  : "Progress 처리에 실패했습니다."}
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {progressQuery.isLoading ? (
              <div className="flex items-center justify-center py-10">
                <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
              </div>
            ) : progressQuery.error ? (
              <div className={opsTheme.errorNotice}>
                {progressQuery.error instanceof Error
                  ? progressQuery.error.message
                  : "Progress를 불러오지 못했습니다."}
              </div>
            ) : timelineItems.length === 0 ? (
              <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-6 text-center text-sm text-neutral-soft">
                {hasApplication
                  ? "아직 Progress 기록이 없습니다."
                  : "아직 아무 것도 연결되지 않았습니다."}
              </div>
            ) : (
              timelineItems.map((timelineItem) => {
                if (timelineItem.kind !== "progress") {
                  const delivery = timelineItem.delivery;
                  const deliveryKey = delivery
                    ? `${timelineItem.id}:${delivery.id}`
                    : null;
                  const expanded =
                    deliveryKey !== null && expandedDeliveryId === deliveryKey;
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
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
                          {delivery ? (
                            <div className="mt-2">
                              <BareButton
                                type="button"
                                onClick={() =>
                                  setExpandedDeliveryId(
                                    expanded ? null : deliveryKey
                                  )
                                }
                                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-bg-weak px-2 text-[11px] font-medium text-neutral-muted transition hover:text-neutral-primary"
                              >
                                {expanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                <Mail className="h-3.5 w-3.5" />
                                메일 내용
                              </BareButton>
                              {expanded ? (
                                <div className="mt-2 rounded-md border border-neutral-1000-a05 bg-bg-default/70 p-3 text-xs leading-5 text-neutral-muted">
                                  {delivery.subject ? (
                                    <div className="mb-2 font-medium text-neutral-primary">
                                      {delivery.subject}
                                    </div>
                                  ) : null}
                                  {delivery.bodyText ? (
                                    <div className="whitespace-pre-wrap">
                                      {delivery.bodyText}
                                    </div>
                                  ) : (
                                    <div>표시할 메일 본문이 없습니다.</div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                }

                const item = timelineItem.item;
                const isDeleting =
                  deleteProgress.isPending && pendingDeleteId === item.id;
                return (
                  <article
                    key={item.id}
                    className="rounded-md border border-neutral-1000-a05 bg-bg-floating px-3.5 py-3 text-sm text-neutral-primary"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[11px] text-neutral-soft">
                        {formatKst(item.createdAt)}
                      </div>
                      <BareButton
                        type="button"
                        onClick={() => handleDeleteProgress(item.id)}
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
                      {item.text}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <RoleFitJudgmentPanel fit={fit} />
        </div>

        <ManualInternalRecommendationModal
          fixedRole={manualRole}
          open={manualModalOpen}
          onClose={() => setManualModalOpen(false)}
          userId={talentId}
          onQueued={() => {
            setQueuedRecommendationAt(new Date().toISOString());
          }}
        />
      </aside>
    );
  }
);
