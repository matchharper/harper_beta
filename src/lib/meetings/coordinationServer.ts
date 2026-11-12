import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import {
  agentContactDatabase,
  assertAgentContactSource,
  assertAgentContactPair,
} from "@/lib/agentContacts/store";
import { companyAgentScope } from "@/lib/agentContacts/companyScope";
import {
  assertOrgRoleAccess,
  assertOrgWorkspacePermission,
} from "@/lib/org/server";
import { readOrgAgentTalent } from "@/lib/org/agent/data";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { resolveWorkspaceAttendees } from "./scheduleDraftServer";
import { fetchMeetingAvailabilityForCompanyUser } from "./availabilityServer";
import {
  fetchConfirmedHarperBusyRanges,
  fetchSyncedGoogleCalendarBusyRanges,
} from "./slotsServer";
import { syncGoogleCalendarBusyBlocksIfStaleForCompanyUser } from "./calendarSyncServer";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { formatCoordinatedMeeting, formatCoordinationAvailability, meetingInstant } from "./coordination";
import {
  readCoordinatedMeetings,
  assertMeetingRequestSource,
  changeCoordinatedMeeting,
} from "./coordinationStore";
import {
  ensureMeetingCalendarEvent,
  fetchMeetingCalendarDelivery,
} from "./meetingCalendarServer";
import { isValidCalendarTimezone } from "@/lib/integrations/googleCalendarTools";
import type { Query } from "@/lib/career/matching/internalScoring/database";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export async function executeMeetingCoordination(args: {
  admin: any;
  user: User;
  workspaceId: string;
  conversationId: string;
  currentUserMessageId: number;
  actorLabel: string;
  input: Record<string, any>;
}) {
  const input = args.input;
  const action = text(input.action);
  if (
    ![
      "read",
      "prepare",
      "confirm",
      "update",
      "cancel",
      "retry_delivery",
    ].includes(action)
  )
    throw new Error("Unknown meeting action");
  const db = agentContactDatabase();
  const scoped = companyAgentScope(args.admin);
  const admin = getSupabaseAdmin();
  let rows = input.scheduleId
    ? await readCoordinatedMeetings(db, args.workspaceId, {
        scheduleId: input.scheduleId,
      })
    : [];
  let row = rows[0];
  if (input.scheduleId && !row) throw new Error("Meeting unavailable");
  const roleId = row?.role_id || text(input.roleId);
  const talentId = row?.talent_id || text(input.talentId);
  if (!roleId || !talentId)
    throw new Error("Exact roleId and talentId, or scheduleId, are required");
  if (
    (input.roleId && input.roleId !== roleId) ||
    (input.talentId && input.talentId !== talentId)
  )
    throw new Error("Meeting target mismatch");
  const source = scoped ?? {
    kind: "company" as const,
    workspaceId: args.workspaceId,
    userId: args.user.id,
    messageId: args.currentUserMessageId,
  };
  await assertAgentContactSource(db.query, source, roleId, talentId);
  await assertOrgRoleAccess({
    admin: args.admin,
    user: args.user,
    workspaceId: args.workspaceId,
    roleId,
    permission: scoped ? "view" : "manage_candidates",
  });
  if (scoped && action === "prepare")
    throw new Error(
      "A company teammate must first delegate this meeting with prepare"
    );
  if (!input.scheduleId && action === "read") {
    rows = await readCoordinatedMeetings(db, args.workspaceId, {
      roleId,
      talentId,
    });
    // A unique match has the same delegation and delivery evidence as an ID lookup.
    // Multiple meetings remain an index so the model can choose the exact request.
    if (rows.length === 1) row = rows[0];
  }
  if (!["read", "prepare"].includes(action) && !row)
    throw new Error("Read the saved meeting and use its exact scheduleId");

  const assertAccess = async (q: Query, target: any) => {
    if (!scoped && action === "cancel") {
      await assertAgentContactSource(q, source, roleId);
    } else await assertAgentContactSource(q, source, roleId, talentId);
    if (
      target.role_id !== roleId ||
      target.talent_id !== talentId ||
      target.company_workspace_id !== args.workspaceId
    )
      throw new Error("Meeting scope mismatch");
    const original = await assertMeetingRequestSource(
      q,
      target,
      action !== "cancel"
    );
    const owner = {
      id: original.company_user_id,
      app_metadata: {},
      user_metadata: {},
    } as User;
    // These are original request facts, never a fabricated membership on the service actor.
    await assertOrgWorkspacePermission({
      admin,
      user: owner,
      workspaceId: args.workspaceId,
      permission: "manage_candidates",
    });
    await assertOrgRoleAccess({
      admin,
      user: owner,
      workspaceId: args.workspaceId,
      roleId,
    });
    if (!scoped)
      await assertOrgWorkspacePermission({
        admin,
        user: args.user,
        workspaceId: args.workspaceId,
        permission: "manage_candidates",
      });
  };

  const talent = ["prepare", "confirm", "update"].includes(action)
    ? await readOrgAgentTalent({
        admin: args.admin,
        user: args.user,
        workspaceId: args.workspaceId,
        roleId,
        talentId,
        includeProfile: false,
        audience: "company_safe",
      })
    : null;
  const position = talent?.positions.find((p: any) => p.roleId === roleId);
  if (talent && !position)
    throw new Error("Candidate relationship unavailable");
  const active =
    position?.stage === "connected" ||
    position?.stage === "final_offer" ||
    position?.stage.startsWith("custom:");
  if (["confirm", "update"].includes(action) && !active)
    throw new Error(
      "Complete the existing company connection/reengagement decision before confirming a meeting"
    );

  if (action === "prepare") {
    await assertOrgWorkspacePermission({
      admin,
      user: args.user,
      workspaceId: args.workspaceId,
      permission: "manage_candidates",
    });
    if (!active && position?.stage !== "pending_connection")
      throw new Error(
        "Use the existing Intro/connection process before preparing this meeting"
      );
    if (!text(input.title) || !text(input.purpose) || !text(input.operationId))
      throw new Error("title, purpose and operationId are required");
    const duration = input.durationMinutes ?? 60;
    if (!Number.isSafeInteger(duration) || duration < 1)
      throw new Error(
        "Meeting duration must be a positive whole number of minutes"
      );
    const { attendees, organizer } = await resolveWorkspaceAttendees({
      admin,
      user: args.user,
      workspaceId: args.workspaceId,
      actorLabel: args.actorLabel,
      attendeeEmails: input.attendeeEmails ?? [],
    });
    if (attendees.some((a) => !a.email))
      throw new Error("Every company attendee needs a verified email");
    const [rec] = await db.query(
      "select * from talent_opportunity_recommendation where id=$1::uuid",
      [position!.recommendationId]
    );
    const config = {
      companyAttendees: attendees,
      organizer,
      title: text(input.title),
      meetingPurpose: text(input.purpose),
      durationMinutes: duration,
      conferenceProvider: "google_meet",
      invitationKind: "process_stage",
      offerWindowDays: 14,
      processStageId: null,
      processStageName: null,
    };
    const prepared = await db.transaction(async (q) => {
      await assertAgentContactSource(q, source, roleId, talentId);
      await assertAgentContactPair(q, {
        role_id: roleId,
        talent_id: talentId,
        company_workspace_id: args.workspaceId,
        recommendation_id: rec.id,
      });
      const [origin] = await q(
        "select id,conversation_id from company_messages where id=$1 and role='user' and company_user_id=$2::uuid and company_workspace_id=$3::uuid",
        [args.currentUserMessageId, args.user.id, args.workspaceId]
      );
      if (!origin || origin.conversation_id !== args.conversationId)
        throw new Error("Original company request unavailable");
      const [result] = await q(
        `select create_meeting_schedule_draft_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8::jsonb,$9::jsonb,null,null,$10,$11) as value`,
        [
          args.workspaceId,
          roleId,
          rec.id,
          talentId,
          organizer.companyUserId,
          config.title,
          duration,
          JSON.stringify(attendees),
          JSON.stringify(config),
          origin.id,
          // An uncertain result can be retried from a later message. The RPC
          // compares the payload and retains the first message as its audit source.
          `agent-meeting:${args.workspaceId}:${args.user.id}:${rec.id}:${createHash("sha256").update(text(input.operationId)).digest("hex")}`,
        ]
      );
      await q(
        `update meeting_schedules set source_refs=source_refs||jsonb_build_object('coordination',$2::jsonb)
        where id=$1::uuid and not source_refs ? 'coordination'`,
        [
          result.value.scheduleId,
          JSON.stringify({
            messageId: origin.id,
            userId: args.user.id,
            conversationId: origin.conversation_id,
            introductionRootId: rec.agent_introduction_root_id ?? null,
            consentAt: rec.feedback_at ?? null,
          }),
        ]
      );
      return result.value;
    });
    rows = await readCoordinatedMeetings(db, args.workspaceId, {
      scheduleId: prepared.scheduleId,
    });
    row = rows[0];
  }

  const ownerId =
    row?.organizer_company_user_id || (scoped ? undefined : args.user.id);
  if (row && row.source_refs?.coordination) await assertAccess(db.query, row);
  const needsAvailability = ["read", "prepare", "confirm", "update"].includes(
    action
  );
  const availability =
    ownerId && needsAvailability
      ? await fetchMeetingAvailabilityForCompanyUser({
          admin,
          companyUserId: ownerId,
          workspaceId: args.workspaceId,
        })
      : null;
  const timezone =
    text(input.timezone) ||
    (row?.confirmed_start_at ? row.timezone : null) ||
    availability?.timezone ||
    "Asia/Seoul";
  if (!isValidCalendarTimezone(timezone)) throw new Error("Invalid timezone");
  const start = ["confirm", "update"].includes(action)
    ? meetingInstant(input.startsAt, "startsAt")
    : undefined;
  const end = ["confirm", "update"].includes(action)
    ? meetingInstant(input.endsAt, "endsAt")
    : undefined;
  if (start && !text(input.timezone))
    throw new Error("timezone is required for the agreed appointment");
  const windowStart =
    start ?? (input.from ? meetingInstant(input.from, "from") : new Date());
  const windowEnd =
    end ??
    (input.until
      ? meetingInstant(input.until, "until")
      : new Date(windowStart.getTime() + 14 * 86400000));
  if (windowEnd <= windowStart) throw new Error("Invalid meeting window");
  const attendeeIds: string[] = row
    ? row.company_attendees.map((a: any) => a.companyUserId)
    : ownerId
      ? [ownerId]
      : [];
  const evidence: string[] = [];
  const [previousDelivery] = row
    ? await db.query(
        "select external_event_id from meeting_schedule_calendar_events where schedule_id=$1::uuid",
        [row.id]
      )
    : [];
  if (needsAvailability)
    for (const id of attendeeIds) {
      const sync = await syncGoogleCalendarBusyBlocksIfStaleForCompanyUser({
        admin,
        companyUserId: id,
        workspaceId: args.workspaceId,
        timezone,
        skipIfNotActive: true,
        minimumIntervalMs: start ? 0 : undefined,
      });
      evidence.push(
        `Calendar for teammate ${id}: ${sync.status}; ${sync.lastSyncedAt ? `last checked ${formatLlmDateTime(sync.lastSyncedAt)}` : "personal conflicts unverified"}.`
      );
    }
  const [harperBusy, calendarBusy] = needsAvailability
    ? await Promise.all([
        fetchConfirmedHarperBusyRanges({
          admin,
          attendeeCompanyUserIds: attendeeIds,
          excludeScheduleId: row?.id || "00000000-0000-0000-0000-000000000000",
          windowStart,
          windowEnd,
        }),
        fetchSyncedGoogleCalendarBusyRanges({
          admin,
          attendeeCompanyUserIds: attendeeIds,
          windowStart,
          windowEnd,
          excludeExternalEventId: previousDelivery?.external_event_id,
        }),
      ])
    : [[], []];
  if (["confirm", "update", "cancel"].includes(action)) {
    if (
      !text(input.operationId) ||
      !Number.isSafeInteger(input.expectedVersion)
    )
      throw new Error("operationId and expectedVersion are required");
    row = await changeCoordinatedMeeting({
      db,
      workspaceId: args.workspaceId,
      scheduleId: row.id,
      expectedVersion: input.expectedVersion,
      operationKey: input.operationId,
      actorLabel: `${args.actorLabel} — Harper 일정 조율 실행`,
      action: action as "confirm" | "update" | "cancel",
      startAt: start?.toISOString(),
      endAt: end?.toISOString(),
      timezone: start ? timezone : undefined,
      ...(action !== "cancel"
        ? {
            title: text(input.title) || undefined,
            purpose: text(input.purpose) || undefined,
            durationMinutes: input.durationMinutes,
          }
        : {}),
      assertAccess,
    });
    rows = await readCoordinatedMeetings(db, args.workspaceId, {
      scheduleId: row.id,
    });
    row = rows[0];
  }
  let calendar = row
    ? await fetchMeetingCalendarDelivery({ admin, scheduleId: row.id })
    : null;
  if (
    ["confirm", "update", "cancel", "retry_delivery"].includes(action) &&
    row?.confirmed_start_at
  ) {
    await assertAccess(db.query, row);
    calendar = await ensureMeetingCalendarEvent(row.id);
  }
  const conversation: string[] = [];
  for (const meeting of row ? [row] : []) {
    const ref = meeting.source_refs?.coordination;
    if (!ref || (!scoped && ref.userId !== args.user.id)) continue;
    // Same-role thread scope and original private conversation are preserved. These are user facts, not generated plans.
    const history = await db.query(
      `select id,role,company_user_id,content,created_at from company_messages where conversation_id=$1::uuid and company_workspace_id=$2::uuid
      and id>=$3 and (role_id is null or role_id=$4::uuid) and role in ('user','assistant') order by id`,
      [ref.conversationId, args.workspaceId, ref.messageId, roleId]
    );
    conversation.push(
      `Original meeting request from teammate ${ref.userId} and later company conversation for ${meeting.id}:\n${history.map((m) => `${m.role}${m.company_user_id ? ` (${m.company_user_id})` : ""} message ${m.id} (${formatLlmDateTime(m.created_at)}): ${m.content}`).join("\n")}`
    );
  }
  return {
    scheduleId: row?.id,
    version: row?.version,
    status: row?.status,
    calendar,
    modelOutput: [
      `Meeting action: ${action}. ${action === "prepare" ? "Request saved; no candidate message or Calendar invitation sent." : ""}`,
      ...(row ? [row] : rows).map(formatCoordinatedMeeting),
      rows.length || row
        ? ""
        : "No saved meetings for this candidate and Role.",
      needsAvailability
        ? `Saved availability:\n${formatCoordinationAvailability(availability)}`
        : "",
      needsAvailability
        ? `Scheduling evidence window: ${formatLlmDateTime(windowStart.toISOString())} to ${formatLlmDateTime(windowEnd.toISOString())}. Calendar sync currently covers the next 14 days; outside that coverage personal conflicts remain unverified.`
        : "",
      ...evidence,
      ...[...harperBusy, ...calendarBusy].map(
        (b) =>
          `Known busy: ${formatLlmDateTime(b.startAt)} to ${formatLlmDateTime(b.endAt)}.`
      ),
      `Harper shared Calendar: ${process.env.HARPER_GOOGLE_CALENDAR_ACCOUNT_ID && process.env.HARPER_GOOGLE_CALENDAR_USER_ID && process.env.HARPER_GOOGLE_CALENDAR_EMAIL ? "configured; live access checked on delivery" : "not configured"}. Connected personal Calendar takes priority.`,
      calendar
        ? `Calendar delivery: ${calendar.status}. Calendar host: ${calendar.organizerSource === "personal" ? "requester's personal Calendar" : calendar.organizerSource === "harper" ? "Harper shared Calendar" : "not recorded"}.${calendar.meetUrl ? ` Meet: ${calendar.meetUrl}` : ""}${calendar.calendarUrl ? ` Event: ${calendar.calendarUrl}` : ""}${calendar.error ? ` ${calendar.error}` : ""} Attendee acceptance and human readership are unverified.`
        : "No Calendar delivery recorded.",
      ...conversation,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
