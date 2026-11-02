import { CronDate } from "cron-parser";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { Json } from "@/types/database.types";
import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";
import type { TalentMeetingSchedule } from "./types";

export const MEETING_FIELDS =
  "id,talent_id,role_id,scheduling_source,title,content,timezone,confirmed_start_at,confirmed_end_at,status,version,source_key,source_refs";
export async function readTalentSchedules(args: {
  admin: TalentAdminClient;
  userId: string;
  scheduleId?: string;
  roleId?: string;
  sourceKey?: string;
  from?: string;
  until?: string;
  includeCancelled?: boolean;
  offset?: number;
  limit?: number;
}) {
  const offset = args.offset ?? 0,
    limit = args.limit ?? 30;
  let query = args.admin
    .from("meeting_schedules")
    .select(
      `${MEETING_FIELDS},role:company_roles(name,company_workspace(company_name)),calendar:meeting_schedule_calendar_events(conference_url)`,
      { count: "exact" }
    )
    .eq("talent_id", args.userId);
  if (args.scheduleId) query = query.eq("id", args.scheduleId);
  else if (!args.includeCancelled) query = query.eq("status", "confirmed");
  if (args.sourceKey) query = query.eq("source_key", args.sourceKey);
  if (args.roleId) query = query.eq("role_id", args.roleId);
  if (args.from) query = query.gte("confirmed_start_at", args.from);
  if (args.until) query = query.lt("confirmed_start_at", args.until);
  const { data, error, count } = await query
    .order("confirmed_start_at")
    .order("id")
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return {
    schedules: (data ?? []) as TalentMeetingSchedule[],
    nextOffset: offset + limit < (count ?? 0) ? offset + limit : null,
  };
}
export async function writeTalentSchedule(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId?: string | null;
  requestId: string;
  input: Record<string, unknown>;
}) {
  const input = { ...args.input };
  if (input.source_refs !== undefined) {
    const refs = input.source_refs as Record<string, unknown>;
    if (!refs || typeof refs !== "object" || Array.isArray(refs))
      throw new Error("source_refs must be an object.");
    for (const key of ["gmailThreadIds", "gmailMessageIds", "messageIds"])
      if (refs[key] !== undefined) {
        const ids = refs[key];
        if (
          !Array.isArray(ids) ||
          ids.some((id) =>
            key === "messageIds"
              ? !Number.isSafeInteger(id)
              : typeof id !== "string"
          )
        )
          throw new Error(`${key} must contain source identifiers.`);
      }
  }
  // Interpret local times using the explicitly supplied event timezone; store instants.
  for (const key of ["starts_at", "ends_at"])
    if (input[key] != null) {
      const value = String(input[key]);
      if (!input.timezone && !/(Z|[+-]\d\d:\d\d)$/i.test(value))
        throw new Error(
          "Supply a timezone or an explicit offset for meeting times."
        );
      const instant = new CronDate(
        value,
        String(input.timezone ?? PROMPT_TIME_ZONE)
      ).toDate();
      if (!Number.isFinite(instant.getTime()))
        throw new Error(`Invalid ${key}`);
      input[key] = instant.toISOString();
    }
  const { data, error } = await args.admin.rpc(
    "write_talent_meeting_schedule",
    {
      p_user_id: args.userId,
      p_conversation_id: args.conversationId ?? null,
      p_request_id: args.requestId,
      p_input: input as Json,
    }
  );
  if (error) throw new Error(error.message);
  return data as unknown as TalentMeetingSchedule;
}
export function formatTalentSchedules(result: {
  schedules: TalentMeetingSchedule[];
  nextOffset?: number | null;
}) {
  return [
    `Appointments (times ${PROMPT_TIME_ZONE}; these are actual meetings, not agent work reservations):`,
    ...result.schedules.map((row) =>
      [
        `Schedule ${row.id}; version ${row.version}; ${row.status}; scheduling source ${row.scheduling_source}.`,
        `Title: ${row.title}`,
        row.role
          ? `Related position: ${row.role.company_workspace?.company_name ?? ""} / ${row.role.name}`
          : "",
        row.role_id ? `Role ID: ${row.role_id}` : "No linked Role.",
        `Start: ${row.confirmed_start_at ? formatLlmDateTime(row.confirmed_start_at) : "unconfirmed"}; end: ${row.confirmed_end_at ? formatLlmDateTime(row.confirmed_end_at) : "unknown"}; event timezone: ${row.timezone}.`,
        row.content,
        row.calendar?.conference_url
          ? `Meeting link: ${row.calendar.conference_url}`
          : "",
        row.source_key ? `Source key: ${row.source_key}` : "",
        row.source_refs?.gmailThreadIds?.length
          ? `Gmail thread IDs: ${row.source_refs.gmailThreadIds.join(", ")}`
          : "",
        row.source_refs?.gmailMessageIds?.length
          ? `Gmail message IDs: ${row.source_refs.gmailMessageIds.join(", ")}`
          : "",
        row.source_refs?.messageIds?.length
          ? `Conversation message IDs: ${row.source_refs.messageIds.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    ),
    !result.schedules.length ? "No appointments found in this scope." : "",
    result.nextOffset != null
      ? `More appointments: read_talent_schedules offset=${result.nextOffset} with the same filters.`
      : "End of this appointment scope.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export async function readUpcomingTalentScheduleContext(args: {
  admin: TalentAdminClient;
  userId: string;
  now?: Date;
}) {
  const now = args.now ?? new Date(),
    until = new Date(now.getTime() + 3 * 86400000);
  const schedules: TalentMeetingSchedule[] = [];
  let offset: number | null = 0;
  do {
    const page = await readTalentSchedules({
      ...args,
      from: now.toISOString(),
      until: until.toISOString(),
      offset,
    });
    schedules.push(...page.schedules);
    offset = page.nextOffset;
  } while (offset !== null);
  return `Upcoming 72 hours, ${formatLlmDateTime(now)} through ${formatLlmDateTime(until)}:\n${formatTalentSchedules({ schedules })}`;
}

/** Fence a prepared reminder against a concurrent reschedule/cancellation. */
export async function changedTalentSchedules(args: {
  admin: TalentAdminClient;
  userId: string;
  versions?: Record<string, number>;
}) {
  const ids = Object.keys(args.versions ?? {});
  if (!ids.length) return null;
  const { data, error } = await args.admin
    .from("meeting_schedules")
    .select(MEETING_FIELDS)
    .eq("talent_id", args.userId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as TalentMeetingSchedule[];
  return rows.length !== ids.length ||
    rows.some((row) => Number(row.version) !== Number(args.versions?.[row.id]))
    ? formatTalentSchedules({ schedules: rows })
    : null;
}
