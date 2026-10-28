import type { User } from "@supabase/supabase-js";
import { readRoleMatchingActivity } from "@/lib/companyFirstSearch/activity.server";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { fetchOrgHomeActivityPage } from "./homeActivity.server";
import type { OrgHomeActivityKind } from "./homeActivity";
import {
  DEFAULT_INTRO_SEARCH_DAYS,
  DEFAULT_INTRO_SEARCH_HOUR,
  INTRO_SEARCH_DAYS,
  parseIntroSearchDays,
  parseIntroSearchHour,
} from "./introSearchSchedule";
import { readPendingConnections } from "./pendingConnections.server";
import {
  readRoleTodoSuggestions,
  readTodoReads,
} from "./todoSuggestions.server";
import { fetchOrgBoard } from "./server";
import {
  ORG_TODO_RECENT_DAYS,
  ORG_TODO_SUGGESTIONS_SHOWN,
  orgTodoMyTurn,
  type OrgTodoItem,
  type OrgTodoKind,
  type OrgTodoResponse,
  type OrgTodoSource,
} from "./todo";

type Admin = ReturnType<typeof getSupabaseAdmin>;
type Talent = NonNullable<OrgTodoItem["talent"]>;

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;
const MEETING_SOON_MS = 72 * 60 * 60 * 1000;
const ALL_LIMIT = 200;
/** Names shown under a grouped item such as "연결 수락할 후보 5명". */
const PEOPLE_SHOWN = 3;
/** A connection with no interview arranged through Harper after this long. */
const INTERVIEW_NUDGE_DAYS = 3;
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
 * from the team. A new 연결 수락할 후보 needs the team's decision, so it is
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

function rows<T>(response: { data: unknown; error: unknown }) {
  if (response.error) throw response.error;
  return (response.data ?? []) as T[];
}

function table(admin: Admin, name: string) {
  return admin.from(name as any) as any;
}

/** The next scheduled search for a Role, in KST, from its saved days and hour. */
export function nextScheduledSearchAt(args: {
  days: unknown;
  hour: unknown;
  now: Date;
}) {
  const days = parseIntroSearchDays(args.days) ?? DEFAULT_INTRO_SEARCH_DAYS;
  const hour = parseIntroSearchHour(args.hour) ?? DEFAULT_INTRO_SEARCH_HOUR;
  const kstNow = new Date(args.now.getTime() + KST_MS);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(
      Date.UTC(
        kstNow.getUTCFullYear(),
        kstNow.getUTCMonth(),
        kstNow.getUTCDate() + offset,
        hour
      ) - KST_MS
    );
    // INTRO_SEARCH_DAYS starts on Monday; getUTCDay starts on Sunday.
    const weekday =
      INTRO_SEARCH_DAYS[(new Date(day.getTime() + KST_MS).getUTCDay() + 6) % 7];
    if (
      weekday &&
      days.includes(weekday) &&
      day.getTime() > args.now.getTime()
    ) {
      return day.toISOString();
    }
  }
  return null;
}

/**
 * Everything on one Role's To-do, from the records each feature already
 * writes. Candidates go through the board's visibility (team access,
 * test-only, deleted profiles), so the To-do never shows someone the inbox
 * would hide.
 */
