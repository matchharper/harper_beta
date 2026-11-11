import type { User } from "@supabase/supabase-js";
import { readRoleMatchingActivity } from "@/lib/companyFirstSearch/activity.server";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { fetchOrgHomeActivityPage } from "./homeActivity.server";
import type { OrgHomeActivityKind } from "./homeActivity";
import { creditSlotForRole, type BillingCreditSlot } from "./billing/types";
import {
  readNextScheduledSearches,
  readOrgDecisionCounts,
  type OrgRoleDecisionRead,
} from "./decisionCounts.server";
import {
  readRoleTodoSuggestions,
  readTodoReads,
} from "./todoSuggestions.server";
import { getOrgRoleStatusFilterValue } from "./roleStatus";
import { fetchOrgBoard, fetchRoleRowsForWorkspace } from "./server";
import { readSearchRunNotes } from "./searchRunNote";
import {
  answeredByOf,
  applyCandidateConversations,
  candidateMessageExcerpt,
  CONVERSATION_EVENTS,
  readCandidateConversations,
  readMailboxConversations,
  requestsAnsweredInMailbox,
  isMailboxKey,
  type AnsweredBy,
  type ConversationRow,
  type MailboxRow,
} from "./candidateConversationTodo";
import {
  ORG_TODO_RECENT_DAYS,
  ORG_TODO_SUGGESTIONS_SHOWN,
  orgTodoMyTurn,
  type OrgTodoItem,
  type OrgTodoKind,
  type OrgTodoResponse,
  type OrgTodoSource,
} from "./todo";
import { untypedTable } from "./untypedTable";

type Admin = ReturnType<typeof getSupabaseAdmin>;
type Talent = NonNullable<OrgTodoItem["talent"]>;

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;
const MEETING_SOON_MS = 72 * 60 * 60 * 1000;
const ALL_LIMIT = 200;
/** Stages where the company and the candidate are already working together. */
const IN_PROCESS_TAGS = ["내부:연결대기", "내부:연결됨", "내부:최종오퍼"];
/** Names shown under a grouped item such as "연결을 기다리는 후보 5명". */
const PEOPLE_SHOWN = 3;
/** A connection with no interview arranged through Harper after this long. */
const INTERVIEW_NUDGE_DAYS = 3;
/** A draft or failed request untouched this long is no longer a to-do. */
const STALE_REQUEST_DAYS = 30;
/**
 * Company requests from creation to the company seeing the answer. Sent and
 * not yet answered, answered and being passed on: all still under way.
 */
const REQUEST_IN_PROGRESS = [
  "queued",
  "awaiting_talent",
  "relay_queued",
  "review_required",
];
/** Feed events that say the team or Harper sent something to a candidate. */
const SENT_REQUEST_EVENTS = new Set<OrgHomeActivityKind>([
  "company_question",
  "company_message",
  "company_resume_request",
]);

