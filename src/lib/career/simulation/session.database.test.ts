import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createSimulationSession } from "./session";
test("session RPC: atomic pointer, ownership, CAS, replay, expiry, coaching exclusion", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
 create table public.talent_conversations(id uuid primary key,user_id uuid not null,career_coaching_activity_message_id bigint);
 create table public.talent_messages(id bigint generated always as identity primary key,conversation_id uuid not null,user_id uuid not null,role text,content text,message_type text,payload jsonb,created_at timestamptz default now());`);
    await db.exec(
      await readFile(
        "supabase/migrations/20261008113024_simulation_sessions.sql",
        "utf8"
      )
    );
    const user = "00000000-0000-4000-8000-000000000001",
      conv = "00000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into talent_conversations(id,user_id) values($1,$2)",
      [conv, user]
    );
    const initial = createSimulationSession({
      roleRef: "role:x",
      roleName: "Role",
      documentId: null,
      documentName: null,
    });
    const call = async (
      op: string,
      id: number | null = null,
      revision: number | null = null,
      payload: unknown = null,
      key: string | null = null,
      owner = user
    ) => {
      const r = await db.query<{ id: number; payload: typeof initial }>(
        "select * from write_simulation_session($1,$2,$3,$4,$5,$6,$7)",
        [
          owner,
          conv,
          op,
          id,
          revision,
          payload ? JSON.stringify(payload) : null,
          key,
        ]
      );
      return r.rows[0];
    };
    await assert.rejects(
      call(
        "begin",
        null,
        null,
        initial,
        "start",
        "00000000-0000-4000-8000-000000000003"
      )
    );
    const first = await call("begin", null, null, initial, "start");
    assert.ok(first.id);
    assert.equal(
      (await call("begin", null, null, initial, "start")).id,
      first.id
    );
    await assert.rejects(call("begin", null, null, initial, "other"));
    await assert.rejects(
      db.query(
        "update talent_conversations set career_coaching_activity_message_id=42 where id=$1",
        [conv]
      )
    );
    const saved = await call(
      "save",
      first.id,
      1,
      { ...initial, analysisStatus: "completed" },
      "save"
    );
    assert.equal(saved.payload.revision, 2);
    assert.equal(
      (await call("save", first.id, 1, initial, "save")).payload.revision,
      2
    );
    await assert.rejects(call("save", first.id, 1, initial, "stale"));
    const old = {
      ...saved.payload,
      lastActivityAt: new Date(Date.now() - 61 * 60_000).toISOString(),
    };
    await call("save", first.id, 2, old, "old");
    const expired = await call("touch");
    assert.equal(expired.payload.endReason, "expired");
    const ptr = await db.query<{
      simulation_session_message_id: number | null;
    }>("select simulation_session_message_id from talent_conversations");
    assert.equal(ptr.rows[0].simulation_session_message_id, null);
    await assert.rejects(call("save", first.id, 3, initial, "resurrect"));
    const second = await call("begin", null, null, initial, "new");
    await call(
      "save",
      second.id,
      1,
      { ...initial, lastActivityAt: old.lastActivityAt },
      "old_running"
    );
    assert.equal((await call("touch")).payload.status, "active");
  } finally {
    await db.close();
  }
});
