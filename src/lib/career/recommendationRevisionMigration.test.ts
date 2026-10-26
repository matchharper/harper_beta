import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Disposable database: no application connection, real accounts or outbound work.
test("view and click stamps keep the recommendation revision that accept compares", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table talent_opportunity_recommendation(id uuid primary key, talent_id uuid,
        feedback text, feedback_at timestamptz, saved_stage text, viewed_at timestamptz,
        clicked_at timestamptz, updated_at timestamptz not null);
    `);
    await db.exec(
      readFileSync(
        resolve(
          "supabase/migrations/20261024093000_recommendation_updated_at_skip_view_click.sql"
        ),
        "utf8"
      )
    );
    await db.exec(`create trigger talent_opportunity_recommendation_set_updated_at
      before update on talent_opportunity_recommendation
      for each row execute function set_talent_opportunity_recommendation_updated_at()`);
    const id = "00000000-0000-4000-8000-000000000001";
    const revision = "2026-10-23 09:16:10.123456+00";
    await db.query(
      `insert into talent_opportunity_recommendation(id, talent_id, updated_at)
       values ($1, $1, $2)`,
      [id, revision]
    );
    const readRevision = async () =>
      (
        await db.query<{ revision: string }>(
          "select updated_at::text as revision from talent_opportunity_recommendation where id = $1",
          [id]
        )
      ).rows[0].revision;

    await db.query(
      "update talent_opportunity_recommendation set viewed_at = now() where id = $1 and viewed_at is null",
      [id]
    );
    assert.equal(await readRevision(), revision);
    await db.query(
      "update talent_opportunity_recommendation set clicked_at = now() where id = $1 and clicked_at is null",
      [id]
    );
    assert.equal(await readRevision(), revision);

    await db.query(
      "update talent_opportunity_recommendation set feedback = 'like', feedback_at = now() where id = $1",
      [id]
    );
    const afterDecision = await readRevision();
    assert.notEqual(afterDecision, revision);

    await db.query(
      "update talent_opportunity_recommendation set saved_stage = 'applied', clicked_at = now() where id = $1",
      [id]
    );
    assert.notEqual(await readRevision(), afterDecision);
  } finally {
    await db.close();
  }
});