function time(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** The feed's events for the Role, newest first, back to `since`. */
async function readActivity(args: {
  admin: Admin;
  user: User;
  workspaceId: string;
  roleId: string;
  locale: "ko" | "en";
  since: string;
  all: boolean;
}) {
  const events: Awaited<ReturnType<typeof fetchOrgHomeActivityPage>>["items"] =
    [];
  let cursor: string | undefined;
  do {
    const page = await fetchOrgHomeActivityPage({
      admin: args.admin,
      user: args.user,
      workspaceId: args.workspaceId,
      roleId: args.roleId,
      cursor,
      kind: "all",
      search: "",
      locale: args.locale,
      // The To-do has its own lines for Harper's work.
      includeHarper: false,
    });
    events.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    const oldest = page.items.at(-1)?.createdAt ?? "";
    if (!args.all || oldest < args.since) break;
  } while (cursor && events.length < ALL_LIMIT);
  return events;
}

/**
 * Feed events by section. 알림 holds what candidates did that needs nothing
 * from the team. A new Waiting to connect needs the team's decision, so it is
 * counted under 할 일 only, never also as an update. What the team or Harper
 * sent goes to 한 일 once the wait for the answer is over; while it lasts,
 * the waiting line under 진행 중 says it.
 */
const ACTIVITY_COLUMN: Partial<
  Record<
    OrgHomeActivityKind,
    { column: OrgTodoItem["column"]; kind: OrgTodoKind }
  >
> = {
  intro_accepted: { column: "notice", kind: "intro_accepted" },
  candidate_message: { column: "notice", kind: "candidate_message" },
  candidate_response: { column: "notice", kind: "candidate_response" },
  meeting_confirmed: { column: "notice", kind: "meeting_confirmed" },
  intro_sent: { column: "done", kind: "intro_sent" },
  meeting_requested: { column: "done", kind: "meeting_requested" },
  company_question: { column: "done", kind: "message_delivered" },
  company_message: { column: "done", kind: "message_delivered" },
  company_resume_request: { column: "done", kind: "message_delivered" },
};

// What each read below selects; see untypedTable for why it is stated here.
type IntroRow = {
  candidate_sent_at: string | null;
  id: string;
  recommendation_id: string | null;
  requested_at: string | null;
  selected_at: string | null;
  status: string;
  talent_id: string;
};
type RequestRow = {
  contact_kind: string | null;
  created_at: string;
  expects_document: boolean | null;
  id: string;
  ops_only: boolean | null;
  recommendation_id: string | null;
  source_company_message_id: number | string | null;
  talent_id: string;
  updated_at: string | null;
  workflow_status: string;
};
type FollowupRow = {
  due_at: string | null;
  id: string;
  recommendation_id: string | null;
  source_id: string | null;
  source_kind: string | null;
  status: string;
  talent_id: string;
  updated_at: string;
};
type MeetingRow = {
  confirmed_start_at: string | null;
  id: string;
  recommendation_id: string | null;
  round: { id: string; status: string; updated_at: string | null } | null;
  status: string;
  talent_id: string;
};
type RunRow = {
  continuation_job_id: string | null;
  finished_at: string | null;
  id: string;
  status: string;
  trigger_reason: string | null;
};
type DeclinedRow = {
  id: string;
  talent_decision_at: string | null;
  talent_id: string;
};
type ConnectedTagRow = { talent_id: string; updated_at: string };
type TalentIdRow = { talent_id: string };
type WithdrawnRow = { user_id: string; name: string | null; deleted_at: string };
type MessageRow = { id: number | string; slack_thread_id: string | null };
type IdRow = { id: string };
type ProposalRow = {
  created_at: string;
  id: string;
  scope_key: string;
  summary: string | null;
};
type BriefChangeRow = {
  created_at: string;
  id: string;
  source: string | null;
  summary: string | null;
  summary_status: string | null;
};
type SelectedRow = { selection_run_id: string };
export type OperationRow = {
  created_at: string;
  external: Array<{ trigger: string | null }> | { trigger: string | null } | null;
  finished_at: string | null;
  id: string;
  kind: string;
  status: string;
};
export type OutboxRow = {
  delivery_channel: string | null;
  status: string;
  updated_at: string;
};
type SlackChannelRow = { id: string; slack_team_id: string };
/** Workspace facts read once for every Role on the To-do. */
type WorkspaceFacts = {
  /** Enabled Slack channels. */
  slackChannels: SlackChannelRow[];
  /** Slack teams whose Harper app is connected (active, with a token). */
  activeSlackTeams: Set<string>;
};

function rows<T>(response: { data: unknown; error: unknown }): T[] {
  if (response.error) throw response.error;
  return (response.data ?? []) as T[];
}

/** A read the To-do can do without: a failure leaves its lines out. */
function optionalRows<T>(
  label: string,
  response: { data: unknown; error: unknown }
): T[] {
  if (response.error) {
    console.warn("[org/todo]", { label, error: response.error });
    return [];
  }
  return (response.data ?? []) as T[];
}

/**
 * Running external searches (in progress) and what blocks a Role (blocked).
 * Each blocked item clears itself once its cause is gone: a later successful
 * search, a working Slack delivery, or intros to spend. Rows are newest first.
 */
export function roleSearchAndBlockedItems(args: {
  operations: OperationRow[];
  outbox: OutboxRow[];
  optOuts: Array<{ channel_id: string }>;
  workspace: Pick<WorkspaceFacts, "slackChannels" | "activeSlackTeams">;
  introsLeft: number | null;
  pendingCount: number;
  /** People to request a connection with: requesting uses an intro too. */
  toRequestCount?: number;
}): OrgTodoItem[] {
  const found: OrgTodoItem[] = [];
  // Member and external searches: running external search, and the latest
  // finished search of each kind that failed. A later success clears it.
  const operationRows = args.operations.filter(
    (row) => {
      const external = Array.isArray(row.external) ? row.external[0] : row.external;
      return external?.trigger !== "shadow";
    }
  );
  const externalRunning = operationRows.find(
    (row) =>
      row.kind === "external_search" &&
      (row.status === "queued" || row.status === "running")
  );
  if (externalRunning) {
    found.push({
      id: `external-search:${externalRunning.id}`,
      column: "in_progress",
      kind: "external_search_running",
      at: externalRunning.created_at,
      source: "harper",
    });
  }
  for (const kind of ["member_search", "external_search"]) {
    const latest = operationRows.find(
      (row) =>
        row.kind === kind &&
        ["succeeded", "completed", "failed"].includes(row.status)
    );
    if (latest?.status !== "failed") continue;
    found.push({
      id: `search-failed:${kind}`,
      column: "blocked",
      kind: "search_failed",
      at: latest.finished_at ?? latest.created_at,
      detail: kind,
      source: "harper",
    });
  }
  // Slack delivery: a channel this Role posts to whose Slack app is not
  // connected, or the newest Slack delivery failed. Clears once it works.
  const optedOut = new Set(args.optOuts.map((row) => String(row.channel_id)));
  const disconnected = args.workspace.slackChannels.some(
    (channel) =>
      !optedOut.has(String(channel.id)) &&
      !args.workspace.activeSlackTeams.has(channel.slack_team_id)
  );
  const lastSlackDelivery = args.outbox.find(
    (row) => (row.delivery_channel ?? "slack") === "slack"
  );
  if (disconnected || lastSlackDelivery?.status === "failed") {
    found.push({
      id: "slack-delivery",
      column: "blocked",
      kind: "slack_delivery_error",
      at: disconnected ? null : (lastSlackDelivery?.updated_at ?? null),
      detail: disconnected ? "integration" : "send",
    });
  }
  // No intros left while candidates wait for a decision: waiting to connect
  // first, else people to request (both use an intro).
  const toRequest = args.pendingCount > 0 ? 0 : (args.toRequestCount ?? 0);
  if (args.introsLeft === 0 && (args.pendingCount > 0 || toRequest > 0)) {
    found.push({
      id: "intros-empty",
      column: "blocked",
      kind: "intros_empty",
      at: null,
      count: args.pendingCount || toRequest,
      ...(toRequest ? { detail: "company_intro" } : {}),
    });
  }
  return found;
}

/**
 * Everything on one Role's To-do, from the records each feature already
 * writes. Candidates go through the board's visibility (team access,
 * test-only, deleted profiles), so the To-do never shows someone the inbox
 * would hide. The decision numbers come from readOrgDecisionCounts; this
 * function does not count candidates itself.
 */
async function loadRoleTodoItems(args: {
  admin: Admin;
  user: User;
  workspaceId: string;
  roleId: string;
  locale: "ko" | "en";
  range: "all" | "recent";
  now: Date;
  decision: OrgRoleDecisionRead;
  /** undefined: could not be read, so nothing is said about it. */
  nextScheduledSearchAt: string | null | undefined;
  introsLeft: number | null;
  workspace: WorkspaceFacts;
  canManage: boolean;
}): Promise<{ items: OrgTodoItem[]; suggestions: number }> {
  const { admin, user, workspaceId, roleId, now, decision } = args;
  const all = args.range === "all";
  const since = all
    ? new Date(0).toISOString()
    : new Date(now.getTime() - ORG_TODO_RECENT_DAYS * DAY_MS).toISOString();
  const limit = all ? ALL_LIMIT : 10;

  const [
    intros,
    requests,
    followups,
    meetings,
    session,
    conversations,
    threads,
    operations,
    outbox,
    optOuts,
    matching,
    activity,
    briefChanges,
    runs,
    suggestionRows,
    connectedTags,
    reads,
    declined,
    conversationRows,
    inProcessTags,
    inProcessIntros,
    mailboxRows,
  ] = await Promise.all([
    untypedTable(admin, "company_intro_candidates")
      .select(
        "id,talent_id,recommendation_id,status,requested_at,candidate_sent_at,selected_at"
      )
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      // Once the candidate accepts (connecting), 알림 says so; the short
      // step of sending the intro email is not a second line.
      .in("status", ["awaiting_talent"]),
    untypedTable(admin, "company_talent_requests")
      .select(
        "id,talent_id,recommendation_id,workflow_status,contact_kind,expects_document,source_company_message_id,created_at,updated_at,ops_only"
      )
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .in("workflow_status", ["draft", "failed", ...REQUEST_IN_PROGRESS]),
    untypedTable(admin, "company_talent_followups")
      .select(
        "id,talent_id,recommendation_id,source_kind,source_id,status,due_at,updated_at"
      )
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .or(`status.eq.pending,and(status.eq.delivered,updated_at.gte.${since})`),
    untypedTable(admin, "meeting_schedules")
      .select(
        "id,talent_id,recommendation_id,status,confirmed_start_at,round:meeting_schedule_rounds!meeting_schedules_active_round_id_fkey(id,status,updated_at)"
      )
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId),
    untypedTable(admin, "company_role_start_sessions")
      .select("phase,updated_at")
      .eq("role_id", roleId)
      .maybeSingle(),
    untypedTable(admin, "company_conversations")
      .select("id")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId),
    untypedTable(admin, "company_slack_threads")
      .select("id")
      .eq("role_id", roleId),
    // Member and external searches on this Role, newest first (operation ledger).
    untypedTable(admin, "company_agent_operations")
      .select("id,kind,status,created_at,finished_at,external:external_sourcing_runs(trigger)")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .order("created_at", { ascending: false })
      .limit(20),
    // Candidate deliveries for this Role, newest first.
    untypedTable(admin, "company_first_slack_outbox")
      .select("status,delivery_channel,updated_at")
      .eq("company_workspace_id", workspaceId)
      .contains("role_ids", [roleId])
      .in("status", ["sent", "failed"])
      .order("updated_at", { ascending: false })
      .limit(20),
    untypedTable(admin, "company_role_notification_channels")
      .select("channel_id")
      .eq("role_id", roleId),
    readRoleMatchingActivity({ admin, workspaceId, roleId }),
    readActivity({
      admin,
      user,
      workspaceId,
      roleId,
      locale: args.locale,
      since,
      all,
    }),
    untypedTable(admin, "company_role_hiring_brief_history")
      .select("id,created_at,source,summary,summary_status")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    untypedTable(admin, "company_first_search_runs")
      .select(
        "id,status,trigger_reason,finished_at,continuation_job_id:result->scheduledContinuation->>jobId"
      )
      .eq("company_workspace_id", workspaceId)
      .or(
        `role_id.eq.${roleId},scheduled_role_ids.cs.{${roleId}},requested_role_ids.cs.{${roleId}}`
      )
      .in("status", ["succeeded", "completed"])
      .gte("finished_at", since)
      .order("finished_at", { ascending: false })
      .limit(limit),
    readRoleTodoSuggestions({ admin, workspaceId, roleId, since, now }),
    untypedTable(admin, "talent_opportunity_tag")
      .select("talent_id,updated_at")
      .eq("opportunity_id", roleId)
      .eq("tag", "내부:연결됨")
      .order("updated_at", { ascending: false })
      .limit(200),
    readTodoReads({ admin, roleId, userId: user.id }),
    // A candidate who said no to the company's intro: the end of that wait.
    untypedTable(admin, "company_intro_candidates")
      .select("id,talent_id,talent_decision_at")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .eq("close_reason", "talent_declined")
      .gte("talent_decision_at", since)
      .order("talent_decision_at", { ascending: false })
      .limit(limit),
    // Each candidate's conversation with the company, newest first: who
    // wrote last decides whether the company still has to answer.
    untypedTable(admin, "talent_progress")
      .select("id,talent_id,created_at,metadata")
      .eq("role_id", roleId)
      .eq("kind", "org_candidate_activity")
      .eq("open_to_company", true)
      .in("metadata->>eventType", CONVERSATION_EVENTS)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ALL_LIMIT),
    untypedTable(admin, "talent_opportunity_tag")
      .select("talent_id")
      .eq("opportunity_id", roleId)
      .in("tag", IN_PROCESS_TAGS)
      .limit(ALL_LIMIT),
    // Withdrawing closes an open intro as privacy_withdrawn.
    untypedTable(admin, "company_intro_candidates")
      .select("talent_id")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .not("requested_at", "is", null)
      .or(
        "status.in.(awaiting_talent,connecting,connected),close_reason.eq.privacy_withdrawn"
      )
      .limit(ALL_LIMIT),
    // Messages between this Role's company agent and candidates' Harper.
    readMailboxRows({ admin, workspaceId, roleId, since }),
  ]);

  const introRows = rows<IntroRow>(intros);
  const requestRows = rows<RequestRow>(requests).filter(
    (row) => row.ops_only !== true
  );
  // A request from before the agent mailbox that the candidate has since
  // answered there no longer waits (its answer reached the company's agent).
  const answeredInMailbox = await readRequestsAnsweredInMailbox({
    admin,
    workspaceId,
    roleId,
    requests: requestRows,
  });
  const followupRows = rows<FollowupRow>(followups);
  const meetingRows = rows<MeetingRow>(meetings);
  const runRows = rows<RunRow>(runs);
  const declinedRows = rows<DeclinedRow>(declined);
  // Someone the team was working with who left Harper is gone from the board,
  // so this line is the only word the team gets.
  const inProcessIds = Array.from(
    new Set(
      [
        ...optionalRows<TalentIdRow>("in_process_tags", inProcessTags),
        ...optionalRows<TalentIdRow>("in_process_intros", inProcessIntros),
      ].map((row) => row.talent_id)
    )
  );
  const withdrawnRows = inProcessIds.length
    ? optionalRows<WithdrawnRow>(
        "withdrawn_in_process",
        await untypedTable(admin, "talent_users")
          .select("user_id,name,deleted_at")
          .in("user_id", inProcessIds)
          .gte("deleted_at", since)
          .order("deleted_at", { ascending: false })
          .limit(limit)
      )
    : [];
  // Candidates' messages of the last days nobody on the company side answered.
  // Waiting lines use the recent window in both views, like the cards above.
  const mailbox = readMailboxConversations(mailboxRows, {
    now,
    days: ORG_TODO_RECENT_DAYS,
  });
  const waitingOnCompany = readCandidateConversations(
    [
      ...optionalRows<ConversationRow>("candidate_conversations", conversationRows),
      ...mailbox.conversationRows,
    ],
    { now, days: ORG_TODO_RECENT_DAYS }
  );

  // The few names shown under a grouped item: who has waited longest for
  // the company's decision, and the newest suggested candidates. Both come
  // from the same people the decision numbers count.
  const pendingPeople = decision.waiting.map((row) => ({
    talentId: row.talentId,
    at: row.since ?? "",
  }));
  const readyPeople = decision.toRequest.map((row) => ({
    talentId: row.talentId,
    at: row.at ?? "",
  }));
  // Connected candidates with no interview arranged through Harper yet.
  const connectedSince = new Map<string, string>();
  for (const tag of rows<ConnectedTagRow>(connectedTags)) {
    if (!connectedSince.has(tag.talent_id))
      connectedSince.set(tag.talent_id, tag.updated_at);
  }
  const withMeeting = new Set(meetingRows.map((row) => String(row.talent_id)));

  // Names and links come from the board, so hidden candidates stay hidden.
  const talentIds = Array.from(
    new Set(
      [
        // Suggested (ready) intros are named through readyPeople below.
        ...[
          ...introRows.filter((row) => row.status !== "ready"),
          ...requestRows,
          ...followupRows,
          ...meetingRows,
          ...declinedRows,
        ].map((row) => String(row.talent_id ?? "")),
        ...suggestionRows.flatMap((row) => row.talent_ids ?? []),
        ...pendingPeople.slice(0, PEOPLE_SHOWN).map((row) => row.talentId),
        ...readyPeople.slice(0, PEOPLE_SHOWN).map((row) => row.talentId),
        ...[...connectedSince.keys()].filter((id) => !withMeeting.has(id)),
        ...waitingOnCompany.unanswered.map((row) => row.talentId),
        ...mailbox.waiting.map((row) => row.talent_id),
      ].filter(Boolean)
    )
  );
  const talents = new Map<string, Talent>();
  const stageOf = new Map<string, string>();
  if (talentIds.length) {
    const board = await fetchOrgBoard({
      admin,
      user,
      workspaceId,
      roleId,
      talentIds,
      includeProfileLabels: false,
      includeInternalStages: false,
    });
    for (const item of board.items) {
      stageOf.set(item.talentId, String(item.stage));
      talents.set(item.talentId, {
        id: item.talentId,
        name: item.talent.name ?? "",
        recommendationId: item.recommendationId,
      });
    }
  }

  const items: OrgTodoItem[] = [];

  // 내 차례
  const people = (list: Array<{ talentId: string; at: string }>) =>
    list
      .filter((row) => talents.has(row.talentId))
      .slice(0, PEOPLE_SHOWN)
      .map((row) => ({
        name: talents.get(row.talentId)!.name,
        since: row.at || null,
      }));
  const pendingCount = decision.counts.pending_connection;
  if (pendingCount) {
    items.push({
      id: "pending_connection",
      column: "my_turn",
      kind: "pending_connection",
      at: null,
      count: pendingCount,
      people: people(pendingPeople),
    });
  }
  if (decision.counts.company_intro) {
    items.push({
      id: "company_intro",
      column: "my_turn",
      kind: "company_intro",
      at: null,
      count: decision.counts.company_intro,
      people: people(readyPeople),
    });
  }
  for (const [talentId, at] of connectedSince) {
    const talent = talents.get(talentId);
    if (
      !talent ||
      withMeeting.has(talentId) ||
      stageOf.get(talentId) !== "connected"
    )
      continue;
    if (now.getTime() - Date.parse(at) < INTERVIEW_NUDGE_DAYS * DAY_MS)
      continue;
    items.push({
      id: `interview-missing:${talentId}`,
      column: "my_turn",
      kind: "interview_missing",
      at,
      talent,
    });
  }

  // Which surface a company request was written in.
  const messageIds = [
    ...requestRows.map((row) => row.source_company_message_id),
    ...mailbox.waiting.map((row) =>
      row.source?.kind === "company" ? (row.source.messageId as number | string) : null
    ),
  ].filter((id): id is number | string => id !== null && id !== undefined);
  const messageSource = new Map<string, OrgTodoSource>();
  if (messageIds.length) {
    const messages = rows<MessageRow>(
      await untypedTable(admin, "company_messages")
        .select("id,slack_thread_id")
        .in("id", messageIds)
    );
    for (const message of messages) {
      messageSource.set(
        String(message.id),
        message.slack_thread_id ? "slack" : "web"
      );
    }
  }
  const nextFollowup = new Map<string, string>();
  for (const row of followupRows) {
    if (row.status !== "pending" || !row.due_at) continue;
    const current = nextFollowup.get(String(row.source_id));
    if (!current || row.due_at < current)
      nextFollowup.set(String(row.source_id), row.due_at);
  }

  for (const row of requestRows) {
    if (answeredInMailbox.has(String(row.id))) continue;
    const talent = talents.get(row.talent_id);
    if (!talent) continue;
    const base = {
      at: row.updated_at ?? row.created_at,
      detail: row.expects_document
        ? "resume"
        : String(row.contact_kind ?? "contact"),
      source: messageSource.get(String(row.source_company_message_id)) ?? null,
      talent,
    };
    const stale =
      now.getTime() - Date.parse(base.at) > STALE_REQUEST_DAYS * DAY_MS;
    if (
      stale &&
      (row.workflow_status === "draft" || row.workflow_status === "failed")
    )
      continue;
    if (row.workflow_status === "draft") {
      items.push({
        ...base,
        id: `contact-draft:${row.id}`,
        column: "my_turn",
        kind: "contact_draft",
      });
    } else if (row.workflow_status === "failed") {
      items.push({
        ...base,
        id: `contact-failed:${row.id}`,
        column: "my_turn",
        kind: "contact_failed",
      });
    } else {
      // Being sent, waiting for the answer, or answered and being passed on.
      const kind =
        row.workflow_status === "queued"
          ? "request_sending"
          : row.workflow_status === "awaiting_talent"
            ? "request_waiting"
            : "request_answered";
      items.push({
        ...base,
        id: `request:${row.id}`,
        column: "in_progress",
        kind,
        nextAt:
          kind === "request_waiting"
            ? (nextFollowup.get(String(row.id)) ?? null)
            : null,
      });
    }
  }

  // A message to a candidate's Harper with no answer yet in its conversation.
  for (const row of mailbox.waiting) {
    const talent = talents.get(row.talent_id);
    if (!talent) continue;
    items.push({
      id: `agent-request:${row.id}`,
      column: "in_progress",
      kind: "request_waiting",
      at: row.created_at,
      detail: "contact",
      source:
        row.source?.kind === "company"
          ? (messageSource.get(String(row.source.messageId)) ?? null)
          : "harper",
      talent,
      nextAt: null,
    });
  }

  const startSession = session.error
    ? null
    : (session.data as { phase?: string; updated_at?: string } | null);
  if (session.error) throw session.error;
  if (startSession?.phase) {
    const phase = startSession.phase;
    if (phase === "questions" || phase === "review" || phase === "evaluating") {
      items.push({
        id: "role-start",
        column: "my_turn",
        kind: "role_start",
        at: startSession.updated_at ?? null,
        detail: phase,
      });
    } else if (
      ["drafting", "searching", "registering", "batch"].includes(phase)
    ) {
      items.push({
        id: "role-start",
        column: "in_progress",
        kind: "role_start_working",
        at: startSession.updated_at ?? null,
        detail: phase,
      });
    }
  }

  const scopes = [
    ...rows<IdRow>(conversations).map((row) => `chat:${row.id}`),
    ...rows<IdRow>(threads).map((row) => `slack:${row.id}`),
  ];
  if (scopes.length) {
    // Pending proposals are few per workspace, while a Role can have
    // hundreds of Slack threads: match here rather than in the query URL.
    const roleScopes = new Set(scopes);
    const proposals = rows<ProposalRow>(
      await untypedTable(admin, "company_agent_update_proposals")
        .select("id,scope_key,summary,created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .gt("expires_at", now.toISOString())
        .order("created_at", { ascending: false })
        .limit(200)
    ).filter((proposal) => roleScopes.has(String(proposal.scope_key)));
    for (const proposal of proposals) {
      items.push({
        id: `memory:${proposal.id}`,
        column: "my_turn",
        kind: "memory_proposal",
        at: proposal.created_at,
        detail: String(proposal.summary ?? "").trim() || null,
        source: String(proposal.scope_key).startsWith("slack:")
          ? "slack"
          : "web",
      });
    }
  }

  // 진행 중
  for (const row of introRows) {
    if (row.status === "ready") continue;
    const talent = talents.get(row.talent_id);
    if (!talent) continue;
    items.push({
      id: `intro:${row.id}`,
      column: "in_progress",
      kind: "intro_waiting",
      at: row.candidate_sent_at ?? row.requested_at ?? null,
      detail: row.candidate_sent_at ? "awaiting_talent" : "preparing",
      nextAt: nextFollowup.get(String(row.id)) ?? null,
      talent,
    });
  }
  // One line per interview: "곧 인터뷰" replaces "일정이 잡혔어요" for the same
  // interview, and "인터뷰를 요청했어요" waits until the time is picked.
  const soonMeetings = new Set<string>();
  const waitingRounds = new Set<string>();
  for (const row of meetingRows) {
    const talent = talents.get(row.talent_id);
    if (!talent) continue;
    const start = row.confirmed_start_at
      ? Date.parse(row.confirmed_start_at)
      : NaN;
    if (row.status === "confirmed" && Number.isFinite(start)) {
      if (start > now.getTime() && start - now.getTime() <= MEETING_SOON_MS) {
        soonMeetings.add(String(row.id));
        items.push({
          id: `meeting-soon:${row.id}`,
          column: "notice",
          kind: "meeting_soon",
          at: row.confirmed_start_at,
          nextAt: row.confirmed_start_at,
          talent,
        });
      }
      continue;
    }
    if (row.round && ["queued", "sent"].includes(row.round.status)) {
      waitingRounds.add(String(row.round.id));
      items.push({
        id: `meeting:${row.id}`,
        column: "in_progress",
        kind: "meeting_waiting",
        at: row.round.updated_at ?? null,
        talent,
      });
    }
  }
  if (matching.activity) {
    items.push({
      id: "search-running",
      column: "in_progress",
      kind: "search_running",
      at: null,
      detail: matching.activity.trigger,
      source: matching.activity.trigger === "requested" ? null : "harper",
    });
  }
  items.push(
    ...roleSearchAndBlockedItems({
      operations: optionalRows<OperationRow>("operations", operations),
      outbox: optionalRows<OutboxRow>("outbox", outbox),
      optOuts: optionalRows<{ channel_id: string }>("notification_opt_outs", optOuts),
      workspace: args.workspace,
      introsLeft: args.introsLeft,
      pendingCount,
      toRequestCount: decision.counts.company_intro,
    })
  );
  // Harper's own scheduled work on this Role (not tied to an introduction):
  // the team sees when it runs and who set it up, and can cancel it. Paused
  // work does not run, so it has no next time and comes after the rest.
  const { data: schedules, error: schedulesError } = await untypedTable(admin, "company_agent_schedules")
    .select("id,revision,title,next_run_at,created_by,status,target_refs")
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .in("status", ["active", "paused"])
    .is("target_refs->>introductionRootId", null)
    .order("next_run_at", { ascending: true })
    .limit(20);
  if (schedulesError) throw schedulesError;
  const scheduleRows = ((schedules ?? []) as Array<Record<string, any>>)
    .filter((row) => !row.target_refs?.introductionRootId)
    .sort((left, right) => Number(left.status === "paused") - Number(right.status === "paused"));
  for (const row of scheduleRows) {
    const paused = row.status === "paused";
    items.push({
      id: `schedule:${row.id}`,
      column: "scheduled",
      kind: "harper_scheduled",
      at: null,
      nextAt: paused ? null : (row.next_run_at ?? null),
      detail: row.title ?? null,
      source: row.created_by === "agent" ? "harper" : null,
      scheduleStatus: paused ? "paused" : "active",
      scheduledBy: row.created_by === "agent" ? "harper" : row.created_by === "user" ? "team" : null,
      // Only someone who may cancel gets what cancelling needs.
      ...(args.canManage
        ? { scheduleId: String(row.id), scheduleRevision: Number(row.revision) }
        : {}),
    });
  }
  // The worker's own rule decides it (company_role_scheduled_search_v1).
  if (args.nextScheduledSearchAt) {
    items.push({
      id: "scheduled-search",
      column: "scheduled",
      kind: "scheduled_search",
      at: null,
      nextAt: args.nextScheduledSearchAt,
      source: "harper",
    });
  }

  // 제안: the newest few open ones; approved ones run, then count as done.
  let openSuggestions = 0;
  for (const row of suggestionRows) {
    const talentId = (row.talent_ids ?? []).find((id) => talents.has(id));
    const base = {
      detail: row.title,
      source:
        row.source === "slack" || row.source === "web" ? row.source : null,
      suggestionId: row.id,
      talent: talentId ? talents.get(talentId)! : null,
    } as const;
    if (row.status === "pending") {
      // A suggestion about candidates who have since moved on is no longer
      // the team's to answer: it leaves the To-do without a decision.
      const moved = Object.entries(row.talent_stages ?? {}).some(
        ([id, stage]) => stageOf.get(id) !== stage
      );
      if (moved) continue;
      openSuggestions += 1;
      if (openSuggestions > ORG_TODO_SUGGESTIONS_SHOWN) continue;
      items.push({
        ...base,
        id: `suggestion:${row.id}`,
        column: "suggestion",
        kind: "suggestion",
        at: row.created_at,
      });
    } else if (row.status === "approved") {
      items.push({
        ...base,
        id: `suggestion:${row.id}`,
        column: "in_progress",
        kind: "suggestion_running",
        at: row.decided_at,
      });
    } else if (row.status === "done" && (row.completed_at ?? "") >= since) {
      items.push({
        ...base,
        id: `suggestion:${row.id}`,
        column: "done",
        kind: "suggestion_done",
        at: row.completed_at,
      });
    }
  }
  // Harper's criteria suggestion from pass reasons (S2 G), with its other
  // suggestions. A read failure leaves it out rather than the whole To-do.
  const { readRoleCriteriaProposalItems } = await import("./criteriaProposals.server");
  const criteriaProposals = await readRoleCriteriaProposalItems({
    admin, workspaceId, roleId, locale: args.locale, now,
  }).catch((error) => {
    console.error("[org/todo:criteria-proposals]", error);
    return [];
  });
  items.push(...criteriaProposals);
  openSuggestions += criteriaProposals.length;

  // 알림, 한 일 (최근)
  // Still waiting for the candidate: the intro and each request under way.
  const waitingIntros = new Set(
    introRows
      .filter((row) => row.status === "awaiting_talent")
      .map((row) => String(row.id))
  );
  const requestsUnderWay = requestRows
    .filter((row) => !answeredInMailbox.has(String(row.id)))
    .filter((row) => REQUEST_IN_PROGRESS.includes(row.workflow_status))
    .map((row) => ({
      talentId: String(row.talent_id),
      since: time(row.created_at),
    }));
  // An event another line already says: a waiting line under 진행 중, or
  // "곧 인터뷰" for the same interview.
  const saidElsewhere = (event: (typeof activity)[number]) => {
    const [prefix, ...rest] = event.id.split(":");
    const id = rest.join(":");
    if (event.kind === "intro_sent")
      return prefix === "intro-sent" && waitingIntros.has(id);
    if (event.kind === "meeting_requested")
      return prefix === "meeting-requested" && waitingRounds.has(id);
    if (event.kind === "meeting_confirmed")
      return prefix === "meeting-confirmed" && soonMeetings.has(id);
    if (SENT_REQUEST_EVENTS.has(event.kind)) {
      // Sent for a request still under way: sent at or after it was made.
      const at = time(event.createdAt);
      return requestsUnderWay.some(
        (row) =>
          row.talentId === event.talentId &&
          (row.since === null || at === null || at >= row.since - 1000)
      );
    }
    return false;
  };
  for (const event of activity) {
    const place = ACTIVITY_COLUMN[event.kind];
    if (!place || event.createdAt < since || saidElsewhere(event)) continue;
    items.push({
      id: `activity:${event.id}`,
      column: place.column,
      kind: place.kind,
      at: event.createdAt,
      // The feed's own kind, so the To-do words it the way the feed does.
      detail: event.kind,
      nextAt: event.meetingStartsAt ?? null,
      talent: {
        id: event.talentId,
        name: event.talentName,
        recommendationId: event.recommendationId,
      },
    });
  }
  for (const row of declinedRows) {
    const talent = talents.get(row.talent_id);
    if (!talent || !row.talent_decision_at) continue;
    items.push({
      id: `intro-declined:${row.id}`,
      column: "notice",
      kind: "intro_declined",
      at: row.talent_decision_at,
      talent,
    });
  }
  for (const row of withdrawnRows) {
    items.push({
      id: `talent-withdrew:${row.user_id}`,
      column: "notice",
      kind: "talent_withdrew",
      at: row.deleted_at,
      talent: { id: row.user_id, name: row.name ?? "", recommendationId: null },
    });
  }
  for (const row of followupRows) {
    if (row.status !== "delivered") continue;
    const talent = talents.get(row.talent_id);
    if (!talent) continue;
    items.push({
      id: `followup:${row.id}`,
      column: "done",
      kind: "followup_sent",
      at: row.updated_at,
      detail: row.source_kind,
      talent,
      source: "harper",
    });
  }
  for (const row of rows<BriefChangeRow>(briefChanges)) {
    items.push({
      id: `brief:${row.id}`,
      column: "done",
      kind: "brief_changed",
      at: row.created_at,
      detail:
        row.summary_status === "ready" || row.summary
          ? String(row.summary ?? "").trim() || null
          : null,
      source: row.source === "signals" ? "harper" : null,
    });
  }
  if (runRows.length) {
    const [selectedResponse, notes] = await Promise.all([
      untypedTable(admin, "company_intro_candidates")
        .select("selection_run_id")
        .eq("company_workspace_id", workspaceId)
        .eq("role_id", roleId)
        .in(
          "selection_run_id",
          runRows.map((run) => run.id)
        ),
      readSearchRunNotes(admin, runRows),
    ]);
    const selected = rows<SelectedRow>(selectedResponse);
    for (const run of runRows) {
      items.push({
        id: `search:${run.id}`,
        column: "done",
        kind: "search_done",
        at: run.finished_at,
        count: selected.filter((row) => row.selection_run_id === run.id).length,
        detail: run.trigger_reason ?? null,
        note: notes.get(run.id) ?? null,
        source: run.trigger_reason === "company_requested" ? null : "harper",
      });
    }
  }

  // A candidate waiting for the company's answer: a card instead of its
  // 알림 lines, and on answered ones, who answered.
  const shown = new Set(items.map((item) => item.id));
  const details = await readConversationDetails({
    admin,
    workspaceId,
    relayIds: waitingOnCompany.unanswered
      .filter((row) => talents.has(row.talentId) && !reads.has(row.id))
      .map((row) => row.relayId)
      .filter((id): id is string => Boolean(id) && !isMailboxKey(id!)),
    requestIds: [...waitingOnCompany.answers]
      .filter(([messageId]) => shown.has(`activity:${messageId}`))
      .map(([, requestId]) => requestId)
      .filter((id): id is string => Boolean(id) && !isMailboxKey(id!)),
  });
  const withConversations = applyCandidateConversations({
    items,
    unanswered: waitingOnCompany.unanswered,
    answers: waitingOnCompany.answers,
    answeredBy: new Map([
      ...details.answeredBy,
      ...(await mailboxAnsweredBy(admin, mailbox.senders)),
    ]),
    dismissed: reads,
    talents,
    excerpts: new Map([...details.excerpts, ...mailbox.excerpts]),
  });

  // Updates this person marked as read leave their To-do.
  const visible = withConversations
    .filter((item) => item.column !== "notice" || !reads.has(item.id))
    .map((item) => ({ ...item, roleId }));
  return { items: visible, suggestions: openSuggestions };
}

