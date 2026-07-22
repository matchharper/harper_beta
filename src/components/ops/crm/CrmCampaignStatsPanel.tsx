import { useQuery } from "@tanstack/react-query";
import { BarChart3, LoaderCircle } from "lucide-react";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsCrmCampaignStatsResponse } from "@/lib/ops/crmCampaigns";
import { cx, opsTheme } from "@/components/ops/theme";

const crmCampaignStatsKey = (campaignId: string | null) =>
  ["ops-crm-campaign-stats", campaignId ?? "none"] as const;

function formatCount(value: number | null | undefined) {
  return Math.max(0, Number(value ?? 0)).toLocaleString();
}

export function CrmCampaignStatsPanel({
  campaignId,
  maxTotalSends,
}: {
  campaignId: string | null;
  maxTotalSends: number;
}) {
  const statsQuery = useQuery({
    queryKey: crmCampaignStatsKey(campaignId),
    queryFn: () => {
      const params = new URLSearchParams({ campaignId: campaignId ?? "" });
      return fetchWithInternalAuth<OpsCrmCampaignStatsResponse>(
        `/api/internal/crm/campaigns/stats?${params.toString()}`
      );
    },
    enabled: Boolean(campaignId),
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  if (!campaignId) {
    return (
      <section className={cx(opsTheme.panel, "p-4")}>
        <div className="flex items-center gap-2 text-sm text-neutral-primary">
          <BarChart3 className="h-4 w-4 text-neutral-soft" />
          발송 통계
        </div>
        <div className="mt-3 text-sm leading-6 text-neutral-muted">
          저장된 캠페인을 선택하면 발송 통계가 표시됩니다.
        </div>
      </section>
    );
  }

  const stats = statsQuery.data?.stats;

  return (
    <section className={cx(opsTheme.panel, "p-4")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-neutral-primary">
          <BarChart3 className="h-4 w-4 text-neutral-soft" />
          발송 통계
        </div>
        {statsQuery.isFetching ? (
          <div className="inline-flex items-center gap-1.5 text-sm text-neutral-muted">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            업데이트 중
          </div>
        ) : null}
      </div>

      {statsQuery.isError ? (
        <div className={cx(opsTheme.errorNotice, "mt-4")}>
          통계를 불러오지 못했습니다.
        </div>
      ) : (
        <div className="mt-4 grid rounded-md border border-neutral-1000-a05 sm:grid-cols-3">
          <div className="px-4 py-3">
            <div className="text-sm text-neutral-muted">발송 대상</div>
            <div className="mt-1 text-lg text-neutral-primary">
              {statsQuery.isLoading
                ? "-"
                : `${formatCount(stats?.uniqueRecipientCount)}명`}
            </div>
          </div>
          <div className="border-t border-neutral-1000-a05 px-4 py-3 sm:border-l sm:border-t-0">
            <div className="text-sm text-neutral-muted">
              발송 메일 / 전체 한도
            </div>
            <div className="mt-1 text-lg text-neutral-primary">
              {statsQuery.isLoading
                ? "-"
                : `${formatCount(stats?.sentEmailCount)} / ${formatCount(maxTotalSends)}개`}
            </div>
          </div>
          <div className="border-t border-neutral-1000-a05 px-4 py-3 sm:border-l sm:border-t-0">
            <div className="text-sm text-neutral-muted">버튼 클릭자</div>
            <div className="mt-1 text-lg text-neutral-primary">
              {statsQuery.isLoading
                ? "-"
                : `${formatCount(stats?.uniqueClickerCount)}명`}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
