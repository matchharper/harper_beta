import { memo, useState } from "react";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import CareerOpportunityPreviewCard from "@/components/career/history/CareerOpportunityPreviewCard";
import CareerOpportunityPreviewModal from "@/components/career/history/CareerOpportunityPreviewModal";
import { getPostingRoleIdFromOpportunityId } from "@/lib/career/postingLinks";

type OpportunityPreviewCardsProps = {
  items: CareerHistoryOpportunity[];
  onOpenOpportunity: (opportunity: CareerHistoryOpportunity) => void;
};

export const OpportunityPreviewCards = memo(function OpportunityPreviewCards({
  items,
  onOpenOpportunity,
}: OpportunityPreviewCardsProps) {
  const [previewOpportunity, setPreviewOpportunity] =
    useState<CareerHistoryOpportunity | null>(null);
  if (items.length === 0) return null;
  return (
    <div className="mt-4 mb-2 w-full max-w-[980px] overflow-x-auto overscroll-x-contain pb-1 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-neutral-1000-a10 scrollbar-track-transparent">
      <div className="flex w-max gap-3 pr-4">
        {items.map((item) => (
          <CareerOpportunityPreviewCard
            key={item.id}
            item={item}
            className="w-[310px] snap-start"
            onActivate={() => {
              if (getPostingRoleIdFromOpportunityId(item.id))
                setPreviewOpportunity(item);
              else onOpenOpportunity(item);
            }}
          />
        ))}
      </div>
      <CareerOpportunityPreviewModal
        item={previewOpportunity}
        onClose={() => setPreviewOpportunity(null)}
      />
    </div>
  );
});
