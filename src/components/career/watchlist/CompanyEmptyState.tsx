import { Building2, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { ActionButton } from "@/components/ui/button";
import type { CompanyWatchlistTab } from "./watchlistTypes";

export const CompanyEmptyState = ({
  activeTab,
  generating,
  onGenerate,
}: {
  activeTab: CompanyWatchlistTab;
  generating: boolean;
  onGenerate: () => void;
}) => {
  if (activeTab === "signals") {
    return <div className="min-h-[280px]" aria-hidden="true" />;
  }

  if (activeTab === "following") {
    return (
      <div className="rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-5 py-10 text-center shadow-sm">
        <Building2 className="mx-auto h-6 w-6 text-neutral-disabled" />
        <h3 className="mt-4 text-[16px] font-medium text-neutral-primary">
          아직 팔로우한 회사가 없습니다.
        </h3>
        <p className="mx-auto mt-2 max-w-[520px] text-[13px] leading-6 text-neutral-muted">
          추천회사나 포지션 히스토리에서 회사 정보를 열고 팔로우하면 이곳에서
          채용, 펀딩, 팀 변화 같은 업데이트를 추적합니다.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-5 py-10 text-center shadow-sm">
      <Sparkles className="mx-auto h-6 w-6 text-neutral-disabled" />
      <h3 className="mt-4 text-[16px] font-medium text-neutral-primary">
        아직 추천 회사가 없습니다.
      </h3>
      <p className="mx-auto mt-2 max-w-[560px] text-[13px] leading-6 text-neutral-muted">
        최근 6개월 안에 활성 채용 신호가 있고 LinkedIn이 연결된 회사 중에서
        프로필 방향에 맞는 회사를 저장합니다.
      </p>
      <ActionButton
        actionVariant="primary"
        buttonRadius="rounded"
        onClick={onGenerate}
        disabled={generating}
        className="mt-5 h-9 gap-2 px-3.5 text-sm"
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        추천 회사 만들기
      </ActionButton>
    </div>
  );
};
