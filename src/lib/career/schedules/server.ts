import { listCoverage } from "@/lib/career/listCoverage";
import { CronExpressionParser, CronDate } from "cron-parser";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";
import { formatScheduleTargets } from "./targetText";
import { formatTalentMessageContentForLlmPrompt } from "../opportunityFeedbackNote";

export type CareerSchedule = {
  id: string;
  talent_id: string;
  conversation_id: string | null;
  title: string;
  instruction: string;
  target_refs: Record<string, unknown>;
  timezone: string;
  next_run_at: string | null;
  recurrence: string | null;
  schedule_key?: string | null;
  interval_days?: number | null;
  last_change?: {
    id: string;
    request: Record<string, unknown>;
    created_at: string;
    source_message_text?: string;
  } | null;
  status: string;
  revision: number;
  directive_revision: number;
  last_run_id: string | null;
  last_run?: { id: string; status: string; completed_at: string | null } | null;
};
const database = (admin: TalentAdminClient) => admin as any;
const scheduleFields =
  "*,last_run:opportunity_discovery_run!talent_agent_schedules_last_run_id_fkey(id,status,completed_at),last_change:talent_external_operations!talent_agent_schedules_last_operation_id_fkey(id,request,created_at)";

export function nextScheduleOccurrence(
  recurrence: string | null,
  timezone: string,
  after: Date,
  intervalDays?: number | null
): string | null {
  if (intervalDays != null) {
    if (recurrence || !Number.isFinite(intervalDays) || intervalDays <= 0)
      throw new Error(
        "Use a positive interval_days or a cron recurrence, not both."
      );
    return new Date(after.getTime() + intervalDays * 86400000).toISOString();
  }
  if (!recurrence) return null;
  return CronExpressionParser.parse(recurrence, {
    tz: timezone,
    currentDate: after,
  })
    .next()
    .toDate()
    .toISOString();
}

export async function listCareerSchedules(args: {
  admin: TalentAdminClient;
  userId: string;
  status?: string;
  offset?: number;
  limit?: number;
}) {
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 30;
  let query = database(args.admin)
    .from("talent_agent_schedules")
    .select(scheduleFields, { count: "exact" })
    .eq("talent_id", args.userId);
  if (args.status) query = query.eq("status", args.status);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return {
    schedules: (data ?? []) as CareerSchedule[],
    total: count as number | null,
    nextOffset: offset + limit < (count ?? 0) ? offset + limit : null,
  };
}

