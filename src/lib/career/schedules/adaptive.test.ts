import assert from "node:assert/strict";
import test from "node:test";
import { localAdmin, owner, other, write } from "./testSupport";
import { setupDaily as setup } from "./dailyTestSupport";
import {
  collectDueCareerWork,
  formatCareerSchedules,
  nextScheduleOccurrence,
  readCareerCheckIn,
  readCareerScheduleFollowIndex,
  writeCareerSchedule,
} from "./server";
import {
  assertCareerSourceEventsCurrent,
  CareerSourceChangedError,
} from "../companies/server";

test("onboarding creates one initial check-in; later reads preserve arbitrary timing, instructions and pauses", async () => {
  const db = await setup(),
    admin = localAdmin(db);
  try {
    assert.equal(await readCareerCheckIn({ admin, userId: owner }), null);
    await db.query(
      "update talent_setting set is_onboarding_done=true where user_id=$1",
      [owner]
    );
    const initial = (await readCareerCheckIn({ admin, userId: owner }))!;
    assert.equal(initial.interval_days, 3);
    assert.equal(initial.status, "active");
    assert.ok(
      Math.abs(
        new Date(initial.next_run_at!).getTime() - Date.now() - 3 * 86400000
      ) < 5000
    );
    const changed = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "change-timing",
      actor: "career_agent",
      input: {
        action: "update",
        schedule_id: initial.id,
        expected_revision: initial.revision,
        interval_days: 5.5,
        instruction: "Read the current Brief; only send material developments.",
        reason: "The user asked for important information only.",
      },
    });
    assert.equal(changed.interval_days, 5.5);
    assert.ok(
      Math.abs(
        new Date(changed.next_run_at!).getTime() - Date.now() - 5.5 * 86400000
      ) < 5000
    );
    const paused = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "pause",
      actor: "career_agent",
      input: {
        action: "pause",
        schedule_id: initial.id,
        expected_revision: changed.revision,
        reason: "Harper paused its checks after reviewing contact history.",
      },
    });
    assert.equal(paused.next_run_at, changed.next_run_at);
    await db.query(
      "update talent_setting set is_onboarding_done=true where user_id=$1",
      [owner]
    );
    const again = (await readCareerCheckIn({ admin, userId: owner }))!;
    assert.equal(again.id, initial.id);
    assert.equal(again.status, "paused");
    assert.equal(again.revision, paused.revision);
    assert.equal(again.interval_days, 5.5);
    assert.equal(again.instruction, changed.instruction);
    assert.match(again.last_change!.request.reason as string, /Harper paused/);
    assert.equal((await collectDueCareerWork({ admin })).runIds.length, 0);
    const resumed = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "resume",
      actor: "career_agent",
      input: {
        action: "resume",
        schedule_id: initial.id,
        expected_revision: again.revision,
        interval_days: 1.25,
        instruction:
          "Follow the current application and revisit other roles using the latest Brief.",
        reason:
          "The user's new application request makes continuing work useful.",
      },
    });
    assert.equal(resumed.id, initial.id);
    assert.equal(resumed.status, "active");
    assert.equal(resumed.interval_days, 1.25);
    assert.ok(new Date(resumed.next_run_at!) > new Date());
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from talent_agent_schedules where talent_id=$1",
          [owner]
        )
      ).rows[0].n,
      1
    );
  } finally {
    await db.close();
  }
});

test("editing instructions with unchanged timing preserves the next execution", async () => {
  const db = await setup(),
    admin = localAdmin(db);
  try {
    const schedule = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "existing-timing",
      input: {
        action: "create",
        title: "Career check-in",
        instruction: "Continue current work.",
        interval_days: 11,
        timezone: "Asia/Seoul",
        next_run_at: "2030-01-01T00:00:00Z",
      },
    });
    const changed = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "instructions-only",
      actor: "career_agent",
      input: {
        action: "update",
        schedule_id: schedule.id,
        expected_revision: schedule.revision,
        instruction: "Only send material developments.",
        interval_days: schedule.interval_days,
        timezone: schedule.timezone,
      },
    });
    assert.equal(changed.next_run_at, schedule.next_run_at);
    assert.equal(changed.interval_days, 11);
    assert.equal(changed.instruction, "Only send material developments.");
  } finally {
    await db.close();
  }
});

