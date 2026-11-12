import type {
  Database,
  Query,
} from "@/lib/career/matching/internalScoring/database";
import { assertAgentContactPair } from "@/lib/agentContacts/store";
import { readAgentContactRelationship } from "@/lib/agentContacts/relationship";

export async function readCoordinatedMeetings(
  db: Database,
  workspaceId: string,
  input: { scheduleId?: string; roleId?: string; talentId?: string }
) {
  return db.query(
    `select s.*,r.meeting_config_snapshot,r.source_company_message_id from meeting_schedules s
    left join meeting_schedule_rounds r on r.id=s.active_round_id
    where s.company_workspace_id=$1::uuid and ($2::uuid is null or s.id=$2::uuid)
      and ($3::uuid is null or s.role_id=$3::uuid) and ($4::uuid is null or s.talent_id=$4::uuid)
    order by s.updated_at desc,s.id`,
    [
      workspaceId,
      input.scheduleId || null,
      input.roleId || null,
      input.talentId || null,
    ]
  );
}

export async function assertMeetingRequestSource(
  q: Query,
  row: any,
  checkIntroduction = true
) {
  const ref = row.source_refs?.coordination;
  if (!ref)
    throw new Error(
      "This meeting uses the existing time-selection invitation. Read its current request before changing it."
    );
  const [source] = await q(
    `select id,company_user_id,conversation_id,content from company_messages
    where id=$1 and company_workspace_id=$2::uuid and company_user_id=$3::uuid and conversation_id=$4::uuid and role='user'`,
    [ref.messageId, row.company_workspace_id, ref.userId, ref.conversationId]
  );
  if (!source)
    throw new Error("Original company meeting request is unavailable");
  if (checkIntroduction && Object.hasOwn(ref, "consentAt")) {
    const [consent] = await q(
      "select id from talent_opportunity_recommendation where id=$1::uuid and feedback_at is not distinct from $2::timestamptz",
      [row.recommendation_id, ref.consentAt]
    );
    if (!consent)
      throw new Error("Candidate consent changed after this meeting request");
  }
  if (checkIntroduction && ref.introductionRootId) {
    const [root] = await q(
      `select m.id from agent_contact_messages m join talent_opportunity_recommendation r on r.agent_introduction_root_id=m.id
      where m.id=$1::uuid and m.root_id=m.id and m.cancelled_at is null and r.id=$2::uuid and r.feedback in ('like','positive')`,
      [ref.introductionRootId, row.recommendation_id]
    );
    if (!root)
      throw new Error("Meeting introduction was withdrawn or replaced");
  }
  return source;
}

