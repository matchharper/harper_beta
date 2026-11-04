import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("personal offer progress persists with ownership, current-recommendation fencing and idempotent activity", async () => {
  const db = new PGlite();
  const user = "00000000-0000-4000-8000-000000000001";
  const other = "00000000-0000-4000-8000-000000000002";
  const recommendation = "00000000-0000-4000-8000-000000000003";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table talent_opportunity_recommendation(id uuid primary key, talent_id uuid, saved_stage text, updated_at timestamptz, feedback text, feedback_at timestamptz, feedback_reason text);
      create table talent_role_activity(id uuid primary key default gen_random_uuid(), recommendation_id uuid, kind text, metadata jsonb);
      create function current_talent_recommendation_id_v1(id uuid) returns uuid language sql as $$select id$$;`);
    await db.exec(
      await readFile(
        "supabase/migrations/20261103083918_career_opportunity_offer_stage.sql",
        "utf8"
      )
    );
    await db.query(
      "insert into talent_opportunity_recommendation(id,talent_id,saved_stage) values($1,$2,'connected')",
      [recommendation, user]
    );
    const move = (talent: string, stage: string) =>
      db.query("select move_talent_role_saved_stage_v1($1,$2,$3,true)", [
        talent,
        recommendation,
        stage,
      ]);
    await assert.rejects(move(other, "offer"), /recommendation_not_found/);
    await move(user, "offer");
    await move(user, "offer");
    assert.deepEqual(
      (
        await db.query(
          "select saved_stage from talent_opportunity_recommendation"
        )
      ).rows,
      [{ saved_stage: "offer" }]
    );
    assert.equal(
      (await db.query("select * from talent_role_activity")).rows.length,
      1
    );
    await move(user, "closed");
    assert.deepEqual(
      (
        await db.query(
          "select saved_stage from talent_opportunity_recommendation"
        )
      ).rows,
      [{ saved_stage: "closed" }]
    );
    await db.query(
      "select update_talent_role_feedback_v1($1,$2,'like',null,'offer',now())",
      [user, recommendation]
    );
    assert.deepEqual(
      (
        await db.query(
          "select feedback,saved_stage from talent_opportunity_recommendation"
        )
      ).rows,
      [{ feedback: "like", saved_stage: "offer" }]
    );
    await db.exec(
      `create or replace function current_talent_recommendation_id_v1(id uuid) returns uuid language sql as $$select '${other}'::uuid$$;`
    );
    await assert.rejects(
      move(user, "saved"),
      /internal_recommendation_superseded/
    );
  } finally {
    await db.close();
  }
});