test("Worker onboarding initializes external discovery and preserves an existing keyed reservation without cadence editing authority", async () => {
  const db = await setup();
  try {
    const legacy = await write(
      db,
      {
        action: "create",
        title: "Existing check-in",
        instruction: "Keep this instruction.",
        next_run_at: "2030-01-01T00:00:00Z",
        timezone: "Asia/Seoul",
        target_refs: { legacySchedulerReview: true },
      },
      "worker-adoption",
      other
    );
    // The earlier cutover has already attached this key before the daily migration.
    await db.query("update talent_agent_schedules set schedule_key='career_check_in' where id=$1",[legacy.id]);
    // Existing Worker access to the onboarding tables, without superuser access.
    await db.exec(
      "grant select on talent_users, talent_setting to harper_worker; grant update on talent_setting to harper_worker; set role harper_worker;"
    );
    await db.query(
      "update talent_setting set is_onboarding_done=true where user_id in ($1,$2)",
      [owner, other]
    );
    await assert.rejects(
      db.query(
        "update talent_agent_schedules set interval_days=1 where talent_id=$1",
        [owner]
      ),
      /permission denied/
    );
    await db.exec("reset role");
    const rows = (
      await db.query<any>(
        "select * from talent_agent_schedules order by talent_id"
      )
    ).rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].interval_days, 3);
    assert.equal(rows[1].id, legacy.id);
    assert.equal(rows[1].schedule_key, "career_check_in");
    assert.equal(rows[1].instruction, "Keep this instruction.");
    const grants = (
      await db.query<any>(
        "select has_function_privilege('anon','ensure_career_check_in(uuid)','execute') anon, has_function_privilege('authenticated','ensure_career_check_in(uuid)','execute') authenticated"
      )
    ).rows[0];
    assert.equal(grants.anon, false);
    assert.equal(grants.authenticated, false);
  } finally {
    await db.close();
  }
});

test("pausing one-time work retains its scheduled date for resumption", async () => {
  const db = await setup(),
    admin = localAdmin(db);
  try {
    const schedule = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "one-time",
      input: {
        action: "create",
        title: "Application follow-up",
        instruction: "Check this application.",
        next_run_at: "2030-01-01T00:00:00Z",
      },
    });
    const paused = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "one-time-pause",
      input: {
        action: "pause",
        schedule_id: schedule.id,
        expected_revision: schedule.revision,
      },
    });
    assert.equal(paused.next_run_at, schedule.next_run_at);
    assert.match(
      formatCareerSchedules([paused]),
      /Saved execution time \(inactive\): 2030-01-01 09:00/
    );
    assert.equal((await collectDueCareerWork({ admin })).runIds.length, 0);
    const resumed = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "one-time-resume",
      input: {
        action: "resume",
        schedule_id: schedule.id,
        expected_revision: paused.revision,
      },
    });
    assert.equal(resumed.status, "active");
    assert.equal(resumed.next_run_at, schedule.next_run_at);
    assert.equal(resumed.interval_days, null);
  } finally {
    await db.close();
  }
});

test("an active schedule cannot silently lose its next execution", async () => {
  const db = await setup(),
    admin = localAdmin(db);
  try {
    const schedule = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "active-timing",
      input: {
        action: "create",
        title: "Check-in",
        instruction: "Continue useful work.",
        interval_days: 11,
      },
    });
    await assert.rejects(
      writeCareerSchedule({
        admin,
        userId: owner,
        requestId: "clear-next",
        input: {
          action: "update",
          schedule_id: schedule.id,
          expected_revision: schedule.revision,
          next_run_at: null,
        },
      }),
      /next execution/i
    );
    assert.equal((await collectDueCareerWork({ admin })).runIds.length, 0);
    const saved = (
      await db.query<any>("select * from talent_agent_schedules where id=$1", [
        schedule.id,
      ])
    ).rows[0];
    assert.equal(saved.revision, schedule.revision);
    assert.ok(saved.next_run_at);
  } finally {
    await db.close();
  }
});

