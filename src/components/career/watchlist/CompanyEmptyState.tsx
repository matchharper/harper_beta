import { Building2 } from "lucide-react";
import type { CompanyWatchlistTab } from "./watchlistTypes";
import { useCareerT } from "@/i18n/useCareerT";

export const CompanyEmptyState = ({
  activeTab,
}: {
  activeTab: CompanyWatchlistTab;
}) => {
  const t = useCareerT();

  if (activeTab === "signals") {
    return <div className="min-h-[280px]" aria-hidden="true" />;
  }

  return (
    <div className="career-glass px-5 py-10 text-center">
      <Building2 className="mx-auto h-6 w-6 text-neutral-disabled" />
      <h3 className="mt-4 text-[16px] font-medium text-neutral-primary">
        {t(
          "career.company.company_empty_state.17mqvmz",
          "아직 팔로우한 회사가 없습니다."
        )}
      </h3>
    </div>
  );
};