export async function readCareerSchedule(args: {
  admin: TalentAdminClient;
  userId: string;
  scheduleId: string;
}) {
  const { data, error } = await database(args.admin)
    .from("talent_agent_schedules")
    .select(scheduleFields)
    .eq("id", args.scheduleId)
    .eq("talent_id", args.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Schedule unavailable.");
  const schedule = data as CareerSchedule;
  const messageId = schedule.last_change?.request.source_message_id;
  if (messageId) {
    const source = await database(args.admin)
      .from("talent_messages")
      .select("id,role,content,created_at,message_type,payload")
      .eq("id", messageId)
      .eq("user_id", args.userId)
      .eq("role", "user")
      .maybeSingle();
    if (source.error) throw new Error(source.error.message);
    if (source.data && schedule.last_change)
      schedule.last_change.source_message_text =
        formatTalentMessageContentForLlmPrompt(source.data, {
          includeCreatedAt: false,
        });
  }
  return schedule;
}

export async function writeCareerSchedule(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId?: string | null;
  requestId: string;
  backgroundRunId?: string;
  sourceMessageId?: number;
  actor?: "user" | "career_agent";
  input: Record<string, unknown>;
}) {
  // Provenance is server-owned, never accepted from a tool or browser payload.
  const {
    background_run_id: _run,
    source_message_id: _message,
    actor: _actor,
    ...input
  } = args.input;
  const action = input.action ?? (input.schedule_id ? "update" : "create");
  const previous =
    action === "create"
      ? null
      : await readCareerSchedule({
          ...args,
          scheduleId: String(input.schedule_id ?? ""),
        });
  input.action = action;
  const meetingIds = (
    input.target_refs as { meetingScheduleIds?: unknown } | undefined
  )?.meetingScheduleIds;
  if (meetingIds !== undefined) {
    if (!Array.isArray(meetingIds) || meetingIds.some(id => typeof id !== "string"))
      throw new Error("meetingScheduleIds must be appointment IDs.");
    if (meetingIds.length) {
      const { data, error } = await args.admin.from("meeting_schedules")
        .select("id").eq("talent_id", args.userId).in("id", meetingIds);
      if (error) throw new Error(error.message);
      if (new Set(data?.map(row => row.id)).size !== new Set(meetingIds).size)
        throw new Error("Appointment unavailable.");
    }
  }
  if (
    action === "create" &&
    (typeof input.title !== "string" || typeof input.instruction !== "string")
  )
    throw new Error("title and instruction are required.");
  const timezone = String(
    input.timezone ?? previous?.timezone ?? PROMPT_TIME_ZONE
  );
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  if (action === "create" || input.timezone !== undefined)
    input.timezone = timezone;
  // Choosing either repetition replaces the other. Explicit null makes it one-time.
  if (input.interval_days != null && input.recurrence == null)
    input.recurrence = null;
  if (input.recurrence != null && input.interval_days == null)
    input.interval_days = null;
  const recurrence =
    input.recurrence === null
      ? null
      : String(input.recurrence ?? previous?.recurrence ?? "") || null;
  const intervalDays =
    input.interval_days === null
      ? null
      : input.interval_days === undefined
        ? (previous?.interval_days ?? null)
        : Number(input.interval_days);
  const now = new Date();
  const next = nextScheduleOccurrence(recurrence, timezone, now, intervalDays);
  const changesTiming =
    recurrence !== (previous?.recurrence ?? null) ||
    intervalDays !== (previous?.interval_days ?? null) ||
    timezone !== previous?.timezone;
  if (input.recurrence !== undefined) input.recurrence = recurrence;
  if (input.interval_days !== undefined) input.interval_days = intervalDays;
  if (action === "create") {
    input.recurrence = recurrence;
    input.interval_days = intervalDays;
  }
  if (input.next_run_at !== undefined && input.next_run_at !== null) {
    const date = new CronDate(String(input.next_run_at), timezone).toDate();
    if (!Number.isFinite(date.getTime()))
      throw new Error("next_run_at must be a valid instant with timezone.");
    input.next_run_at = date.toISOString();
  }
  if (
    action === "create" ||
    action === "resume" ||
    (action === "update" && changesTiming && previous?.status === "active")
  ) {
    if (input.next_run_at === undefined)
      input.next_run_at =
        next ??
        (previous?.next_run_at && new Date(previous.next_run_at) > now
          ? previous.next_run_at
          : null);
    if (!input.next_run_at)
      throw new Error(
        "A next execution time is required for a one-time schedule."
      );
  }
  if (
    action === "update" &&
    previous?.status === "active" &&
    input.next_run_at === null
  )
    throw new Error(
      "An active schedule requires a next execution time. Use pause to stop future checks."
    );
  const { data, error } = await database(args.admin).rpc(
    "write_career_schedule",
    {
      p_user_id: args.userId,
      p_conversation_id: args.conversationId ?? null,
      p_request_id: args.requestId,
      p_input: {
        ...input,
        actor: args.actor ?? "user",
        ...(args.backgroundRunId
          ? { background_run_id: args.backgroundRunId }
          : {}),
        ...(args.sourceMessageId
          ? { source_message_id: args.sourceMessageId }
          : {}),
      },
    }
  );
  if (error) throw new Error(error.message);
  return data as CareerSchedule;
}

export async function readCareerCheckIn(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  // Repairs only a missing initial account reservation. Pauses and
  // custom rules are returned unchanged by this idempotent insert-only RPC.
  const { data, error } = await database(args.admin).rpc(
    "ensure_career_check_in",
    { p_user_id: args.userId }
  );
  if (error) throw new Error(error.message);
  return data ? readCareerSchedule({ ...args, scheduleId: data.id }) : null;
}

export async function readCareerCheckInContext(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const schedule = await readCareerCheckIn(args);
  return schedule
    ? `Opted-in external opportunity discovery (not an idle Career check-in):\n${formatCareerSchedules([schedule])}`
    : "";
}

