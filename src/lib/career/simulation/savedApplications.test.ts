import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createSimulationSession, endSimulationSession } from "./session";
import { createPreparation } from "./preparation";
import { askApplicationInput, pendingApplicationBatch } from "./applicationInput";
import { manageSavedApplications, resumeSavedPreparation } from "./savedApplications";
import { sessionOperation, saveSession } from "./sessionStore";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

function preparation(role: string, doc: string, offerId: number) {
  const state = createSimulationSession({ roleRef: `role:${role}`, roleName: role, documentId: doc, documentName: "CV" });
  state.analysisStatus = "completed";
  state.preparation = createPreparation();
  state.activity = { version: 1, offerId, outputs: {}, batches: [] };
  return askApplicationInput(state, { purpose: "Prepare", items: [
    { kind: "question", title: "What did you build?" },
    { kind: "question", title: "What changed?" },
  ] }, "questions");
}

test("save A, work on B, then resume A with the same answers, pending questions and document through the real RPC", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table talent_users(user_id uuid primary key);
      create table talent_conversations(id uuid primary key,user_id uuid,career_coaching_activity_message_id bigint);
      create table talent_messages(id bigint generated always as identity primary key,user_id uuid,conversation_id uuid,role text,message_type text,content text,payload jsonb,created_at timestamptz default now());
      create table talent_documents(id uuid primary key,talent_id uuid,kind text,extracted_text text,is_deleted boolean default false);`);
    for (const name of ["20261009132045_application_activity_store", "20261009142639_application_questions_without_intro", "20261013141544_email_application_start"])
      await db.exec(await readFile(`supabase/migrations/${name}.sql`, "utf8"));
    const userId = crypto.randomUUID(), conversationId = crypto.randomUUID(), doc = crypto.randomUUID();
    await db.query("insert into talent_users values($1)", [userId]);
    await db.query("insert into talent_conversations(id,user_id) values($1,$2)", [conversationId,userId]);
    await db.query("insert into talent_documents values($1,$2,'resume','Original resume',false)", [doc,userId]);
    const admin = { rpc: async (_: string, args: Record<string, unknown>) => {
      try {
        const { rows } = await db.query<{ result: unknown }>("select write_application_activity($1,$2,$3,$4,$5,$6,$7,$8) result", [
          args.p_user_id,args.p_conversation_id,args.p_operation,args.p_message_id,args.p_revision,
          args.p_payload ? JSON.stringify(args.p_payload) : null,args.p_key,args.p_offer_id,
        ]);
        return { data: rows[0].result, error: null };
      } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
    } } as unknown as TalentAdminClient;
    const store = { admin, userId, conversationId };
    const begin = async (role: string) => {
      const { rows } = await db.query<{ id: number }>("insert into talent_messages(user_id,conversation_id,message_type,payload) values($1,$2,'application_start_offer',$3) returning id", [userId,conversationId,JSON.stringify({ roleId: role, status: "ready" })]);
      return (await sessionOperation({ ...store, operation: "begin", state: preparation(role, doc, rows[0].id), key: role }))!;
    };
    let a = await begin("A");
    const firstQuestion = a.state.activity!.batches[0].itemIds[0];
    a.state.preparation!.responses[firstQuestion] = { decision: "answer", text: "Built the API" };
    a.state.preparation!.workingResume = { documentId: doc, revision: 3, fileName: "A resume.pdf" };
    const paused = await saveSession(store, a, endSimulationSession(a.state, "switched"), "pause-a");
    assert.equal(paused.state.status, "ended");
    assert.equal(pendingApplicationBatch(paused.state), undefined);
    const b = await begin("B");
    const blocked = await manageSavedApplications(store, { action: "resume", sessionMessageId: a.messageId }, "resume-while-b");
    assert.equal(blocked.ok, false);
    await saveSession(store, b, endSimulationSession(b.state, "user"), "pause-b");
    const messages: unknown[] = [];
    const result = await manageSavedApplications(store, { action: "resume", sessionMessageId: a.messageId }, "resume-a", m => messages.push(m));
    assert.equal(result.ok, true);
    const restored = (await sessionOperation({ ...store, operation: "read" }))!;
    assert.equal(restored.messageId, a.messageId);
    assert.equal(pendingApplicationBatch(restored.state)?.id, a.state.activity!.batches[0].id);
    assert.equal(restored.state.preparation?.responses[firstQuestion].text, "Built the API");
    assert.deepEqual(restored.state.preparation?.workingResume, a.state.preparation!.workingResume);
    assert.equal(restored.state.browser, undefined);
    assert.equal(messages.length, 1);
    assert.equal((await sessionOperation({ ...store, operation: "read", messageId: b.messageId }))?.state.status, "ended");
    await manageSavedApplications(store, { action: "resume", sessionMessageId: a.messageId }, "resume-a");
    assert.equal((await sessionOperation({ ...store, operation: "read" }))?.state.revision, restored.state.revision);
    await assert.rejects(manageSavedApplications({ ...store, userId: crypto.randomUUID() }, { action: "resume", sessionMessageId: a.messageId }, "wrong-owner"));
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from talent_simulate_application")).rows[0].count, 2);
  } finally { await db.close(); }
});

test("resuming keeps stopped website attempts and submission outcomes without replaying consent", () => {
  const state = preparation("A", "doc", 1);
  state.browser = { id: "browser", status: "waiting", documentId: "doc", documentHash: "hash", purpose: "Apply", url: "https://example.com/apply", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), approval: { fingerprint: "review", approved: true, executed: true, summary: "Approved" } };
  const paused = endSimulationSession(state, "user");
  const resumed = resumeSavedPreparation(paused);
  assert.equal(resumed.browser?.status, "cancelled");
  assert.deepEqual(resumed.browser, paused.browser);
  assert.equal(resumed.preparation?.showInputs, true);
  assert.deepEqual(resumed.preparation?.responses, state.preparation?.responses);
  assert.throws(() => resumeSavedPreparation({ ...paused, analysisStatus: "failed" }), /initial preparation/);
});
