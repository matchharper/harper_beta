import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  Circle,
  CircleDashed,
  Clock,
  ListTodo,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import {
  useAnswerOrgCriteriaProposal,
  useDecideOrgTodoSuggestion,
  useMarkOrgTodoRead,
  useOrgRoleTodo,
  useCancelOrgHarperSchedule,
} from "@/hooks/org/useOrgRoleTodo";
import {
  orgHomeActivityTitle,
  type OrgHomeActivityKind,
} from "@/lib/org/homeActivity";
import { formatScheduledSearchTime } from "@/lib/org/introSearchSchedule";
import { buildOrgHref } from "@/lib/org/routes";
import {
  orgTodoBadge,
  type OrgTodoColumn,
  type OrgTodoItem,
} from "@/lib/org/todo";
import { cn } from "@/lib/utils";
import { OrgTodoCards } from "@/components/org/role-screen/OrgTodoCards";

type Copy = (
  ko: string,
  en: string,
  values?: Record<string, string | number>
) => string;

function itemText(item: OrgTodoItem, c: Copy, locale: "ko" | "en") {
  const name = item.talent?.name || c("후보자", "Candidate");
  const n = item.count ?? 0;
  if (item.id.startsWith("activity:") && item.detail) {
    return orgHomeActivityTitle(
      { kind: item.detail as OrgHomeActivityKind, talentName: name },
      locale
    );
  }
  const request =
    item.detail === "resume"
      ? c("이력서 요청", "resume request")
      : item.detail === "question"
        ? c("질문", "question")
        : c("연락", "message");
  switch (item.kind) {
    case "pending_connection":
      return c("연결을 기다리는 후보 {n}명", "{n} waiting to connect", { n });
    case "company_intro":
      return c("연결을 요청할 후보 {n}명", "{n} ready to reach out", { n });
    case "contact_draft":
      return c(
        "{name}님에게 보낼 {request} 확인",
        "Review the {request} to {name}",
        { name, request }
      );
    case "contact_failed":
      return c(
        "{name}님에게 {request}을 보내지 못했어요",
        "Couldn't send the {request} to {name}",
        { name, request }
      );
    case "role_start":
      return item.detail === "review"
        ? c("찾는 사람 확정하기", "Confirm who we're looking for")
        : item.detail === "evaluating"
          ? c("첫 3명 평가하기", "Rate the first three")
          : c("역할 시작 질문에 답하기", "Answer the role questions");
    case "memory_proposal":
      return c("하퍼가 바꿀 내용 확인", "Confirm Harper's change");
    case "criteria_proposal":
      return item.detail || c("하퍼가 제안한 기준 변경", "Harper's suggested criteria change");
    case "interview_missing":
      return c(
        "{name}님 면접 일정이 아직 없어요",
        "No interview scheduled with {name} yet",
        { name }
      );
    case "intro_waiting":
      return item.detail === "preparing"
        ? c(
            "{name}님에게 보낼 제안 준비 중",
            "Preparing the intro request to {name}",
            { name }
          )
        : c("{name}님 답 기다리는 중", "Waiting for {name}'s reply", {
            name,
          });
    case "request_sending":
      return c(
        "{name}님에게 {request} 보내는 중",
        "Sending the {request} to {name}",
        { name, request }
      );
    case "request_waiting":
      return c(
        "{name}님 {request} 답 기다리는 중",
        "Waiting for {name}'s reply to your {request}",
        { name, request }
      );
    case "request_answered":
      return c(
        "{name}님 {request} 답 전달 준비 중",
        "Preparing {name}'s reply to your {request}",
        { name, request }
      );
    case "intro_declined":
      return c("{name}님이 연결을 거절했어요", "{name} declined your intro", {
        name,
      });
    case "meeting_waiting":
      return c(
        "{name}님 인터뷰 시간 선택 기다리는 중",
        "Waiting for {name} to pick an interview time",
        { name }
      );
    case "search_running":
      return c("후보 찾는 중", "Searching for candidates");
    case "external_search_running":
      return c("외부 후보 찾는 중", "Searching outside Harper");
    case "search_failed":
      return item.detail === "external_search"
        ? c(
            "외부 후보 검색이 실패했어요. 다음 검색이 되면 사라져요.",
            "The external search failed. This clears after the next one works."
          )
        : c(
            "후보 검색이 실패했어요. 다음 검색이 되면 사라져요.",
            "The candidate search failed. This clears after the next one works."
          );
    case "slack_delivery_error":
      return item.detail === "integration"
        ? c(
            "Slack 연결이 끊겨서 후보를 보내지 못해요",
            "Slack is disconnected, so candidates can't be sent"
          )
        : c(
            "Slack으로 후보를 보내지 못했어요",
            "Couldn't send candidates to Slack"
          );
    case "intros_empty":
      return c(
        "남은 {p0}이 없어요 · {p1} {n}명",
        "No intros left · {p1} ({n})",
        {
          p0: ct(c, COMPANY_TERMS.connection),
          p1: ct(c, COMPANY_TERMS.stage.pending_connection),
          n,
        }
      );
    case "scheduled_search":
      return ct(c, COMPANY_TERMS.nextScheduledSearch);
    case "harper_scheduled":
      // Paused work does not run until it is resumed, so it is not called 예정.
      return item.scheduleStatus === "paused"
        ? c("{p0}: {p1}", "{p0}: {p1}", {
            p0: ct(c, COMPANY_TERMS.todo.paused),
            p1: item.detail ?? "",
          })
        : c("Harper 예정: {p0}", "Harper will: {p0}", { p0: item.detail ?? "" });
    case "role_start_working":
      return item.detail === "searching" || item.detail === "batch"
        ? c("첫 후보 찾는 중", "Finding the first candidates")
        : c("역할 시작 준비 중", "Preparing the role");
    case "meeting_soon":
      return c("{name}님 인터뷰", "Interview with {name}", { name });
    case "followup_sent":
      return c("{name}님에게 팔로업을 보냈어요", "Followed up with {name}", {
        name,
      });
    case "brief_changed":
      return item.detail
        ? c("찾는 사람 변경: {p0}", "Who we're looking for changed: {p0}", { p0: item.detail })
        : c("찾는 사람을 바꿨어요", "Who we're looking for changed");
    case "suggestion":
    case "suggestion_running":
    case "suggestion_done":
      return item.detail ?? "";
    // The count is people added to Ready to reach out for this Role. Intros
    // Harper sends to candidates directly are counted per run, not per Role,
    // so they are not in it and "none" is never claimed.
    case "search_done":
      return n
        ? c(
            "후보 검색 · 연결을 요청할 후보 {n}명 추가",
            "Candidate search · {n} added to Ready to reach out",
            { n }
          )
        : c("후보 검색을 마쳤어요", "Candidate search finished");
    default:
      return name;
  }
}