export async function loadOrgRoleTodo(args: {
  admin: Admin;
  user: User;
  workspaceId: string;
  roleId: string;
  locale: "ko" | "en";
  /**
   * "recent" (the chip): finished work and notices of the last days.
   * "all" (the To-do tab): everything, newest first, up to ALL_LIMIT a kind.
   */
  range?: "all" | "recent";
  now?: Date;
}): Promise<OrgTodoResponse> {
  const { admin, user, workspaceId, roleId } = args;
  const now = args.now ?? new Date();
  const all = args.range === "all";
  const since = all
    ? new Date(0).toISOString()
    : new Date(now.getTime() - ORG_TODO_RECENT_DAYS * DAY_MS).toISOString();
  const limit = all ? ALL_LIMIT : 10;

  const [
    pending,
    intros,
    requests,
    followups,
    meetings,
    session,
    conversations,
    threads,
    role,
    matching,
    activity,
    briefChanges,
    runs,
    suggestionRows,
    connectedTags,
    reads,
    declined,
  ] = await Promise.all([
    readPendingConnections(admin, [roleId]),
    table(admin, "company_intro_candidates")
      .select(
        "id,talent_id,recommendation_id,status,requested_at,candidate_sent_at,selected_at"
      )
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      // Once the candidate accepts (connecting), 알림 says so; the short
      // step of sending the intro email is not a second line.
      .in("status", ["ready", "awaiting_talent"]),
    table(admin, "company_talent_requests")
      .select(
        "id,talent_id,recommendation_id,workflow_status,contact_kind,expects_document,source_company_message_id,created_at,updated_at,ops_only"
      )
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .in("workflow_status", ["draft", "failed", ...REQUEST_IN_PROGRESS]),
    table(admin, "company_talent_followups")
      .select(
        "id,talent_id,recommendation_id,source_kind,source_id,status,due_at,updated_at"
      )
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .or(`status.eq.pending,and(status.eq.delivered,updated_at.gte.${since})`),
    table(admin, "meeting_schedules")
      .select(
        "id,talent_id,recommendation_id,status,confirmed_start_at,round:meeting_schedule_rounds!meeting_schedules_active_round_id_fkey(id,status,updated_at)"
      )
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId),
    table(admin, "company_role_start_sessions")
      .select("phase,updated_at")
      .eq("role_id", roleId)
      .maybeSingle(),
    table(admin, "company_conversations")
      .select("id")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId),
    table(admin, "company_slack_threads").select("id").eq("role_id", roleId),
    table(admin, "company_roles")
      .select(
        "status,company_internal_roles(is_company_first_search,intro_search_date,intro_search_time)"
      )
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .maybeSingle(),
    readRoleMatchingActivity({ admin: admin as any, workspaceId, roleId }),
    readActivity({
      admin,
      user,
      workspaceId,
      roleId,
      locale: args.locale,
      since,
      all,
    }),
    table(admin, "company_role_hiring_brief_history")
      .select("id,created_at,source,summary,summary_status")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    table(admin, "company_first_search_runs")
      .select("id,status,trigger_reason,finished_at")
      .eq("company_workspace_id", workspaceId)
      .or(
        `role_id.eq.${roleId},scheduled_role_ids.cs.{${roleId}},requested_role_ids.cs.{${roleId}}`
      )
      .in("status", ["succeeded", "completed"])
      .gte("finished_at", since)
      .order("finished_at", { ascending: false })
      .limit(limit),
    readRoleTodoSuggestions({ admin, workspaceId, roleId, since, now }),
    table(admin, "talent_opportunity_tag")
      .select("talent_id,updated_at")
      .eq("opportunity_id", roleId)
      .eq("tag", "내부:연결됨")
      .order("updated_at", { ascending: false })
      .limit(200),
    readTodoReads({ admin, roleId, userId: user.id }),
    // A candidate who said no to the company's intro: the end of that wait.
    table(admin, "company_intro_candidates")
      .select("id,talent_id,talent_decision_at")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .eq("close_reason", "talent_declined")
      .gte("talent_decision_at", since)
      .order("talent_decision_at", { ascending: false })
      .limit(limit),
  ]);

  const introRows = rows<any>(intros);
  const requestRows = rows<any>(requests).filter(
    (row) => row.ops_only !== true
  );
  const followupRows = rows<any>(followups);
  const meetingRows = rows<any>(meetings);
  const runRows = rows<any>(runs);
  const declinedRows = rows<any>(declined);

  // The few names shown under a grouped item: who has waited longest for
  // the company's decision, and the newest suggested candidates.
  const pendingPeople = [...pending.sinceByPair]
    .map(([key, at]) => ({ talentId: key.split(":")[1] ?? "", at }))
    .sort((left, right) => left.at.localeCompare(right.at));
  const readyPeople = introRows
    .filter((row) => row.status === "ready")
    .map((row) => ({
      talentId: String(row.talent_id),
      at: String(row.selected_at ?? ""),
    }))
    .sort((left, right) => right.at.localeCompare(left.at));
  // Connected candidates with no interview arranged through Harper yet.
  const connectedSince = new Map<string, string>();
  for (const tag of rows<any>(connectedTags)) {
    if (!connectedSince.has(tag.talent_id))
      connectedSince.set(tag.talent_id, tag.updated_at);
  }
  const withMeeting = new Set(meetingRows.map((row) => String(row.talent_id)));

  // Names and links come from the board, so hidden candidates stay hidden.
  const talentIds = Array.from(
    new Set(
      [
        ...[
          ...introRows,
          ...requestRows,
          ...followupRows,
          ...meetingRows,
          ...declinedRows,
        ]
          .filter((row) => row.status !== "ready")
          .map((row) => String(row.talent_id ?? "")),
        ...suggestionRows.flatMap((row) => row.talent_ids ?? []),
        ...pendingPeople.slice(0, PEOPLE_SHOWN).map((row) => row.talentId),
        ...readyPeople.slice(0, PEOPLE_SHOWN).map((row) => row.talentId),
        ...[...connectedSince.keys()].filter((id) => !withMeeting.has(id)),
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
  const pendingCount = pending.countByRoleId.get(roleId) ?? 0;
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
  if (readyPeople.length) {
    items.push({
      id: "company_intro",
      column: "my_turn",
      kind: "company_intro",
      at: null,
      count: readyPeople.length,
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
  const messageIds = requestRows
    .map((row) => row.source_company_message_id)
    .filter((id): id is number | string => id !== null && id !== undefined);
  const messageSource = new Map<string, OrgTodoSource>();
  if (messageIds.length) {
    const messages = rows<any>(
      await table(admin, "company_messages")
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
    ...rows<any>(conversations).map((row) => `chat:${row.id}`),
    ...rows<any>(threads).map((row) => `slack:${row.id}`),
  ];
  if (scopes.length) {
    const proposals = rows<any>(
      await table(admin, "company_agent_update_proposals")
        .select("id,scope_key,summary,created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .gt("expires_at", now.toISOString())
        .in("scope_key", scopes)
    );
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
  if (role.error) throw role.error;
  const roleRow = role.data as any;
  const internal = Array.isArray(roleRow?.company_internal_roles)
    ? roleRow.company_internal_roles[0]
    : roleRow?.company_internal_roles;
  const roleStatus = String(roleRow?.status ?? "").toLowerCase();
  if (
    internal?.is_company_first_search &&
    (roleStatus === "active" ||
      roleStatus === "top_priority" ||
      roleStatus === "open")
  ) {
    const nextAt = nextScheduledSearchAt({
      days: internal.intro_search_date,
      hour: internal.intro_search_time,
      now,
    });
    if (nextAt) {
      items.push({
        id: "scheduled-search",
        column: "in_progress",
        kind: "scheduled_search",
        at: null,
        nextAt,
        source: "harper",
      });
    }
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

  // 알림, 한 일 (최근)
  // Still waiting for the candidate: the intro and each request under way.
  const waitingIntros = new Set(
    introRows
      .filter((row) => row.status === "awaiting_talent")
      .map((row) => String(row.id))
  );
  const requestsUnderWay = requestRows
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
  for (const row of rows<any>(briefChanges)) {
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
    const selected = rows<any>(
      await table(admin, "company_intro_candidates")
        .select("selection_run_id")
        .eq("company_workspace_id", workspaceId)
        .eq("role_id", roleId)
        .in(
          "selection_run_id",
          runRows.map((run) => run.id)
        )
    );
    for (const run of runRows) {
      items.push({
        id: `search:${run.id}`,
        column: "done",
        kind: "search_done",
        at: run.finished_at,
        count: selected.filter((row) => row.selection_run_id === run.id).length,
        detail: run.trigger_reason ?? null,
        source: run.trigger_reason === "company_requested" ? null : "harper",
      });
    }
  }

  // Updates this person marked as read leave their To-do.
  const visible = items.filter(
    (item) => item.column !== "notice" || !reads.has(item.id)
  );
  // Counts and schedules (no time of their own) first, then newest first.
  visible.sort(
    (left, right) =>
      Number(Boolean(left.at)) - Number(Boolean(right.at)) ||
      String(right.at ?? "").localeCompare(String(left.at ?? ""))
  );
  return {
    items: visible,
    myTurn: orgTodoMyTurn(visible),
    suggestions: openSuggestions,
  };
}
