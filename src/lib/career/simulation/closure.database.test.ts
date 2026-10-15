import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  createSimulationSession,
  endSimulationSession,
  mutateSimulationSession,
} from "./session";
const migration =
  "supabase/migrations/20261008165236_simulation_closure_progress.sql";
test("closure persists private role progress atomically, idempotently, including expiry and public job refs", async () => {
  const db = new PGlite();
  const user = "00000000-0000-4000-8000-000000000001",
    conv = "00000000-0000-4000-8000-000000000002",
    role = "00000000-0000-4000-8000-000000000003";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table talent_conversations(id uuid primary key,user_id uuid,career_coaching_activity_message_id bigint);
      create table talent_messages(id bigint generated always as identity primary key,conversation_id uuid,user_id uuid,role text,message_type text,content text,payload jsonb);
      create table company_roles(role_id uuid primary key);
      create table official_jobs(slug text,role_id uuid);
      create table talent_progress(id uuid default gen_random_uuid(),talent_id uuid,role_id uuid references company_roles,kind text,text text,metadata jsonb,open_to_talent boolean,open_to_company boolean);
      create function set_talent_progress_audiences_v1() returns trigger language plpgsql as $$ begin
        if new.kind in ('memo', 'saved_stage_changed') then new.open_to_talent:=true;new.open_to_company:=false;
        else new.open_to_talent:=false;new.open_to_company:=false;end if;return new;end $$;
      create trigger talent_progress_audiences before insert on talent_progress for each row execute function set_talent_progress_audiences_v1();`);
    await db.exec(
      await readFile(
        "supabase/migrations/20261008113024_simulation_sessions.sql",
        "utf8"
      )
    );
    await db.exec(await readFile(migration, "utf8"));
    await db.query(
      "insert into talent_conversations(id,user_id) values($1,$2)",
      [conv, user]
    );
    await db.query("insert into company_roles values($1)", [role]);
    await db.query("insert into official_jobs values('public-role',$1)", [
      role,
    ]);
    const state = createSimulationSession({
      roleRef: `role:${role}`,
      roleName: "Example",
      documentId: null,
      documentName: null,
    });
    Object.assign(state, { archiveProgress: true });
    state.analysisStatus = "completed";
    state.facts = [
      {
        id: "f1",
        text: "User confirmed backend ownership only",
        messageId: 22,
      },
    ];
    const call = async (
      op: string,
      id: number | null = null,
      revision: number | null = null,
      payload: unknown = null,
      key: string | null = null
    ) =>
      (
        await db.query<{ id: number; payload: typeof state }>(
          "select * from write_simulation_session($1,$2,$3,$4,$5,$6,$7)",
          [
            user,
            conv,
            op,
            id,
            revision,
            payload === null ? null : JSON.stringify(payload),
            key,
          ]
        )
      ).rows[0];
    const first = await call("begin", null, null, state, "start");
    // Invalid role archives fail and roll back the end and conversation pointer.
    await assert.rejects(
      call(
        "save",
        first.id,
        1,
        { ...endSimulationSession(state, "user"), roleRef: "role:missing" },
        "end"
      )
    );
    assert.equal((await call("read")).payload.status, "active");
    const ended = await call(
      "save",
      first.id,
      1,
      endSimulationSession(state, "user"),
      "end"
    );
    await call("save", first.id, 1, endSimulationSession(state, "user"), "end");
    const progress = (
      await db.query<{
        text: string;
        metadata: any;
        open_to_talent: boolean;
        open_to_company: boolean;
      }>("select * from talent_progress")
    ).rows;
    assert.equal(progress.length, 1);
    assert.equal(progress[0].open_to_talent, true);
    assert.equal(progress[0].open_to_company, false);
    assert.match(progress[0].text, /backend ownership/);
    assert.equal(progress[0].metadata.sessionMessageId, ended.id);
    assert.equal(progress[0].metadata.facts[0].messageId, 22);
    assert.equal(
      (await db.query("select * from talent_progress where kind='memo'")).rows
        .length,
      0
    );
    const expired = createSimulationSession({
      roleRef: "job:public-role",
      roleName: "Public",
      documentId: null,
      documentName: null,
    });
    Object.assign(expired, { archiveProgress: true });
    expired.analysisStatus = "failed";
    expired.lastActivityAt = new Date(Date.now() - 61 * 60_000).toISOString();
    await call("begin", null, null, expired, "second");
    await call("touch");
    assert.equal(
      (await db.query("select * from talent_progress")).rows.length,
      2
    );
    assert.equal(
      (
        await db.query<{ simulation_session_message_id: number | null }>(
          "select simulation_session_message_id from talent_conversations"
        )
      ).rows[0].simulation_session_message_id,
      null
    );
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated','public.record_application_preparation_progress(uuid,uuid,jsonb,bigint)','execute') as allowed"
        )
      ).rows[0].allowed,
      false
    );
  } finally {
    await db.close();
  }
});
test("unrelated request awaits another user turn and retains that request for the handoff", () => {
  const state = createSimulationSession({
    roleRef: "role:r",
    roleName: "Example",
    documentId: null,
    documentName: null,
  });
  state.analysisStatus = "completed";
  const pending = mutateSimulationSession(
    state,
    { action: "request_switch", request: "Find backend roles in Berlin" },
    10
  );
  assert.equal(pending.status, "active");
  assert.equal(pending.switchRequest?.text, "Find backend roles in Berlin");
  assert.throws(() =>
    mutateSimulationSession(
      pending,
      { action: "end", endReason: "switched" },
      10
    )
  );
  const declined = mutateSimulationSession(
    pending,
    { action: "cancel_switch" },
    11
  );
  assert.equal(declined.switchRequest, null);
  assert.equal(declined.status, "active");
  const ended = mutateSimulationSession(
    pending,
    {
      action: "end",
      endReason: "switched",
      text: "Resume draft provided; application not yet updated.",
    },
    11
  );
  assert.equal(ended.status, "ended");
  assert.equal(ended.switchRequest?.text, pending.switchRequest?.text);
  assert.match(ended.closingSummary!, /draft/);
});
