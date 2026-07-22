import { useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  LoaderCircle,
  MapPin,
  Sparkles,
  Tags,
} from "lucide-react";
import {
  FitLabelBadge,
  formatFitReasonText,
} from "@/components/ops/matching/MatchingFitLabelControls";
import { MatchingTagEditor } from "@/components/ops/matching/MatchingTalentInlineActions";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  Select as UiSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useOpsCareerRecommendations,
  useOpsManualInternalRecommendationRoles,
} from "@/hooks/ops/useOpsCareer";
import { useOpsMatchingTalentRoleTags } from "@/hooks/ops/useOpsMatching";
import type {
  CareerTalentRecommendationItem,
  OpsManualInternalRecommendationRole,
} from "@/lib/ops/careerServer";
import type {
  OpsMatchingTalentRoleTagGroup,
  OpsMatchingTalentTag,
} from "@/lib/ops/matching";
import {
  formatKst,
  recommendationFeedbackClass,
  recommendationFeedbackLabel,
} from "./utils";
import { ManualInternalRecommendationModal } from "./RecommendationsTab";

type TalentRoleTagsPanelProps = {
  userId: string;
};

type OpportunityInteractionItem = {
  companyName: string | null;
  companyWorkspaceId: string | null;
  locationText: string | null;
  recommendation: CareerTalentRecommendationItem | null;
  roleId: string;
  roleName: string | null;
  roleOption: OpsManualInternalRecommendationRole | null;
  status: string | null;
  tags: OpsMatchingTalentTag[];
  updatedAt: string | null;
};

function formatRoleLabel(role: {
  companyName?: string | null;
  roleName?: string | null;
}) {
  return [role.companyName || "회사명 없음", role.roleName || "Role 없음"]
    .filter(Boolean)
    .join(" · ");
}

function toRoleOptionFromGroup(
  item: OpsMatchingTalentRoleTagGroup
): OpsManualInternalRecommendationRole {
  return {
    alreadyRecommended: false,
    companyName: item.companyName || "회사명 없음",
    companyWorkspaceId: item.companyWorkspaceId ?? "",
    description: null,
    descriptionSummary: null,
    locationText: item.locationText,
    roleId: item.roleId,
    roleName: item.roleName || "Role 없음",
    status: item.status,
    updatedAt: item.updatedAt,
  };
}

function toRoleOptionFromRecommendation(
  item: CareerTalentRecommendationItem
): OpsManualInternalRecommendationRole {
  return {
    alreadyRecommended: true,
    companyName: item.companyName,
    companyWorkspaceId: "",
    description: null,
    descriptionSummary: item.fitSummary,
    locationText: item.locationText,
    roleId: item.roleId,
    roleName: item.roleName,
    status: item.roleStatus,
    updatedAt: item.updatedAt,
  };
}

function recommendationStatusLabel(
  recommendation: CareerTalentRecommendationItem | null
) {
  if (!recommendation) return "추천 전";
  const feedbackLabel = recommendationFeedbackLabel(recommendation.feedback);
  return feedbackLabel === "-" ? "추천됨" : feedbackLabel;
}

function recommendationStatusClass(
  recommendation: CareerTalentRecommendationItem | null
) {
  if (!recommendation) return "bg-bg-weak text-neutral-soft";
  if (recommendation.feedback) {
    return recommendationFeedbackClass(recommendation.feedback);
  }
  return "bg-info-faded text-info";
}

