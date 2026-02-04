import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useBookmarkedCandidates, usePickedCandidates } from "@/hooks/useBookMarkCandidates";
import { useMemo, useState, useEffect } from "react";
import CandidateViews from "@/components/CandidateViews";
import { Loading } from "@/components/ui/loading";

const PAGE_SIZE = 10;

export default function PickedPage() {
  const { companyUser } = useCompanyUserStore();
  const userId = useMemo(() => companyUser?.user_id, [companyUser]);

  const [pageIdx, setPageIdx] = useState(0);

  // userId 바뀌면(로그인/전환) 0페이지로 리셋
  useEffect(() => {
    setPageIdx(0);
  }, [userId]);

  const { data, isLoading, error, isFetching } = usePickedCandidates(
    userId,
    pageIdx,
    PAGE_SIZE
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasNext = data?.hasNext ?? false;
  const hasPrev = pageIdx > 0;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isLoading) return <Loading className="text-hgray600" />;
  if (error) return <div>Error</div>;

  return (
    <div className="w-full">
      {/* Pagination Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-sm text-hgray700">
          Page <span className="font-medium">{pageIdx + 1}</span> /{" "}
          <span className="font-medium">{pageCount}</span>{" "}
          <span className="ml-2 text-hgray600">(전체 {total}개)</span>
          {isFetching && <span className="ml-2 text-hgray500">Syncing…</span>}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-hgray200 text-sm disabled:opacity-50"
            onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
            disabled={!hasPrev || isFetching}
          >
            이전
          </button>

          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-white/10 text-black bg-accenta1 text-sm disabled:opacity-50"
            onClick={() => {
              if (!hasNext) return;
              setPageIdx((p) => p + 1);
            }}
            disabled={!hasNext || isFetching}
          >
            다음
          </button>
        </div>
      </div>

      <CandidateViews
        items={items}
        userId={userId}
        isMyList={true}
        criterias={[]}
      />
    </div>
  );
}
