import type { CareerHistoryOpportunity } from "@/components/career/types";

export type OpportunitySearchItem = Pick<CareerHistoryOpportunity,
  | "id" | "roleId" | "companyName" | "companyLogoUrl" | "title"
  | "location" | "description" | "talentMemo" | "feedback" | "savedStage"
  | "listPosition" | "sourceType" | "opportunityType"
>;

const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().trim();

export function filterOpportunitySearchItems(items: OpportunitySearchItem[], query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter((item) => {
    const text = normalize([
      item.companyName, item.title, item.location, item.description, item.talentMemo,
    ].filter(Boolean).join(" "));
    return terms.every((term) => text.includes(term));
  });
}