function OpportunityActivityCell({
  label,
  muted = false,
  value,
}: {
  label: string;
  muted?: boolean;
  value: string;
}) {
  return (
    <div className="min-w-0 border-l border-neutral-1000-a05 px-2 py-2 first:border-l-0">
      <div className="truncate text-[11px] font-medium leading-4 text-neutral-soft">
        {label}
      </div>
      <div
        className={cx(
          "mt-0.5 truncate text-[13px] font-medium leading-5",
          muted ? "text-neutral-soft" : "text-neutral-primary"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function OpportunityFitSummary({
  fit,
  recommendation,
}: {
  fit: CareerTalentRecommendationItem["matchingFit"];
  recommendation: CareerTalentRecommendationItem | null;
}) {
  const reasonText = formatFitReasonText(fit?.reason);

  if (!fit) {
    return (
      <div className="text-[12px] leading-5 text-neutral-soft">
        {recommendation
          ? "Matching fit 정보 없음"
          : "추천 전입니다. 태그로만 연결되어 있습니다."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-sm bg-bg-weak px-1.5 py-0.5 text-[11px] font-medium text-neutral-muted">
          Score {fit.score ?? "-"}
        </span>
        <FitLabelBadge label={fit.effectiveLabel} prefix="현재" />
        <FitLabelBadge label={fit.label} prefix="LLM" />
        {fit.humanLabel ? (
          <FitLabelBadge label={fit.humanLabel} prefix="Human" />
        ) : (
          <span className="inline-flex items-center rounded border border-neutral-1000-a05 px-2 py-0.5 text-[11px] font-medium text-neutral-soft">
            Human 미지정
          </span>
        )}
      </div>
      <div className="line-clamp-3 whitespace-pre-wrap break-words text-[13px] font-medium leading-5 text-neutral-primary">
        {reasonText || "Fit reason 없음"}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-4 text-neutral-soft">
        {fit.lastEvaluatedAt ? (
          <span>평가 {formatKst(fit.lastEvaluatedAt)}</span>
        ) : null}
        {fit.humanReviewedAt ? (
          <span>사람 {formatKst(fit.humanReviewedAt)}</span>
        ) : null}
      </div>
    </div>
  );
}

function getSortTime(item: OpportunityInteractionItem) {
  const value =
    item.recommendation?.recommendedAt ??
    item.recommendation?.createdAt ??
    item.updatedAt ??
    "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildOpportunityItems(args: {
  recommendations: CareerTalentRecommendationItem[];
  roleOptions: OpsManualInternalRecommendationRole[];
  roleTagItems: OpsMatchingTalentRoleTagGroup[];
}): OpportunityInteractionItem[] {
  const roleOptionMap = new Map(
    args.roleOptions.map((role) => [role.roleId, role])
  );
  const itemMap = new Map<string, OpportunityInteractionItem>();

  for (const recommendation of args.recommendations) {
    const roleOption =
      roleOptionMap.get(recommendation.roleId) ??
      toRoleOptionFromRecommendation(recommendation);
    itemMap.set(recommendation.roleId, {
      companyName: recommendation.companyName,
      companyWorkspaceId: roleOption.companyWorkspaceId || null,
      locationText: recommendation.locationText,
      recommendation,
      roleId: recommendation.roleId,
      roleName: recommendation.roleName,
      roleOption: { ...roleOption, alreadyRecommended: true },
      status: recommendation.roleStatus,
      tags: [],
      updatedAt: recommendation.updatedAt,
    });
  }

  for (const tagItem of args.roleTagItems) {
    const existing = itemMap.get(tagItem.roleId);
    const roleOption =
      roleOptionMap.get(tagItem.roleId) ?? toRoleOptionFromGroup(tagItem);
    if (existing) {
      itemMap.set(tagItem.roleId, {
        ...existing,
        companyName: existing.companyName ?? tagItem.companyName,
        companyWorkspaceId:
          existing.companyWorkspaceId ?? tagItem.companyWorkspaceId,
        locationText: existing.locationText ?? tagItem.locationText,
        roleName: existing.roleName ?? tagItem.roleName,
        roleOption: existing.roleOption ?? roleOption,
        status: existing.status ?? tagItem.status,
        tags: tagItem.tags,
        updatedAt: existing.updatedAt ?? tagItem.updatedAt,
      });
    } else {
      itemMap.set(tagItem.roleId, {
        companyName: tagItem.companyName,
        companyWorkspaceId: tagItem.companyWorkspaceId,
        locationText: tagItem.locationText,
        recommendation: null,
        roleId: tagItem.roleId,
        roleName: tagItem.roleName,
        roleOption,
        status: tagItem.status,
        tags: tagItem.tags,
        updatedAt: tagItem.updatedAt,
      });
    }
  }

  return Array.from(itemMap.values()).sort((left, right) => {
    if (Boolean(left.recommendation) !== Boolean(right.recommendation)) {
      return left.recommendation ? -1 : 1;
    }
    return getSortTime(right) - getSortTime(left);
  });
}

function mergeRoleOptions(args: {
  recommendations: CareerTalentRecommendationItem[];
  roleOptions: OpsManualInternalRecommendationRole[];
  roleTagItems: OpsMatchingTalentRoleTagGroup[];
}) {
  const map = new Map<string, OpsManualInternalRecommendationRole>();
  for (const role of args.roleOptions) {
    map.set(role.roleId, role);
  }
  for (const recommendation of args.recommendations) {
    if (!map.has(recommendation.roleId)) {
      map.set(
        recommendation.roleId,
        toRoleOptionFromRecommendation(recommendation)
      );
    }
  }
  for (const item of args.roleTagItems) {
    if (!map.has(item.roleId)) {
      map.set(item.roleId, toRoleOptionFromGroup(item));
    }
  }
  return Array.from(map.values()).sort((left, right) =>
    formatRoleLabel(left).localeCompare(formatRoleLabel(right), "ko")
  );
}

function OpportunityInteractionRow({
  item,
  onRecommend,
  userId,
}: {
  item: OpportunityInteractionItem;
  onRecommend: (role: OpsManualInternalRecommendationRole) => void;
  userId: string;
}) {
  const recommendation = item.recommendation;
  const recommendableRole = recommendation ? null : item.roleOption;
  const fit = recommendation?.matchingFit ?? null;

  return (
    <article className="px-4 py-4 transition hover:bg-bg-floating/55">
      <div className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-primary">
                {formatRoleLabel(item)}
              </div>
              <span
                className={cx(
                  "inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
                  recommendationStatusClass(recommendation)
                )}
              >
                {recommendationStatusLabel(recommendation)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-5 text-neutral-muted">
              {item.locationText ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-soft" />
                  <span className="truncate">{item.locationText}</span>
                </span>
              ) : null}
              {item.status ? (
                <span className="text-neutral-soft">Status {item.status}</span>
              ) : null}
            </div>
          </div>
          {recommendableRole ? (
            <BareButton
              type="button"
              onClick={() => onRecommend(recommendableRole)}
              className={cx(
                opsTheme.buttonPrimary,
                "h-8 shrink-0 px-3 text-xs"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              추천하기
            </BareButton>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-4 overflow-hidden bg-neutral-100">
          <OpportunityActivityCell
            label="추천"
            muted={!recommendation}
            value={
              recommendation
                ? formatKst(recommendation.recommendedAt)
                : "추천 전"
            }
          />
          <OpportunityActivityCell
            label="열람"
            muted={!recommendation?.viewedAt}
            value={
              recommendation?.viewedAt
                ? formatKst(recommendation.viewedAt)
                : "미열람"
            }
          />
          <OpportunityActivityCell
            label="공고/회사 클릭"
            muted={!recommendation?.clickedAt}
            value={
              recommendation?.clickedAt
                ? formatKst(recommendation.clickedAt)
                : "미클릭"
            }
          />
          <OpportunityActivityCell
            label="응답"
            muted={!recommendation?.feedbackAt}
            value={
              recommendation?.feedbackAt
                ? `${recommendationFeedbackLabel(
                    recommendation.feedback
                  )} ${formatKst(recommendation.feedbackAt)}`
                : "아직 응답 없음"
            }
          />
        </div>

        <div className="mt-3 border-t border-neutral-1000-a05 pt-3">
          <OpportunityFitSummary fit={fit} recommendation={recommendation} />
        </div>

        {recommendation?.feedbackReason ? (
          <div className="mt-3 border-t border-neutral-1000-a05 pt-2 text-[12px] leading-5 text-neutral-muted">
            <div className="font-medium text-neutral-primary">피드백</div>
            <div className="line-clamp-2">{recommendation.feedbackReason}</div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function TalentGeneralTagsPanel({ userId }: TalentRoleTagsPanelProps) {
  const roleTagsQuery = useOpsMatchingTalentRoleTags({ talentId: userId });
  const talentTags = roleTagsQuery.data?.talentTags ?? [];

  return (
    <section className="rounded-md border border-neutral-1000-a05 bg-bg-floating p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-primary">
        <Tags className="h-4 w-4 text-neutral-soft" />
        Talent 태그 (역할과 관계없이 개인에게 부여된 태그입니다.)
      </div>
      {roleTagsQuery.isLoading ? (
        <div className="flex items-center justify-center py-6">
          <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
        </div>
      ) : roleTagsQuery.error ? (
        <div className={opsTheme.errorNotice}>
          {roleTagsQuery.error instanceof Error
            ? roleTagsQuery.error.message
            : "Talent 태그를 불러오지 못했습니다."}
        </div>
      ) : (
        <MatchingTagEditor
          compact
          roleId={null}
          talent={{ tags: talentTags, userId }}
        />
      )}
    </section>
  );
}

export function TalentRoleTagsPanel({ userId }: TalentRoleTagsPanelProps) {
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [modalRole, setModalRole] =
    useState<OpsManualInternalRecommendationRole | null>(null);
  const [manualNotice, setManualNotice] = useState("");
  const roleTagsQuery = useOpsMatchingTalentRoleTags({ talentId: userId });
  const rolesQuery = useOpsManualInternalRecommendationRoles(
    "",
    80,
    true,
    userId
  );
  const recommendationsQuery = useOpsCareerRecommendations(
    userId,
    50,
    true,
    "internal"
  );

  const roleTagItems = useMemo(
    () => roleTagsQuery.data?.items ?? [],
    [roleTagsQuery.data?.items]
  );
  const recommendations = useMemo(
    () =>
      recommendationsQuery.data?.pages.flatMap(
        (page) => page.recommendations
      ) ?? [],
    [recommendationsQuery.data?.pages]
  );
  const roleOptions = useMemo(
    () =>
      mergeRoleOptions({
        recommendations,
        roleOptions: rolesQuery.data?.roles ?? [],
        roleTagItems,
      }),
    [recommendations, roleTagItems, rolesQuery.data?.roles]
  );
  const opportunityItems = useMemo(
    () =>
      buildOpportunityItems({
        recommendations,
        roleOptions,
        roleTagItems,
      }),
    [recommendations, roleOptions, roleTagItems]
  );
  const opportunityByRoleId = useMemo(
    () => new Map(opportunityItems.map((item) => [item.roleId, item])),
    [opportunityItems]
  );
  const selectedRole =
    roleOptions.find((role) => role.roleId === selectedRoleId) ?? null;
  const selectedOpportunity = selectedRole
    ? (opportunityByRoleId.get(selectedRole.roleId) ?? null)
    : null;
  const selectedRoleTags = selectedOpportunity?.tags ?? [];
  const selectedAlreadyRecommended = Boolean(
    selectedOpportunity?.recommendation || selectedRole?.alreadyRecommended
  );
  const isLoading =
    roleTagsQuery.isLoading ||
    rolesQuery.isLoading ||
    recommendationsQuery.isLoading;

  const openRecommendationModal = (
    role: OpsManualInternalRecommendationRole
  ) => {
    setManualNotice("");
    setModalRole({ ...role, alreadyRecommended: false });
  };

  return (
    <section className="rounded-md border border-neutral-1000-a05 bg-bg-floating p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-primary">
          <BriefcaseBusiness className="h-4 w-4 text-neutral-soft" />
          기회 매칭
        </div>
      </div>

      <label className="mt-4 block">
        <span className={opsTheme.label}>회사/Role 선택</span>
        <UiSelect
          items={[
            {
              label: rolesQuery.isLoading
                ? "Role 불러오는 중"
                : roleOptions.length === 0
                  ? "선택 가능한 role 없음"
                  : "기회를 선택하세요",
              value: "",
            },
            ...roleOptions.map((role) => ({
              label: formatRoleLabel(role),
              value: role.roleId,
            })),
          ]}
          value={selectedRoleId}
          onValueChange={(value) => {
            setSelectedRoleId(value ?? "");
            setManualNotice("");
          }}
          disabled={rolesQuery.isLoading || roleOptions.length === 0}
        >
          <SelectTrigger className="mt-1.5 h-10 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value="">
                {rolesQuery.isLoading
                  ? "Role 불러오는 중"
                  : roleOptions.length === 0
                    ? "선택 가능한 role 없음"
                    : "기회를 선택하세요"}
              </SelectItem>
              {roleOptions.map((role) => (
                <SelectItem key={role.roleId} value={role.roleId}>
                  {formatRoleLabel(role)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </UiSelect>
      </label>

      {rolesQuery.error ? (
        <div className={cx(opsTheme.errorNotice, "mt-3")}>
          {rolesQuery.error instanceof Error
            ? rolesQuery.error.message
            : "Role 목록을 불러오지 못했습니다."}
        </div>
      ) : null}
      {recommendationsQuery.error ? (
        <div className={cx(opsTheme.errorNotice, "mt-3")}>
          {recommendationsQuery.error instanceof Error
            ? recommendationsQuery.error.message
            : "Internal 추천 이력을 불러오지 못했습니다."}
        </div>
      ) : null}
      {manualNotice ? (
        <div className={cx(opsTheme.successNotice, "mt-3")}>{manualNotice}</div>
      ) : null}

      {selectedRole ? (
        <div className="mt-4 rounded-md border border-neutral-1000-a05 bg-bg-default/65 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-medium text-neutral-primary">
                  {formatRoleLabel(selectedRole)}
                </div>
                <span
                  className={cx(
                    "inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
                    recommendationStatusClass(
                      selectedOpportunity?.recommendation ?? null
                    )
                  )}
                >
                  {recommendationStatusLabel(
                    selectedOpportunity?.recommendation ?? null
                  )}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-soft">
                {selectedRole.locationText ? (
                  <span>{selectedRole.locationText}</span>
                ) : null}
                {selectedRole.status ? (
                  <span>{selectedRole.status}</span>
                ) : null}
                {selectedOpportunity?.recommendation ? (
                  <span>
                    추천{" "}
                    {formatKst(
                      selectedOpportunity.recommendation.recommendedAt
                    )}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-2 lg:w-[52%]">
              <MatchingTagEditor
                compact
                roleId={selectedRole.roleId}
                talent={{ tags: selectedRoleTags, userId }}
              />
              {!selectedAlreadyRecommended ? (
                <BareButton
                  type="button"
                  onClick={() => openRecommendationModal(selectedRole)}
                  className={cx(
                    opsTheme.buttonPrimary,
                    "h-8 px-2.5 text-[11px]"
                  )}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  추천하기
                </BareButton>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="mb-2 text-sm font-normal text-neutral-muted">
          이 사람에게 추천된 다른 내부 기회들
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
          </div>
        ) : roleTagsQuery.error ? (
          <div className={opsTheme.errorNotice}>
            {roleTagsQuery.error instanceof Error
              ? roleTagsQuery.error.message
              : "기회 매칭 정보를 불러오지 못했습니다."}
          </div>
        ) : opportunityItems.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-6 text-center text-sm text-neutral-soft">
            아직 추천된 내부 기회가 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-neutral-1000-a05 bg-bg-default/45 divide-y divide-neutral-1000-a05">
            {opportunityItems.map((item) => (
              <OpportunityInteractionRow
                key={item.roleId}
                item={item}
                onRecommend={openRecommendationModal}
                userId={userId}
              />
            ))}
          </div>
        )}
      </div>

      <ManualInternalRecommendationModal
        fixedRole={modalRole}
        open={Boolean(modalRole)}
        onClose={() => setModalRole(null)}
        userId={userId}
        onQueued={({ role }) => {
          setManualNotice(
            `${role.companyName} · ${role.roleName} 추천을 등록했습니다.`
          );
        }}
      />
    </section>
  );
}
