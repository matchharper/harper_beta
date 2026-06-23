import { useMemo, useState } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  ChevronDown,
  Columns3,
  Eye,
  FileText,
  GraduationCap,
  History,
  LoaderCircle,
  Search,
  Sparkles,
  StickyNote,
  Table2,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import {
  formatKstRelativeDate,
  formatKstRelativeDateTime,
} from "@/components/ops/dateUtils";
import {
  FitReasonCell,
  MatchingFitLabelCell,
  MatchingFitLabelChips,
  MatchingFitLabelFilter,
  normalizeFitLabelFilters,
  normalizeHumanLabelFilters,
} from "@/components/ops/matching/MatchingFitLabelControls";
import { MatchingDateRangeFilter } from "@/components/ops/matching/MatchingFilterControls";
import {
  ProfileLabelCell,
  TalentIdentity,
  TalentStatusBadges,
} from "@/components/ops/matching/MatchingTalentCells";
import { MatchingTalentDrawer } from "@/components/ops/matching/MatchingTalentDrawer";
import { MatchingMemoQuickAdd } from "@/components/ops/matching/MatchingTalentInlineActions";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input as UiInput } from "@/components/ui/input";
import {
  useOpsMatchingTalentHistory,
  useOpsMatchingTalents,
  useUpdateOpsMatchingFitHumanLabel,
} from "@/hooks/ops/useOpsMatching";
import type {
  OpsMatchingFitLabel,
  OpsMatchingRecommendationResponseStatus,
  OpsMatchingRoleOption,
  OpsMatchingTalentHistoryItem,
  OpsMatchingTalentHistorySection,
  OpsMatchingTalentItem,
} from "@/lib/ops/matching";

type MatchingTalentBrowserProps = {
  canFetchInternal: boolean;
  createdFrom: string;
  createdTo: string;
  excludeRecommended: boolean;
  humanLabelFilters: string[];
  llmLabelFilters: string[];
  onCreatedDateRangeChange: (from: string, to: string) => void;
  onExcludeRecommendedChange: (excludeRecommended: boolean) => void;
  onHumanLabelFiltersChange: (labels: string[]) => void;
  onLlmLabelFiltersChange: (labels: string[]) => void;
  role: OpsMatchingRoleOption;
};

type ViewMode = "card" | "table";
type CardViewSectionId =
  | "education"
  | "externalPositiveOpportunities"
  | "experience"
  | "extra"
  | "internalRecommendationHistory";

const CARD_VIEW_SECTION_OPTIONS = [
  { icon: BriefcaseBusiness, id: "experience", label: "Experience" },
  { icon: GraduationCap, id: "education", label: "Education" },
  { icon: FileText, id: "extra", label: "Extra" },
  {
    icon: ThumbsUp,
    id: "externalPositiveOpportunities",
    label: "최근 external 수락/좋아요",
  },
  {
    icon: History,
    id: "internalRecommendationHistory",
    label: "Internal 추천 history",
  },
] as const satisfies readonly {
  icon: LucideIcon;
  id: CardViewSectionId;
  label: string;
}[];

const DEFAULT_CARD_VIEW_SECTIONS: CardViewSectionId[] = [
  "experience",
  "education",
  "extra",
];

function getSelectedHistorySections(
  sections: readonly CardViewSectionId[]
): OpsMatchingTalentHistorySection[] {
  const selectedSections = new Set(sections);
  const historySections: OpsMatchingTalentHistorySection[] = [];
  if (selectedSections.has("externalPositiveOpportunities")) {
    historySections.push("external_positive");
  }
  if (selectedSections.has("internalRecommendationHistory")) {
    historySections.push("internal_recommendations");
  }
  return historySections;
}

function RecommendedTalentBadge({ recommendedAt }: { recommendedAt: string }) {
  return (
    <div className="mt-2 inline-flex max-w-full items-center rounded bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
      추천됨 · {formatKstRelativeDate(recommendedAt)}
    </div>
  );
}

