import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  changeCoordinatedMeeting,
  assertMeetingDeliveryCurrent,
} from "./coordinationStore";
import type { Database } from "@/lib/career/matching/internalScoring/database";
import { sendAgentContact } from "@/lib/agentContacts/store";
import { formatCoordinationAvailability } from "./coordination";

test("scheduling evidence preserves exact weekly hours and date overrides", () => {
  const rendered = formatCoordinationAvailability({ timezone: "Asia/Seoul",
    weeklyRules: { "1": [{ start: "09:00", end: "11:00" }], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [] },
    dateOverrides: { "2026-11-10": [{ start: "14:00", end: "17:00" }], "2026-11-09": [] } });
  assert.match(rendered, /월요일: 09:00–11:00/);
  assert.match(rendered, /2026-11-10: 14:00–17:00/);
  assert.match(rendered, /2026-11-09: unavailable/);
});

test("correspondence rejects a candidate or Role inconsistent with its exact recommendation", async () => {
  const { pg, db } = await fixture();
  try {
    for (const target of [{ talentId: id(90) }, { roleId: id(91) }])
      await assert.rejects(sendAgentContact({ source: { kind: "company", workspaceId: id(1), userId: id(3), messageId: 1 },
        recommendationId: id(5), operationKey: "mismatched-target", message: "Interview request", ...target }, db), /target does not match/);
    assert.equal((await db.query("select count(*)::int as n from agent_contact_messages"))[0].n, 0);
  } finally { await pg.close(); }
});

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture() {
  const pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create table meeting_schedules(id uuid primary key,company_workspace_id uuid,role_id uuid,recommendation_id uuid,talent_id uuid,
      organizer_company_user_id uuid,status text,title text,duration_minutes integer,
      company_attendees jsonb,active_round_id uuid,version bigint default 1,updated_at timestamptz default now(),confirmed_start_at timestamptz,confirmed_end_at timestamptz,
      timezone text default 'Asia/Seoul',scheduling_source text default 'harper',source_refs jsonb default '{}',source_key text);
    create table meeting_schedule_rounds(id uuid primary key,status text,selection_snapshot jsonb,submitted_at timestamptz,version bigint default 1,updated_at timestamptz,meeting_config_snapshot jsonb default '{}');
    create table meeting_schedule_calendar_events(schedule_id uuid primary key,organizer_company_user_id uuid,status text default 'pending'
      constraint meeting_schedule_calendar_events_status_check check(status in ('pending','creating','created','created_without_meet','failed')),
      external_event_id text,attempts integer default 0,last_error text,updated_at timestamptz default now());
    create table company_user_calendar_busy_blocks(company_user_id uuid,external_event_id text,start_at timestamptz,end_at timestamptz,is_blocking boolean);
    create table company_messages(id bigint primary key,company_workspace_id uuid,company_user_id uuid,conversation_id uuid,role text,content text);
    create table company_workspace(company_workspace_id uuid primary key,company_name text,published_name text,is_reviewing boolean);
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,status text,is_expired boolean,expires_at timestamptz,information jsonb);
    create table company_user_workspace(id uuid,company_workspace_id uuid,company_user_id uuid,authority text,access_scope text,team_id uuid);
    create table company_internal_roles(role_id uuid,team_id uuid);
    create table company_workspace_team_members(membership_id uuid,team_id uuid);
    create table talent_users(user_id uuid primary key,deleted_at timestamptz);
    create table talent_setting(user_id uuid,profile_visibility text,blocked_companies text[]);
    create table talent_opportunity_recommendation(id uuid primary key,talent_id uuid,role_id uuid,feedback text,saved_stage text,agent_introduction_root_id uuid,feedback_at timestamptz);
    create table talent_opportunity_tag(id uuid,talent_id uuid,opportunity_id uuid,tag text,updated_at timestamptz);
    create table ops_matching_role_stages(id uuid,role_id uuid);
    create table talent_progress(id uuid,recommendation_id uuid,kind text,metadata jsonb);
    create table agent_contact_messages(id uuid,root_id uuid,cancelled_at timestamptz);
  `);
  const prior = readFileSync(
    "supabase/migrations/20261102081607_career_meeting_schedules.sql",
    "utf8"
  );
  const start = prior.indexOf(
    "alter table public.meeting_schedules add constraint meeting_schedules_execution_scope"
  );
  await pg.exec(prior.slice(start, prior.indexOf(";", start) + 1));
  await pg.exec(
    readFileSync(
      "supabase/migrations/20261108140241_agent_meeting_coordination.sql",
      "utf8"
    )
  );
  await pg.exec(
    `create trigger busy before update of status,confirmed_start_at,confirmed_end_at on meeting_schedules for each row execute function enforce_confirmed_meeting_calendar_busy_v1();`
  );
  const db: Database = {
    query: async (sql, params) => (await pg.query(sql, params)).rows as any[],
    transaction: (work) =>
      pg.transaction(async (tx) =>
        work(async (sql, params) => (await tx.query(sql, params)).rows as any[])
      ),
  };
  await db.query(
    "insert into company_workspace values($1,'Fixture company',null,false)",
    [id(1)]
  );
  await db.query(
    "insert into company_roles values($1,$2,'internal','active',false,null,'{}')",
    [id(2), id(1)]
  );
  await db.query("insert into company_internal_roles values($1,null)", [id(2)]);
  await db.query(
    "insert into company_user_workspace values($1,$2,$3,'owner','organization',null)",
    [id(10), id(1), id(3)]
  );
  await db.query("insert into talent_users values($1,null)", [id(4)]);
  await db.query("insert into talent_setting values($1,'public','{}')", [
    id(4),
  ]);
  await db.query(
    "insert into talent_opportunity_recommendation(id,talent_id,role_id,feedback,saved_stage,agent_introduction_root_id) values($1,$2,$3,'like','accepted',null)",
    [id(5), id(4), id(2)]
  );
  await db.query(
    "insert into talent_progress values($1,$2,'org_stage_change','{\"stage\":\"connected\"}')",
    [id(9), id(5)]
  );
  await db.query(
    "insert into company_messages values(1,$1,$2,$3,'user','Arrange the role interview next week')",
    [id(1), id(3), id(8)]
  );
  await db.query(
    `insert into meeting_schedules(id,company_workspace_id,role_id,recommendation_id,talent_id,organizer_company_user_id,status,title,duration_minutes,company_attendees,active_round_id,source_refs)
    values($1,$2,$3,$4,$5,$6,'preparing','Interview',40,$7::jsonb,$8,$9::jsonb)`,
    [
      id(6),
      id(1),
      id(2),
      id(5),
      id(4),
      id(3),
      JSON.stringify([{ companyUserId: id(3) }]),
      id(7),
      JSON.stringify({
        coordination: { messageId: 1, userId: id(3), conversationId: id(8) },
      }),
    ]
  );
  await db.query(
    "insert into meeting_schedule_rounds(id,status) values($1,'draft')",
    [id(7)]
  );
  const change = (extra: Record<string, any> = {}) =>
    changeCoordinatedMeeting({
      db,
      workspaceId: id(1),
      scheduleId: id(6),
      expectedVersion: 1,
      operationKey: "confirm-one",
      action: "confirm",
      startAt: "2035-01-01T01:00:00Z",
      endAt: "2035-01-01T01:40:00Z",
      timezone: "Asia/Seoul",
      assertAccess: async () => {},
      ...extra,
    });
  return { pg, db, change };
}

test("agreed time, retry identity, optimistic concurrency, busy exclusion and cancellation persist atomically", async () => {
  const { pg, db, change } = await fixture();
  try {
    assert.equal((await change()).version, 2);
    assert.equal((await change()).version, 2);
    await assert.rejects(
      change({ endAt: "2035-01-01T02:00:00Z" }),
      /Operation ID reused/
    );
    await assert.rejects(
      change({ operationKey: "stale", action: "update" }),
      /Meeting changed/
    );
    const [claim] = await db.query(
      "select claim_meeting_calendar_delivery_v2($1) as value",
      [id(6)]
    );
    assert.equal(claim.value.claimed, true);
    assert.equal(
      (
        await db.query(
          "select claim_meeting_calendar_delivery_v2($1) as value",
          [id(6)]
        )
      )[0].value.claimed,
      false
    );
    await db.transaction((q) =>
      assertMeetingDeliveryCurrent(q, id(6), 2, claim.value.token)
    );
    await assert.rejects(
      change({ action: "update", expectedVersion: 2, operationKey: "update" }),
      /delivery is in progress/
    );
    await db.query(
      "update meeting_schedule_calendar_events set external_event_id='event',status='created',delivered_version=2,lease_token=null"
    );
    await db.query(
      "insert into company_user_calendar_busy_blocks values($1,encode(sha256(convert_to('harper.google-calendar.busy.event:event','UTF8')),'hex'),'2035-01-01T01:00Z','2035-01-01T01:40Z',true)",
      [id(3)]
    );
    const updated = await change({
      action: "update",
      expectedVersion: 2,
      operationKey: "update",
      startAt: "2035-01-01T01:10:00Z",
      endAt: "2035-01-01T01:50:00Z",
    });
    assert.equal(updated.version, 3);
    await db.query(
      "insert into company_user_calendar_busy_blocks values($1,'another-event','2035-01-01T02:00Z','2035-01-01T03:00Z',true)",
      [id(3)]
    );
    await assert.rejects(
      change({
        action: "update",
        expectedVersion: 3,
        operationKey: "conflict",
        startAt: "2035-01-01T02:00:00Z",
        endAt: "2035-01-01T02:40:00Z",
      }),
      /synced Google Calendar event overlaps/
    );
    assert.equal(
      (await db.query("select version from meeting_schedules"))[0].version,
      3
    );
    await db.query(
      "update talent_opportunity_recommendation set saved_stage='closed'"
    );
    await assert.rejects(
      change({
        action: "update",
        expectedVersion: 3,
        operationKey: "withdrawn",
      }),
      /consent is no longer active/
    );
    const cancelled = await change({
      action: "cancel",
      expectedVersion: 3,
      operationKey: "cancel",
      startAt: undefined,
      endAt: undefined,
      timezone: undefined,
    });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(
      (await db.query("select status from meeting_schedule_calendar_events"))[0]
        .status,
      "pending"
    );
  } finally {
    await pg.close();
  }
});

test("original authorization, candidate consent and attendee membership are rechecked before external delivery", async () => {
  const { pg, db, change } = await fixture();
  try {
    await assert.rejects(
      change({
        assertAccess: async () => {
          throw new Error("Role access revoked");
        },
      }),
      /Role access revoked/
    );
    assert.equal(
      (await db.query("select status from meeting_schedules"))[0].status,
      "preparing"
    );
    await change();
    const [claim] = await db.query(
      "select claim_meeting_calendar_delivery_v2($1) as value",
      [id(6)]
    );
    await assert.rejects(
      db.transaction((q) =>
        assertMeetingDeliveryCurrent(q, id(6), 1, claim.value.token)
      ),
      /lease changed/
    );
    await db.query("update company_user_workspace set authority='viewer'");
    await assert.rejects(
      db.transaction((q) =>
        assertMeetingDeliveryCurrent(q, id(6), 2, claim.value.token)
      ),
      /permission unavailable/
    );
    await db.query("update company_user_workspace set authority='owner'");
    await db.query(
      "update talent_opportunity_recommendation set feedback='dislike'"
    );
    await assert.rejects(
      db.transaction((q) =>
        assertMeetingDeliveryCurrent(q, id(6), 2, claim.value.token)
      ),
      /consent is no longer active/
    );
  } finally {
    await pg.close();
  }
});

test("newly agreed duration is saved with its snapshot and a pending Meet can be resumed", async () => {
  const { pg, db, change } = await fixture();
  try {
    const row = await change({
      durationMinutes: 30,
      endAt: "2035-01-01T01:30:00Z",
      title: "Role discussion",
      purpose: "Discuss team responsibilities",
    });
    assert.equal(row.duration_minutes, 30);
    assert.deepEqual(
      (
        await db.query(
          "select meeting_config_snapshot from meeting_schedule_rounds"
        )
      )[0].meeting_config_snapshot,
      {
        title: "Role discussion",
        durationMinutes: 30,
        meetingPurpose: "Discuss team responsibilities",
      }
    );
    const [claim] = await db.query(
      "select claim_meeting_calendar_delivery_v2($1) as value",
      [id(6)]
    );
    await db.query(
      "update meeting_schedule_calendar_events set status='creating',lease_token=null,external_event_id='original',delivered_version=2"
    );
    const [retry] = await db.query(
      "select claim_meeting_calendar_delivery_v2($1) as value",
      [id(6)]
    );
    assert.equal(retry.value.claimed, true);
    assert.equal(retry.value.eventId, "original");
    assert.notEqual(retry.value.token, claim.value.token);
    await db.query(
      "update meeting_schedule_calendar_events set updated_at=now()-interval '2 minutes'"
    );
    assert.equal(
      (
        await db.query(
          "select claim_meeting_calendar_delivery_v2($1) as value",
          [id(6)]
        )
      )[0].value.claimed,
      true
    );
    await db.query(
      "update meeting_schedule_calendar_events set status='created',delivered_version=2,lease_token=null"
    );
    assert.equal(
      (
        await db.query(
          "select claim_meeting_calendar_delivery_v2($1) as value",
          [id(6)]
        )
      )[0].value.claimed,
      false
    );
  } finally {
    await pg.close();
  }
});

test("an accepted legacy relationship opens one agent channel without accepting or introducing again", async () => {
  const { pg, db } = await fixture();
  try {
    await pg.exec(`alter table agent_contact_messages add primary key(id),add column reply_to_id uuid,add column company_workspace_id uuid,
      add column role_id uuid,add column talent_id uuid,add column recommendation_id uuid,add column direction text,add column body text,
      add column material_id uuid,add column document_refs jsonb,add column source jsonb,add column operation_key text,
      add column execution_usage jsonb default '{}',add column receiver_job_id uuid,add column receiver_kind text,add column revision bigint default 1;
      create trigger cancel_withdrawn after update of feedback,saved_stage,agent_introduction_root_id on talent_opportunity_recommendation for each row execute function cancel_withdrawn_agent_introduction_v1();
      create unique index agent_contact_operation on agent_contact_messages(talent_id,direction,operation_key);
      create table talent_conversations(id uuid,user_id uuid,updated_at timestamptz);
      create table opportunity_discovery_run(id uuid default gen_random_uuid(),talent_id uuid,conversation_id uuid,trigger text,run_mode text,status text,dedupe_key text,trigger_payload jsonb);
      create unique index discovery_dedupe on opportunity_discovery_run(dedupe_key) where dedupe_key is not null;`);
    const args = {
      db,
      source: {
        kind: "company" as const,
        workspaceId: id(1),
        userId: id(3),
        messageId: 1,
      },
      recommendationId: id(5),
      operationKey: "invite-time",
      message: "When is a good time for the requested interview?",
    };
    await assert.rejects(sendAgentContact(args, db), /existing introduction/);
    await db.query(
      "insert into talent_progress values($1,$2,'intro_to_company','{}')",
      [id(11), id(5)]
    );
    await db.query(
      "update talent_opportunity_recommendation set feedback='positive'"
    );
    const sent = await sendAgentContact(args, db);
    assert.equal(sent.message.root_id, sent.message.id);
    assert.equal(sent.message.direction, "to_talent");
    assert.equal(sent.message.receiver_kind, "career");
    const retry = await sendAgentContact(args, db);
    assert.equal(retry.message.id, sent.message.id);
    const followup = await sendAgentContact(
      {
        ...args,
        operationKey: "followup",
        message: "The company can also meet Thursday.",
      },
      db
    );
    assert.equal(followup.message.root_id, sent.message.root_id);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from talent_progress where kind='intro_to_company'"
        )
      )[0].n,
      1
    );
    assert.equal(
      (
        await db.query(
          "select feedback,saved_stage from talent_opportunity_recommendation"
        )
      )[0].feedback,
      "positive"
    );
    await db.query(
      "update talent_opportunity_recommendation set saved_stage='accepted'"
    );
    assert.equal(
      (
        await db.query(
          "select cancelled_at from agent_contact_messages where id=$1",
          [sent.message.root_id]
        )
      )[0].cancelled_at,
      null
    );
    await db.query(
      "update talent_opportunity_recommendation set saved_stage='closed'"
    );
    await assert.rejects(
      sendAgentContact({ ...args, operationKey: "after-withdrawal" }, db),
      /withdrawn/
    );
  } finally {
    await pg.close();
  }
});
