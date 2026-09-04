import { Building2 } from "lucide-react";
import { memo } from "react";

import type { CareerHistoryOpportunity } from "@/components/career/types";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { cn } from "@/lib/utils";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { formatCareerLocation } from "@/lib/career/locationDisplay";

import { getOpportunityPostingStatus } from "../../history/opportunityPostingStatus";
import { useCareerT } from "@/i18n/useCareerT";

type CareerT = ReturnType<typeof useCareerT>;

const formatChatOpportunityWorkMode = (value: string | null, t: CareerT) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  if (!normalized) return null;
  if (normalized === "remote") return t("career.common.career.1r843ma", "원격");
  if (normalized === "hybrid")
    return t("career.common.career.055fv5b", "하이브리드");
  if (normalized === "onsite" || normalized === "on_site")
    return t("career.common.career.0ketgfl", "대면");
  return value.trim().replaceAll("_", " ");
};

const formatChatOpportunityEmploymentType = (value: string, t: CareerT) => {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  if (!normalized) return null;
  if (normalized === "full_time")
    return t("career.onboarding.onboarding.166o9pn", "풀타임");
  if (normalized === "part_time")
    return t("career.common.career_history_panel.090irfh", "파트타임");
  if (normalized === "internship")
    return t("career.common.career_history_panel.0sbhtqh", "인턴");
  if (normalized === "contract")
    return t("career.common.career_history_panel.1rvnrzl", "계약직");
  if (normalized === "fractional") return "Fractional";
  return value.trim().replaceAll("_", " ");
};

const getChatOpportunityMetaItems = (
  item: CareerHistoryOpportunity,
  t: CareerT,
  locale: Locale
) =>
  [
    formatCareerLocation(item.location, locale),
    formatChatOpportunityWorkMode(item.workMode, t),
    ...item.employmentTypes.map((value) =>
      formatChatOpportunityEmploymentType(value, t)
    ),
  ].filter(Boolean) as string[];

type OpportunityPreviewCardsProps = {
  items: CareerHistoryOpportunity[];
  onOpenOpportunity: (opportunity: CareerHistoryOpportunity) => void;
};

export const OpportunityPreviewCards = memo(function OpportunityPreviewCards({
  items,
  onOpenOpportunity,
}: OpportunityPreviewCardsProps) {
  const t = useCareerT();
  const { locale } = useMessages();

  if (items.length === 0) return null;

  return (
    <div className="mt-4 mb-2 w-full max-w-[980px] overflow-x-auto overscroll-x-contain pb-1 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-neutral-1000-a10 scrollbar-track-transparent">
      <div className="flex w-max gap-3 pr-4">
        {items.map((item) => {
          const metaItems = getChatOpportunityMetaItems(item, t, locale);
          const postingStatus = getOpportunityPostingStatus(item, locale, t);

          return (
            <ClickablePanel
              key={item.id}
              onActivate={() => {
                onOpenOpportunity(item);
              }}
              className="group flex w-[310px] shrink-0 snap-start cursor-pointer flex-col gap-4 rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-4 py-4 text-left transition-colors hover:border-neutral-400 hover:bg-bg-weak"
              aria-label={`${item.companyName} ${item.title} 공고 열기`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-3 w-full">
                <div className="flex w-full min-w-0 items-start gap-3">
                  {item.companyLogoUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.companyLogoUrl}
                        alt={item.companyName}
                        className="h-11 w-11 shrink-0 rounded-[8px] border border-neutral-1000-a05 bg-bg-default object-cover"
                      />
                    </>
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-black text-neutral-00">
                      <Building2 className="h-4 w-4" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 items-start justify-center w-full">
                    <div className="mt-0.5 break-words text-[14px] font-medium text-neutral-primary line-clamp-1">
                      {item.companyName}
                    </div>
                    {(metaItems.length > 0 || postingStatus) && (
                      <div className="mt-0.5 flex w-full min-w-0 flex-col items-start gap-y-0.5 text-[13px] text-neutral-muted">
                        {metaItems.length > 0 && (
                          <div
                            className="w-full min-w-0 truncate"
                            title={metaItems.join(" · ")}
                          >
                            {metaItems.join(" · ")}
                          </div>
                        )}

                        {postingStatus && (
                          <span
                            className={cn(
                              "whitespace-nowrap",
                              postingStatus.isExpired && "font-medium text-info"
                            )}
                          >
                            {postingStatus.label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full text-[15px] leading-6 font-medium text-neutral-primary truncate">
                  {item.title}
                </div>
              </div>
            </ClickablePanel>
          );
        })}
      </div>
    </div>
  );
});
