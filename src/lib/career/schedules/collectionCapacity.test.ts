import assert from "node:assert/strict";
import test from "node:test";
import { setup, localAdmin } from "./testSupport";
import { collectDueCareerWork } from "./server";

test("deferred schedules keep their occurrence and collect in order as capacity becomes available", async () => {
  const db = await setup(), admin = localAdmin(db);
  try {
    await db.exec(`update talent_setting set is_onboarding_done=true;
      update talent_agent_schedules set next_run_at='2020-01-01';`);
    const before = (await db.query("select * from talent_agent_schedules order by id")).rows;
    assert.equal(before.length, 2);
    assert.deepEqual(await collectDueCareerWork({ admin, limit: 0 }), { runIds: [], scheduleCount: 0 });
    assert.deepEqual((await db.query("select * from talent_agent_schedules order by id")).rows, before);

    const first = await collectDueCareerWork({ admin, limit: 1 });
    assert.equal(first.runIds.length, 1);
    const remaining = (await db.query("select * from talent_agent_schedules where last_run_id is null")).rows;
    assert.deepEqual(remaining, [before[1]]);
    const second = await collectDueCareerWork({ admin, limit: 1 });
    assert.equal(second.runIds.length, 1);
    assert.notEqual(second.runIds[0], first.runIds[0]);
    assert.equal((await collectDueCareerWork({ admin, limit: 6 })).runIds.length, 0);
    assert.equal((await db.query("select * from opportunity_discovery_run")).rows.length, 2);
  } finally { await db.close(); }
});