function MatchingTalentTable({
  onHumanLabelChange,
  onSelect,
  talents,
  updatingFitId,
}: {
  onHumanLabelChange: (
    talent: OpsMatchingTalentItem,
    label: OpsMatchingFitLabel | null
  ) => void;
  onSelect: (talent: OpsMatchingTalentItem) => void;
  talents: OpsMatchingTalentItem[];
  updatingFitId: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-neutral-1000-a05 bg-bg-floating">
      <table className="w-full min-w-[1820px] table-fixed border-collapse text-left text-xs">
        <thead className="bg-bg-weak text-neutral-muted">
          <tr>
            <th className="w-[250px] px-3 py-2 font-medium">Talent</th>
            <th className="w-[240px] px-3 py-2 font-medium">최근 회사</th>
            <th className="w-[240px] px-3 py-2 font-medium">최근 학교</th>
            <th className="w-[90px] px-3 py-2 font-medium">Score</th>
            <th className="w-[250px] px-3 py-2 font-medium">Label</th>
            <th className="w-[480px] px-3 py-2 font-medium">판단 이유</th>
            <th className="w-[260px] px-3 py-2 font-medium">메모</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-1000-a05">
          {talents.map((talent) => (
            <tr
              key={talent.userId}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(talent)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(talent);
                }
              }}
              className="cursor-pointer align-top text-neutral-muted transition hover:bg-bg-default"
            >
              <td className="px-3 py-3 align-top">
                <TalentIdentity talent={talent} />
                <TalentStatusBadges talent={talent} />
                {talent.fit?.recommendation ? (
                  <RecommendedTalentBadge
                    recommendedAt={talent.fit.recommendation.recommendedAt}
                  />
                ) : null}
                <div className="mt-1 text-[11px] text-neutral-soft">
                  가입 {formatKstRelativeDate(talent.createdAt)}
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <ProfileLabelCell
                  emptyLabel="회사 없음"
                  labels={talent.recentCompanies}
                />
              </td>
              <td className="px-3 py-3 align-top">
                <ProfileLabelCell
                  emptyLabel="학교 없음"
                  labels={talent.recentSchools}
                />
              </td>
              <td className="px-3 py-3 align-top text-sm font-medium text-neutral-primary">
                {talent.fit?.score ?? "-"}
              </td>
              <td className="px-3 py-3 align-top">
                {talent.fit ? (
                  <div className="space-y-2">
                    {talent.fit.lastEvaluatedAt ? (
                      <div className="text-[11px] text-neutral-soft">
                        평가{" "}
                        {formatKstRelativeDateTime(talent.fit.lastEvaluatedAt)}
                      </div>
                    ) : null}
                    <MatchingFitLabelCell
                      isUpdating={updatingFitId === talent.fit.fitId}
                      item={talent.fit}
                      onHumanLabelChange={(_, label) =>
                        onHumanLabelChange(talent, label)
                      }
                    />
                  </div>
                ) : (
                  <span className="text-[11px] text-neutral-soft">미평가</span>
                )}
              </td>
              <td className="px-3 py-3 align-top">
                <FitReasonCell
                  criteria={talent.fit?.reevaluationCriteria}
                  reason={talent.fit?.reason ?? null}
                />
              </td>
              <td className="px-3 py-3 align-top">
                <MatchingMemoQuickAdd
                  memoPreview={talent.memoPreview}
                  talentId={talent.userId}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchingTalentCards({
  historyByTalentId,
  historyErrorMessage,
  isHistoryLoading,
  onHumanLabelChange,
  onSelect,
  talents,
  updatingFitId,
  visibleSections,
}: {
  historyByTalentId: Map<string, OpsMatchingTalentHistoryItem>;
  historyErrorMessage: string | null;
  isHistoryLoading: boolean;
  onHumanLabelChange: (
    talent: OpsMatchingTalentItem,
    label: OpsMatchingFitLabel | null
  ) => void;
  onSelect: (talent: OpsMatchingTalentItem) => void;
  talents: OpsMatchingTalentItem[];
  updatingFitId: string | null;
  visibleSections: CardViewSectionId[];
}) {
  const visibleSectionSet = new Set(visibleSections);

  return (
    <div className="space-y-3">
      {talents.map((talent) => (
        <div
          key={talent.userId}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(talent)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(talent);
            }
          }}
          className={cx(
            opsTheme.panel,
            "cursor-pointer border border-neutral-1000-a05 p-4 transition hover:bg-bg-default"
          )}
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.85fr)_minmax(420px,1.35fr)_minmax(360px,1fr)]">
            <MatchingTalentCardIdentity talent={talent} />
            <MatchingTalentCardProfile
              history={historyByTalentId.get(talent.userId) ?? null}
              historyErrorMessage={historyErrorMessage}
              isHistoryLoading={isHistoryLoading}
              talent={talent}
              visibleSections={visibleSectionSet}
            />
            <MatchingTalentCardDecision
              onHumanLabelChange={onHumanLabelChange}
              talent={talent}
              updatingFitId={updatingFitId}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchingCardViewDropdown({
  selectedSections,
  onSectionToggle,
}: {
  onSectionToggle: (sectionId: CardViewSectionId, selected: boolean) => void;
  selectedSections: CardViewSectionId[];
}) {
  const selectedSet = new Set(selectedSections);
  const label =
    selectedSections.length === CARD_VIEW_SECTION_OPTIONS.length
      ? "View 전체"
      : `View ${selectedSections.length}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BareButton
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-1000-a05 bg-bg-default/65 px-3 text-xs font-medium text-neutral-muted transition hover:bg-bg-default hover:text-neutral-primary"
        >
          <Eye className="h-3.5 w-3.5" />
          <span>{label}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </BareButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {CARD_VIEW_SECTION_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuCheckboxItem
              key={option.id}
              checked={selectedSet.has(option.id)}
              className="gap-2 text-xs"
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                onSectionToggle(option.id, checked === true)
              }
            >
              <Icon className="h-3.5 w-3.5 text-neutral-soft" />
              {option.label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CardSectionHeader({
  count,
  icon: Icon,
  label,
}: {
  count?: number;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium uppercase text-neutral-muted">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {typeof count === "number" ? (
        <span className="text-neutral-placeholder">{count}</span>
      ) : null}
    </div>
  );
}

function CardEmptyState({ label }: { label: string }) {
  return <div className="text-xs leading-5 text-neutral-soft">{label}</div>;
}

function MatchingTalentCardIdentity({
  talent,
}: {
  talent: OpsMatchingTalentItem;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <section className="space-y-2">
        <TalentIdentity talent={talent} />
        <TalentStatusBadges talent={talent} />
        {talent.fit?.recommendation ? (
          <RecommendedTalentBadge
            recommendedAt={talent.fit.recommendation.recommendedAt}
          />
        ) : null}
        {talent.headline ? (
          <div className="text-xs leading-5 text-neutral-muted">
            {talent.headline}
          </div>
        ) : null}
        <div className="text-[11px] text-neutral-soft">
          가입{" "}
          {talent.createdAt ? formatKstRelativeDate(talent.createdAt) : "-"}
        </div>
      </section>

      <section className="border-t border-neutral-1000-a05 pt-3">
        <CardSectionHeader
          count={talent.insights.length}
          icon={Sparkles}
          label="Insight"
        />
        <div className="mt-2 space-y-3">
          {talent.insights.length === 0 ? (
            <CardEmptyState label="Insight 없음" />
          ) : (
            talent.insights.map((insight) => (
              <div key={`${talent.userId}:${insight.key}`} className="">
                <div className="text-[13px] font-medium text-neutral-primary">
                  {insight.label}
                </div>
                <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-5 text-neutral-700">
                  {insight.value}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function MatchingTalentCardProfile({
  history,
  historyErrorMessage,
  isHistoryLoading,
  talent,
  visibleSections,
}: {
  history: OpsMatchingTalentHistoryItem | null;
  historyErrorMessage: string | null;
  isHistoryLoading: boolean;
  talent: OpsMatchingTalentItem;
  visibleSections: Set<CardViewSectionId>;
}) {
  const hasVisibleSection = CARD_VIEW_SECTION_OPTIONS.some((option) =>
    visibleSections.has(option.id)
  );

  return (
    <div className="min-w-0 space-y-4 border-t border-neutral-1000-a05 pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
      <CardSectionHeader icon={BookOpen} label="Profile" />
      {!hasVisibleSection ? <CardEmptyState label="표시할 정보 없음" /> : null}
      {visibleSections.has("experience") ? (
        <ProfileExperienceList experiences={talent.experiences} />
      ) : null}
      {visibleSections.has("education") ? (
        <ProfileEducationList educations={talent.educations} />
      ) : null}
      {visibleSections.has("extra") ? (
        <ProfileExtraList extras={talent.extras} />
      ) : null}
      {visibleSections.has("externalPositiveOpportunities") ? (
        <ExternalPositiveOpportunityList
          errorMessage={historyErrorMessage}
          isLoading={isHistoryLoading && !history}
          opportunities={history?.externalPositiveOpportunities ?? []}
        />
      ) : null}
      {visibleSections.has("internalRecommendationHistory") ? (
        <InternalRecommendationHistoryList
          errorMessage={historyErrorMessage}
          isLoading={isHistoryLoading && !history}
          recommendations={history?.internalRecommendations ?? []}
        />
      ) : null}
    </div>
  );
}

function ProfileExperienceList({
  experiences,
}: {
  experiences: OpsMatchingTalentItem["experiences"];
}) {
  return (
    <section className="border-t border-neutral-1000-a05 pt-3 first:border-t-0 first:pt-0">
      <CardSectionHeader
        count={experiences.length}
        icon={BriefcaseBusiness}
        label="Experience"
      />
      <div className="mt-2 space-y-4">
        {experiences.length === 0 ? (
          <CardEmptyState label="Experience 없음" />
        ) : (
          experiences.map((experience, index) => (
            <div
              key={`${experience.companyName ?? "company"}:${experience.role ?? "role"}:${experience.period ?? index}`}
              className=""
            >
              <div className="text-[13px] font-medium leading-5 text-neutral-primary">
                {experience.role ?? "역할 없음"}
              </div>
              <div className="mt-0.5 text-[13px] leading-5 text-primary">
                {[experience.companyName, experience.employmentType]
                  .filter(Boolean)
                  .join(" · ") || "회사 없음"}
              </div>
              {experience.period ? (
                <div className="text-[13px] leading-5 text-neutral-muted">
                  {experience.period}
                </div>
              ) : null}
              {experience.description ? (
                <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-neutral-muted">
                  {experience.description}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ProfileEducationList({
  educations,
}: {
  educations: OpsMatchingTalentItem["educations"];
}) {
  return (
    <section className="border-t border-neutral-1000-a05 pt-3 first:border-t-0 first:pt-0">
      <CardSectionHeader
        count={educations.length}
        icon={GraduationCap}
        label="Education"
      />
      <div className="mt-2 space-y-3">
        {educations.length === 0 ? (
          <CardEmptyState label="Education 없음" />
        ) : (
          educations.map((education, index) => (
            <div
              key={`${education.school ?? "school"}:${education.degree ?? "degree"}:${education.period ?? index}`}
              className="border-l border-neutral-1000-a10 pl-3"
            >
              <div className="text-[13px] font-medium leading-5 text-neutral-primary">
                {education.school ?? "학교 없음"}
              </div>
              <div className="mt-0.5 text-xs leading-5 text-neutral-muted">
                {[education.degree, education.field]
                  .filter(Boolean)
                  .join(" · ") || "전공/학위 없음"}
              </div>
              {education.period ? (
                <div className="text-[11px] leading-4 text-neutral-soft">
                  {education.period}
                </div>
              ) : null}
              {education.description ? (
                <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-neutral-muted">
                  {education.description}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ProfileExtraList({
  extras,
}: {
  extras: OpsMatchingTalentItem["extras"];
}) {
  return (
    <section className="border-t border-neutral-1000-a05 pt-3 first:border-t-0 first:pt-0">
      <CardSectionHeader count={extras.length} icon={FileText} label="Extra" />
      <div className="mt-2 space-y-3">
        {extras.length === 0 ? (
          <CardEmptyState label="Extra 없음" />
        ) : (
          extras.map((extra, index) => (
            <div
              key={`${extra.title ?? "extra"}:${extra.date ?? index}`}
              className="border-l border-neutral-1000-a10 pl-3"
            >
              <div className="text-[13px] font-medium leading-5 text-neutral-primary">
                {extra.title ?? "Extra"}
              </div>
              {extra.date ? (
                <div className="mt-0.5 text-[11px] leading-4 text-neutral-soft">
                  {extra.date}
                </div>
              ) : null}
              {extra.description ? (
                <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-neutral-muted">
                  {extra.description}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function getPositiveOpportunityFeedbackLabel(feedback: string | null) {
  const normalized = String(feedback ?? "").toLowerCase();
  if (normalized === "like") return "좋아요";
  if (normalized === "positive") return "수락";
  return feedback || "수락";
}

function getRecommendationStatusLabel(
  status: OpsMatchingRecommendationResponseStatus
) {
  if (status === "accepted") return "수락";
  if (status === "rejected") return "거절";
  return "미응답";
}

function RecommendationStatusBadge({
  status,
}: {
  status: OpsMatchingRecommendationResponseStatus;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
        status === "accepted" && "bg-positive-faded text-positive",
        status === "rejected" && "bg-critical-faded text-critical",
        status === "no_response" && "bg-bg-weak text-neutral-muted"
      )}
    >
      {getRecommendationStatusLabel(status)}
    </span>
  );
}

function HistorySectionState({
  emptyLabel,
  errorMessage,
  isLoading,
}: {
  emptyLabel: string;
  errorMessage: string | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs leading-5 text-neutral-soft">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        불러오는 중
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="text-xs leading-5 text-critical">{errorMessage}</div>
    );
  }

  return <CardEmptyState label={emptyLabel} />;
}

function ExternalPositiveOpportunityList({
  errorMessage,
  isLoading,
  opportunities,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  opportunities: OpsMatchingTalentHistoryItem["externalPositiveOpportunities"];
}) {
  return (
    <section className="border-t border-neutral-1000-a05 pt-3 first:border-t-0 first:pt-0">
      <CardSectionHeader
        count={opportunities.length}
        icon={ThumbsUp}
        label="최근 external 수락/좋아요"
      />
      <div className="mt-2 space-y-3">
        {opportunities.length === 0 ? (
          <HistorySectionState
            emptyLabel="최근 external 수락/좋아요 없음"
            errorMessage={errorMessage}
            isLoading={isLoading}
          />
        ) : (
          opportunities.map((opportunity) => {
            const title =
              [opportunity.companyName, opportunity.roleName]
                .filter(Boolean)
                .join(" · ") || "Opportunity";
            const eventAt = opportunity.feedbackAt ?? opportunity.recommendedAt;
            return (
              <div
                key={opportunity.recommendationId}
                className="border-l border-neutral-1000-a10 pl-3"
              >
                <div className="text-[13px] font-medium leading-5 text-neutral-primary">
                  {title}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] leading-4 text-neutral-soft">
                  <RecommendationStatusBadge
                    status={opportunity.responseStatus}
                  />
                  <span>
                    {getPositiveOpportunityFeedbackLabel(opportunity.feedback)}
                  </span>
                  <span>· {formatKstRelativeDate(eventAt)}</span>
                  {typeof opportunity.score === "number" ? (
                    <span>· Score {opportunity.score}</span>
                  ) : null}
                </div>
                {opportunity.fitSummary ? (
                  <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-neutral-muted">
                    {opportunity.fitSummary}
                  </div>
                ) : null}
                {opportunity.feedbackReason ? (
                  <div className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-5 text-neutral-soft">
                    {opportunity.feedbackReason}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function InternalRecommendationHistoryList({
  errorMessage,
  isLoading,
  recommendations,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  recommendations: OpsMatchingTalentHistoryItem["internalRecommendations"];
}) {
  return (
    <section className="border-t border-neutral-1000-a05 pt-3 first:border-t-0 first:pt-0">
      <CardSectionHeader
        count={recommendations.length}
        icon={History}
        label="Internal 추천 history"
      />
      <div className="mt-2 space-y-3">
        {recommendations.length === 0 ? (
          <HistorySectionState
            emptyLabel="Internal 추천 history 없음"
            errorMessage={errorMessage}
            isLoading={isLoading}
          />
        ) : (
          recommendations.map((recommendation) => {
            const title =
              [recommendation.companyName, recommendation.roleName]
                .filter(Boolean)
                .join(" · ") || "Internal recommendation";
            return (
              <div
                key={recommendation.recommendationId}
                className="border-l border-neutral-1000-a10 pl-3"
              >
                <div className="text-[13px] font-medium leading-5 text-neutral-primary">
                  {title}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-4 text-neutral-soft">
                  <RecommendationStatusBadge
                    status={recommendation.responseStatus}
                  />
                  <span>
                    추천 {formatKstRelativeDate(recommendation.recommendedAt)}
                  </span>
                  {typeof recommendation.score === "number" ? (
                    <span>· Score {recommendation.score}</span>
                  ) : null}
                </div>
                {recommendation.fitSummary ? (
                  <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-neutral-muted">
                    {recommendation.fitSummary}
                  </div>
                ) : null}
                {recommendation.feedbackReason ? (
                  <div className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-5 text-neutral-soft">
                    {recommendation.feedbackReason}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCardRecord(value: unknown): Record<string, unknown> | null {
  if (isPlainRecord(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getCardTextValue(value: unknown) {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return null;
  }
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || null;
}

function getRecordTextValue(
  record: Record<string, unknown>,
  keys: readonly string[]
) {
  for (const key of keys) {
    const text = getCardTextValue(record[key]);
    if (text) return text;
  }
  return null;
}

function getHoldDecisionSummary(criteria: unknown) {
  const record = parseCardRecord(criteria);
  if (!record) return null;
  const directSummary = getRecordTextValue(record, [
    "summary",
    "holdSummary",
    "hold_summary",
    "decisionSummary",
    "decision_summary",
  ]);
  if (directSummary) return directSummary;
  for (const key of ["hold", "ambiguous", "decision", "result"]) {
    const child = parseCardRecord(record[key]);
    if (!child) continue;
    const nestedSummary = getRecordTextValue(child, [
      "summary",
      "reason",
      "text",
    ]);
    if (nestedSummary) return nestedSummary;
  }
  return null;
}

function isHoldOrAmbiguousFit(fit: OpsMatchingTalentItem["fit"]) {
  const label = fit?.label?.toLowerCase();
  return label === "hold" || label === "ambiguous";
}

function MatchingTalentCardDecision({
  onHumanLabelChange,
  talent,
  updatingFitId,
}: {
  onHumanLabelChange: (
    talent: OpsMatchingTalentItem,
    label: OpsMatchingFitLabel | null
  ) => void;
  talent: OpsMatchingTalentItem;
  updatingFitId: string | null;
}) {
  const holdSummary =
    talent.fit && isHoldOrAmbiguousFit(talent.fit)
      ? getHoldDecisionSummary(talent.fit.reevaluationCriteria)
      : null;

  return (
    <div className="min-w-0 space-y-4 border-t border-neutral-1000-a05 pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
      <section className="space-y-4">
        <CardSectionHeader icon={Sparkles} label="LLM 판단" />
        {talent.fit ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-bg-weak px-2 py-2">
                <div className="text-[11px] font-medium uppercase text-neutral-soft">
                  Score
                </div>
                <div className="mt-1 text-sm font-semibold text-neutral-primary">
                  {talent.fit.score ?? "-"}
                </div>
              </div>
              <div className="rounded-md bg-bg-weak px-2 py-2">
                <div className="text-[11px] font-medium uppercase text-neutral-soft">
                  평가
                </div>
                <div className="mt-1 truncate text-[11px] text-neutral-muted">
                  {talent.fit.lastEvaluatedAt
                    ? formatKstRelativeDateTime(talent.fit.lastEvaluatedAt)
                    : "-"}
                </div>
              </div>
            </div>
            <MatchingFitLabelCell
              isUpdating={updatingFitId === talent.fit.fitId}
              item={talent.fit}
              onHumanLabelChange={(_, label) =>
                onHumanLabelChange(talent, label)
              }
            />
            {holdSummary ? (
              <div className="rounded-md bg-bg-weak px-3 py-2">
                <div className="text-[11px] font-medium uppercase text-neutral-soft">
                  보류 summary
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-neutral-800">
                  {holdSummary}
                </div>
              </div>
            ) : null}
            <FitReasonCell
              expanded
              criteria={talent.fit.reevaluationCriteria}
              reason={talent.fit.reason}
            />
          </>
        ) : (
          <CardEmptyState label="미평가" />
        )}
      </section>

      <section className="border-t border-neutral-1000-a05 pt-3">
        <CardSectionHeader icon={StickyNote} label="메모" />
        <div className="mt-2">
          <MatchingMemoQuickAdd
            memoPreview={talent.memoPreview}
            talentId={talent.userId}
          />
        </div>
      </section>
    </div>
  );
}

export function MatchingTalentBrowser({
  canFetchInternal,
  createdFrom,
  createdTo,
  excludeRecommended,
  humanLabelFilters,
  llmLabelFilters,
  onCreatedDateRangeChange,
  onExcludeRecommendedChange,
  onHumanLabelFiltersChange,
  onLlmLabelFiltersChange,
  role,
}: MatchingTalentBrowserProps) {
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [cardViewSections, setCardViewSections] = useState<CardViewSectionId[]>(
    DEFAULT_CARD_VIEW_SECTIONS
  );
  const [selectedTalent, setSelectedTalent] =
    useState<OpsMatchingTalentItem | null>(null);
  const normalizedLlmLabelFilters = useMemo(
    () => normalizeFitLabelFilters(llmLabelFilters),
    [llmLabelFilters]
  );
  const normalizedHumanLabelFilters = useMemo(
    () => normalizeHumanLabelFilters(humanLabelFilters),
    [humanLabelFilters]
  );
  const talentsQuery = useOpsMatchingTalents({
    createdFrom,
    createdTo,
    enabled: canFetchInternal,
    excludeRecommended,
    humanLabels: normalizedHumanLabelFilters,
    limit: 20,
    llmLabels: normalizedLlmLabelFilters,
    query: searchQuery,
    roleId: role.roleId,
  });
  const updateHumanLabel = useUpdateOpsMatchingFitHumanLabel();
  const talents = useMemo(
    () => talentsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [talentsQuery.data?.pages]
  );
  const selectedHistorySections = useMemo(
    () => getSelectedHistorySections(cardViewSections),
    [cardViewSections]
  );
  const talentIds = useMemo(
    () => talents.map((talent) => talent.userId),
    [talents]
  );
  const talentHistoryQuery = useOpsMatchingTalentHistory({
    enabled:
      canFetchInternal &&
      viewMode === "card" &&
      selectedHistorySections.length > 0,
    sections: selectedHistorySections,
    talentIds,
  });
  const historyByTalentId = useMemo(
    () =>
      new Map(
        (talentHistoryQuery.data?.items ?? []).map((item) => [
          item.talentId,
          item,
        ])
      ),
    [talentHistoryQuery.data?.items]
  );
  const historyErrorMessage =
    talentHistoryQuery.error instanceof Error
      ? talentHistoryQuery.error.message
      : talentHistoryQuery.error
        ? "History를 불러오지 못했습니다."
        : null;
  const totalCount = talentsQuery.data?.pages[0]?.totalCount ?? null;
  const hasActiveFilters = Boolean(
    searchQuery ||
    createdFrom ||
    createdTo ||
    excludeRecommended ||
    normalizedLlmLabelFilters.length > 0 ||
    normalizedHumanLabelFilters.length > 0
  );
  const handleHumanLabelChange = (
    talent: OpsMatchingTalentItem,
    label: OpsMatchingFitLabel | null
  ) => {
    if (updateHumanLabel.isPending || !talent.fit) return;
    updateHumanLabel.mutate({
      fitId: talent.fit.fitId,
      humanLabel: label,
    });
  };
  const handleCardViewSectionToggle = (
    sectionId: CardViewSectionId,
    selected: boolean
  ) => {
    setCardViewSections((current) => {
      const next = new Set(current);
      if (selected) next.add(sectionId);
      else next.delete(sectionId);
      return CARD_VIEW_SECTION_OPTIONS.map((option) => option.id).filter((id) =>
        next.has(id)
      );
    });
  };
  return (
    <section className="space-y-4">
      <div className="rounded-md space-y-2">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-row gap-3">
            <div className="relative w-full flex items-center">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
              <UiInput
                unstyled
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setSearchQuery(searchDraft.trim());
                  }
                }}
                className={cx(opsTheme.input, "pl-9 w-[640px]")}
                placeholder="이름/이메일 검색"
              />
            </div>
            <MatchingDateRangeFilter
              emptyLabel="가입일 전체"
              from={createdFrom}
              onChange={onCreatedDateRangeChange}
              prefix="가입"
              to={createdTo}
            />
            <MatchingFitLabelFilter
              emptyLabel="LLM label 전체"
              selectedLabels={normalizedLlmLabelFilters}
              onChange={onLlmLabelFiltersChange}
            />
            <MatchingFitLabelFilter
              emptyLabel="Human label 전체"
              includeMissingOption
              selectedLabels={normalizedHumanLabelFilters}
              onChange={onHumanLabelFiltersChange}
            />
            <BareButton
              type="button"
              aria-pressed={excludeRecommended}
              onClick={() => onExcludeRecommendedChange(!excludeRecommended)}
              className={cx(
                "h-10 shrink-0 px-3 text-xs",
                excludeRecommended
                  ? opsTheme.buttonPrimary
                  : opsTheme.buttonSecondary
              )}
            >
              추천된 사람 제외
            </BareButton>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BareButton
              type="button"
              onClick={() => {
                setSearchQuery(searchDraft.trim());
              }}
              className={cx(opsTheme.buttonPrimary, "h-10 px-3 text-xs")}
            >
              적용
            </BareButton>
            {hasActiveFilters ? (
              <BareButton
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  setSearchQuery("");
                  onCreatedDateRangeChange("", "");
                  onLlmLabelFiltersChange([]);
                  onHumanLabelFiltersChange([]);
                  onExcludeRecommendedChange(false);
                }}
                className={cx(opsTheme.buttonSecondary, "h-10 px-3 text-xs")}
              >
                초기화
              </BareButton>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-neutral-muted">
            <span>
              {totalCount === null
                ? "Talent 목록"
                : `${totalCount.toLocaleString("ko-KR")}명`}
            </span>
            <MatchingFitLabelChips
              labels={normalizedLlmLabelFilters}
              prefix="LLM"
            />
            <MatchingFitLabelChips
              labels={normalizedHumanLabelFilters}
              prefix="Human"
            />
            {excludeRecommended ? (
              <span className="inline-flex items-center rounded-full bg-bg-weak px-2 py-0.5 text-[11px] font-medium text-neutral-muted">
                추천 제외
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex h-10 w-fit rounded-md border border-neutral-1000-a05 bg-bg-default/65 p-1">
              {[
                { icon: Table2, id: "table" as const, label: "Table" },
                { icon: Columns3, id: "card" as const, label: "Card" },
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <BareButton
                    key={option.id}
                    type="button"
                    onClick={() => setViewMode(option.id)}
                    className={cx(
                      "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition",
                      viewMode === option.id
                        ? "bg-black text-neutral-00"
                        : "text-neutral-muted hover:bg-bg-default hover:text-neutral-primary"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {option.label}
                  </BareButton>
                );
              })}
            </div>
            <MatchingCardViewDropdown
              selectedSections={cardViewSections}
              onSectionToggle={handleCardViewSectionToggle}
            />
          </div>
        </div>
      </div>

      {updateHumanLabel.error ? (
        <div className={opsTheme.errorNotice}>
          {updateHumanLabel.error instanceof Error
            ? updateHumanLabel.error.message
            : "Human label을 저장하지 못했습니다."}
        </div>
      ) : null}

      {talentsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
        </div>
      ) : talentsQuery.error ? (
        <div className={opsTheme.errorNotice}>
          {talentsQuery.error instanceof Error
            ? talentsQuery.error.message
            : "Talent 목록을 불러오지 못했습니다."}
        </div>
      ) : talents.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-10 text-center text-sm text-neutral-soft">
          조건에 맞는 talent가 없습니다.
        </div>
      ) : viewMode === "table" ? (
        <MatchingTalentTable
          onHumanLabelChange={handleHumanLabelChange}
          talents={talents}
          onSelect={setSelectedTalent}
          updatingFitId={updateHumanLabel.variables?.fitId ?? null}
        />
      ) : (
        <MatchingTalentCards
          historyByTalentId={historyByTalentId}
          historyErrorMessage={historyErrorMessage}
          isHistoryLoading={talentHistoryQuery.isFetching}
          onHumanLabelChange={handleHumanLabelChange}
          talents={talents}
          onSelect={setSelectedTalent}
          updatingFitId={updateHumanLabel.variables?.fitId ?? null}
          visibleSections={cardViewSections}
        />
      )}

      {talentsQuery.hasNextPage ? (
        <div className="flex justify-center">
          <BareButton
            type="button"
            onClick={() => void talentsQuery.fetchNextPage()}
            disabled={talentsQuery.isFetchingNextPage}
            className={cx(opsTheme.buttonSecondary, "h-10 px-4 text-xs")}
          >
            {talentsQuery.isFetchingNextPage ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            20명 더 보기
          </BareButton>
        </div>
      ) : null}

      <MatchingTalentDrawer
        role={role}
        talent={selectedTalent}
        onClose={() => setSelectedTalent(null)}
      />
    </section>
  );
}
