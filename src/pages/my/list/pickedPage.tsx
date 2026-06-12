import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import {
  useBookmarkedCandidates,
  usePickedCandidates,
} from "@/hooks/useBookMarkCandidates";
import { useMemo, useState, useEffect } from "react";
import CandidateViews from "@/components/CandidateViews";
import { Loading } from "@/components/ui/loading";
import { BareButton } from "@/components/ui/button";

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

  if (isLoading) return <Loading className="text-neutral-muted" />;
  if (error) return <div>Error</div>;

  return (
    <div className="w-full">
      {/* Pagination Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-sm text-neutral-muted">
          Page <span className="font-medium">{pageIdx + 1}</span> /{" "}
          <span className="font-medium">{pageCount}</span>{" "}
          <span className="ml-2 text-neutral-muted">(전체 {total}개)</span>
          {isFetching && (
            <span className="ml-2 text-neutral-soft">Syncing…</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <BareButton
            type="button"
            className="px-3 py-1.5 rounded-lg border border-neutral-1000-a05 bg-bg-basement text-sm disabled:opacity-50"
            onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
            disabled={!hasPrev || isFetching}
          >
            이전
          </BareButton>

          <BareButton
            type="button"
            className="px-3 py-1.5 rounded-lg border border-neutral-1000-a05 text-neutral-00 bg-black text-sm disabled:opacity-50"
            onClick={() => {
              if (!hasNext) return;
              setPageIdx((p) => p + 1);
            }}
            disabled={!hasNext || isFetching}
          >
            다음
          </BareButton>
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
