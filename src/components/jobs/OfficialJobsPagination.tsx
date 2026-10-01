import { useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { MuteButton } from "@/components/ui/button";
import type { useOfficialJobs } from "@/hooks/officialJobs/useOfficialJobs";
import type { OfficialJobsLocale } from "@/lib/officialJobs/copy";
import { getOfficialJobsExperienceCopy } from "@/lib/officialJobs/experienceCopy";

export default function OfficialJobsPagination({
  query,
  locale,
}: {
  query: ReturnType<typeof useOfficialJobs>;
  locale: OfficialJobsLocale;
}) {
  const {
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isError,
    isFetchNextPageError,
    refetch,
  } = query;
  const { ref, inView } = useInView({ rootMargin: "200px" });
  const copy = getOfficialJobsExperienceCopy(locale);

  useEffect(() => {
    if (inView && hasNextPage && !isFetching && !isError) void fetchNextPage();
  }, [inView, hasNextPage, isFetching, isError, fetchNextPage]);

  if (!hasNextPage && !isError) return null;
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <div ref={ref} aria-hidden="true" className="h-px w-full" />
      <p role="status" className="text-[13px] text-neutral-muted">
        {isError ? copy.loadError : isFetchingNextPage ? copy.loading : null}
      </p>
      <MuteButton
        size="lg"
        disabled={isFetching}
        onClick={() => {
          if (isError && !isFetchNextPageError) void refetch();
          else void fetchNextPage();
        }}
      >
        {isError ? copy.retry : isFetchingNextPage ? copy.loading : copy.more}
      </MuteButton>
    </div>
  );
}