test("the old paused check-in is always in context even behind more than twelve newer tasks", async () => {
  const db = await setup(),
    admin = localAdmin(db);
  try {
    await db.query(
      "insert into talent_messages(id,user_id,role,content) values(19,$1,'user','정기 연락은 멈추고 내가 요청할 때만 도와줘.')",
      [owner]
    );
    const old = await write(
      db,
      {
        action: "create",
        title: "Existing check-in",
        instruction: "Preserve my explicit monthly instruction.",
        timezone: "Asia/Seoul",
        recurrence: "0 9 1 * *",
        next_run_at: "2030-01-01T00:00:00Z",
        target_refs: { legacySchedulerReview: true },
      },
      "legacy"
    );
    await write(
      db,
      {
        action: "pause",
        schedule_id: old.id,
        expected_revision: 1,
        actor: "career_agent",
        reason: "The user asked to pause this schedule.",
        source_message_id: 19,
      },
      "user-pause"
    );
    await db.query("update talent_agent_schedules set schedule_key='career_check_in' where id=$1",[old.id]);
    await db.query(
      "update talent_setting set is_onboarding_done=true where user_id=$1",
      [owner]
    );
    const adopted = (await readCareerCheckIn({ admin, userId: owner }))!;
    assert.equal(adopted.id, old.id);
    assert.equal(adopted.interval_days, null);
    assert.equal(adopted.recurrence, "0 9 1 * *");
    assert.equal(adopted.status, "paused");
    await db.query(
      "update talent_agent_schedules set created_at='2020-01-01' where id=$1",
      [old.id]
    );
    for (let i = 0; i < 15; i++)
      await write(
        db,
        {
          action: "create",
          title: `Other task ${i}`,
          instruction: "Do this separate task.",
          timezone: "Asia/Seoul",
          next_run_at: "2030-01-01T00:00:00Z",
        },
        `other-${i}`
      );
    const context = await readCareerScheduleFollowIndex({
      admin,
      userId: owner,
    });
    assert.match(context, new RegExp(`Schedule ${old.id}; revision 2; paused`));
    assert.match(context, /Preserve my explicit monthly instruction/);
    assert.match(context, /The user asked to pause this schedule/);
    assert.match(context, /Source user message: 19/);
    assert.match(context, /정기 연락은 멈추고 내가 요청할 때만 도와줘/);
    assert.match(context, /Additional saved work/);
    assert.equal(context.split(`Schedule ${old.id};`).length - 1, 1);
  } finally {
    await db.close();
  }
});

test("intervals cross month boundaries exactly and quiet occurrences keep their next run", async () => {
  assert.equal(
    nextScheduleOccurrence(
      null,
      "Asia/Seoul",
      new Date("2026-10-31T00:00:00Z"),
      3
    ),
    "2026-11-03T00:00:00.000Z"
  );
  assert.equal(
    nextScheduleOccurrence(
      null,
      "America/New_York",
      new Date("2026-10-31T00:00:00Z"),
      0.5
    ),
    "2026-10-31T12:00:00.000Z"
  );
  assert.throws(
    () => nextScheduleOccurrence("0 9 * * *", "Asia/Seoul", new Date(), 2),
    /not both/
  );
  const db = await setup(),
    admin = localAdmin(db);
  try {
    await db.query(
      "update talent_setting set is_onboarding_done=true where user_id=$1",
      [owner]
    );
    const schedule = (await readCareerCheckIn({ admin, userId: owner }))!;
    await db.query(
      "update talent_agent_schedules set next_run_at='2020-01-01',interval_days=8 where id=$1",
      [schedule.id]
    );
    const due = await collectDueCareerWork({ admin });
    assert.equal(due.runIds.length, 1);
    const run = (
      await db.query<any>(
        "select * from opportunity_discovery_run where id=$1",
        [due.runIds[0]]
      )
    ).rows[0];
    assert.equal(run.trigger_payload.contactScope, "external_recommendations");
    assert.equal(run.trigger_payload.sourceEvents[0].intervalDays, 8);
    assert.equal((await collectDueCareerWork({ admin })).runIds.length, 0);
    await db.query(
      "update opportunity_discovery_run set status='completed',coverage='{\"agentOutcome\":\"no_send\"}' where id=$1",
      [run.id]
    );
    await db.query("select finish_career_source_events($1)", [run.id]);
    const after = (await readCareerCheckIn({ admin, userId: owner }))!;
    assert.equal(after.status, "active");
    assert.equal(after.interval_days, 8);
    assert.ok(
      Math.abs(
        new Date(after.next_run_at!).getTime() - Date.now() - 8 * 86400000
      ) < 5000
    );
  } finally {
    await db.close();
  }
});

