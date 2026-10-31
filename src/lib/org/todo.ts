/**
 * The company's To-do for one Role, read from records Harper already keeps.
 * Columns follow who has to act: the company must act or the work stops
 * (my_turn), Harper or the candidate is on it (in_progress), the candidate
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
  | "suggestion"
  | "in_progress"
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
  // suggestion, then in_progress and done once approved
  | "suggestion"
  | "suggestion_running"
  | "suggestion_done"
  // in_progress
  | "intro_waiting"
  | "request_sending"
  | "request_waiting"
  | "request_answered"
  | "meeting_waiting"
  | "search_running"
  | "scheduled_search"
  | "role_start_working"
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
  id: string;
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
  /** The next thing on the clock: a follow-up, a meeting, the next search. */
  nextAt?: string | null;
  source?: OrgTodoSource | null;
  /** A Harper suggestion the team can approve, dismiss or mute. */
  suggestionId?: string;
};

export type OrgTodoResponse = {
  items: OrgTodoItem[];
  myTurn: number;
  /** Open suggestions, shown apart from the count. */
  suggestions: number;
};

export const ORG_TODO_COLUMNS: OrgTodoColumn[] = [
  "my_turn",
  "notice",
  "suggestion",
  "in_progress",
  "done",
];

/** Notices and finished work older than this leave the board. */
export const ORG_TODO_RECENT_DAYS = 7;

/** Suggestions shown at once; older open ones wait their turn. */
export const ORG_TODO_SUGGESTIONS_SHOWN = 3;

/**
 * The chip number: things to do, not people. "연결 수락한 후보 5명" is one
 * thing to do, so a long list of suggested candidates does not drown the rest.
 */
export function orgTodoMyTurn(items: OrgTodoItem[]) {
  return items.filter((item) => item.column === "my_turn").length;
}

/**
 * The number on the To-do chip: things to do plus unread updates.
 * Counted from the list itself, so 읽음 lowers it at once.
 */
export function orgTodoBadge(items: OrgTodoItem[]) {
  return items.filter(
    (item) => item.column === "my_turn" || item.column === "notice"
  ).length;
}
