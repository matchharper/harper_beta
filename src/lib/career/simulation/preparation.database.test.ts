import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createSimulationSession } from "./session";
import { createPreparation } from "./preparation";
test("preparation RPC protects running draft, expires idle state, resumes and rejects stale or foreign mutations", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
 create table public.talent_conversations(id uuid primary key,user_id uuid not null,career_coaching_activity_message_id bigint);
 create table public.talent_messages(id bigint generated always as identity primary key,conversation_id uuid not null,user_id uuid not null,role text,content text,message_type text,payload jsonb,created_at timestamptz default now());`);
    for (const f of [
      "20261008113024_simulation_sessions.sql",
      "20261009085318_application_preparation_drafts.sql",
    ])
      await db.exec(await readFile(`supabase/migrations/${f}`, "utf8"));
    const user = "00000000-0000-4000-8000-000000000001",
      conv = "00000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into talent_conversations(id,user_id) values($1,$2)",
      [conv, user]
    );
    const state = {
      ...createSimulationSession({
        roleRef: "role:x",
        roleName: "Engineer",
        documentId: "cv",
        documentName: "CV",
      }),
      preparation: createPreparation(),
    };
    state.analysisStatus = "completed";
    state.lastActivityAt = new Date(Date.now() - 7200000).toISOString();
    state.preparation.generation = {
      status: "running",
      runId: "run",
      startedAt: new Date().toISOString(),
      inputRevision: 0,
    };
    const rpc = async (
      op: string,
      id: number | null,
      revision: number | null,
      payload: unknown,
      key: string | null,
      owner = user
    ) =>
      (
        await db.query<{ id: number; payload: typeof state }>(
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
        )
      ).rows[0];
    let r = await rpc("begin", null, null, state, "start");
    r = await rpc("touch", r.id, null, null, null);
    assert.equal(r.payload.status, "active");
    r.payload.preparation.generation.status = "ready";
    r.payload.lastActivityAt = new Date(Date.now() - 7200000).toISOString();
    r.payload.preparation.draftMessageId = 99;
    r = await rpc("save", r.id, r.payload.revision, r.payload, "draft");
    r = await rpc("touch", r.id, null, null, null);
    assert.equal(r.payload.endReason, "expired");
    assert.equal(r.payload.preparation.draftMessageId, 99);
    const old = r.payload.revision;
    r = await rpc("resume", r.id, old, null, "resume");
    assert.equal(r.payload.status, "active");
    await assert.rejects(() => rpc("save", r.id, old, r.payload, "stale"));
    await assert.rejects(() =>
      rpc(
        "read",
        r.id,
        null,
        null,
        null,
        "00000000-0000-4000-8000-000000000003"
      )
    );
    const pointer = (
      await db.query<{ simulation_session_message_id: number }>(
        "select simulation_session_message_id from talent_conversations"
      )
    ).rows[0];
    assert.equal(pointer.simulation_session_message_id, r.id);
  } finally {
    await db.close();
  }
});