test("an occurrence may pause its own future work; a subsequent user edit still invalidates current work", async () => {
  const db = await setup(),
    admin = localAdmin(db);
  try {
    await db.query(
      "update talent_setting set is_onboarding_done=true where user_id=$1",
      [owner]
    );
    const schedule = (await readCareerCheckIn({ admin, userId: owner }))!;
    await db.query(
      "update talent_agent_schedules set next_run_at='2020-01-01' where id=$1",
      [schedule.id]
    );
    const runId = (await collectDueCareerWork({ admin })).runIds[0];
    await db.query(
      "update opportunity_discovery_run set status='handed_off' where id=$1",
      [runId]
    );
    const run = (
      await db.query<any>(
        "select * from opportunity_discovery_run where id=$1",
        [runId]
      )
    ).rows[0];
    const paused = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "self-pause",
      actor: "career_agent",
      backgroundRunId: runId,
      input: {
        action: "pause",
        schedule_id: schedule.id,
        expected_revision: 1,
        instruction: "Reassess ongoing work when the user returns.",
      },
    });
    assert.equal(paused.directive_revision, 1);
    assert.equal(paused.last_change!.request.appliesTo, "future_occurrences");
    await assertCareerSourceEventsCurrent({ admin, run });
    const userPaused = await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "user-pause",
      input: {
        action: "pause",
        schedule_id: schedule.id,
        expected_revision: paused.revision,
        // A browser cannot borrow a background run's future-only authority.
        background_run_id: runId,
        actor: "career_agent",
      },
    });
    assert.equal(userPaused.directive_revision, 2);
    assert.equal(userPaused.last_change!.request.actor, "user");
    await assert.rejects(
      assertCareerSourceEventsCurrent({ admin, run }),
      CareerSourceChangedError
    );
    await assert.rejects(
      writeCareerSchedule({
        admin,
        userId: owner,
        requestId: "stale",
        input: {
          action: "resume",
          schedule_id: schedule.id,
          expected_revision: paused.revision,
        },
      }),
      /revision conflict/
    );
    await assert.rejects(
      writeCareerSchedule({
        admin,
        userId: other,
        requestId: "foreign",
        input: {
          action: "resume",
          schedule_id: schedule.id,
          expected_revision: 3,
        },
      }),
      /unavailable/i
    );
  } finally {
    await db.close();
  }
});

test("contact opt-outs remain separate from schedule existence or resumption", async () => {
  const db = await setup(),
    admin = localAdmin(db);
  try {
    await db.query(
      "update talent_setting set status='stopped',profile_visibility='dont_share',get_external_recommendation=false,get_internal_recommendation=false,is_onboarding_done=true where user_id=$1",
      [owner]
    );
    const schedule = (await readCareerCheckIn({ admin, userId: owner }))!;
    assert.equal(schedule.status, "paused");
    await writeCareerSchedule({
      admin,
      userId: owner,
      requestId: "resume-existing",
      input: {
        action: "resume",
        schedule_id: schedule.id,
        expected_revision: 1,
        next_run_at: "2020-01-01T00:00:00Z",
      },
    });
    assert.deepEqual((await collectDueCareerWork({ admin })).runIds, []);
    const setting = (
      await db.query<any>("select * from talent_setting where user_id=$1", [
        owner,
      ])
    ).rows[0];
    assert.equal(setting.status, "stopped");
    assert.equal(setting.get_external_recommendation, false);
    assert.equal(setting.profile_visibility, "dont_share");
  } finally {
    await db.close();
  }
});
