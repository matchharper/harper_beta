import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History, LoaderCircle } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { formatRelativeTime } from "@/lib/utils";
import type { MatchingRunHistoryItem } from "@/lib/companyFirstSearch/history";

type HistoryPage = {
  items: Pick<
    MatchingRunHistoryItem,
    "id" | "createdAt" | "status" | "roles" | "reviewedTalents" | "selected"
  >[];
  nextOffset: number | null;
};
export function OrgSearchHistory({
  workspaceId,
  roleId,
}: {
  workspaceId: string;
  roleId?: string;
}) {
  const [open, setOpen] = useState(false);
  const { c, locale } = useOrgLocale();
  const query = useInfiniteQuery({
    queryKey: ["org", "search-history", workspaceId, roleId],
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
    initialPageParam: 0,
    getNextPageParam: (page: HistoryPage) => page.nextOffset ?? undefined,
    queryFn: ({ pageParam }) =>
      fetchWithInternalAuth<HistoryPage>(
        `/api/org/search-history?${new URLSearchParams({ workspaceId, ...(roleId ? { roleId } : {}), offset: String(pageParam) })}`
      ),
  });
  const statuses: Record<string, string> = {
    queued: c("대기", "Queued"),
    running: c("검색 중", "Searching"),
    succeeded: c("완료", "Complete"),
    skipped: c("건너뜀", "Skipped"),
    failed: c("실패", "Failed"),
    delivery_pending: c("전달 대기", "Delivery pending"),
  };
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <MuteButton
          aria-label={c("검색 기록", "Search history")}
          title={c("검색 기록", "Search history")}
          variant="transparent"
          size="md"
        >
          <History className="size-4" strokeWidth={1.4} />
        </MuteButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label={c("검색 기록", "Search history")}
          align="end"
          sideOffset={8}
          className="z-[90] w-[440px] max-w-[calc(100vw-24px)] rounded-lg border border-neutral-1000-a10 bg-bg-floating p-4 shadow-lg"
        >
          <h2 className="mb-4 text-sm font-medium">
            {c("검색 기록", "Search history")}
          </h2>
          <div className="max-h-[min(460px,60dvh)] overflow-y-auto overscroll-contain">
            {query.isLoading ? (
              <LoaderCircle className="mx-auto my-8 size-5 animate-spin" />
            ) : query.isError && !items.length ? (
              <MuteButton onClick={() => void query.refetch()}>
                {c("다시 불러오기", "Retry")}
              </MuteButton>
            ) : !items.length ? (
              <p className="py-8 text-center text-xs text-neutral-muted">
                {c("검색 기록이 없습니다.", "No searches yet.")}
              </p>
            ) : (
              items.map((item, index) => (
                <article
                  key={item.id ?? index}
                  className="border-b border-neutral-1000-a05 py-3 last:border-0"
                >
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="truncate">
                      {item.roles
                        .map((role) => role.name)
                        .filter(Boolean)
                        .join(", ") || c("전체 역할", "All roles")}
                    </span>
                    <time
                      dateTime={item.createdAt ?? undefined}
                      title={
                        item.createdAt
                          ? new Date(item.createdAt).toLocaleString(locale)
                          : undefined
                      }
                      className="shrink-0 text-neutral-soft"
                    >
                      {formatRelativeTime(item.createdAt, locale)}
                    </time>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-muted">
                    <span>
                      {statuses[item.status] ?? c("확인 중", "Checking")}
                    </span>
                    {item.reviewedTalents != null && (
                      <span>
                        {c("검토 {n}명", "{n} reviewed", {
                          n: item.reviewedTalents,
                        })}
                      </span>
                    )}
                    {item.selected != null && (
                      <span>
                        {c("선정 {n}명", "{n} selected", { n: item.selected })}
                      </span>
                    )}
                  </div>
                </article>
              ))
            )}
            {query.isFetchNextPageError && (
              <MuteButton
                className="mt-3 w-full"
                onClick={() => void query.fetchNextPage()}
              >
                {c("다시 불러오기", "Retry")}
              </MuteButton>
            )}
            {query.hasNextPage && !query.isFetchNextPageError && (
              <MuteButton
                className="mt-3 w-full"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {c("더 보기", "Load more")}
              </MuteButton>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
