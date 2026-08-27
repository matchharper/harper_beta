import "server-only";

import { fetchMeetingAvailabilityForCompanyUser } from "@/lib/meetings/availabilityServer";
import {
  calculateMeetingCandidateSlots,
  type MeetingBusyRange,
} from "@/lib/meetings/slots";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

export type ExternalMeetingBusyProvider = (args: {
  attendeeCompanyUserIds: string[];
  windowEnd: Date;
  windowStart: Date;
}) => Promise<MeetingBusyRange[]>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function fetchSyncedGoogleCalendarBusyRanges(args: {
  admin: AdminClient;
  attendeeCompanyUserIds: string[];
  windowEnd: Date;
  windowStart: Date;
}) {
  const attendeeIds = Array.from(
    new Set(args.attendeeCompanyUserIds.map(clean).filter(Boolean))
  );
  if (attendeeIds.length === 0) return [];
  const { data, error } = await (
    args.admin.from("company_user_calendar_busy_blocks" as any) as any
  )
    .select("start_at, end_at")
    .in("company_user_id", attendeeIds)
    .lt("start_at", args.windowEnd.toISOString())
    .gt("end_at", args.windowStart.toISOString());
  if (error) throw error;
  return (data ?? []).flatMap(
    (row: Record<string, unknown>): MeetingBusyRange[] => {
      const startAt = clean(row.start_at);
      const endAt = clean(row.end_at);
      return startAt && endAt
        ? [{ endAt, source: "external_calendar", startAt }]
        : [];
    }
  );
}

function parseAttendeeIds(value: unknown, organizerCompanyUserId: string) {
  const ids = Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const companyUserId = clean(
          (item as Record<string, unknown>).companyUserId
        );
        return companyUserId ? [companyUserId] : [];
      })
    : [];
  return Array.from(
    new Set([organizerCompanyUserId, ...ids].map(clean).filter(Boolean))
  );
}

function parseBusyRows(
  rows: Array<Record<string, unknown>>,
  attendeeIds: Set<string>
) {
  return rows.flatMap((row): MeetingBusyRange[] => {
    const organizerId = clean(row.organizer_company_user_id);
    const attendeeMatch = Array.isArray(row.company_attendees)
      ? row.company_attendees.some((attendee) => {
          if (
            !attendee ||
            typeof attendee !== "object" ||
            Array.isArray(attendee)
          ) {
            return false;
          }
          return attendeeIds.has(
            clean((attendee as Record<string, unknown>).companyUserId)
          );
        })
      : false;
    const startAt = clean(row.confirmed_start_at);
    const endAt = clean(row.confirmed_end_at);
    if (
      (!attendeeIds.has(organizerId) && !attendeeMatch) ||
      !startAt ||
      !endAt
    ) {
      return [];
    }
    return [{ endAt, source: "harper", startAt }];
  });
}

export async function fetchConfirmedHarperBusyRanges(args: {
  admin: AdminClient;
  attendeeCompanyUserIds: string[];
  excludeScheduleId: string;
  windowEnd: Date;
  windowStart: Date;
}) {
  const attendeeIds = Array.from(
    new Set(args.attendeeCompanyUserIds.map(clean).filter(Boolean))
  );
  if (attendeeIds.length === 0) return [];

  const baseSelect =
    "id, organizer_company_user_id, company_attendees, confirmed_start_at, confirmed_end_at";
  const applyWindow = (query: any) =>
    query
      .eq("status", "confirmed")
      .neq("id", args.excludeScheduleId)
      .lt("confirmed_start_at", args.windowEnd.toISOString())
      .gt("confirmed_end_at", args.windowStart.toISOString());

  const organizerQuery = applyWindow(
    (args.admin.from("meeting_schedules" as any) as any)
      .select(baseSelect)
      .in("organizer_company_user_id", attendeeIds)
  );
  const attendeeQueries = attendeeIds.map((companyUserId) =>
    applyWindow(
      (args.admin.from("meeting_schedules" as any) as any)
        .select(baseSelect)
        // supabase-js treats an Array value as a Postgres array literal. This
        // column is jsonb, so pass serialized JSON to produce `cs.[{...}]`.
        .contains("company_attendees", JSON.stringify([{ companyUserId }]))
    )
  );
  const [organizerResult, ...attendeeResults] = await Promise.all([
    organizerQuery,
    ...attendeeQueries,
  ]);
  if (organizerResult.error) throw organizerResult.error;
  for (const result of attendeeResults) {
    if (result.error) throw result.error;
  }

  const rows = new Map<string, Record<string, unknown>>();
  for (const row of [
    ...(organizerResult.data ?? []),
    ...attendeeResults.flatMap((result) => result.data ?? []),
  ]) {
    rows.set(clean(row.id), row);
  }
  return parseBusyRows(Array.from(rows.values()), new Set(attendeeIds));
}

export async function computeCurrentMeetingSlots(args: {
  admin?: AdminClient;
  companyAttendees: unknown;
  durationMinutes: number;
  externalBusyProvider?: ExternalMeetingBusyProvider;
  organizerCompanyUserId: string;
  scheduleId: string;
  windowEnd: Date;
  windowStart: Date;
  workspaceId: string;
}) {
  const admin = args.admin ?? getSupabaseAdmin();
  const organizerCompanyUserId = clean(args.organizerCompanyUserId);
  const attendeeCompanyUserIds = parseAttendeeIds(
    args.companyAttendees,
    organizerCompanyUserId
  );
  const availability = await fetchMeetingAvailabilityForCompanyUser({
    admin,
    companyUserId: organizerCompanyUserId,
    workspaceId: args.workspaceId,
  });
  if (!availability) {
    return { availability: null, busyRanges: [], slots: [] };
  }

  const [harperBusy, externalBusy] = await Promise.all([
    fetchConfirmedHarperBusyRanges({
      admin,
      attendeeCompanyUserIds,
      excludeScheduleId: args.scheduleId,
      windowEnd: args.windowEnd,
      windowStart: args.windowStart,
    }),
    args.externalBusyProvider
      ? args.externalBusyProvider({
          attendeeCompanyUserIds,
          windowEnd: args.windowEnd,
          windowStart: args.windowStart,
        })
      : fetchSyncedGoogleCalendarBusyRanges({
          admin,
          attendeeCompanyUserIds,
          windowEnd: args.windowEnd,
          windowStart: args.windowStart,
        }),
  ]);
  const busyRanges = [...harperBusy, ...externalBusy];
  return {
    availability,
    busyRanges,
    slots: calculateMeetingCandidateSlots({
      availability,
      busyRanges,
      durationMinutes: args.durationMinutes,
      windowEnd: args.windowEnd,
      windowStart: args.windowStart,
    }),
  };
}