function itemHref(item: OrgTodoItem, roleId: string, workspaceId: string) {
  if (item.kind === "slack_delivery_error") {
    return buildOrgHref({ orgId: workspaceId, page: "settings" });
  }
  if (item.kind === "intros_empty") {
    return buildOrgHref({ orgId: workspaceId, page: "billing" });
  }
  if (item.kind === "pending_connection" || item.kind === "company_intro") {
    return buildOrgHref({
      orgId: workspaceId,
      page: "role",
      roleId,
      tab: "inbox",
      inboxStage: item.kind,
    });
  }
  if (item.kind === "role_start" || item.kind === "role_start_working") {
    return buildOrgHref({
      orgId: workspaceId,
      page: "role",
      roleId,
      tab: "start",
    });
  }
  if (item.kind === "brief_changed") {
    return buildOrgHref({
      orgId: workspaceId,
      page: "role",
      roleId,
      tab: "role",
      section: "criteria",
    });
  }
  if (item.talent && item.kind !== "suggestion") {
    return buildOrgHref({
      orgId: workspaceId,
      page: "role",
      roleId,
      tab: "pipeline",
      detail: {
        recommendationId: item.talent.recommendationId,
        roleId,
        talentId: item.talent.id,
        workspaceId,
      },
    });
  }
  return null;
}

/** The sections shown above the Role chat. */
export const ORG_TODO_CHIP_COLUMNS: OrgTodoColumn[] = [
  "my_turn",
  "blocked",
  "notice",
  "suggestion",
  "in_progress",
  "scheduled",
];

const COLUMN_ICON: Record<OrgTodoColumn, LucideIcon> = {
  blocked: AlertTriangle,
  done: Check,
  in_progress: Clock,
  my_turn: Circle,
  notice: Bell,
  scheduled: CalendarClock,
  suggestion: CircleDashed,
};

