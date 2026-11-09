import { ArrowRight, ListTodo, type LucideIcon } from "lucide-react";
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
import { formatScheduledDateTime } from "@/lib/org/introSearchSchedule";
import { buildOrgHref } from "@/lib/org/routes";
import {
  orgTodoBadge,
  type OrgTodoColumn,
  type OrgTodoItem,
} from "@/lib/org/todo";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  ORG_TODO_COLUMN_ICON,
  OrgTodoCards,
} from "@/components/org/role-screen/OrgTodoCards";

type Copy = (
  ko: string,
  en: string,
  values?: Record<string, string | number>
) => string;

/** A To-do line's text, the same on every surface. */
export function orgTodoItemText(item: OrgTodoItem, c: Copy, locale: "ko" | "en") {
  return itemText(item, c, locale);
}

/** The line's text plus its date when the time is the point (scheduled work, interviews). */
export function orgTodoItemTitle(item: OrgTodoItem, c: Copy, locale: "ko" | "en") {
  return itemTitle(item, c, locale);
}

function itemText(item: OrgTodoItem, c: Copy, locale: "ko" | "en") {
  const name = item.talent?.name || c("후보자", "Candidate");
  const n = item.count ?? 0;
  if (item.id.startsWith("activity:") && item.detail) {
    const title = orgHomeActivityTitle(
      { kind: item.detail as OrgHomeActivityKind, talentName: name },
      locale
    );
    const answered = answeredText(item, c);
    return answered ? `${title} · ${answered}` : title;
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
    case "unanswered_message":
      return c(
        "{name}님 메시지에 아직 답하지 않았어요",
        "{name}'s message has no reply yet",
        { name }
      );
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
    case "talent_withdrew":
      return c(
        "{name}님과 더 이상 진행할 수 없어요",
        "This can't continue with {name}",
        { name }
      );
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
          p1: ct(
            c,
            item.detail === "company_intro"
              ? COMPANY_TERMS.stage.company_intro
              : COMPANY_TERMS.stage.pending_connection
          ),
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
      if (item.note) return item.note;
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

/**
 * On a candidate's message: who answered it, so the team sees when Harper
 * answered and no one on the team did.
 */
function answeredText(item: OrgTodoItem, c: Copy) {
  const who = item.answeredBy;
  if (!who) return null;
  if (who.by === "harper") return c("Harper가 답했어요", "Harper replied");
  return who.name
    ? c("{name}님이 답했어요", "{name} replied", { name: who.name })
    : c("팀이 답했어요", "Your team replied");
}

function itemHref(item: OrgTodoItem, roleId: string, workspaceId: string) {
  // The candidate's messages are answered in the Role's conversation.
  if (item.kind === "unanswered_message" || item.answeredBy) {
    return buildOrgHref({ orgId: workspaceId, page: "role", roleId, tab: "chat" });
  }
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
  // The profile of someone who left no longer opens.
  if (item.talent && item.kind !== "suggestion" && item.kind !== "talent_withdrew") {
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


/** When the time is the point (Harper's scheduled work, an interview): that time. */
export function orgTodoItemWhen(item: OrgTodoItem, locale: "ko" | "en") {
  return item.nextAt &&
    item.scheduleStatus !== "paused" &&
    (item.column === "scheduled" || item.kind === "meeting_soon")
    ? formatScheduledDateTime(item.nextAt, locale)
    : "";
}

/** Rows whose time is the point: when Harper will do it, when the interview is. */
function itemTitle(item: OrgTodoItem, c: Copy, locale: "ko" | "en") {
  const text = itemText(item, c, locale);
  const when = orgTodoItemWhen(item, locale);
  return when ? `${text} · ${when}` : text;
}

/** Who is behind a count: a few names, then how many more. */
export function orgTodoItemPeople(item: OrgTodoItem, c: Copy) {
  const people = item.people ?? [];
  if (!people.length) return null;
  const shown = people.slice(0, 3).map((person) => person.name).filter(Boolean);
  if (!shown.length) return null;
  const more = Math.max(0, (item.count ?? people.length) - shown.length);
  const names = shown.join(", ");
  return more
    ? c("{p0} 외 {n}명", "{p0} and {n} more", { p0: names, n: more })
    : names;
}

/**
 * The card's line under its title: a candidate's message as a short quote and
 * how long ago it came; otherwise who is behind a count.
 */
export function orgTodoItemDescription(item: OrgTodoItem, c: Copy, locale: "ko" | "en") {
  if (item.kind !== "unanswered_message") return orgTodoItemPeople(item, c);
  return (
    [item.detail ? `“${item.detail}”` : null, formatRelativeTime(item.at, locale)]
      .filter(Boolean)
      .join(" · ") || null
  );
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

/** A request the team can always ask Harper for: a chip above the Role chat input. */
export type OrgTodoShortcut = {
  actionLabel: string;
  busy?: boolean;
  busyLabel?: string;
  /** The chip's words, the team's request (the candidate side's "기회 더 찾아줘"). */
  chipLabel: string;
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
      chipLabel: c("파이프라인 요약해줘", "Summarize the pipeline"),
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
      chipLabel: c("후보 더 찾아줘", "Find more candidates"),
      id: "run_search",
      onRun: args.onRunSearch,
      title: c(
        "지금 목록에 없는 후보를 더 찾아볼까요?",
        "Find candidates not on the list yet?"
      ),
    },
  ];
}

/**
 * The requests the team can always make, as small chips above the Role chat
 * input like the candidate side's, so they sit with the chat instead of the
 * To-do. Shown under the same rule as before (an hour with no team message;
 * Run Search also while a search runs).
 */
export function OrgTodoShortcutChips({
  shortcuts,
}: {
  shortcuts: OrgTodoShortcut[];
}) {
  return (
    <>
      {shortcuts.map((shortcut) => (
        <MuteButton
          aria-busy={shortcut.busy || undefined}
          data-org-todo-shortcut={shortcut.id}
          disabled={shortcut.busy}
          key={shortcut.id}
          onClick={shortcut.onRun}
          size="sm"
          type="button"
        >
          {shortcut.busy ? shortcut.busyLabel : shortcut.chipLabel}
        </MuteButton>
      ))}
    </>
  );
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

/** One thing a To-do line lets the team do. */
export type OrgTodoAct = {
  disabled?: boolean;
  href?: string;
  key: string;
  label: string;
  onClick?: () => void;
  /** The step forward; the rest are quiet answers (괜찮아요, 읽음, 취소). */
  primary?: boolean;
};

/** A line's controls in the follow-up style: the step forward, then quiet answers. */
export type OrgTodoActionParts = {
  primary: ReactNode;
  secondary: ReactNode[];
  /** At the end of the line: a suggestion's 이런 제안 그만. */
  trailing?: ReactNode;
};

/** The step forward as words with an arrow, like the candidate side's follow-up action. */
export function OrgTodoGo({ act }: { act: OrgTodoAct }) {
  const body = (
    <>
      {act.label}
      <ArrowRight aria-hidden />
    </>
  );
  return act.href ? (
    <Link className="org-todo-go" href={act.href} onClick={act.onClick} shallow>
      {body}
    </Link>
  ) : (
    <button
      className="org-todo-go"
      disabled={act.disabled}
      onClick={act.onClick}
      type="button"
    >
      {body}
    </button>
  );
}

/** A quiet answer (괜찮아요, 읽음, 취소), like the candidate side's 닫기. */
export function OrgTodoQuiet({ act }: { act: OrgTodoAct }) {
  return act.href ? (
    <Link className="career-card-close" href={act.href} onClick={act.onClick} shallow>
      {act.label}
    </Link>
  ) : (
    <button
      className="career-card-close"
      disabled={act.disabled}
      onClick={act.onClick}
      type="button"
    >
      {act.label}
    </button>
  );
}

/** Section names, the same on every To-do surface. */
export function orgTodoHeadings(c: Copy): Record<OrgTodoColumn, string> {
  return {
    blocked: ct(c, COMPANY_TERMS.todo.blocked),
    done: c("한 일", "Done"),
    in_progress: ct(c, COMPANY_TERMS.todo.inProgress),
    my_turn: ct(c, COMPANY_TERMS.todo.decide),
    notice: ct(c, COMPANY_TERMS.todo.updates),
    scheduled: ct(c, COMPANY_TERMS.todo.scheduled),
    suggestion: ct(c, COMPANY_TERMS.todo.harperCan),
  };
}

/**
 * The button a To-do line needs and its second line, for one Role. A Role's
 * list calls it once; Home calls it per line, for that line's Role.
 */
export function useOrgTodoActions({
  onApprove,
  onChanged,
  onNavigate,
  roleId,
  workspaceId,
}: {
  /** Sends the approved plan to the Role chat as the team's message. */
  onApprove: (message: string) => void;
  /** After an answer, a cancel or 읽음 settles: another list to refresh. */
  onChanged?: () => void;
  onNavigate?: () => void;
  roleId: string;
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  const decide = useDecideOrgTodoSuggestion({ roleId, workspaceId });
  const cancelSchedule = useCancelOrgHarperSchedule({ roleId, workspaceId });
  // Why cancelling each schedule did not work, by schedule.
  const [cancelIssues, setCancelIssues] = useState<Record<string, CancelIssue>>({});
  const markRead = useMarkOrgTodoRead({ roleId, workspaceId });
  const answerProposal = useAnswerOrgCriteriaProposal({ roleId, workspaceId });
  const answer = (
    item: OrgTodoItem,
    decision: "approve" | "dismiss" | "mute"
  ) => {
    if (!item.suggestionId || decide.isPending) return;
    decide.mutate(
      { decision, suggestionId: item.suggestionId },
      {
        onSettled: onChanged,
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
  // What a line lets the team do, worded as what it does; `primary` is the
  // step forward (진행하기, 반영하기, 결정하기…), the rest are quiet answers.
  const acts = (item: OrgTodoItem): OrgTodoAct[] => {
    if (item.kind === "suggestion") {
      return [
        {
          disabled: decide.isPending,
          key: "dismiss",
          label: c("괜찮아요", "Not now"),
          onClick: () => answer(item, "dismiss"),
        },
        {
          disabled: decide.isPending,
          key: "approve",
          label: c("진행하기", "Go ahead"),
          onClick: () => answer(item, "approve"),
          primary: true,
        },
      ];
    }
    // Sent only to someone who may cancel; gone after a 403.
    if (item.kind === "harper_scheduled") {
      const scheduleId = item.scheduleId;
      const issue = scheduleId ? cancelIssues[scheduleId] : undefined;
      if (!scheduleId || issue === "forbidden") return [];
      return [
        {
          disabled: cancelSchedule.isPending || issue === "stale_again",
          key: "cancel",
          label: c("취소", "Cancel"),
          onClick: () =>
            cancelSchedule.mutate(
              {
                expectedRevision: item.scheduleRevision ?? 0,
                scheduleId,
              },
              {
                onSettled: onChanged,
                onError: (error) =>
                  setCancelIssues((current) => ({
                    ...current,
                    [scheduleId]: cancelIssueAfter(error, current[scheduleId]),
                  })),
                onSuccess: () =>
                  setCancelIssues(({ [scheduleId]: _done, ...rest }) => rest),
              }
            ),
        },
      ];
    }
    if (item.kind === "criteria_proposal") {
      // Applying saves the change to the Brief; dismissing records it.
      const proposalId = item.id.slice("criteria:".length);
      const answerWith = (action: "accept" | "dismiss") => () =>
        answerProposal.mutate({ action, proposalId }, { onSettled: onChanged });
      return [
        {
          disabled: answerProposal.isPending,
          key: "dismiss",
          label: c("괜찮아요", "Not now"),
          onClick: answerWith("dismiss"),
        },
        {
          disabled: answerProposal.isPending,
          key: "accept",
          label: c("반영하기", "Apply"),
          onClick: answerWith("accept"),
          primary: true,
        },
      ];
    }
    if (item.kind === "memory_proposal") {
      return [
        {
          key: "answer",
          label: c("채팅에서 답하기", "Answer in chat"),
          onClick: () => onNavigate?.(),
          primary: true,
        },
      ];
    }
    const read: OrgTodoAct = {
      key: "read",
      label: c("읽음", "Mark read"),
      onClick: () => markRead.mutate(item.id, { onSettled: onChanged }),
    };
    const href = itemHref(item, roleId, workspaceId);
    if (item.kind === "unanswered_message" && href) {
      // Set aside, the message goes back to its 알림 line until the candidate
      // writes again.
      return [
        {
          href,
          key: "reply",
          label: c("답하기", "Reply"),
          onClick: () => onNavigate?.(),
          primary: true,
        },
        { ...read, key: "dismiss", label: c("답 안 해도 돼요", "No reply needed") },
      ];
    }
    if (!href) return item.column === "notice" ? [read] : [];
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
    const view: OrgTodoAct = {
      href,
      key: "view",
      label: item.answeredBy
        ? c("대화 열기", "Open chat")
        : (labels[item.kind] ?? c("보기", "View")),
      onClick: () => onNavigate?.(),
      primary: true,
    };
    return item.column === "notice" ? [view, read] : [view];
  };
  // The buttons a row needs, as the small dark pills of the list above the chat.
  const action = (item: OrgTodoItem) => {
    const list = acts(item);
    if (!list.length) return null;
    return (
      <>
        {list.map((act) =>
          act.href ? (
            <MuteButton asChild key={act.key} size="sm" variant="dark">
              <Link href={act.href} onClick={act.onClick} shallow>
                {act.label}
              </Link>
            </MuteButton>
          ) : (
            <MuteButton
              disabled={act.disabled}
              key={act.key}
              onClick={act.onClick}
              size="sm"
              type="button"
              variant="dark"
            >
              {act.label}
            </MuteButton>
          )
        )}
      </>
    );
  };
  // The same buttons in the candidate side's follow-up style: the step forward
  // as words with an arrow, the other answers as small quiet words.
  const actionParts = (item: OrgTodoItem): OrgTodoActionParts => {
    const list = acts(item);
    const forward = list.find((act) => act.primary);
    return {
      primary: forward ? <OrgTodoGo act={forward} /> : null,
      secondary: list
        .filter((act) => !act.primary)
        .map((act) => <OrgTodoQuiet act={act} key={act.key} />),
      trailing:
        item.kind === "suggestion" ? (
          <OrgTodoQuiet
            act={{
              disabled: decide.isPending,
              key: "mute",
              label: c("이런 제안 그만", "Stop suggesting this"),
              onClick: () => answer(item, "mute"),
            }}
          />
        ) : undefined,
    };
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
  return { action, actionParts, answer, decide, detail };
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
  variant = "rows",
  workspaceId,
}: {
  columns: OrgTodoColumn[];
  /** Sends the approved plan to the Role chat as the team's message. */
  onApprove: (message: string) => void;
  onNavigate?: () => void;
  range: "all" | "recent";
  roleId: string;
  /** "cards": the role screen's right column, in the candidate side's card style. */
  variant?: "rows" | "cards";
  workspaceId: string;
}) {
  const { c, locale } = useOrgLocale();
  const todo = useOrgRoleTodo({ range, roleId, workspaceId });
  const { action, actionParts, decide, detail } = useOrgTodoActions({
    onApprove,
    onNavigate,
    roleId,
    workspaceId,
  });
  const items = todo.data?.items ?? [];
  const suggestions = todo.data?.suggestions ?? 0;
  const headings = orgTodoHeadings(c);
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
        detail={detail}
        headings={headings}
        items={items}
        parts={actionParts}
        people={(item) => orgTodoItemDescription(item, c, locale)}
        suggestionCount={suggestions}
        text={(item) => itemText(item, c, locale)}
        title={(item) => itemTitle(item, c, locale)}
        when={(item) => orgTodoItemWhen(item, locale)}
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
        // Harper's suggestions are counted apart from the lines (see the API).
        const count = column === "suggestion" ? suggestions : group.length;
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
                  detail={
                    detail(item) ??
                    (item.kind === "unanswered_message"
                      ? orgTodoItemDescription(item, c, locale)
                      : undefined)
                  }
                  icon={ORG_TODO_COLUMN_ICON[column]}
                  key={item.id}
                  title={itemTitle(item, c, locale)}
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
 * input, so the list opens above them as wide as the chat. The requests the
 * team can always make sit as chips beside it.
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
  /** Requests the team can always make, as chips beside the To-do chip. */
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
          <div
            className="mx-auto flex w-full max-w-[1120px] flex-wrap gap-2 px-4 pt-2 md:mb-1 md:px-5 md:pt-0"
            data-org-todo-shortcuts
          >
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
            <OrgTodoShortcutChips shortcuts={shortcuts} />
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
            workspaceId={workspaceId}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
