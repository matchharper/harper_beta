import { BriefcaseBusiness, Check, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { OpportunityType } from "@/lib/opportunityType";
import { cn } from "@/lib/utils";
import type { CareerHistoryOpportunity } from "../types";

/**
 * EXPERIMENT(new-opportunity-company-role-switcher)
 *
 * This is deliberately isolated behind one flag. It is currently paused, so
 * the previous one-role-at-a-time UI remains active. Flip this to `true` to
 * restore the desktop company-grouping prototype without changing saved
 * feedback, API responses, or navigation state. Delete this file and the
 * similarly tagged call sites once the experiment is permanently discarded.
 */
export const ENABLE_NEW_OPPORTUNITY_COMPANY_ROLE_SWITCHER = false;

const isGroupableExternalOpportunity = (item: CareerHistoryOpportunity) =>
  !item.isUserAdded &&
  item.sourceType === "external" &&
  item.opportunityType === OpportunityType.ExternalJd &&
  item.companyDbId != null;

const getNullableNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * The worker's fit score/rank determines the representative whenever it is
 * available. Recency is only a stable fallback for legacy recommendations.
 */
const compareSameCompanyRecommendations = (
  left: CareerHistoryOpportunity,
  right: CareerHistoryOpportunity
) => {
  const leftScore = getNullableNumber(left.recommendationScore);
  const rightScore = getNullableNumber(right.recommendationScore);
  if (leftScore !== null || rightScore !== null) {
    if (leftScore === null) return 1;
    if (rightScore === null) return -1;
    if (leftScore !== rightScore) return rightScore - leftScore;
  }

  const leftRank = getNullableNumber(left.recommendationRank);
  const rightRank = getNullableNumber(right.recommendationRank);
  if (leftRank !== null || rightRank !== null) {
    if (leftRank === null) return 1;
    if (rightRank === null) return -1;
    if (leftRank !== rightRank) return leftRank - rightRank;
  }

  return (
    Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt) ||
    left.id.localeCompare(right.id)
  );
};

/**
 * Public job discovery uses the canonical company id. Company-name matching is
 * intentionally avoided, and internal connection offers stay workspace/role
 * scoped because their decisions and permissions are not company-wide.
 */
export const getLoadedSameCompanyExternalOpportunities = (
  items: readonly CareerHistoryOpportunity[],
  activeItem: CareerHistoryOpportunity | null
) => {
  if (
    !ENABLE_NEW_OPPORTUNITY_COMPANY_ROLE_SWITCHER ||
    !activeItem ||
    !isGroupableExternalOpportunity(activeItem)
  ) {
    return [];
  }

  const companyItems = items
    .filter(
      (item) =>
        isGroupableExternalOpportunity(item) &&
        item.companyDbId === activeItem.companyDbId
    )
    .sort(compareSameCompanyRecommendations);

  return companyItems.length > 1 ? companyItems : [];
};

export const getNewOpportunityNavigationKey = (
  item: CareerHistoryOpportunity
) =>
  ENABLE_NEW_OPPORTUNITY_COMPANY_ROLE_SWITCHER &&
  isGroupableExternalOpportunity(item)
    ? `company:${item.companyDbId}`
    : `opportunity:${item.id}`;

export const getNewOpportunityNavigationItems = (
  items: readonly CareerHistoryOpportunity[]
) => {
  if (!ENABLE_NEW_OPPORTUNITY_COMPANY_ROLE_SWITCHER) return [...items];

  const grouped = new Map<string, CareerHistoryOpportunity[]>();

  for (const item of items) {
    const key = getNewOpportunityNavigationKey(item);
    const current = grouped.get(key);
    if (current) current.push(item);
    else grouped.set(key, [item]);
  }

  return Array.from(grouped.values()).map(
    (group) => [...group].sort(compareSameCompanyRecommendations)[0]
  );
};

const NewOpportunityCompanyRoleSwitcher = ({
  activeOpportunityId,
  onOpenCompanyInfo,
  opportunities,
  onSelect,
}: {
  activeOpportunityId: string;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  opportunities: readonly CareerHistoryOpportunity[];
  onSelect: (item: CareerHistoryOpportunity) => void;
}) => {
  const t = useCareerT();

  if (
    !ENABLE_NEW_OPPORTUNITY_COMPANY_ROLE_SWITCHER ||
    opportunities.length < 2
  ) {
    return null;
  }

  const company = opportunities[0];
  const companyName = company?.companyName ?? "";

  return (
    <section className="overflow-hidden rounded-[14px] bg-bg-floating text-neutral-primary">
      <div className="flex items-center gap-3 border-b border-neutral-1000-a05 px-4 py-2.5 sm:px-5">
        {company?.companyLogoUrl ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-default p-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={company.companyLogoUrl}
              alt=""
              className="h-full w-full rounded-md object-cover"
            />
          </span>
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-weak text-neutral-primary">
            <BriefcaseBusiness className="h-4 w-4" />
          </span>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {company && onOpenCompanyInfo ? (
            <BareButton
              type="button"
              onClick={() => onOpenCompanyInfo(company)}
              className="truncate text-[14px] font-medium decoration-dotted underline underline-offset-2 transition-colors hover:text-primary sm:text-[15px]"
            >
              {companyName}
            </BareButton>
          ) : (
            <span className="truncate text-[14px] font-medium sm:text-[15px]">
              {companyName}
            </span>
          )}
          <span className="text-[12px] text-neutral-muted">
            {t(
              "career.history.company_role_switcher.position_count",
              "추천 포지션 {count}개",
              { values: { count: opportunities.length } }
            )}
          </span>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t(
          "career.history.company_role_switcher.role_list_label",
          "{companyName} 추천 포지션",
          { values: { companyName } }
        )}
        className="space-y-1 bg-bg-weak/70 p-1.5"
      >
        {opportunities.map((item, index) => {
          const selected = item.id === activeOpportunityId;

          return (
            <BareButton
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(item)}
              className={cn(
                "group flex min-h-10 w-full items-center gap-2.5 rounded-[9px] border px-3 py-2 text-left transition-colors",
                selected
                  ? "border-neutral-1000-a10 bg-bg-floating shadow-sm"
                  : "border-transparent text-neutral-muted hover:bg-bg-floating/70 hover:text-neutral-primary"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
                  selected
                    ? "bg-black text-neutral-00"
                    : "bg-neutral-1000-a05 text-neutral-muted"
                )}
              >
                {selected ? <Check className="h-3 w-3" /> : index + 1}
              </span>

              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px] sm:text-[14px]",
                  selected && "font-medium text-neutral-primary"
                )}
                title={item.title}
              >
                {item.title}
              </span>

              {index === 0 ? (
                <Badge className="shrink-0 bg-primary-faded text-[10px] text-primary sm:text-[11px]">
                  {t(
                    "career.history.company_role_switcher.primary",
                    "우선 추천"
                  )}
                </Badge>
              ) : selected ? null : (
                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-soft transition-transform group-hover:translate-x-0.5" />
              )}
            </BareButton>
          );
        })}
      </div>
    </section>
  );
};

export default NewOpportunityCompanyRoleSwitcher;