/** Rows whose time is the point: when Harper will do it, when the interview is. */
function itemTitle(item: OrgTodoItem, c: Copy, locale: "ko" | "en") {
  const text = itemText(item, c, locale);
  const when =
    item.nextAt &&
    item.scheduleStatus !== "paused" &&
    (item.column === "scheduled" || item.kind === "meeting_soon")
      ? formatScheduledSearchTime(item.nextAt, locale)
      : "";
  return when ? `${text} · ${when}` : text;
}

/** Under Harper's scheduled work: who set it up. */
function scheduleOwner(item: OrgTodoItem, c: Copy) {
  if (item.kind !== "harper_scheduled") return null;
  if (item.scheduledBy === "harper") return ct(c, COMPANY_TERMS.todo.byHarper);
  if (item.scheduledBy === "team") return ct(c, COMPANY_TERMS.todo.byTeam);
  return null;
}

/**
 * Why cancelling one schedule did not work. A stale revision (409) reloads
 * the list (the mutation refreshes it) and allows one more press; a second
 * 409 stops there. Without permission (403) the button goes away.
 */
type CancelIssue = "stale" | "stale_again" | "failed" | "forbidden";

function cancelIssueAfter(error: unknown, previous: CancelIssue | undefined): CancelIssue {
  const status = (error as { status?: number } | null)?.status;
  if (status === 403) return "forbidden";
  if (status === 409) return previous === "stale" ? "stale_again" : "stale";
  return "failed";
}

function cancelIssueText(issue: CancelIssue, c: Copy) {
  switch (issue) {
    case "stale":
      return c(
        "그사이 예약이 바뀌어 다시 불러왔어요. 한 번 더 눌러 주세요.",
        "This schedule changed in the meantime and was reloaded. Press Cancel once more."
      );
    case "stale_again":
      return c(
        "예약을 취소하지 못했어요. 할 일을 다시 열어 확인해 주세요.",
        "Couldn't cancel this schedule. Reopen the To-do and check it."
      );
    case "forbidden":
      return c(
        "이 예약을 취소할 권한이 없어요.",
        "You don't have permission to cancel this schedule."
      );
    default:
      return c(
        "예약을 취소하지 못했어요. 다시 눌러 주세요.",
        "Couldn't cancel this schedule. Try again."
      );
  }
}

/** A request the team can always ask Harper for, listed with its suggestions. */
export type OrgTodoShortcut = {
  actionLabel: string;
  busy?: boolean;
  busyLabel?: string;
  id: string;
  onRun: () => void;
  title: string;
};

/** Pipeline summary and Run Search, worded as things Harper offers to do. */
export function useOrgTodoShortcuts(args: {
  onRunSearch: () => void;
  onSend: (message: string) => void;
  searching: boolean;
}): OrgTodoShortcut[] {
  const { c } = useOrgLocale();
  return [
    {
      actionLabel: c("요약 받기", "Summarize"),
      id: "pipeline_summary",
      onRun: () =>
        args.onSend(
          c(
            "현재 연결된 후보자 파이프라인을 요약해서 설명해줘",
            "Summarize the current candidate pipeline for this role."
          )
        ),
      title: c("파이프라인을 요약해 드릴까요?", "Summarize the pipeline?"),
    },
    {
      actionLabel: c("찾아 주세요", "Search"),
      busy: args.searching,
      busyLabel: c("찾는 중", "Searching"),
      id: "run_search",
      onRun: args.onRunSearch,
      title: c(
        "지금 목록에 없는 후보를 더 찾아볼까요?",
        "Find candidates not on the list yet?"
      ),
    },
  ];
}

function TodoRow({
  action,
  detail,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  detail?: ReactNode;
  icon: LucideIcon;
  title: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-neutral-1000-a05 px-4 py-3 last:border-b-0">
      <Icon
        aria-hidden
        className="size-5 shrink-0 text-neutral-soft"
        strokeWidth={1.4}
      />
      <div className="min-w-0 flex-1">
        <div className="break-keep text-[14px] leading-5 text-neutral-primary">
          {title}
        </div>
        {detail ? (
          <div className="mt-0.5 break-keep text-[12px] leading-4 text-neutral-muted">
            {detail}
          </div>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-1.5">{action}</div>
      ) : null}
    </li>
  );
}

