import { memo, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { ManualInternalRecommendationModal } from "@/components/ops/career/RecommendationsTab";
import { formatKst } from "@/components/ops/career/utils";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  ProgressFeed,
  type ProgressFeedItem,
} from "@/components/progress-feed/ProgressFeed";
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

const EMPTY_PROGRESS_ITEMS: OpsMatchingProgressItem[] = [];

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
        text: "추천된 역할을 열람했습니다.",
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
    const progressQuery = useOpsMatchingProgress({
      roleId: role.roleId,
      talentId,
    });
    const createProgress = useCreateOpsMatchingProgress();
    const deleteProgress = useDeleteOpsMatchingProgress();
    const items = progressQuery.data?.items ?? EMPTY_PROGRESS_ITEMS;
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
    const feedItems = useMemo<ProgressFeedItem[]>(() => {
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

      return timelineItems.map((timelineItem) => {
        if (timelineItem.kind === "progress") {
          return {
            createdAt: timelineItem.item.createdAt,
            deletable: true,
            icon: "note",
            id: timelineItem.item.id,
            text: timelineItem.item.text,
          };
        }

        return {
          createdAt: timelineItem.createdAt,
          delivery: timelineItem.delivery
            ? {
                bodyText: timelineItem.delivery.bodyText,
                id: timelineItem.delivery.id,
                subject: timelineItem.delivery.subject,
              }
            : null,
          icon:
            timelineItem.kind === "feedback"
              ? timelineItem.title.includes("거절")
                ? "x"
                : "check"
              : timelineItem.kind === "viewed"
                ? "eye"
                : "sparkles",
          id: timelineItem.id,
          text: timelineItem.text,
          title: timelineItem.title,
        };
      });
    }, [
      hasApplication,
      hasQueuedProgress,
      items,
      queuedRecommendationAt,
      recommendation,
      role,
    ]);

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
          <ProgressFeed
            deleteError={
              deleteProgress.error instanceof Error
                ? deleteProgress.error
                : null
            }
            draft={draft}
            emptyLabel={
              hasApplication
                ? "아직 Progress 기록이 없습니다."
                : "아직 아무 것도 연결되지 않았습니다."
            }
            error={
              progressQuery.error instanceof Error ? progressQuery.error : null
            }
            isLoading={progressQuery.isLoading}
            items={feedItems}
            onDelete={(item) => {
              if (deleteProgress.isPending) return;
              deleteProgress.mutate({
                progressId: item.id,
                roleId: role.roleId,
                talentId,
              });
            }}
            onDraftChange={setDraft}
            onSubmit={() =>
              addProgress(trimmedDraft, () => {
                setDraft("");
              })
            }
            pendingDeleteId={pendingDeleteId}
            pendingSubmit={createProgress.isPending}
            placeholder="이 role과 관련된 메모를 남겨주세요."
            submitError={
              createProgress.error instanceof Error
                ? createProgress.error
                : null
            }
          />

          {showConnectionButton ? (
            <BareButton
              type="button"
              onClick={() => setManualModalOpen(true)}
              className={cx(opsTheme.buttonPrimary, "mt-4 h-9 px-3 text-xs")}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {talentDisplayName}에게 {role.companyName} - {role.roleName} 연결
              제안하기
            </BareButton>
          ) : null}

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
