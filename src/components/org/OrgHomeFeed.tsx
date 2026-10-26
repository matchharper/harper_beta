import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronDown,
  Inbox,
  Mail,
  MessageSquare,
  Reply,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OrgHomeActivity,
  OrgHomeActivityKind,
  OrgHomeActivityFilter,
  OrgHomeActivityPage,
} from "@/lib/org/homeActivity";
import { orgHomeActivityTitle } from "@/lib/org/homeActivity";
import { cn, formatRelativeTime } from "@/lib/utils";
import { OrgErrorState } from "./workspace/OrgErrorState";
import { TalentDetailSimpleView } from "./TalentDetailSimpleView";

const eventIcons: Record<OrgHomeActivityKind, LucideIcon> = {
  intro_sent: Mail,
  pending_connection: Inbox,
  intro_accepted: Check,
  candidate_message: MessageSquare,
  candidate_response: Reply,
  company_question: ArrowUpRight,
  company_message: ArrowUpRight,
  company_resume_request: ArrowUpRight,
  meeting_requested: CalendarDays,
  meeting_confirmed: CalendarCheck2,
};
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Recent company-visible events; opening a row preserves the current feed filters. */
export function OrgHomeFeed({
  workspaceId,
  roleId,
  roleName,
  scrollHeader,
  navigationHeader,
}: {
  workspaceId: string;
  roleId: string | null;
  roleName?: string;
  scrollHeader?: ReactNode;
  navigationHeader?: ReactNode;
}) {
  const { c, locale } = useOrgLocale();
  const { selectTalent } = useOrgJobsNavigation();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<OrgHomeActivityFilter>("all");
  const [searchText, setSearchText] = useState("");
  const scrollRef = useRef<HTMLElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSearchText(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [workspaceId, roleId, searchText, kindFilter, locale]);
  const query = useInfiniteQuery({
    queryKey: [
      "org",
      "home-activity",
      workspaceId,
      roleId ?? "all",
      "pages",
      searchText,
      kindFilter,
      locale,
    ],
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    refetchOnMount: "always",
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        workspaceId,
        search: searchText,
        kind: kindFilter,
        locale,
      });
      if (roleId) params.set("roleId", roleId);
      if (pageParam) params.set("cursor", pageParam);
      return fetchWithInternalAuth<OrgHomeActivityPage>(
        `/api/org/activity?${params}`,
        { signal }
      );
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  useEffect(() => {
    const target = loadMoreRef.current;
    const root = scrollRef.current;
    if (
      !target ||
      !root ||
      !hasNextPage ||
      isFetching ||
      isError ||
      search.trim() !== searchText
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          void fetchNextPage();
        }
      },
      { root, rootMargin: "240px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, isError, fetchNextPage, search, searchText]);
  const filters = [
    { value: "all", label: c("모든 소식", "All updates") },
    { value: "intros", label: "Intro" },
    { value: "messages", label: c("메시지", "Messages") },
    { value: "interviews", label: c("인터뷰", "Interviews") },
  ];
  const titleFor = (item: OrgHomeActivity, name?: string) =>
    orgHomeActivityTitle(item, locale, name);
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
  }, [query.data]);
  const days = new Map<string, OrgHomeActivity[]>();
  for (const item of items) {
    const day = dayFormatter.format(new Date(item.createdAt));
    const group = days.get(day) ?? [];
    group.push(item);
    days.set(day, group);
  }
  const today = dayFormatter.format(new Date(query.dataUpdatedAt));
  const yesterday = dayFormatter.format(
    new Date(query.dataUpdatedAt - 86_400_000)
  );
  const dateLabel = (day: string, createdAt: string) =>
    day === today
      ? c("오늘", "Today")
      : day === yesterday
        ? c("어제", "Yesterday")
        : new Intl.DateTimeFormat(locale, {
            timeZone: "Asia/Seoul",
            month: "long",
            day: "numeric",
            ...(day.slice(0, 4) !== today.slice(0, 4)
              ? { year: "numeric" as const }
              : {}),
          }).format(new Date(createdAt));
  const meetingTime = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Seoul",
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  const filtered = Boolean(searchText || kindFilter !== "all");
  return (
    <>
      <section
        ref={scrollRef}
        aria-label={c("활동 피드", "Activity feed")}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-8 lg:px-6"
      >
        {scrollHeader}
        {navigationHeader}
        <header className="pb-2 lg:pt-7">
          {!navigationHeader && (
            <h2 className="truncate text-xl font-medium text-neutral-primary">
              {roleName || c("전체 소식", "All activity")}
            </h2>
          )}
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              navigationHeader ? "mt-2" : "mt-6"
            )}
          >
            <div className="relative min-w-40 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-soft"
              />
              <Input
                type="search"
                aria-label={c("피드 검색", "Search activity")}
                placeholder={c(
                  "후보자·내용 검색",
                  "Search candidates or updates"
                )}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 pl-9 text-[13px]"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <MuteButton
                  variant="default"
                  className="h-9 gap-2 px-3"
                  aria-label={c("소식 유형", "Update type")}
                >
                  <SlidersHorizontal
                    aria-hidden
                    className="size-4 text-neutral-muted"
                  />
                  {filters.find((filter) => filter.value === kindFilter)?.label}
                  <ChevronDown
                    aria-hidden
                    className="size-3.5 text-neutral-soft"
                  />
                </MuteButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={kindFilter}
                  onValueChange={(value) =>
                    setKindFilter(value as OrgHomeActivityFilter)
                  }
                >
                  {filters.map((filter) => (
                    <DropdownMenuRadioItem
                      key={filter.value}
                      value={filter.value}
                    >
                      {filter.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {query.isError && !query.data ? (
          <OrgErrorState
            message={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ) : query.isPending ? (
          <div
            aria-label={c("소식 불러오는 중", "Loading updates")}
            aria-busy
            className="mt-7 space-y-8"
          >
            <Skeleton className="h-4 w-12" />
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="space-y-3 border-b border-neutral-1000-a05 pb-6"
              >
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        ) : days.size ? (
          [...days].map(([day, events]) => (
            <section
              key={day}
              aria-label={dateLabel(day, events[0].createdAt)}
              className="mt-7"
            >
              <h3 className="mb-2 px-2 text-sm font-normal text-neutral-soft">
                {dateLabel(day, events[0].createdAt)}
              </h3>
              <ul className="divide-y divide-neutral-1000-a05">
                {events.map((item) => {
                  const Icon = eventIcons[item.kind];
                  const preview = item.meetingStartsAt
                    ? [meetingTime(item.meetingStartsAt), item.text]
                        .filter(Boolean)
                        .join(" · ")
                    : item.text;
                  return (
                    <li key={item.id}>
                      <BareButton
                        onClick={() =>
                          selectTalent({
                            workspaceId,
                            roleId: item.roleId,
                            talentId: item.talentId,
                            recommendationId: item.recommendationId,
                          })
                        }
                        className="group flex w-full gap-3 rounded-md px-2 py-3 my-1 text-left outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
                      >
                        <Icon
                          aria-hidden
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            item.kind === "intro_accepted" ||
                              item.kind === "meeting_confirmed"
                              ? "text-positive-strong"
                              : "text-neutral-muted"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 text-[13px] font-medium leading-5 text-neutral-primary">
                              {item.roleName && (
                                <span className="text-neutral-muted font-normal">
                                  {item.roleName} ·{" "}
                                </span>
                              )}
                              {titleFor(item, "{name}")
                                .split("{name}")
                                .map((text, index) => (
                                  <Fragment key={index}>
                                    {index > 0 && (
                                      <span className="text-action">
                                        {item.talentName ||
                                          c("후보자", "Candidate")}
                                      </span>
                                    )}
                                    {text}
                                  </Fragment>
                                ))}
                            </div>
                            <time
                              className="shrink-0 whitespace-nowrap text-xs font-normal leading-5 text-neutral-muted"
                              dateTime={item.createdAt}
                              title={new Date(item.createdAt).toLocaleString(
                                locale
                              )}
                            >
                              {formatRelativeTime(item.createdAt, locale)}
                            </time>
                          </div>
                          {/* {preview && (
                            <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-[13px] font-normal leading-5 text-neutral-muted">
                              {preview}
                            </p>
                          )} */}
                        </div>
                      </BareButton>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        ) : query.hasNextPage ? null : (
          <div
            role="status"
            className="flex flex-col items-center gap-3 py-20 text-sm text-neutral-muted"
          >
            {filtered ? (
              <Search aria-hidden className="size-5 text-neutral-soft" />
            ) : (
              <Inbox aria-hidden className="size-5 text-neutral-soft" />
            )}
            <p>
              {filtered
                ? c("검색 결과가 없습니다.", "No matching updates.")
                : c("아직 소식이 없습니다.", "No updates yet.")}
            </p>
            {filtered && (
              <MuteButton
                onClick={() => {
                  setSearch("");
                  setKindFilter("all");
                }}
                variant="neutral"
              >
                {c("필터 초기화", "Clear filters")}
              </MuteButton>
            )}
          </div>
        )}
        {query.isError && query.data && (
          <OrgErrorState
            message={query.error.message}
            onRetry={() =>
              void (query.isFetchNextPageError
                ? query.fetchNextPage()
                : query.refetch())
            }
          />
        )}
        {query.hasNextPage && !query.isError && (
          <div ref={loadMoreRef} className="flex justify-center py-6">
            <MuteButton
              disabled={query.isFetching || search.trim() !== searchText}
              onClick={() => void query.fetchNextPage()}
              variant="transparent"
            >
              {query.isFetchingNextPage
                ? c("소식을 불러오는 중", "Loading updates")
                : c("이전 소식 더 보기", "Load older updates")}
            </MuteButton>
          </div>
        )}
      </section>
      <TalentDetailSimpleView />
    </>
  );
}