/**
 * The To-do sections for one Role: one line per thing with the button that
 * does it. A second line only for a suggestion's control and for Harper's
 * scheduled work (who set it up, a failed cancel).
 */
export function OrgTodoList({
  columns,
  onApprove,
  onNavigate,
  range,
  roleId,
  shortcuts = [],
  variant = "rows",
  workspaceId,
}: {
  columns: OrgTodoColumn[];
  /** Sends the approved plan to the Role chat as the team's message. */
  onApprove: (message: string) => void;
  onNavigate?: () => void;
  range: "all" | "recent";
  roleId: string;
  shortcuts?: OrgTodoShortcut[];
  /** "cards": the role screen's right column, in the candidate side's card style. */
  variant?: "rows" | "cards";
  workspaceId: string;
}) {
  const { c, locale } = useOrgLocale();
  const todo = useOrgRoleTodo({ range, roleId, workspaceId });
  const decide = useDecideOrgTodoSuggestion({ roleId, workspaceId });
  const cancelSchedule = useCancelOrgHarperSchedule({ roleId, workspaceId });
  // Why cancelling each schedule did not work, by schedule.
  const [cancelIssues, setCancelIssues] = useState<Record<string, CancelIssue>>({});
  const markRead = useMarkOrgTodoRead({ roleId, workspaceId });
  const answerProposal = useAnswerOrgCriteriaProposal({ roleId, workspaceId });
  const items = todo.data?.items ?? [];
  const suggestions = todo.data?.suggestions ?? 0;
  const headings: Record<OrgTodoColumn, string> = {
    blocked: ct(c, COMPANY_TERMS.todo.blocked),
    done: c("한 일", "Done"),
    in_progress: ct(c, COMPANY_TERMS.todo.inProgress),
    my_turn: ct(c, COMPANY_TERMS.todo.decide),
    notice: ct(c, COMPANY_TERMS.todo.updates),
    scheduled: ct(c, COMPANY_TERMS.todo.scheduled),
    suggestion: ct(c, COMPANY_TERMS.todo.harperCan),
  };
  const answer = (
    item: OrgTodoItem,
    decision: "approve" | "dismiss" | "mute"
  ) => {
    if (!item.suggestionId || decide.isPending) return;
    decide.mutate(
      { decision, suggestionId: item.suggestionId },
      {
        onSuccess: (result) => {
          if (decision !== "approve") return;
          onNavigate?.();
          onApprove(
            c(
              "제안대로 진행해 주세요: {p0}\n{p1}",
              "Please go ahead with your suggestion: {p0}\n{p1}",
              { p0: result.title, p1: result.plan }
            )
          );
        },
      }
    );
  };
  // The one button a row needs, worded as what it does.
  const action = (item: OrgTodoItem) => {
    if (item.kind === "suggestion") {
      return (
        <>
          <MuteButton
            disabled={decide.isPending}
            onClick={() => answer(item, "dismiss")}
            size="sm"
            type="button"
            variant="dark"
          >
            {c("괜찮아요", "Not now")}
          </MuteButton>
          <MuteButton
            disabled={decide.isPending}
            onClick={() => answer(item, "approve")}
            size="sm"
            type="button"
            variant="dark"
          >
            {c("진행하기", "Go ahead")}
          </MuteButton>
        </>
      );
    }
    // Sent only to someone who may cancel; gone after a 403.
    if (item.kind === "harper_scheduled") {
      const scheduleId = item.scheduleId;
      const issue = scheduleId ? cancelIssues[scheduleId] : undefined;
      if (!scheduleId || issue === "forbidden") return null;
      return (
        <MuteButton
          disabled={cancelSchedule.isPending || issue === "stale_again"}
          onClick={() =>
            cancelSchedule.mutate(
              {
                expectedRevision: item.scheduleRevision ?? 0,
                scheduleId,
              },
              {
                onError: (error) =>
                  setCancelIssues((current) => ({
                    ...current,
                    [scheduleId]: cancelIssueAfter(error, current[scheduleId]),
                  })),
                onSuccess: () =>
                  setCancelIssues(({ [scheduleId]: _done, ...rest }) => rest),
              }
            )
          }
          size="sm"
          type="button"
          variant="dark"
        >
          {c("취소", "Cancel")}
        </MuteButton>
      );
    }
    if (item.kind === "criteria_proposal") {
      // Applying saves the change to the Brief; dismissing records it.
      const proposalId = item.id.slice("criteria:".length);
      const answerWith = (action: "accept" | "dismiss") => () =>
        answerProposal.mutate({ action, proposalId });
      return (
        <>
          <MuteButton
            disabled={answerProposal.isPending}
            onClick={answerWith("dismiss")}
            size="sm"
            type="button"
            variant="dark"
          >
            {c("괜찮아요", "Not now")}
          </MuteButton>
          <MuteButton
            disabled={answerProposal.isPending}
            onClick={answerWith("accept")}
            size="sm"
            type="button"
            variant="dark"
          >
            {c("반영하기", "Apply")}
          </MuteButton>
        </>
      );
    }
    if (item.kind === "memory_proposal") {
      return (
        <MuteButton
          onClick={() => onNavigate?.()}
          size="sm"
          type="button"
          variant="dark"
        >
          {c("채팅에서 답하기", "Answer in chat")}
        </MuteButton>
      );
    }
    const href = itemHref(item, roleId, workspaceId);
    if (!href) {
      return item.column === "notice" ? (
        <MuteButton
          onClick={() => markRead.mutate(item.id)}
          size="sm"
          type="button"
          variant="dark"
        >
          {c("읽음", "Mark read")}
        </MuteButton>
      ) : null;
    }
    const labels: Partial<Record<OrgTodoItem["kind"], string>> = {
      intros_empty: c("연결 추가하기", "Add intros"),
      slack_delivery_error: c("연동 확인", "Check Slack"),
      company_intro: c("검토하기", "Review"),
      contact_draft: c("확인하기", "Review"),
      contact_failed: c("확인하기", "Review"),
      interview_missing: c("일정 잡기", "Schedule"),
      pending_connection: c("결정하기", "Decide"),
      role_start: c("이어 하기", "Continue"),
    };
    const label = labels[item.kind] ?? c("보기", "View");
    const view = (
      <MuteButton asChild size="sm" variant="dark">
        <Link href={href} onClick={() => onNavigate?.()} shallow>
          {label}
        </Link>
      </MuteButton>
    );
    if (item.column !== "notice") return view;
    return (
      <>
        {view}
        <MuteButton
          onClick={() => markRead.mutate(item.id)}
          size="sm"
          type="button"
          variant="dark"
        >
          {c("읽음", "Mark read")}
        </MuteButton>
      </>
    );
  };

  // The second line: a suggestion's one control, or who set up Harper's
  // scheduled work and why cancelling it did not work.
  const detail = (item: OrgTodoItem) => {
    if (item.kind === "suggestion") {
      return (
        <button
          className="underline-offset-2 hover:underline"
          disabled={decide.isPending}
          onClick={() => answer(item, "mute")}
          type="button"
        >
          {c("이런 제안 그만", "Stop suggesting this")}
        </button>
      );
    }
    const owner = scheduleOwner(item, c);
    const issue = item.scheduleId ? cancelIssues[item.scheduleId] : undefined;
    if (!owner && !issue) return undefined;
    return (
      <>
        {owner}
        {issue ? (
          <span className="block text-critical" role="alert">
            {cancelIssueText(issue, c)}
          </span>
        ) : null}
      </>
    );
  };

  if (todo.isLoading) {
    return (
      <p className="px-4 py-4 text-[13px] text-neutral-muted">
        {c("불러오는 중", "Loading")}
      </p>
    );
  }
  if (todo.isError) {
    return (
      <p className="px-4 py-4 text-[13px] text-neutral-muted">
        {c("할 일을 불러오지 못했어요.", "Couldn't load the to-do.")}{" "}
        <button
          className="underline"
          onClick={() => void todo.refetch()}
          type="button"
        >
          {c("다시 시도", "Retry")}
        </button>
      </p>
    );
  }
  if (variant === "cards") {
    return (
      <OrgTodoCards
        columns={columns}
        decideError={decide.isError}
        decidePending={decide.isPending}
        headings={headings}
        items={items}
        onMute={(item) => answer(item, "mute")}
        renderAction={action}
        shortcuts={shortcuts}
        suggestionCount={suggestions}
        title={(item) => itemText(item, c, locale)}
      />
    );
  }
  return (
    <>
      {decide.isError ? (
        <p className="px-4 pt-3 text-[12px] text-critical">
          {c(
            "제안에 답하지 못했어요. 다시 눌러 주세요.",
            "Couldn't answer the suggestion. Try again."
          )}
        </p>
      ) : null}
      {columns.map((column) => {
        const group = items.filter((item) => item.column === column);
        // 막힌 것 shows only while something is blocked; it clears itself.
        if (column === "blocked" && !group.length) return null;
        const extra = column === "suggestion" ? shortcuts : [];
        // Harper's suggestions plus the requests it always offers.
        const count =
          column === "suggestion" ? suggestions + extra.length : group.length;
        // 할 일, 막힌 것 and 알림 make up the To-do number: blue like it when above 0.
        const counted =
          (column === "my_turn" || column === "blocked" || column === "notice") &&
          count > 0;
        return (
          <section key={column}>
            <h3 className="sticky top-0 z-10 flex items-center gap-1 bg-bg-floating px-4 pb-1 pt-3 text-[12px] text-neutral-muted">
              {headings[column]}
              {counted ? (
                <Badge size="xs" variant="count">
                  {String(count)}
                </Badge>
              ) : (
                <span>{count}</span>
              )}
            </h3>
            <ul>
              {group.map((item) => (
                <TodoRow
                  action={action(item)}
                  detail={detail(item)}
                  icon={COLUMN_ICON[column]}
                  key={item.id}
                  title={itemTitle(item, c, locale)}
                />
              ))}
              {extra.map((shortcut) => (
                <TodoRow
                  action={
                    <MuteButton
                      aria-busy={shortcut.busy || undefined}
                      disabled={shortcut.busy}
                      onClick={() => {
                        onNavigate?.();
                        shortcut.onRun();
                      }}
                      size="sm"
                      type="button"
                      variant="dark"
                    >
                      {shortcut.busy
                        ? shortcut.busyLabel
                        : shortcut.actionLabel}
                    </MuteButton>
                  }
                  icon={COLUMN_ICON.suggestion}
                  key={shortcut.id}
                  title={shortcut.title}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/**
 * The To-do above the Role chat. The anchor wraps the chip row and the chat
 * input, so the list opens above them as wide as the chat.
 */
export function OrgTodoArea({
  children,
  onApprove,
  roleId,
  shortcuts,
  workspaceId,
}: {
  /** The chat input, below the chip. */
  children: ReactNode;
  onApprove: (message: string) => void;
  roleId: string;
  shortcuts: OrgTodoShortcut[];
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  const [open, setOpen] = useState(false);
  const todo = useOrgRoleTodo({ range: "recent", roleId, workspaceId });
  const badge = orgTodoBadge(todo.data?.items ?? []);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverAnchor asChild>
        <div>
          <div className="mx-auto flex w-full max-w-[1120px] flex-wrap gap-2 px-4 pt-2 md:mb-1 md:px-5 md:pt-0">
            <PopoverTrigger asChild>
              <MuteButton
                aria-label={c(
                  "할 일, 결정할 것·막힌 것·알림 {n}개",
                  "To-do, {n} to decide, blocked or new",
                  { n: badge }
                )}
                // Something to do or an unread update: glow until opened.
                className={cn(badge > 0 && !open && "org-todo-glow")}
                size="sm"
                type="button"
                variant="raised"
              >
                <ListTodo aria-hidden className="h-3.5 w-3.5" />
                {ct(c, COMPANY_TERMS.todo.button)}
                {badge ? (
                  // Same badge as the 인박스 tab.
                  <Badge size="xs" variant="count">
                    {String(badge)}
                  </Badge>
                ) : null}
              </MuteButton>
            </PopoverTrigger>
          </div>
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="center"
        aria-label={ct(c, COMPANY_TERMS.todo.button)}
        className="w-[var(--radix-popover-trigger-width)] px-4 md:px-5"
        side="top"
        surface={false}
      >
        <div className="mx-auto max-h-[min(60svh,560px)] max-w-[1120px] overflow-y-auto rounded-xl border border-neutral-1000-a10 bg-bg-floating pb-1 shadow-(--shadow-lg)">
          <OrgTodoList
            columns={ORG_TODO_CHIP_COLUMNS}
            onApprove={onApprove}
            onNavigate={() => setOpen(false)}
            range="recent"
            roleId={roleId}
            shortcuts={shortcuts}
            workspaceId={workspaceId}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
