import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "@/lib/org/homeActivity";
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
  meeting_requested: CalendarDays,
  meeting_confirmed: CalendarCheck2,
};
const eventGroups: Record<OrgHomeActivityKind, string> = {
  intro_sent: "intros",
  pending_connection: "intros",
  intro_accepted: "intros",
  candidate_message: "messages",
  candidate_response: "messages",
  company_question: "messages",
  meeting_requested: "interviews",
  meeting_confirmed: "interviews",
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
}: {
  workspaceId: string;
  roleId: string | null;
  roleName?: string;
}) {
  const { c, locale } = useOrgLocale();
  const { selectTalent } = useOrgJobsNavigation();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const query = useQuery({
    queryKey: ["org", "home-activity", workspaceId, roleId ?? "all"],
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    refetchOnMount: "always",
    queryFn: () => {
      const params = new URLSearchParams({ workspaceId });
      if (roleId) params.set("roleId", roleId);
      return fetchWithInternalAuth<{ items: OrgHomeActivity[] }>(
        `/api/org/activity?${params}`
      );
    },
  });
  const filters = [
    { value: "all", label: c("모든 소식", "All updates") },
    { value: "intros", label: "Intro" },
    { value: "messages", label: c("메시지", "Messages") },
    { value: "interviews", label: c("인터뷰", "Interviews") },
  ];
  const titleFor = (item: OrgHomeActivity) => {
    const name = item.talentName || c("후보자", "Candidate");
    const titles: Record<OrgHomeActivityKind, string> = {
      intro_sent: c("{name}님에게 Intro를 보냈어요", "Intro sent to {name}", {
        name,
      }),
      pending_connection: c(
        "새로운 연결 대기 후보 · {name}",
        "New candidate to review · {name}",
        { name }
      ),
      intro_accepted: c(
        "{name}님이 Intro를 수락했어요",
        "{name} accepted your intro",
        { name }
      ),
      candidate_message: c(
        "{name}님에게 메시지가 왔어요",
        "New message from {name}",
        { name }
      ),
      candidate_response: c("{name}님이 답변했어요", "{name} replied", {
        name,
      }),
      company_question: c(
        "{name}님에게 메시지를 보냈어요",
        "Message sent to {name}",
        { name }
      ),
      meeting_requested: c(
        "{name}님에게 인터뷰를 요청했어요",
        "Interview requested with {name}",
        { name }
      ),
      meeting_confirmed: c(
        "{name}님의 인터뷰 일정이 정해졌어요",
        "Interview scheduled with {name}",
        { name }
      ),
    };
    return titles[item.kind];
  };
  const searchText = search.trim().toLocaleLowerCase(locale);
  const items = (query.data?.items ?? [])
    .filter(
      (item) =>
        (kindFilter === "all" || eventGroups[item.kind] === kindFilter) &&
        (!searchText ||
          [item.talentName, item.roleName, item.text, titleFor(item)]
            .join(" ")
            .toLocaleLowerCase(locale)
            .includes(searchText))
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
    );
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
        aria-label={c("활동 피드", "Activity feed")}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-8 lg:px-6"
      >
        <header className="pb-2 lg:pt-7">
          <h2 className="truncate text-xl font-medium text-neutral-primary">
            {roleName || c("전체 소식", "All activity")}
          </h2>
          <div className="mt-6 flex flex-wrap items-center gap-2">
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
                  onValueChange={setKindFilter}
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
        {query.isError ? (
          <OrgErrorState
            message={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ) : query.isLoading ? (
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
              <h3 className="mb-2 px-2 text-xs font-medium text-neutral-soft">
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
                        className="group flex w-full gap-3 rounded-md px-2 py-5 text-left outline-none transition-colors hover:bg-bg-weak focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
                      >
                        <Icon
                          aria-hidden
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            item.kind === "intro_accepted" ||
                              item.kind === "meeting_confirmed"
                              ? "text-positive-strong"
                              : "text-neutral-soft"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium leading-5 text-neutral-primary">
                            {titleFor(item)}
                          </div>
                          {preview && (
                            <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-[13px] font-normal leading-5 text-neutral-muted">
                              {preview}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-soft">
                            {!roleId && item.roleName && (
                              <>
                                <span>{item.roleName}</span>
                                <span aria-hidden>·</span>
                              </>
                            )}
                            <time
                              dateTime={item.createdAt}
                              title={new Date(item.createdAt).toLocaleString(
                                locale
                              )}
                            >
                              {formatRelativeTime(item.createdAt, locale)}
                            </time>
                          </div>
                        </div>
                        <ArrowUpRight
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-neutral-soft opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        />
                      </BareButton>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        ) : (
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
        {!filtered && query.data?.items.length === 100 && (
          <p className="pt-6 text-center text-xs text-neutral-soft">
            {c("최근 100개 소식", "Latest 100 updates")}
          </p>
        )}
      </section>
      <TalentDetailSimpleView />
    </>
  );
}
