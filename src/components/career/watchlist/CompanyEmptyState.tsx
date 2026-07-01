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
    <div className="rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-5 py-10 text-center shadow-sm">
      <Building2 className="mx-auto h-6 w-6 text-neutral-disabled" />
      <h3 className="mt-4 text-[16px] font-medium text-neutral-primary">
        {t(
          "career.company.company_empty_state.17mqvmz",
          "아직 팔로우한 회사가 없습니다."
        )}
      </h3>
      <p className="mx-auto mt-2 max-w-[520px] text-[13px] leading-6 text-neutral-muted">
        {t(
          "career.company.company_empty_state.0akildu",
          "포지션 히스토리에서 회사 정보를 열고 팔로우하면 이곳에서 채용, 펀딩, 팀 변화 같은 업데이트를 추적합니다."
        )}
      </p>
    </div>
  );
};
