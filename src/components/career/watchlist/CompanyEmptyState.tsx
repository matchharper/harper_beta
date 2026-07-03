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
          "최근 6개월 안에 활성 채용 신호가 있고 LinkedIn이 연결된 회사 중에서 프로필 방향에 맞는 회사를 저장합니다."
        )}
      </p>
    </div>
  );
};
