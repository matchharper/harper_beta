import type { OrgInboxCounts } from "./inboxPagination";

/**
 * The company's To-do ("what's happening now") for one or more Roles, read
 * from records Harper already keeps. Columns follow who has to act: the
 * company must act or the work stops (my_turn), something stopped Harper and
 * clears itself once fixed (blocked), Harper or the candidate is on it
 * (in_progress), Harper will do it at a set time (scheduled), the candidate
 * did something (notice), Harper or the team finished it (done). Only
 * my_turn is counted.
 *
 * One fact sits in one section. Work that has started and is not finished
 * shows only under in_progress; when it ends, one line of the outcome goes
 * to notice (what the candidate did) or done.
 */
export type OrgTodoColumn =
  | "notice"
  | "my_turn"
  | "blocked"
  | "suggestion"
  | "in_progress"
  | "scheduled"
  | "done";

/** Where the item came from, when the record says so. */
export type OrgTodoSource = "web" | "slack" | "email" | "harper";

export type OrgTodoKind =
  // my_turn
  | "pending_connection"
  | "company_intro"
  | "contact_draft"
  | "contact_failed"
  | "role_start"
  | "memory_proposal"
  | "interview_missing"
  // blocked: each clears itself once the cause is gone
  | "search_failed"
  | "slack_delivery_error"
  | "intros_empty"
  // suggestion, then in_progress and done once approved
  | "suggestion"
  | "suggestion_running"
  | "suggestion_done"
  /** Harper's suggested criteria change from pass reasons (S2 G). */
  | "criteria_proposal"
  // in_progress
  | "intro_waiting"
  | "request_sending"
  | "request_waiting"
  | "request_answered"
  | "meeting_waiting"
  | "search_running"
  | "external_search_running"
  | "role_start_working"
  // scheduled
  | "scheduled_search"
  | "harper_scheduled"
  // notice
  | "intro_accepted"
  | "intro_declined"
  | "candidate_message"
  | "candidate_response"
  | "meeting_confirmed"
  | "meeting_soon"
  // done
  | "intro_sent"
  | "meeting_requested"
  | "message_delivered"
  | "followup_sent"
  | "brief_changed"
  | "search_done";

export type OrgTodoItem = {
  /** Unique within its Role; (roleId, id) is unique across a workspace. */
  id: string;
  roleId?: string;
  column: OrgTodoColumn;
  kind: OrgTodoKind;
  /** When it happened, or when it was asked for. */
  at: string | null;
  count?: number;
  /** A few of the people behind a count, with when each started waiting. */
  people?: Array<{ name: string; since: string | null }>;
  talent?: {
    id: string;
    name: string;
    recommendationId: string | null;
  } | null;
  /**
   * A short fact the item needs: the request type (question, resume,
   * contact), the Role start step, a Brief change summary, a message kind.
   */
  detail?: string | null;
  /**
   * Harper's own words for it, when Harper wrote them: a finished search's
   * result line. Shown instead of the fixed wording.
   */
  note?: string | null;
  /** The next thing on the clock: a follow-up, a meeting, the next search. */
  nextAt?: string | null;
  source?: OrgTodoSource | null;
  /** A Harper suggestion the team can approve, dismiss or mute. */
  suggestionId?: string;
  /**
   * Harper's scheduled work the team can cancel (with its current revision).
   * Sent only to someone who may cancel it.
   */
  scheduleId?: string;
  scheduleRevision?: number;
  /** paused: it does not run until resumed, so it has no next time. */
  scheduleStatus?: "active" | "paused";
  /** Who set up Harper's scheduled work: Harper on its own, or the team. */
  scheduledBy?: "harper" | "team" | null;
};

/** Each Role's numbers, the same ones the inbox and Home show. */
export type OrgNowRole = {
  roleId: string;
  counts: OrgInboxCounts;
  oldestWaitingSince: string | null;
  /** null: no scheduled search for this Role. */
  nextScheduledSearchAt: string | null;
  /** Intros left for this Role; null when unlimited or unknown. */
  introsLeft: number | null;
};

export type OrgTodoResponse = {
  items: OrgTodoItem[];
  myTurn: number;
  /** Open suggestions, shown apart from the count. */
  suggestions: number;
  roles: OrgNowRole[];
};

export const ORG_TODO_COLUMNS: OrgTodoColumn[] = [
  "my_turn",
  "blocked",
  "notice",
  "suggestion",
  "in_progress",
  "scheduled",
  "done",
];

/** Notices and finished work older than this leave the board. */
export const ORG_TODO_RECENT_DAYS = 7;

/** Suggestions shown at once; older open ones wait their turn. */
export const ORG_TODO_SUGGESTIONS_SHOWN = 3;

/**
 * The chip number: things to do, not people. "연결을 기다리는 후보 5명" is one
 * thing to do, so a long list of suggested candidates does not drown the rest.
 */
export function orgTodoMyTurn(items: OrgTodoItem[]) {
  return items.filter((item) => item.column === "my_turn").length;
}

/**
 * The number on the To-do chip: things to do, what is blocked, and unread
 * updates. Counted from the list itself, so 읽음 lowers it at once.
 */
export function orgTodoBadge(items: OrgTodoItem[]) {
  return items.filter(
    (item) =>
      item.column === "my_turn" ||
      item.column === "blocked" ||
      item.column === "notice"
  ).length;
}
