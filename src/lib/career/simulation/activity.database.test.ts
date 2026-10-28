import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createSimulationSession } from "./session";
import { createPreparation } from "./preparation";
test("activity storage is atomic, owner scoped and revision guarded, with no message state copies", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
   create table talent_users(user_id uuid primary key);
   create table talent_conversations(id uuid primary key,user_id uuid,career_coaching_activity_message_id bigint);
   create table talent_messages(id bigint generated always as identity primary key,user_id uuid,conversation_id uuid,role text,message_type text,content text,payload jsonb,created_at timestamptz default now());
   create table talent_documents(id uuid primary key,talent_id uuid,kind text,extracted_text text,is_deleted boolean default false);`);
    await db.exec(
      await readFile(
        "supabase/migrations/20261009132045_application_activity_store.sql",
        "utf8"
      )
    );
    await db.exec(await readFile("supabase/migrations/20261009142639_application_questions_without_intro.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261013141544_email_application_start.sql", "utf8"));
    const user = crypto.randomUUID(),
      conv = crypto.randomUUID(),
      doc = crypto.randomUUID();
    await db.query("insert into talent_users values($1)", [user]);
    await db.query(
      "insert into talent_conversations(id,user_id) values($1,$2)",
      [conv, user]
    );
    await db.query(
      "insert into talent_documents values($1,$2,'resume','Resume',false)",
      [doc, user]
    );
    const offer = (
      await db.query<{ id: number }>(
        "insert into talent_messages(user_id,conversation_id,message_type,payload) values($1,$2,'application_start_offer',$3) returning id",
        [user, conv, JSON.stringify({ roleId: "engineer", status: "ready" })]
      )
    ).rows[0].id;
    const s = {
      ...createSimulationSession({
        roleRef: "role:engineer",
        roleName: "Engineer",
        documentId: doc,
        documentName: "Resume",
      }),
      preparation: createPreparation(),
      activity: { version: 1, offerId: offer, outputs: {}, batches: [] },
    };
    const rpc = async (
      op: string,
      payload: unknown = s,
      id: number | null = null,
      rev: number | null = null,
      key = "start",
      owner = user
    ) =>
      (
        await db.query<{
          r: {
            id: string;
            message_id: number;
            revision: number;
            payload: typeof s;
          };
        }>("select write_application_activity($1,$2,$3,$4,$5,$6,$7,$8) r", [
          owner,
          conv,
          op,
          id,
          rev,
          JSON.stringify(payload),
          key,
          offer,
        ])
      ).rows[0].r;
    const r = await rpc("begin");
    assert.equal((await rpc("begin")).id, r.id);
    assert.equal(
      (await db.query("select * from talent_simulate_application")).rows.length,
      1
    );
    assert.equal(
      (
        await db.query<{ payload: { view: string } }>(
          "select payload from talent_messages where id=$1",
          [r.message_id]
        )
      ).rows[0].payload.view,
      "state"
    );
    await assert.rejects(() =>
      rpc("read", null, r.message_id, null, "x", crypto.randomUUID())
    );
    const saved = await rpc(
      "save",
      { ...s, facts: [{ id: "F1", text: "Confirmed", messageId: 1 }] },
      r.message_id,
      1,
      "facts"
    );
    assert.equal(saved.revision, 2);
    assert.equal((await rpc("save", s, r.message_id, 1, "facts")).revision, 2);
    await assert.rejects(() => rpc("save", s, r.message_id, 1, "stale"));
    const privileges = (
      await db.query<{ allowed: boolean }>(
        "select has_table_privilege('authenticated','talent_simulate_application','SELECT') or has_function_privilege('authenticated','write_application_activity(uuid,uuid,text,bigint,integer,jsonb,text,bigint)','EXECUTE') allowed"
      )
    ).rows[0];
    assert.equal(privileges.allowed, false);
    const withQuestions = {
      ...saved.payload,
      activity: {
        ...saved.payload.activity,
        batches: [
          {
            id: "batch-1",
            introduction: "Which experience should we clarify?",
            status: "waiting",
          },
        ],
      },
    };
    const questions = await rpc(
      "save",
      withQuestions,
      r.message_id,
      2,
      "questions"
    );
    const batch = questions.payload.activity.batches[0] as unknown as {
      introMessageId: number;
    };
    assert.equal(batch.introMessageId, undefined);
    const count = (await db.query("select * from talent_messages")).rows.length;
    await rpc("save", withQuestions, r.message_id, 2, "questions");
    assert.equal(
      (await db.query("select * from talent_messages")).rows.length,
      count
    );

    await assert.rejects(() =>
      db.query(
        "update talent_conversations set career_coaching_activity_message_id=123 where id=$1",
        [conv]
      )
    );
    await rpc(
      "save",
      {
        ...questions.payload,
        status: "ended",
        endedAt: new Date().toISOString(),
      },
      r.message_id,
      3,
      "end"
    );
    await db.query(
      "update talent_conversations set career_coaching_activity_message_id=123 where id=$1",
      [conv]
    );
    await assert.rejects(() =>
      rpc("resume", saved.payload, r.message_id, 4, "resume")
    );
  } catch (e) {
    console.error(e);
    throw e;
  } finally {
    await db.close();
  }
});


test("email activity requires an owned inbound source and readable resume, with no Start card", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table talent_users(user_id uuid primary key);
      create table talent_conversations(id uuid primary key,user_id uuid,career_coaching_activity_message_id bigint);
      create table talent_messages(id bigint generated always as identity primary key,user_id uuid,conversation_id uuid,role text,message_type text,content text,payload jsonb,created_at timestamptz default now());
      create table talent_documents(id uuid primary key,talent_id uuid,kind text,extracted_text text,is_deleted boolean default false);`);
    for (const name of ["20261009132045_application_activity_store", "20261009142639_application_questions_without_intro", "20261013141544_email_application_start", "20261027113000_application_start_work_identity"])
      await db.exec(await readFile(`supabase/migrations/${name}.sql`, "utf8"));
    const user = crypto.randomUUID(), conv = crypto.randomUUID(), doc = crypto.randomUUID();
    await db.query("insert into talent_users values($1)", [user]);
    await db.query("insert into talent_conversations(id,user_id) values($1,$2)", [conv,user]);
    await db.query("insert into talent_documents values($1,$2,'resume','Career facts',false)", [doc,user]);
    const source = (await db.query<{id:number}>("insert into talent_messages(user_id,conversation_id,role,content) values($1,$2,'user','Please help me apply') returning id", [user,conv])).rows[0].id;
    const state = { ...createSimulationSession({roleRef:"role:engineer",roleName:"Engineer",documentId:doc,documentName:"Resume"}), preparation:createPreparation(), activity:{version:1,channel:"email",sourceMessageId:source,outputs:{},batches:[]} };
    const begin = async (payload: unknown, sourceId = source) => (await db.query<{r:any}>("select write_application_activity($1,$2,'begin',null,null,$3,'email-start',$4) r", [user,conv,JSON.stringify(payload),sourceId])).rows[0].r;
    await assert.rejects(() => begin({...state, documentId:null}));
    await assert.rejects(() => begin({...state, activity:{...state.activity,sourceMessageId:source+1}}));
    await db.query("update talent_messages set role='assistant' where id=$1", [source]);
    await assert.rejects(() => begin(state));
    await db.query("update talent_messages set role='user' where id=$1", [source]);
    const result = await begin(state);
    assert.equal((await begin(state)).id, result.id);
    assert.equal((await db.query("select * from talent_simulate_application")).rows.length, 1);
    assert.equal((await db.query("select * from talent_messages where message_type='application_start_offer'")).rows.length, 0);
    const otherRole = { ...state, sessionId: crypto.randomUUID(), roleRef: "role:designer" };
    await assert.rejects(() => begin(otherRole), /Another application is active/);
    const end = async (activity: any) => {
      const payload = { ...activity.payload, status: "ended", endedAt: new Date().toISOString(), endReason: "switched" };
      await db.query("select write_application_activity($1,$2,'save',$3,$4,$5,$6)", [user,conv,activity.message_id,activity.revision,JSON.stringify(payload),`end:${activity.id}`]);
    };
    await end(result);
    const second = await begin(otherRole);
    assert.notEqual(second.id, result.id);
    assert.equal((await begin(otherRole)).id, second.id);
    await end(second);
    const anotherDoc = crypto.randomUUID();
    await db.query("insert into talent_documents values($1,$2,'resume','Other career facts',false)", [anotherDoc,user]);
    const changedSource = { ...state, sessionId: crypto.randomUUID(), documentId: anotherDoc };
    const third = await begin(changedSource);
    assert.notEqual(third.id, result.id);
    assert.equal((await begin(changedSource)).id, third.id);
    // Replaying an ended preparation returns its outcome, never a new analysis.
    const replay = await begin(state);
    assert.equal(replay.id, result.id);
    assert.equal(replay.status, "ended");
    assert.equal((await db.query("select * from talent_simulate_application")).rows.length, 3);
  } finally { await db.close(); }
});
