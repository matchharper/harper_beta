import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("the role and resource details recover the same owner's current linked reviews across conversations and merged IDs", async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const [user, other, chat, olderChat, role, target, alias, rec] = Array.from({ length: 8 }, (_, i) => id(i + 1));
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table talent_messages(id bigint primary key, conversation_id uuid, user_id uuid, message_type text, payload jsonb);
      create table talent_opportunity_recommendation(id uuid primary key, talent_id uuid, role_id uuid);
      create table career_opportunities(id uuid primary key, talent_id uuid, recommendation_id uuid, deleted_at timestamptz, merged_into_id uuid);
      create table talent_external_operations(id uuid primary key, user_id uuid, conversation_id uuid, kind text, request jsonb);`);
    await db.exec(readFileSync("supabase/migrations/20261116034500_career_opportunity_reviews.sql", "utf8"));
    await db.query("insert into talent_opportunity_recommendation values($1,$2,$3)", [rec, user, role]);
    await db.query("insert into career_opportunities values($1,$2,$3,null,null),($4,$2,null,null,$1)", [target, user, rec, alias]);
    const write = (rowId: number, formId: number, rev: number, owner: string, conversation: string, type: string, ref: string, hidden = false) =>
      db.query("insert into talent_messages values ($1,$2,$3,'career_form',$4::jsonb)", [rowId,conversation,owner,{
        kind: "form", formId, revision: rev, hidden, relatedRefs: [{ type, id: ref }],
      }]);
    await write(10,10,1,user,olderChat,"opportunity",alias);
    await write(20,20,1,user,chat,"role",role);
    await write(21,20,2,user,chat,"role",role);
    await write(30,30,1,user,chat,"role",role);
    await write(31,30,2,user,chat,"role",id(99));
    await write(40,40,1,other,chat,"role",role);
    await write(50,50,1,user,chat,"role",role,true);
    await db.query("insert into talent_external_operations values($1,$2,$3,'delegated_work',$4)", [id(60),user,olderChat,{resource_refs: [{kind:"opportunity",id:alias}]}]);
    await write(60,60,1,user,olderChat,"work",id(60));
    await write(61,61,1,user,chat,"work",id(60)); // Work belongs to a different conversation.
    await write(62,62,1,user,olderChat,"role",id(99));
    await db.query("update talent_messages set payload=jsonb_set(payload,'{relatedRefs}',(payload->'relatedRefs')||$1::jsonb) where id=62", [JSON.stringify([{type:"work",id:id(60)}])]);
    const list = async (roleId: string | null, opportunityId: string | null, before: number | null = null) =>
      (await db.query<{ conversation_id: string; form_id: number; revision: number }>(
        "select * from list_career_opportunity_reviews_v1($1,$2,$3,$4,20)", [user,roleId,opportunityId,before]
      )).rows;
    assert.deepEqual(await list(role,null), [
      { conversation_id: olderChat, form_id: 60, revision: 1 },
      { conversation_id: chat, form_id: 20, revision: 2 },
      { conversation_id: olderChat, form_id: 10, revision: 1 },
    ]);
    assert.deepEqual(await list(role,target), await list(role,null));
    assert.deepEqual(await list(null,target), [
      { conversation_id: olderChat, form_id: 60, revision: 1 },
      { conversation_id: olderChat, form_id: 10, revision: 1 },
    ]);
    assert.deepEqual(await list(role,null,20), [{ conversation_id: olderChat, form_id: 10, revision: 1 }]);
    assert.deepEqual(await list(null,id(100)), []);
  } finally { await db.close(); }
});