/**
 * The Role's agent mailbox in the To-do window, each message with whether its
 * conversation was withdrawn. A read that fails leaves those lines out.
 */
async function readMailboxRows(args: {
  admin: Admin;
  workspaceId: string;
  roleId: string;
  since: string;
}): Promise<MailboxRow[]> {
  type Row = Omit<MailboxRow, "rootCancelled">;
  const messages = optionalRows<Row>(
    "agent_mailbox",
    await untypedTable(args.admin, "agent_contact_messages")
      .select("id,root_id,talent_id,direction,body,source,created_at")
      .eq("company_workspace_id", args.workspaceId)
      .eq("role_id", args.roleId)
      .gte("created_at", args.since)
      .order("created_at", { ascending: false })
      .limit(ALL_LIMIT)
  );
  const rootIds = [...new Set(messages.map((row) => String(row.root_id)))];
  if (!rootIds.length) return [];
  const roots = await untypedTable(args.admin, "agent_contact_messages")
    .select("id,cancelled_at")
    .in("id", rootIds);
  if (roots.error) {
    console.warn("[org/todo]", { label: "agent_mailbox_roots", error: roots.error });
    return [];
  }
  const cancelled = new Set(
    ((roots.data ?? []) as Array<{ id: string; cancelled_at: string | null }>)
      .filter((root) => root.cancelled_at)
      .map((root) => String(root.id))
  );
  return messages.map((row) => ({
    ...row,
    rootCancelled: cancelled.has(String(row.root_id)),
  }));
}

