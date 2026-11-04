import { useCareerT } from "@/i18n/useCareerT";
import type { CareerHistoryOpportunity } from "../types";
import OpportunityListCard from "./OpportunityListCard";
import {
  getCareerOpportunityManagementStatus,
  type CareerOpportunityManagementStatus,
} from "./savedOpportunityStatus";

export default function ProgressOpportunityList({
  items,
  loading,
  pendingOpportunityIds,
  onOpenDetail,
  onStatusChange,
}: {
  items: CareerHistoryOpportunity[];
  loading?: boolean;
  pendingOpportunityIds?: Set<string>;
  onOpenDetail: (item: CareerHistoryOpportunity) => void;
  onStatusChange?: (
    item: CareerHistoryOpportunity,
    status: CareerOpportunityManagementStatus
  ) => void;
}) {
  const t = useCareerT();
  return (
    <div>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <OpportunityListCard
            key={item.id}
            item={item}
            pending={Boolean(pendingOpportunityIds?.has(item.id))}
            savedStatus={getCareerOpportunityManagementStatus(item)}
            onOpenDetail={onOpenDetail}
            onSavedStatusChange={onStatusChange}
          />
        ))}
      </div>
      {!items.length && (
        <p className="py-8 text-center text-sm text-neutral-soft" role="status">
          {loading
            ? t("career.automation.loading", "불러오는 중…")
            : t(
                "career.history.progress.filter_empty",
                "해당하는 기회가 없습니다."
              )}
        </p>
      )}
    </div>
  );
}
