/** Local-only bridge used by harper_worker's scheduler capacity regression test. */
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { setupDaily } from "./dailyTestSupport";
import { localAdmin, owner, other, role } from "./testSupport";
import { collectCareerProcessing } from "./daily";

const url = new URL(process.argv[2]);
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.match(url.pathname, /^\/scheduler_capacity_[a-f0-9]+$/);
const input = JSON.parse(process.argv[3]);
const sql = postgres(url.toString(), {
  max: 1,
  onnotice: () => {},
  // Match the shared PGlite fixture's already-serialized JSON parameters.
  types: { fixtureJson: {
    to: 3802, from: [114, 3802],
    serialize: (value: unknown) => typeof value === "string" ? value : JSON.stringify(value),
    parse: JSON.parse,
  } },
});
const db = {
  exec: (query: string) => sql.unsafe(query),
  query: async (query: string, args: unknown[] = []) => ({ rows: await sql.unsafe(query, args as never[]) }),
} as unknown as PGlite;
try {
  if (input.action === "setup") {
    await setupDaily(undefined, db);
    await db.exec(`
      alter table opportunity_discovery_run add column started_at timestamptz,add column last_progress_at timestamptz;
      update talent_setting set status='active',is_onboarding_done=true;
      update talent_agent_schedules set next_run_at='2030-01-10T08:00:00+09:00' where talent_id='${owner}';
      delete from talent_agent_schedules where talent_id='${other}';
      insert into talent_opportunity_matching_review(talent_id,opportunity_id,decision,not_before)
        values('${other}','${role}','candidate_first','2030-01-10T08:00:00+09:00');
    `);
    console.log(JSON.stringify({ scheduleTalent: owner, dailyTalent: other }));
  } else {
    assert.equal(input.action, "collect_due");
    assert.ok(Number.isSafeInteger(input.maxNewRuns) && input.maxNewRuns >= 0);
    // Same production collector/RPCs as collectDueCareerWork, with a fixed 09:00 clock.
    const work = await collectCareerProcessing({
      admin: localAdmin(db), limit: input.maxNewRuns,
      now: new Date("2030-01-10T09:00:00+09:00"),
    });
    console.log(JSON.stringify({ work }));
  }
} finally {
  await sql.end();
}
