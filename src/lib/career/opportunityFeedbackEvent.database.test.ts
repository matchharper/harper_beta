import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const role = '10000000-0000-4000-8000-000000000011';
const rec = '10000000-0000-4000-8000-000000000041';
async function database() {
  const db = new PGlite();
  await db.exec(`
    create table company_roles(role_id uuid primary key,source_type text);
    create table talent_opportunity_recommendation(id uuid primary key,talent_id uuid,role_id uuid,feedback text,feedback_reason text,saved_stage text,feedback_at timestamptz,updated_at timestamptz,email_acceptance_confirmation jsonb);
    create table talent_opportunity_tag(talent_id uuid,opportunity_id uuid,tag text);
    create table feedback_executions(id serial);
    create function current_talent_recommendation_id_v1(id uuid) returns uuid language sql as $$ select id $$;
    create function update_talent_role_feedback_v1(talent uuid,rec uuid,decision text,reason text,stage text,at_time timestamptz) returns jsonb language plpgsql as $$ begin
      insert into feedback_executions default values;
      update talent_opportunity_recommendation set feedback=decision,feedback_reason=reason,saved_stage=stage,feedback_at=at_time,updated_at=at_time where id=rec and talent_id=talent;
      return jsonb_build_object('status','updated'); end $$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261030041000_career_feedback_event_idempotency.sql','utf8'));
  await db.query("insert into company_roles values($1,'internal')",[role]);
  await db.query("insert into talent_opportunity_recommendation values($1,$2,$3,'dislike',null,null,'2026-10-29','2026-10-29','{}')",[rec,user,role]);
  return db;
}
const decide = async (db: PGlite, owner=user, feedback='dislike', reason: string | null=null) =>
  (await db.query<any>("select update_talent_role_feedback_v2($1,$2,$3,$4,null,now()) r",[owner,rec,feedback,reason])).rows[0].r;

test('repeated internal/external decisions preserve the original event time without invoking the downstream writer', async () => {
  const db=await database(); try {
    for (const source of ['internal','external']) {
      await db.query('update company_roles set source_type=$1',[source]);
      assert.equal((await decide(db)).status,'no_change');
      assert.equal((await decide(db)).status,'no_change');
    }
    const rows=(await db.query<any>('select feedback_at::text at from talent_opportunity_recommendation')).rows;
    assert.ok(rows[0].at.startsWith('2026-10-29'));
    assert.equal((await db.query<any>('select count(*)::int n from feedback_executions')).rows[0].n,0);
  } finally { await db.close(); }
});

test('a changed reason or decision remains new work; another owner cannot exploit the no-change path', async () => {
  const db=await database(); try {
    await assert.rejects(decide(db,other),/not_found/);
    assert.equal((await decide(db,user,'dislike','서울 출근은 어려워요')).status,'updated');
    assert.equal((await decide(db,user,'dislike','서울 출근은 어려워요')).status,'no_change');
    assert.equal((await db.query<any>('select count(*)::int n from feedback_executions')).rows[0].n,1);
    await assert.rejects(decide(db,user,'keep'),/keep_cannot_change_existing_decision/);
  } finally { await db.close(); }
});
