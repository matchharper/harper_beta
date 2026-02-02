import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useBookmarkedCandidates } from "@/hooks/useBookMarkCandidates";
import { useMemo, useState, useEffect } from "react";
import CandidateViews from "@/components/CandidateViews";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 10;

export default function BookmarksPage() {
  const { companyUser } = useCompanyUserStore();
  const userId = useMemo(() => companyUser?.user_id, [companyUser]);

  const [pageIdx, setPageIdx] = useState(0);

  // userId 바뀌면(로그인/전환) 0페이지로 리셋
  useEffect(() => {
    setPageIdx(0);
  }, [userId]);

  const { data, isLoading, error, isFetching } = useBookmarkedCandidates(
    userId,
    pageIdx,
    PAGE_SIZE
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasNext = data?.hasNext ?? false;
  const hasPrev = pageIdx > 0;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error</div>;

  return (
    <div className="w-full">
      {/* Pagination Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex flex-row items-center gap-3 text-sm text-hgray900">
          <span>Page</span>
          <span className={`rounded-md p-1 bg-white/5 ${!hasPrev || isFetching ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`} onClick={() => setPageIdx((p) => Math.max(0, p - 1))}><ChevronLeft size={16} className="text-accenta1" /></span>
          <span className="font-medium">{pageIdx + 1}</span> /{" "}
          <span className="font-medium">{pageCount}</span>{" "}
          <span className={`rounded-md p-1 bg-white/5 ${!hasNext || isFetching ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`} onClick={() => {
            if (!hasNext) return;
            setPageIdx((p) => p + 1);
          }}><ChevronRight size={16} className="text-accenta1" /></span>
          {isFetching && <span className="ml-2 text-hgray500">Syncing…</span>}
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