export function formatCareerSchedules(
  schedules: CareerSchedule[],
  nextOffset: number | null = null
) {
  return [
    `Schedule times: ${PROMPT_TIME_ZONE}.`,
    ...schedules.map((item) =>
      [
        `Schedule ${item.id}; revision ${item.revision}; ${item.status}; ${item.title}${item.schedule_key === "career_check_in" ? "; opted-in external discovery" : ""}`,
        `Instruction: ${item.instruction}`,
        `${item.status === "paused" || item.status === "cancelled" ? "Saved execution time (inactive)" : "Next execution"}: ${item.next_run_at ? formatLlmDateTime(item.next_run_at) : "none"}; recurrence: ${item.interval_days != null ? `every ${item.interval_days} days` : (item.recurrence ?? "one time")}; recurrence timezone: ${item.timezone}`,
        item.last_run_id
          ? `Last invocation: ${item.last_run_id}${item.last_run ? `; ${item.last_run.status}${item.last_run.completed_at ? `; ended ${formatLlmDateTime(item.last_run.completed_at)}` : ""}` : ""}`
          : "",
        item.last_change
          ? [
              `Last change: ${formatLlmDateTime(item.last_change.created_at)}; ${item.last_change.request.actor ?? "unspecified actor"}; action ${item.last_change.request.action ?? "unspecified"}.`,
              item.last_change.request.appliesTo === "future_occurrences"
                ? "This change applies to future occurrences; its originating invocation remains current."
                : "",
              typeof item.last_change.request.reason === "string"
                ? `Recorded change reason: ${item.last_change.request.reason}`
                : "",
              item.last_change.request.source_message_id
                ? `Source user message: ${item.last_change.request.source_message_id}.`
                : "",
              item.last_change.source_message_text
                ? `Original user message:\n${item.last_change.source_message_text}`
                : "",
              item.last_change.request.background_run_id
                ? `Source background invocation: ${item.last_change.request.background_run_id}.`
                : "",
            ]
              .filter(Boolean)
              .join("\n")
          : "",
        ...formatScheduleTargets(item.target_refs),
      ]
        .filter(Boolean)
        .join("\n")
    ),
    !schedules.length ? "No schedules found." : "",
    nextOffset !== null
      ? `More schedules: offset ${nextOffset}`
      : "End of schedules.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function collectDueCareerSchedules(args: {
  admin: TalentAdminClient;
  now?: Date;
  limit?: number;
}) {
  // Zero capacity defers collection without advancing any saved occurrence.
  // The dispatch endpoint still performs recovery and delivery maintenance.
  if (args.limit === 0) return { runIds: [] as string[] };
  const now = args.now ?? new Date();
  const { data, error } = await database(args.admin)
    .from("talent_agent_schedules")
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", now.toISOString())
    .order("next_run_at")
    .order("id")
    .limit(args.limit ?? 100);
  if (error) throw new Error(error.message);
  const runIds: string[] = [];
  for (const item of (data ?? []) as CareerSchedule[]) {
    // Advance from the current wall time: downtime coalesces into one occurrence,
    // without a burst of missed emails. This is independent of the agent sending.
    const next = nextScheduleOccurrence(
      item.recurrence,
      item.timezone,
      now,
      item.interval_days
    );
    const { data: id, error: writeError } = await database(args.admin).rpc(
      "enqueue_career_schedule_occurrence",
      {
        p_id: item.id,
        p_expected_revision: item.revision,
        p_due_at: item.next_run_at,
        p_next_at: next,
      }
    );
    if (writeError) throw new Error(writeError.message);
    if (id) runIds.push(String(id));
  }
  return { runIds };
}

export async function collectDueCareerWork(args: {
  admin: TalentAdminClient;
  limit?: number;
}) {
  const { collectCareerProcessing } = await import("./daily");
  return collectCareerProcessing(args);
}
export {
  finishCareerSourceEvents,
  assertCareerSourceEventsCurrent,
  CareerSourceChangedError,
} from "../companies/server";

export async function readCareerScheduleFollowIndex(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { listCareerCompanyFollows, COMPANY_FOLLOW_COVERAGE } =
    await import("../companies/server");
  const [schedules, follows, checkIn] = await Promise.allSettled([
    listCareerSchedules({ ...args, limit: 12 }),
    listCareerCompanyFollows({ ...args, limit: 12 }),
    readCareerCheckInContext(args),
  ]);
  const hasCheckIn = checkIn.status === "fulfilled" && Boolean(checkIn.value);
  const indexedSchedules = schedules.status === "fulfilled"
    ? schedules.value.schedules.filter(item => !hasCheckIn || item.schedule_key !== "career_check_in")
    : [];
  const shownSchedules = indexedSchedules.length + Number(hasCheckIn);
  return [
    `Saved Career work (times: ${PROMPT_TIME_ZONE}):`,
    checkIn.status === "fulfilled"
      ? checkIn.value
      : "The external discovery schedule could not be read. Its timing and active state are unknown; read it before changing it.",
    schedules.status === "fulfilled" ? `Saved schedules (${listCoverage(shownSchedules, schedules.value.total != null ? shownSchedules < schedules.value.total : null)}${hasCheckIn ? "; includes discovery schedule above" : ""}):` : "",
    ...(schedules.status === "fulfilled"
      ? indexedSchedules
          .map(
            (item) =>
              `- Schedule ${item.id}; revision ${item.revision}; ${item.status}; ${item.title}; next ${item.next_run_at ? formatLlmDateTime(item.next_run_at) : "none"}.`
          )
      : ["Other schedules could not be read."]),
    follows.status === "fulfilled" ? `Company follows (${listCoverage(follows.value.follows.length, follows.value.nextOffset !== null)}):` : "Company follows unavailable.",
    ...(follows.status === "fulfilled"
      ? follows.value.follows.map(
          (item) =>
            `- Follow ${item.id}; revision ${item.revision}; ${item.workspace?.company_name ?? item.company?.name ?? "company"}; scope ${item.scope}; company_db_id ${item.company_db_id ?? "none"}${item.company_workspace_id ? `; company_workspace_id ${item.company_workspace_id}` : ""}.`
        )
      : []),
    follows.status === "fulfilled" && follows.value.follows.length
      ? COMPANY_FOLLOW_COVERAGE
      : "",
    (schedules.status === "fulfilled" && schedules.value.nextOffset !== null) ||
    (follows.status === "fulfilled" && follows.value.nextOffset !== null)
      ? "Additional saved work exists. Use list_schedules or follow_company action=list."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
