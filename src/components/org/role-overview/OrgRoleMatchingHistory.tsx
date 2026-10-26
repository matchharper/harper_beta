import * as Popover from "@radix-ui/react-popover";
import { ArrowLeft, ChevronRight, History, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { CardButton, MuteButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  isMatchingHistorySummaryPending,
  useOrgMatchingHistory,
  useOrgMatchingHistoryDetail,
} from "@/hooks/org/useOrgMatchingHistory";
import type {
  HiringBriefHistoryItem,
  HiringBriefSnapshot,
} from "@/lib/org/hiringBriefHistory";
import {
  criterionLevel,
  ORG_ROLE_CRITERION_LEVELS,
  normalizeOrgRoleCriteria,
} from "@/lib/org/roleCriteria";
import {
  isOrgQueryAccessError,
  isOrgQueryBlockingError,
} from "@/lib/org/queryError";
import { formatRelativeTime } from "@/lib/utils";

export function MatchingHistorySummary({
  item,
}: {
  item: Pick<HiringBriefHistoryItem, "summary" | "summaryStatus">;
}) {
  const { c } = useOrgLocale();
  if (item.summary)
    return (
      <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-primary">
        {item.summary}
      </p>
    );
  if (item.summaryStatus === "retry")
    return (
      <p className="text-sm text-neutral-muted" role="status">
        {c(
          "변경 요약을 다시 준비할 예정이에요. 원문은 확인할 수 있어요.",
          "We’ll try generating the summary again. You can still view the saved versions."
        )}
      </p>
    );
  if (isMatchingHistorySummaryPending(item.summaryStatus))
    return (
      <div
        aria-label={c("변경 요약 작성 중", "Preparing change summary")}
        role="status"
        className="space-y-2 py-1"
      >
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  return (
    <p className="text-sm text-neutral-muted">
      {c(
        "변경 요약을 준비하지 못했어요. 원문은 확인할 수 있어요.",
        "The summary is unavailable. You can still view the saved versions."
      )}
    </p>
  );
}

export function MatchingHistorySnapshot({
  title,
  snapshot,
}: {
  title: string;
  snapshot: HiringBriefSnapshot;
}) {
  const { c } = useOrgLocale();
  const criteria = normalizeOrgRoleCriteria(snapshot.criteria);
  return (
    <section
      aria-label={title}
      className="space-y-5 border-t border-neutral-1000-a10 pt-5"
    >
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-neutral-primary">
          Hiring Brief
        </h3>
        {snapshot.request ? (
          <RichText content={snapshot.request} className="text-sm leading-6" />
        ) : (
          <p className="text-sm text-neutral-muted">
            {c("작성된 내용이 없어요.", "No content saved.")}
          </p>
        )}
      </div>
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-neutral-primary">
          Evaluation Criteria
        </h3>
        {criteria.length ? (
          criteria.map((criterion, index) => (
            <div key={index} className="space-y-1">
              <h4 className="text-sm font-medium text-neutral-primary">
                {criterion.name}
                <span className="ml-2 font-normal text-neutral-soft">
                  {(({ ko, en }) => c(ko, en))(
                    ORG_ROLE_CRITERION_LEVELS.find(
                      (level) => level.level === criterionLevel(criterion)
                    )!
                  )}
                </span>
              </h4>
              <RichText
                content={criterion.criteria}
                className="text-sm leading-6"
              />
            </div>
          ))
        ) : (
          <p className="text-sm text-neutral-muted">
            {c("작성된 기준이 없어요.", "No criteria saved.")}
          </p>
        )}
      </div>
    </section>
  );
}

function HistoryAttribution({
  item,
  compact = false,
}: {
  item: HiringBriefHistoryItem;
  compact?: boolean;
}) {
  const { c, locale } = useOrgLocale();
  const at = new Date(item.createdAt);
  const timestamp = Number.isNaN(at.getTime())
    ? c("시각 기록 없음", "Time not recorded")
    : at.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-neutral-muted">
      <span className="min-w-0 break-words">
        {item.actorLabel || c("수정자 기록 없음", "Author not recorded")}
      </span>
      <time
        className="shrink-0 text-neutral-soft"
        dateTime={item.createdAt}
        title={timestamp}
      >
        {compact
          ? (formatRelativeTime(item.createdAt, locale) ?? timestamp)
          : timestamp}
      </time>
    </div>
  );
}

export function OrgRoleMatchingHistory({
  workspaceId,
  roleId,
}: {
  workspaceId: string;
  roleId: string;
}) {
  const { c } = useOrgLocale();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <MuteButton
          aria-label={c("매칭 기준 변경 이력", "Matching criteria history")}
          title={c("매칭 기준 변경 이력", "Matching criteria history")}
          variant="transparent"
          size="md"
        >
          <History className="size-4" strokeWidth={1.4} aria-hidden />
        </MuteButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label={c("매칭 기준 변경 이력", "Matching criteria history")}
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[90] flex max-h-[var(--radix-popover-content-available-height)] w-[440px] max-w-[calc(100vw-24px)] flex-col rounded-lg border border-neutral-1000-a10 bg-bg-floating p-4 text-neutral-primary shadow-lg"
        >
          <MatchingHistoryContent workspaceId={workspaceId} roleId={roleId} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MatchingHistoryContent({
  workspaceId,
  roleId,
}: {
  workspaceId: string;
  roleId: string;
}) {
  const { c } = useOrgLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [version, setVersion] = useState<"before" | "after">("after");
  const backButton = useRef<HTMLButtonElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);
  const selectedRowId = useRef<string | null>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  useLayoutEffect(() => {
    if (scrollArea.current) {
      scrollArea.current.scrollTop = selectedId ? 0 : listScrollTop.current;
    }
    if (selectedId) backButton.current?.focus({ preventScroll: true });
    else if (selectedRowId.current) {
      rowButtons.current
        .get(selectedRowId.current)
        ?.focus({ preventScroll: true });
    }
  }, [selectedId]);
  const list = useOrgMatchingHistory(workspaceId, roleId, !selectedId);
  const detail = useOrgMatchingHistoryDetail(
    workspaceId,
    roleId,
    selectedId,
    true
  );
  const detailBlocked = isOrgQueryBlockingError(detail.error, detail.data);
  const hasSnapshots = Boolean(
    detail.data?.before && detail.data.after && !detailBlocked
  );
  const items = isOrgQueryAccessError(list.error)
    ? []
    : (list.data?.pages.flatMap((page) => page.items) ?? []);
  return (
    <>
      <div className="mb-4 flex shrink-0 items-center gap-2">
        {selectedId ? (
          <MuteButton
            ref={backButton}
            variant="transparent"
            size="sm"
            onClick={() => setSelectedId(null)}
            aria-label={c("변경 이력 목록으로", "Back to history")}
          >
            <ArrowLeft className="size-4" aria-hidden />
          </MuteButton>
        ) : null}
        <h2 className="min-w-0 flex-1 text-sm font-medium text-neutral-primary">
          {c("매칭 기준 변경 이력", "Matching criteria history")}
        </h2>
        <Popover.Close asChild>
          <MuteButton
            variant="transparent"
            size="sm"
            aria-label={c("변경 이력 닫기", "Close history")}
          >
            <X className="size-4" aria-hidden />
          </MuteButton>
        </Popover.Close>
      </div>
      {selectedId && hasSnapshots ? (
        <div
          role="group"
          aria-label={c("변경 전후 보기", "View saved version")}
          className="mb-4 flex shrink-0 gap-1"
        >
          {(["before", "after"] as const).map((value) => (
            <MuteButton
              key={value}
              size="sm"
              variant={version === value ? "neutral" : "transparent"}
              aria-pressed={version === value}
              onClick={() => {
                setVersion(value);
                if (scrollArea.current) scrollArea.current.scrollTop = 0;
              }}
            >
              {value === "before"
                ? c("변경 전", "Before")
                : c("변경 후", "After")}
            </MuteButton>
          ))}
        </div>
      ) : null}
      <div
        ref={scrollArea}
        className="min-h-0 max-h-[min(460px,60dvh)] overflow-y-auto overscroll-contain [overflow-wrap:anywhere]"
      >
        {selectedId ? (
          detail.isPending ? (
            <div
              className="space-y-3"
              role="status"
              aria-label={c("변경 내용 불러오는 중", "Loading change details")}
            >
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : detailBlocked ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>
                {c(
                  "변경 내용을 불러오지 못했어요.",
                  "We couldn’t load this change."
                )}
              </p>
              <MuteButton onClick={() => void detail.refetch()}>
                {c("다시 불러오기", "Retry")}
              </MuteButton>
            </div>
          ) : detail.data?.before && detail.data.after ? (
            <div className="space-y-5">
              <div className="space-y-3">
                <HistoryAttribution item={detail.data} />
                <MatchingHistorySummary item={detail.data} />
              </div>
              {detail.isError ? (
                <div
                  role="alert"
                  className="space-y-2 text-sm text-neutral-muted"
                >
                  <p>
                    {c(
                      "최신 요약을 불러오지 못했어요.",
                      "We couldn’t refresh the summary."
                    )}
                  </p>
                  <MuteButton size="sm" onClick={() => void detail.refetch()}>
                    {c("다시 불러오기", "Retry")}
                  </MuteButton>
                </div>
              ) : null}
              <MatchingHistorySnapshot
                title={
                  version === "before"
                    ? c("변경 전", "Before")
                    : c("변경 후", "After")
                }
                snapshot={detail.data[version]!}
              />
            </div>
          ) : (
            <p className="text-sm text-neutral-muted">
              {c(
                "이 변경 기록을 찾을 수 없어요.",
                "This change could not be found."
              )}
            </p>
          )
        ) : (
          <div>
            {list.isPending ? (
              <div
                className="space-y-4"
                role="status"
                aria-label={c("변경 이력 불러오는 중", "Loading history")}
              >
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : !items.length && !list.isError ? (
              <p className="py-8 text-sm text-neutral-muted">
                {c("아직 저장된 변경 이력이 없어요.", "No saved changes yet.")}
              </p>
            ) : null}
            {items.map((item) => (
              <CardButton
                key={item.id}
                ref={(element) => {
                  if (element) rowButtons.current.set(item.id, element);
                  else rowButtons.current.delete(item.id);
                }}
                onClick={() => {
                  listScrollTop.current = scrollArea.current?.scrollTop ?? 0;
                  selectedRowId.current = item.id;
                  setVersion("after");
                  setSelectedId(item.id);
                }}
                className="gap-3 rounded-none border-0 border-b border-neutral-1000-a05 px-1 py-3 font-normal shadow-none last:border-0 hover:bg-bg-weak"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <HistoryAttribution item={item} compact />
                  <MatchingHistorySummary item={item} />
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-neutral-muted"
                  aria-hidden
                />
              </CardButton>
            ))}
            {list.isError ? (
              <div role="alert" className="space-y-2 pt-4 text-sm">
                <p>
                  {c(
                    "변경 이력을 불러오지 못했어요.",
                    "We couldn’t load the history."
                  )}
                </p>
                <MuteButton
                  onClick={() =>
                    void (list.isFetchNextPageError
                      ? list.fetchNextPage()
                      : list.refetch())
                  }
                >
                  {c("다시 불러오기", "Retry")}
                </MuteButton>
              </div>
            ) : null}
            {list.hasNextPage && !list.isFetchNextPageError ? (
              <MuteButton
                className="mt-4"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage
                  ? c("불러오는 중", "Loading")
                  : c("이전 변경 더 보기", "Load earlier changes")}
              </MuteButton>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
