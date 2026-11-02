import assert from "node:assert/strict";
import test from "node:test";
import { setupMeetings, meetingAdmin, owner, other, role } from "./testSupport";
import { TALENT_MEETING_TOOLS } from "./tools";
import {
  readTalentSchedules,
  readUpcomingTalentScheduleContext,
  changedTalentSchedules,
} from "./server";
import { writeCareerSchedule, collectDueCareerWork } from "../schedules/server";
const input = {
  action: "create",
  title: "Platform interview",
  source_key: "gmail:thread-1:meeting-1",
  starts_at: "2030-01-07T09:00:00+09:00",
  timezone: "Asia/Seoul",
  role_id: role,
  content: "Bring architecture notes. https://meet.example.test/room",
  source_refs: { gmailThreadIds: ["thread-1"] },
};

test("external appointment lifecycle preserves ownership, provenance, retries and company/Calendar isolation", async () => {
  const db = await setupMeetings();
  try {
    const admin = meetingAdmin(db),
      context: any = { admin, userId: owner, toolCallId: "call-1" };
    const save = async (value: any, ctx = context) =>
      (await TALENT_MEETING_TOOLS.upsert_talent_schedules.execute!(
        value,
        ctx
      )) as any;
    const created = await save(input),
      row = created.schedule;
    assert.equal(
      new Date(row.confirmed_start_at).toISOString(),
      "2030-01-07T00:00:00.000Z"
    );
    assert.equal(row.confirmed_end_at, null);
    assert.equal((await save(input)).schedule.id, row.id);
    await assert.rejects(
      save(input, { ...context, toolCallId: "another-run" }),
      /already recorded/
    );
    assert.equal(
      (await readTalentSchedules({ admin, userId: other })).schedules.length,
      0
    );
    await assert.rejects(
      save(
        { action: "cancel", schedule_id: row.id, expected_version: 1 },
        { ...context, userId: other }
      ),
      /unavailable/
    );
    const moved = (
      await save({
        action: "update",
        schedule_id: row.id,
        expected_version: 1,
        starts_at: "2030-01-08T15:00:00+09:00",
        content: "Changed to Tuesday.",
      })
    ).schedule;
    assert.equal(moved.version, 2);
    assert.match(
      (await changedTalentSchedules({
        admin,
        userId: owner,
        versions: { [row.id]: 1 },
      }))!,
      /Changed to Tuesday/
    );
    await assert.rejects(
      save({ action: "cancel", schedule_id: row.id, expected_version: 1 }),
      /version conflict/
    );
    const cancel = await save({
      action: "cancel",
      schedule_id: row.id,
      expected_version: 2,
    });
    assert.equal(cancel.schedule.status, "cancelled");
    assert.equal(
      (await readTalentSchedules({ admin, userId: owner })).schedules.length,
      0
    );
    assert.equal(
      (await readTalentSchedules({ admin, userId: owner, scheduleId: row.id }))
        .schedules[0].status,
      "cancelled"
    );
    assert.equal(
      (await db.query("select * from meeting_test_effects")).rows.length,
      0
    );
    const permissions = (
      await db.query<any>(
        "select has_function_privilege('authenticated','write_talent_meeting_schedule(uuid,uuid,text,jsonb)','execute') allowed"
      )
    ).rows[0];
    assert.equal(permissions.allowed, false);
    await db.query(
      `insert into meeting_schedules(talent_id,role_id,company_workspace_id,organizer_company_user_id,recommendation_id,title,status,confirmed_start_at,confirmed_end_at,idempotency_key)
      values($1,$2,$1,$1,$1,'Harper interview','confirmed','2030-01-07T00:00Z','2030-01-07T01:00Z','harper-original')`,
      [owner, role]
    );
    const harper = (
      await db.query<any>(
        "select * from meeting_schedules where scheduling_source='harper'"
      )
    ).rows[0];
    assert.equal(
      (await db.query("select * from meeting_test_effects")).rows.length,
      2
    );
    await assert.rejects(
      save({
        action: "update",
        schedule_id: harper.id,
        expected_version: 1,
        title: "Changed",
      }),
      /Harper-managed/
    );
    await assert.rejects(
      db.query(
        "update meeting_schedules set company_workspace_id=$1 where id=$2",
        [owner, row.id]
      ),
      /execution_scope/
    );
  } finally {
    await db.close();
  }
});

test("72-hour input includes complete facts, and a separate reservation executes before a later recurring check", async () => {
  const db = await setupMeetings();
  try {
    const admin = meetingAdmin(db),
      ctx: any = { admin, userId: owner, toolCallId: "create" };
    const { schedule } = (await TALENT_MEETING_TOOLS.upsert_talent_schedules
      .execute!(input, ctx)) as any;
    const context = await readUpcomingTalentScheduleContext({
      admin,
      userId: owner,
      now: new Date("2030-01-06T00:00Z"),
    });
    assert.match(context, /2030-01-07 09:00/);
    assert.match(context, /architecture notes/);
    assert.match(context, /thread-1/);
    assert.doesNotMatch(context, /2030-01-07T/);
    const before = await readUpcomingTalentScheduleContext({
      admin,
      userId: owner,
      now: new Date("2030-01-01T00:00Z"),
    });
    assert.doesNotMatch(before, /Platform interview/);
    const work = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "prep",
      input: {
        action: "create",
        title: "Prepare interview",
        instruction: "Read current appointment and help prepare.",
        next_run_at: "2020-01-01T00:00:00Z",
        target_refs: { meetingScheduleIds: [schedule.id] },
      },
    });
    const due = await collectDueCareerWork({ admin });
    assert.equal(due.runIds.length, 1);
    const run = (
      await db.query<any>(
        "select * from opportunity_discovery_run where id=$1",
        [due.runIds[0]]
      )
    ).rows[0];
    assert.deepEqual(
      run.trigger_payload.sourceEvents[0].targetRefs.meetingScheduleIds,
      [schedule.id]
    );
    assert.equal(run.trigger_payload.sourceEvents[0].sourceId, work.id);
    await assert.rejects(
      writeCareerSchedule({
        admin,
        userId: other,
        requestId: "foreign",
        input: {
          action: "create",
          title: "Prep",
          instruction: "Prep",
          next_run_at: "2030-01-01T00:00Z",
          target_refs: { meetingScheduleIds: [schedule.id] },
        },
      }),
      /unavailable/
    );
  } finally {
    await db.close();
  }
});
