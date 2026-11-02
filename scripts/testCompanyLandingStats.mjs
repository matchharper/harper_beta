// Local-only verification of the migration and public snapshot reader.
// node --import tsx scripts/testCompanyLandingStats.mjs
// Set PGLITE_MODULE_PATH when PGlite is installed in an isolated local runtime.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { readCompanyLandingStats } = require("../src/lib/companyLandingStats.server.ts");
const { PGlite } = await import(
  process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite"
);
const db = new PGlite();
const adapter = async (strings, ...values) => {
  const sql = strings.reduce(
    (query, part, index) => query + (index ? `$${index}` : "") + part,
    ""
  );
  return (await db.query(sql, values)).rows;
};
const refresh = () => db.exec("SELECT public.refresh_company_landing_stats()");
try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE talent_users (user_id text PRIMARY KEY);
    CREATE TABLE talent_setting (user_id text PRIMARY KEY, is_onboarding_done boolean);
    CREATE TABLE talent_messages (user_id text, role text, message_type text, content text);
    CREATE TABLE company_roles (role_id text PRIMARY KEY, source_type text, information jsonb);
    CREATE TABLE talent_external_fit (talent_id text, role_id text, UNIQUE(talent_id, role_id));
    CREATE TABLE talent_opportunity_fit (talent_id text, opportunity_id text, UNIQUE(talent_id, opportunity_id));

    -- PGlite has no background scheduler. Record the real migration's job,
    -- then execute that stored command to exercise the scheduled writer.
    CREATE SCHEMA cron;
    CREATE TABLE cron.job (jobname text PRIMARY KEY, schedule text, command text);
    CREATE FUNCTION cron.schedule(text, text, text) RETURNS bigint LANGUAGE sql AS $$
      INSERT INTO cron.job VALUES ($1, $2, $3)
      ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule, command = excluded.command
      RETURNING 1::bigint;
    $$;
  `);
  const migration = await readFile(
    new URL("../supabase/migrations/20261101042259_company_landing_daily_snapshot.sql", import.meta.url),
    "utf8"
  );
  await db.exec(migration.replace(
    "CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;",
    ""
  ));
  const empty = await readCompanyLandingStats(adapter);
  assert.equal(empty.talentCount, 0);
  assert.equal(empty.averageConversationMessages, null);
  assert.equal(empty.assessedPairCount, 0);
  assert.ok(Number.isFinite(Date.parse(empty.updatedAt)));
  const [job] = (await db.query("SELECT * FROM cron.job")).rows;
  assert.equal(job.jobname, "company-landing-stats-daily");
  assert.equal(job.schedule, "0 20 * * *", "05:00 Asia/Seoul in the existing GMT cron timezone");

  await db.exec(`
    INSERT INTO talent_users VALUES ('a'), ('b'), ('registered-only'), ('one-way'), ('no-setting');
    INSERT INTO talent_setting VALUES ('a', true), ('b', false), ('registered-only', null), ('one-way', true);
    INSERT INTO company_roles VALUES ('one', 'external', '{}'), ('two', 'internal', '{}'),
      ('fixture', 'internal', '{"testOnly":true,"testFixture":"company-landing-stats"}');
    INSERT INTO talent_external_fit VALUES ('a','one'), ('b','one'), ('a','fixture');
    INSERT INTO talent_opportunity_fit VALUES ('a','one'), ('a','two'), ('b','fixture');
    INSERT INTO talent_messages VALUES
      ('a','user','chat','hello'), ('a','assistant','chat','hello'),
      ('a','user','chat','question'), ('a','assistant','chat','answer'),
      ('a','assistant','chat','more detail'),
      ('a','user','call_transcript','voice question'),
      ('a','assistant','call_transcript','voice answer'),
      ('b','user','chat','question'), ('b','assistant','chat','answer'),
      ('b','assistant','chat','more detail'),
      ('registered-only','user','chat','unfinished onboarding'),
      ('registered-only','assistant','chat','onboarding question'),
      ('no-setting','user','call_transcript','voice question'),
      ('no-setting','assistant','call_transcript','voice answer'),
      ('one-way','assistant','chat','greeting'),
      ('one-way','user','chat','   '),
      ('a','assistant','opportunity_agent_update','automatic notification'),
      ('a','user','opportunity_feedback_note','saved a job'),
      ('a','assistant','opportunity_feedback_note','not a candidate action'),
      ('a','user','opportunity_feedback_note','   '),
      ('one-way','user','opportunity_feedback_note','excluded a job'),
      ('a','assistant','system','system notification'),
      ('b','assistant','mail','email');
  `);
  assert.deepEqual(await readCompanyLandingStats(adapter), empty,
    "visits keep the stored snapshot even when source data changes");
  await db.exec(job.command);
  const result = await readCompanyLandingStats(adapter);
  assert.equal(result.talentCount, 5, "all registered talent");
  assert.equal(result.averageConversationMessages, 8,
    "completed, two-way participants' full chat/voice/feedback history");
  assert.equal(result.assessedPairCount, 3,
    "deduplicate fit pairs and exclude marked test-only roles");
  assert.deepEqual(Object.keys(result).sort(), [
    "assessedPairCount", "averageConversationMessages", "talentCount", "updatedAt",
  ]);

  await db.exec("UPDATE talent_setting SET is_onboarding_done = true WHERE user_id = 'b'");
  assert.equal((await readCompanyLandingStats(adapter)).averageConversationMessages, 8);
  await refresh();
  assert.equal((await readCompanyLandingStats(adapter)).averageConversationMessages, 6,
    "the next refresh includes the newly completed onboarding");
  await db.exec("UPDATE talent_setting SET is_onboarding_done = false WHERE user_id IN ('a', 'b')");
  await refresh();
  assert.equal((await readCompanyLandingStats(adapter)).averageConversationMessages, null,
    "an empty eligible population preserves a null average");

  const lastGood = await readCompanyLandingStats(adapter);
  await db.exec("ALTER TABLE talent_external_fit RENAME TO unavailable_external_fit");
  assert.deepEqual(await readCompanyLandingStats(adapter), lastGood,
    "reading the snapshot does not need access to the aggregate sources");
  await assert.rejects(refresh(), /talent_external_fit/);
  assert.deepEqual(await readCompanyLandingStats(adapter), lastGood,
    "failed aggregation preserves every previously committed value and its timestamp");
  await db.exec("ALTER TABLE unavailable_external_fit RENAME TO talent_external_fit");

  await db.exec("UPDATE company_landing_stats SET assessed_pair_count = 12345 WHERE name = 'current'");
  assert.equal((await readCompanyLandingStats(adapter)).assessedPairCount, 12345,
    "an operator can centrally override the value until the next refresh");
  await refresh();
  assert.equal((await readCompanyLandingStats(adapter)).assessedPairCount, 3);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM company_landing_stats")).rows[0].n, 1,
    "refresh replaces the single current snapshot");

  const [permissions] = (await db.query(`
    SELECT
      has_table_privilege('service_role', 'company_landing_stats', 'SELECT') AS server_read,
      has_table_privilege('service_role', 'company_landing_stats', 'UPDATE') AS server_write,
      has_function_privilege('service_role', 'refresh_company_landing_stats()', 'EXECUTE') AS server_refresh
  `)).rows;
  assert.deepEqual(permissions, { server_read: true, server_write: false, server_refresh: false });
  await db.exec("SET ROLE service_role");
  assert.equal((await readCompanyLandingStats(adapter)).assessedPairCount, 3);
  await db.exec("RESET ROLE");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(() => readCompanyLandingStats(adapter), /permission denied/);
      await assert.rejects(refresh, /permission denied/);
    } finally {
      await db.exec("RESET ROLE");
    }
  }
  await db.exec("DELETE FROM company_landing_stats WHERE name = 'current'");
  await assert.rejects(() => readCompanyLandingStats(adapter), /snapshot is unavailable/,
    "an uninitialized snapshot never falls back to expensive aggregation");
  console.log("PASS: migration initialization, daily job command, aggregate definitions, fixed snapshot reads, atomic failure retention, operator override, and read/write permissions");
} finally {
  await db.close();
}