export async function changeCoordinatedMeeting(args: {
  db: Database;
  workspaceId: string;
  scheduleId: string;
  expectedVersion: number;
  operationKey: string;
  actorLabel?: string;
  action: "confirm" | "update" | "cancel";
  startAt?: string;
  endAt?: string;
  timezone?: string;
  title?: string;
  purpose?: string;
  durationMinutes?: number;
  assertAccess: (q: Query, row: any) => Promise<void>;
}) {
  return args.db.transaction(async (q) => {
    const [s] = await q(
      "select * from meeting_schedules where id=$1::uuid and company_workspace_id=$2::uuid for update",
      [args.scheduleId, args.workspaceId]
    );
    if (!s) throw new Error("Meeting unavailable");
    await args.assertAccess(q, s);
    await assertMeetingRequestSource(q, s, args.action !== "cancel");
    const request = {
      action: args.action,
      startAt: args.startAt ?? null,
      endAt: args.endAt ?? null,
      timezone: args.timezone ?? null,
      title: args.title ?? null,
      purpose: args.purpose ?? null,
      durationMinutes: args.durationMinutes ?? null,
    };
    const previous = s.source_refs?.calendarMutation;
    if (previous?.operationKey === args.operationKey) {
      if (
        JSON.stringify(previous.request) !== JSON.stringify(request) &&
        !(
          await q("select $1::jsonb=$2::jsonb as same", [
            JSON.stringify(previous.request),
            JSON.stringify(request),
          ])
        )[0].same
      )
        throw new Error("Operation ID reused with different meeting input");
      return s;
    }
    if (Number(s.version) !== args.expectedVersion)
      throw new Error(
        "Meeting changed. Read its current version before continuing."
      );
    const [delivery] = await q(
      "select * from meeting_schedule_calendar_events where schedule_id=$1::uuid for update",
      [s.id]
    );
    if (
      delivery?.status === "creating" &&
      delivery.lease_token &&
      Date.now() - new Date(delivery.updated_at).getTime() < 90_000
    )
      throw new Error(
        "Calendar delivery is in progress. Read its outcome before changing this meeting."
      );
    if (args.action === "confirm" && s.status !== "preparing")
      throw new Error(
        "Only an unconfirmed request can be confirmed; use update for an agreed time change"
      );
    if (args.action === "update" && s.status !== "confirmed")
      throw new Error("Only an existing confirmed meeting can be rescheduled");
    if (s.status === "cancelled") throw new Error("This meeting is cancelled");
    if (args.action !== "cancel") {
      const { stage } = await readAgentContactRelationship(
        q,
        s.recommendation_id
      );
      if (
        stage !== "connected" &&
        stage !== "final_offer" &&
        !stage?.startsWith("custom:")
      )
        throw new Error(
          "The candidate is no longer in a connected active process"
        );
      await assertAgentContactPair(q, {
        role_id: s.role_id,
        talent_id: s.talent_id,
        company_workspace_id: s.company_workspace_id,
        recommendation_id: s.recommendation_id,
      });
      const duration = args.durationMinutes ?? Number(s.duration_minutes);
      if (
        !Number.isSafeInteger(duration) ||
        duration < 1 ||
        new Date(args.startAt!).getTime() <= Date.now() ||
        new Date(args.endAt!).getTime() - new Date(args.startAt!).getTime() !==
          duration * 60_000
      )
        throw new Error(
          "The agreed future time range must match the meeting duration"
        );
      // Same locks as Calendar sync and the existing selection-page confirmation.
      for (const id of [
        ...new Set<string>(
          s.company_attendees.map((a: any) => a.companyUserId)
        ),
      ].sort())
        await q(
          "select pg_advisory_xact_lock(hashtextextended('meeting-attendee:'||$1,0))",
          [id]
        );
      await q(
        "select pg_advisory_xact_lock(hashtextextended('meeting-talent:'||$1,0))",
        [s.talent_id]
      );
      const overlaps = await q(
        `select id from meeting_schedules other where id<>$1::uuid and status='confirmed'
        and confirmed_start_at<$3::timestamptz and coalesce(confirmed_end_at,confirmed_start_at)>$2::timestamptz
        and (talent_id=$4::uuid or exists(select 1 from jsonb_array_elements(other.company_attendees) a,
          jsonb_array_elements($5::jsonb) b where a->>'companyUserId'=b->>'companyUserId'))`,
        [
          s.id,
          args.startAt,
          args.endAt,
          s.talent_id,
          JSON.stringify(s.company_attendees),
        ]
      );
      if (overlaps.length)
        throw new Error(
          "An existing appointment now conflicts with this time; read current availability and coordinate another time"
        );
    }
    const status = args.action === "cancel" ? "cancelled" : "confirmed";
    const [updated] = await q(
      `update meeting_schedules set status=$2,confirmed_start_at=coalesce($3::timestamptz,confirmed_start_at),
      confirmed_end_at=coalesce($4::timestamptz,confirmed_end_at),timezone=coalesce($5,timezone),version=version+1,updated_at=now(),
      source_refs=source_refs||jsonb_build_object('calendarMutation',$6::jsonb),title=coalesce($7,title),duration_minutes=coalesce($8,duration_minutes) where id=$1::uuid returning *`,
      [
        s.id,
        status,
        args.startAt ?? null,
        args.endAt ?? null,
        args.timezone ?? null,
        JSON.stringify({ operationKey: args.operationKey, request, actorLabel: args.actorLabel ?? null }),
        args.title ?? null,
        args.durationMinutes ?? null,
      ]
    );
    await q(
      `update meeting_schedule_rounds set status=$2,selection_snapshot=jsonb_build_object('timezone',$3::text,'source','agent_correspondence'),
      submitted_at=case when $2='confirmed' then now() else submitted_at end,version=version+1,updated_at=now(),
      meeting_config_snapshot=meeting_config_snapshot||jsonb_build_object('title',$4::text,'durationMinutes',$5::int)
        ||case when $6::text is null then '{}'::jsonb else jsonb_build_object('meetingPurpose',$6::text) end
      where id=$1::uuid`,
      [
        s.active_round_id,
        status,
        updated.timezone,
        updated.title,
        updated.duration_minutes,
        args.purpose ?? null,
      ]
    );
    // Pending work survives a process crash before the external call.
    if (updated.confirmed_start_at)
      await q(
        `insert into meeting_schedule_calendar_events(schedule_id,organizer_company_user_id,status)
      values($1::uuid,$2::uuid,'pending') on conflict(schedule_id) do update set status='pending',lease_token=null,updated_at=now()`,
        [s.id, s.organizer_company_user_id]
      );
    return updated;
  });
}

/** Recheck the durable original authorization immediately before an external write. */
export async function assertMeetingDeliveryCurrent(
  q: Query,
  scheduleId: string,
  version: number,
  token: string
) {
  const [row] = await q(
    `select s.* from meeting_schedules s join meeting_schedule_calendar_events d on d.schedule_id=s.id
    where s.id=$1::uuid and s.version=$2 and d.lease_token=$3::uuid and d.status='creating' for update of s,d`,
    [scheduleId, version, token]
  );
  if (!row) throw new Error("Meeting or Calendar delivery lease changed");
  if (!row.source_refs?.coordination) return;
  const source = await assertMeetingRequestSource(
    q,
    row,
    row.status !== "cancelled"
  );
  const { assertAgentContactSource } =
    await import("@/lib/agentContacts/store");
  await assertAgentContactSource(
    q,
    {
      kind: "company",
      workspaceId: row.company_workspace_id,
      userId: source.company_user_id,
      messageId: Number(source.id),
    },
    row.role_id
  );
  if (row.status !== "cancelled") {
    const { stage } = await readAgentContactRelationship(
      q,
      row.recommendation_id
    );
    if (
      stage !== "connected" &&
      stage !== "final_offer" &&
      !stage?.startsWith("custom:")
    )
      throw new Error("Candidate connection is no longer active");
    await assertAgentContactPair(q, {
      role_id: row.role_id,
      talent_id: row.talent_id,
      company_workspace_id: row.company_workspace_id,
      recommendation_id: row.recommendation_id,
    });
  }
  const members = await q(
    `select company_user_id from company_user_workspace where company_workspace_id=$1::uuid
    and company_user_id in (select (a->>'companyUserId')::uuid from jsonb_array_elements($2::jsonb) a) for share`,
    [row.company_workspace_id, JSON.stringify(row.company_attendees)]
  );
  if (
    new Set(members.map((m) => m.company_user_id)).size !==
    new Set(row.company_attendees.map((a: any) => a.companyUserId)).size
  )
    throw new Error("Meeting attendees changed workspace membership");
}
