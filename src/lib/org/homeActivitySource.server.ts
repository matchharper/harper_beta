import {
  orgCandidateActivityKind,
  readOrgCandidateActivity,
} from "./candidateActivityFeed";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type {
  OrgHomeActivityFilter,
  OrgHomeActivityKind,
} from "./homeActivity";
import {
  ACTIVITY_SCAN_SIZE,
  activityTimestamp,
  compareActivity,
  type ActivityEvent,
  type ActivityPosition,
} from "./homeActivityPagination";
type Admin = ReturnType<typeof getSupabaseAdmin>;

/** Each stream uses its event timestamp, not a parent row's unrelated update time. */
export async function loadActivityEvents(args: {
  admin: Admin;
  workspaceId: string;
  roleIds: string[];
  snapshot: string;
  after: ActivityPosition | null;
  kind: OrgHomeActivityFilter;
}) {
  const { admin, workspaceId, roleIds, snapshot, after, kind } = args;
  const streams: PromiseLike<ActivityEvent[]>[] = [];
  // Only validated timestamps/UUIDs from the cursor enter PostgREST filter syntax.
  const page = (
    query: any,
    timeColumn: string,
    prefix: string,
    relation?: string
  ) => {
    const column = relation ? `${relation}.${timeColumn}` : timeColumn;
    query = query.lte(column, snapshot);
    if (after) {
      const cursorPrefix = after.id.slice(0, after.id.lastIndexOf(":") + 1);
      if (prefix === cursorPrefix) {
        const id = after.id.slice(prefix.length);
        query = query.or(
          `${timeColumn}.lt.${after.createdAt},and(${timeColumn}.eq.${after.createdAt},id.gt.${id})`,
          relation ? { referencedTable: relation } : undefined
        );
      } else {
        query =
          prefix > cursorPrefix
            ? query.lte(column, after.createdAt)
            : query.lt(column, after.createdAt);
      }
    }
    return query
      .order(relation ? `${relation}(${timeColumn})` : timeColumn, {
        ascending: false,
      })
      .order(relation ? `${relation}(id)` : "id", { ascending: true })
      .limit(ACTIVITY_SCAN_SIZE);
  };
  const event = (
    row: any,
    prefix: string,
    eventKind: OrgHomeActivityKind,
    createdAt: string,
    text = "",
    meetingStartsAt: string | null = null
  ): ActivityEvent => ({
    id: `${prefix}${row.id}`,
    roleId: row.role_id,
    talentId: row.talent_id,
    kind: eventKind,
    createdAt: activityTimestamp(createdAt),
    text,
    meetingStartsAt,
  });
  const read = async (query: any, map: (row: any) => ActivityEvent | null) => {
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(map).filter(Boolean) as ActivityEvent[];
  };
  if (kind === "all" || kind === "intros" || kind === "messages") {
    let query = admin
      .from("talent_progress")
      .select("id,role_id,talent_id,kind,metadata,text,created_at")
      .in("role_id", roleIds)
      .eq("open_to_company", true);
    const eventTypes = [
      "candidate_message_delivered",
      "candidate_response_received",
      "candidate_contact_sent",
    ];
    if (kind === "intros") query = query.eq("kind", "intro_to_company");
    else if (kind === "messages")
      query = query
        .eq("kind", "org_candidate_activity")
        .in("metadata->>eventType", eventTypes);
    else
      query = query.or(
        `kind.eq.intro_to_company,and(kind.eq.org_candidate_activity,metadata->>eventType.in.(${eventTypes.join(",")}))`
      );
    streams.push(
      read(page(query, "created_at", ""), (row) => {
        if (row.kind === "intro_to_company")
          return event(row, "", "pending_connection", row.created_at);
        const activity = readOrgCandidateActivity(row.metadata);
        return activity
          ? event(
              row,
              "",
              orgCandidateActivityKind(activity),
              row.created_at,
              row.text ?? ""
            )
          : null;
      })
    );
  }
  if (kind === "all" || kind === "intros") {
    const intros = () =>
      admin
        .from("company_intro_candidates")
        .select(
          "id,role_id,talent_id,candidate_sent_at,talent_decision_at,status"
        )
        .eq("company_workspace_id", workspaceId)
        .in("role_id", roleIds);
    streams.push(
      read(page(intros(), "candidate_sent_at", "intro-sent:"), (row) =>
        event(row, "intro-sent:", "intro_sent", row.candidate_sent_at)
      )
    );
    streams.push(
      read(
        page(
          intros().in("status", ["connecting", "connected"]),
          "talent_decision_at",
          "intro-accepted:"
        ),
        (row) =>
          event(
            row,
            "intro-accepted:",
            "intro_accepted",
            row.talent_decision_at
          )
      )
    );
  }
  if (kind === "all" || kind === "interviews") {
    const confirmed = admin
      .from("meeting_schedules")
      .select("id,role_id,talent_id,title,confirmed_start_at,updated_at")
      .eq("company_workspace_id", workspaceId)
      .in("role_id", roleIds)
      .eq("status", "confirmed")
      .not("confirmed_start_at", "is", null);
    streams.push(
      read(page(confirmed, "updated_at", "meeting-confirmed:"), (row) =>
        event(
          row,
          "meeting-confirmed:",
          "meeting_confirmed",
          row.updated_at,
          row.title ?? "",
          row.confirmed_start_at
        )
      )
    );
    const requested = admin
      .from("meeting_schedules")
      .select(
        "id,role_id,talent_id,title,round:meeting_schedule_rounds!meeting_schedules_active_round_id_fkey!inner(id,status,updated_at)"
      )
      .eq("company_workspace_id", workspaceId)
      .in("role_id", roleIds)
      .or("status.neq.confirmed,confirmed_start_at.is.null")
      .in("round.status", ["queued", "sent", "confirmed"]);
    streams.push(
      read(
        page(requested, "updated_at", "meeting-requested:", "round"),
        (row) =>
          event(
            { ...row, id: row.round.id },
            "meeting-requested:",
            "meeting_requested",
            row.round.updated_at,
            row.title ?? ""
          )
      )
    );
  }
  const pages = await Promise.all(streams);
  const events = pages.flat().sort(compareActivity);
  return {
    events: events.slice(0, ACTIVITY_SCAN_SIZE),
    hasMore:
      events.length > ACTIVITY_SCAN_SIZE ||
      pages.some((rows) => rows.length === ACTIVITY_SCAN_SIZE),
  };
}