/**
 * Requests waiting for the candidate that the candidate answered through the
 * agent mailbox afterwards. A read that fails leaves them waiting.
 */
async function readRequestsAnsweredInMailbox(args: {
  admin: Admin;
  workspaceId: string;
  roleId: string;
  requests: RequestRow[];
}) {
  const waiting = args.requests.filter(
    (row) => row.workflow_status === "awaiting_talent"
  );
  if (!waiting.length) return new Set<string>();
  const replies = optionalRows<{ talent_id: string; created_at: string }>(
    "agent_mailbox_answers",
    await untypedTable(args.admin, "agent_contact_messages")
      .select("talent_id,created_at")
      .eq("company_workspace_id", args.workspaceId)
      .eq("role_id", args.roleId)
      .eq("direction", "to_company")
      .in("talent_id", [...new Set(waiting.map((row) => String(row.talent_id)))])
      .order("created_at", { ascending: false })
      .limit(ALL_LIMIT)
  );
  return requestsAnsweredInMailbox(waiting, replies);
}

/** Who sent each company message in the mailbox: a team member by name, or Harper. */
async function mailboxAnsweredBy(
  admin: Admin,
  senders: Map<string, string | null>
): Promise<Array<[string, AnsweredBy]>> {
  const memberIds = [...new Set([...senders.values()].filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (memberIds.length) {
    for (const member of optionalRows<{ user_id: string; name: string | null }>(
      "agent_mailbox_members",
      await untypedTable(admin, "company_users").select("user_id,name").in("user_id", memberIds)
    )) {
      if (member.name) names.set(String(member.user_id), member.name);
    }
  }
  return [...senders].map(([key, userId]) => [
    key,
    userId ? { by: "team", name: names.get(userId) ?? null } : { by: "harper" },
  ]);
}

/**
 * What the conversation lines show: a short line of each waiting candidate's
 * message, and who sent each company message that answered one. A read that
 * fails leaves those words out, not the To-do.
 */
async function readConversationDetails(args: {
  admin: Admin;
  workspaceId: string;
  relayIds: string[];
  requestIds: string[];
}) {
  const none = { data: [], error: null };
  const [relays, requests] = await Promise.all([
    args.relayIds.length
      ? untypedTable(args.admin, "company_talent_relays")
          .select("id,relay_content")
          .in("id", [...new Set(args.relayIds)])
      : none,
    args.requestIds.length
      ? untypedTable(args.admin, "company_talent_requests")
          .select(
            "id,source:company_messages!company_talent_requests_source_company_message_id_fkey(message_type,company_user_id)"
          )
          .eq("company_workspace_id", args.workspaceId)
          .in("id", [...new Set(args.requestIds)])
      : none,
  ]);
  const excerpts = new Map<string, string>();
  for (const relay of optionalRows<{ id: string; relay_content: string | null }>(
    "candidate_relays",
    relays
  )) {
    const excerpt = candidateMessageExcerpt(relay.relay_content);
    if (excerpt) excerpts.set(String(relay.id), excerpt);
  }
  type Source = { message_type: string | null; company_user_id: string | null };
  const sources = optionalRows<{ id: string; source: Source | Source[] | null }>(
    "company_replies",
    requests
  ).map((row) => ({
    id: String(row.id),
    source: Array.isArray(row.source) ? (row.source[0] ?? null) : row.source,
  }));
  const memberIds = [
    ...new Set(
      sources
        .filter((row) => row.source?.message_type !== "web_action")
        .map((row) => row.source?.company_user_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const names = new Map<string, string>();
  if (memberIds.length) {
    for (const member of optionalRows<{ user_id: string; name: string | null }>(
      "company_reply_members",
      await untypedTable(args.admin, "company_users")
        .select("user_id,name")
        .in("user_id", memberIds)
    )) {
      if (member.name) names.set(String(member.user_id), member.name);
    }
  }
  const answeredBy = new Map<string, AnsweredBy>();
  for (const row of sources) {
    const who = answeredByOf(row.source, names);
    if (who) answeredBy.set(row.id, who);
  }
  return { answeredBy, excerpts };
}

async function readWorkspaceFacts(
  admin: Admin,
  workspaceId: string
): Promise<WorkspaceFacts> {
  const [channels, integrations] = await Promise.all([
    untypedTable(admin, "company_slack_channels")
      .select("id,slack_team_id")
      .eq("company_workspace_id", workspaceId)
      .eq("is_enabled", true),
    untypedTable(admin, "company_slack_integrations")
      .select("slack_team_id")
      .eq("company_workspace_id", workspaceId)
      .eq("status", "active")
      .not("bot_token_ciphertext", "is", null),
  ]);
  return {
    slackChannels: optionalRows<SlackChannelRow>("slack_channels", channels),
    activeSlackTeams: new Set(
      optionalRows<{ slack_team_id: string }>("slack_integrations", integrations).map(
        (row) => row.slack_team_id
      )
    ),
  };
}

async function readCreditSlots(workspaceId: string) {
  const { getBillingSummary } = await import("./billing/store");
  return (await getBillingSummary(workspaceId)).creditSlots;
}

/** Roles read at once for Home, so a big workspace does not flood the database. */
const ROLE_TODO_CONCURRENCY = 4;

/** Home reads To-do lines for Roles in progress, paused or being set up, not ended ones. */
export function isHomeTodoRole(status: unknown) {
  return ["active", "paused", "draft"].includes(getOrgRoleStatusFilterValue(status));
}

/** Like Promise.all, with at most `limit` calls running at once; results keep input order. */
export async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  run: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await run(values[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, worker)
  );
  return results;
}

/**
 * "What's happening now" for one Role, several, or every Role this person
 * can see ("all"): the To-do lines of each, plus each Role's numbers. Roles
 * outside the person's access are left out. The decision numbers are the
 * inbox's (readOrgDecisionCounts), so every surface shows the same.
 */
export async function readOrgNow(args: {
  admin: Admin;
  user: User;
  workspaceId: string;
  roleIds: string[] | "all";
  locale: "ko" | "en";
  /**
   * "recent" (the chip): finished work and notices of the last days.
   * "all" (the To-do tab): everything, newest first, up to ALL_LIMIT a kind.
   */
  range?: "all" | "recent";
  now?: Date;
  /** Balance per Role; defaults to the billing summary. */
  readCreditSlots?: (workspaceId: string) => Promise<BillingCreditSlot[]>;
  /**
   * The person may cancel Harper's scheduled work (manage_candidates, as the
   * cancel route checks). Without it the rows show no cancel button.
   */
  canManage?: boolean;
}): Promise<OrgTodoResponse> {
  const { admin, user, workspaceId } = args;
  const now = args.now ?? new Date();
  const range = args.range ?? "recent";
  const roleRows = await fetchRoleRowsForWorkspace(admin, workspaceId, user);
  const visible = new Set(roleRows.map((row) => row.role_id));
  const workspaceWide = args.roleIds === "all";
  const roleIds = workspaceWide
    ? [...visible]
    : [...new Set(args.roleIds as string[])].filter((id) => visible.has(id));
  // Harper-tailored Roles without their own slot are never charged.
  const uncharged = new Set(
    roleRows
      .filter((row) => {
        const internal = Array.isArray(row.company_internal_roles)
          ? row.company_internal_roles[0]
          : row.company_internal_roles;
        return (internal as { is_harper_tailored_role?: boolean | null } | null | undefined)
          ?.is_harper_tailored_role === true;
      })
      .map((row) => row.role_id)
  );
  // Home (every Role): To-do lines only for Roles still being worked on.
  // Numbers still come for every Role, from the one board read above.
  const todoRoleIds = new Set(
    workspaceWide
      ? roleRows.filter((row) => isHomeTodoRole(row.status)).map((row) => row.role_id)
      : roleIds
  );
  const [decisions, nextSearches, creditSlots, workspace] = await Promise.all([
    readOrgDecisionCounts({ admin, user, workspaceId, roleIds }),
    readNextScheduledSearches({ admin, roleIds, now }),
    (args.readCreditSlots ?? readCreditSlots)(workspaceId).catch((error) => {
      // Unknown balance: no "intros left" line, rather than no To-do.
      console.warn("[org/todo] billing unavailable", { error });
      return null;
    }),
    roleIds.length
      ? readWorkspaceFacts(admin, workspaceId)
      : { slackChannels: [], activeSlackTeams: new Set<string>() },
  ]);
  const roles = roleIds.map((roleId) => {
    const decision = decisions.get(roleId)!;
    const slot = creditSlots ? creditSlotForRole(creditSlots, roleId) : undefined;
    return {
      roleId,
      decision,
      introsLeft: slot ? slot.remaining : null,
      charged:
        !uncharged.has(roleId) ||
        Boolean(creditSlots?.some((row) => row.slotId !== null && row.roleId === roleId)),
      nextScheduledSearchAt: nextSearches.get(roleId),
    };
  });
  const perRole = await mapWithConcurrency(
    roles.filter((role) => todoRoleIds.has(role.roleId)),
    ROLE_TODO_CONCURRENCY,
    (role) => {
      const loaded = loadRoleTodoItems({
        admin,
        user,
        workspaceId,
        roleId: role.roleId,
        locale: args.locale,
        range,
        now,
        decision: role.decision,
        nextScheduledSearchAt: role.nextScheduledSearchAt,
        // No "intros left" line for a Role that is never charged.
        introsLeft: role.charged ? role.introsLeft : null,
        workspace,
        canManage: args.canManage === true,
      });
      if (!workspaceWide) return loaded;
      // On Home one Role that cannot be read leaves the others' To-do.
      return loaded.catch((error) => {
        console.error("[org/todo] role To-do unavailable", {
          roleId: role.roleId,
          error,
        });
        return { items: [] as OrgTodoItem[], suggestions: 0 };
      });
    }
  );
  const items = perRole.flatMap((role) => role.items);
  // Counts and schedules (no time of their own) first, then newest first.
  items.sort(
    (left, right) =>
      Number(Boolean(left.at)) - Number(Boolean(right.at)) ||
      String(right.at ?? "").localeCompare(String(left.at ?? ""))
  );
  return {
    items,
    myTurn: orgTodoMyTurn(items),
    suggestions: perRole.reduce((sum, role) => sum + role.suggestions, 0),
    roles: roles.map((role) => ({
      roleId: role.roleId,
      counts: role.decision.counts,
      oldestWaitingSince: role.decision.oldestWaitingSince,
      nextScheduledSearchAt: role.nextScheduledSearchAt ?? null,
      introsLeft: role.introsLeft,
    })),
  };
}

/** One Role's To-do (the Role chat chip and To-do tab). */
export function loadOrgRoleTodo(args: {
  admin: Admin;
  user: User;
  workspaceId: string;
  roleId: string;
  locale: "ko" | "en";
  range?: "all" | "recent";
  now?: Date;
  canManage?: boolean;
}) {
  const { roleId, ...rest } = args;
  return readOrgNow({ ...rest, roleIds: [roleId] });
}
