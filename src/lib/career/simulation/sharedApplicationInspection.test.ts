import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createSimulationSession, parseSimulationSession, type SimulationSession } from "./session";
import { createPreparation } from "./preparation";
import { prepareApplicationReview } from "./applicationReview";
import { hydrateApplicationInspections, splitApplicationInspections, storeApplicationInspections, type SharedInspection } from "./sharedApplicationInspection";
import { inspectionMemoryStore } from "./sharedApplicationInspection.testSupport";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

function fixture() {
  const state = createSimulationSession({ roleRef: "job:example", roleName: "Example", documentId: "private-resume", documentName: "Resume" });
  state.activity = { version: 1, roleId: "11111111-1111-4111-8111-111111111111", outputs: {}, batches: [] };
  state.preparation = createPreparation();
  state.preparation.responses.question = { decision: "answer", text: "My private history" };
  state.applicationUrl = "https://example.test/apply";
  state.applicationInspection = { status: "completed", runId: "inspection", browserUseSessionId: "private-inspection-session" };
  state.applicationForm = {
    status: "read", url: state.applicationUrl, checkedAt: "2026-10-29T02:00:00.000Z", limitations: ["Observed form"],
    submission: { status: "supported", reason: "Public application" },
    fields: [{ label: "Why apply?", type: "textarea", required: true, options: [], instructions: "Tell us why", fileTypes: [], maxLength: null }],
  };
  state.applicationReview = prepareApplicationReview(state, state.documentId!, [{ fieldId: "field-1", value: "My personal answer" }], [{ documentId: "private-letter", title: "Cover letter" }]);
  state.browser = {
    id: "attempt-2", status: "succeeded", engine: "browser-use-agents", startedAt: state.startedAt, updatedAt: state.startedAt,
    documentId: state.documentId!, documentHash: "hash", url: state.applicationUrl, purpose: "Apply", sessionId: "private-session",
    reviewedApplication: structuredClone(state.applicationReview),
    approval: { fingerprint: "approval", approved: true, executed: true, summary: "My approved details" },
    result: { summary: "Submitted", url: "https://example.test/receipt/private", evidence: "receipt-123" },
  };
  state.browser.previousAttempts = [{ ...structuredClone(state.browser), id: "attempt-1", status: "failed" }];
  state.browser.previousAttempts[0].reviewedApplication!.form.checkedAt = "2026-10-28T02:00:00.000Z";
  state.browser.previousAttempts[0].reviewedApplication!.fields[0].value = "Earlier answer";
  return state;
}

test("public observations split once while private answers, approvals and prior attempts round-trip", async () => {
  const state = fixture();
  const db = inspectionMemoryStore();
  const admin = db as unknown as TalentAdminClient;
  const payload = await storeApplicationInspections(admin, state);
  assert.equal(db.rows.size, 2);
  assert.equal(payload.applicationForm, undefined);
  assert.equal(payload.applicationUrl, undefined);
  assert.equal(payload.applicationReview.form, undefined);
  assert.equal(payload.browser.reviewedApplication.form, undefined);
  assert.equal(payload.browser.previousAttempts[0].reviewedApplication.form, undefined);
  assert.deepEqual(payload.preparation, state.preparation);
  assert.deepEqual(payload.browser.approval, state.browser!.approval);
  assert.equal(payload.applicationReview.fields[0].value, "My personal answer");
  assert.equal(payload.applicationReview.documents[0].documentId, "private-letter");
  const publicText = JSON.stringify([...db.rows.values()]);
  for (const secret of ["My personal answer", "My private history", "private-letter", "private-resume", "private-session", "receipt-123"]) assert.ok(!publicText.includes(secret));
  const hydrated = parseSimulationSession(await hydrateApplicationInspections(admin, payload))!;
  assert.ok(hydrated);
  assert.equal(hydrated.applicationUrl, state.applicationUrl);
  assert.equal(hydrated.applicationReview!.form.fields[0].label, "Why apply?");
  assert.deepEqual(hydrated.applicationForm!.limitations, ["Observed form", "Public application"]);
  assert.equal(hydrated.browser!.previousAttempts![0].reviewedApplication!.fields[0].value, "Earlier answer");
  assert.equal(hydrated.browser!.previousAttempts![0].reviewedApplication!.form.checkedAt, "2026-10-28T02:00:00.000Z");
  await storeApplicationInspections(admin, hydrated);
  assert.equal(db.rows.size, 2);
  delete hydrated.applicationFormId;
  hydrated.applicationForm = { ...hydrated.applicationForm!, checkedAt: "2026-10-30T02:00:00.000Z", fields: [] };
  const next = await storeApplicationInspections(admin, hydrated);
  const restored = await hydrateApplicationInspections(admin, next) as SimulationSession;
  assert.equal(db.rows.size, 3);
  assert.equal(restored.applicationForm!.fields.length, 0);
  assert.equal(restored.applicationReview!.form.fields.length, 1);
  assert.equal(restored.browser!.reviewedApplication!.fields[0].value, "My personal answer");
  await assert.rejects(hydrateApplicationInspections(admin, { ...next, activity: { ...next.activity, roleId: "different-role" } }), /Referenced application inspection unavailable/);
  assert.deepEqual(await hydrateApplicationInspections(admin, state), state);
});

test("SQL backfill copies public forms without changing any source payload and restricts shared-table access", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table talent_simulate_application(id uuid primary key, payload jsonb, updated_at timestamptz, revision integer);`);
    const state = fixture();
    // Unknown metadata from an older provider must not become a shared fact.
    const legacy = structuredClone(state) as any;
    legacy.applicationForm.candidate = "private-root-metadata";
    legacy.applicationForm.fields[0].answer = "private-field-metadata";
    await db.query("insert into talent_simulate_application values($1,$2,now(),7)", [state.sessionId, JSON.stringify(legacy)]);
    const sourceBefore = (await db.query("select * from talent_simulate_application")).rows;
    await db.exec(await readFile("supabase/migrations/20261029061615_shared_role_application_inspections.sql", "utf8"));
    assert.deepEqual((await db.query("select * from talent_simulate_application")).rows, sourceBefore);
    const row = (await db.query<{payload: any; revision: number}>("select payload,revision from talent_simulate_application")).rows[0];
    const observations = (await db.query<SharedInspection>("select * from role_application_inspections")).rows;
    assert.equal(observations.length, 2);
    assert.equal(row.revision, 7);
    assert.deepEqual(row.payload, JSON.parse(JSON.stringify(legacy)));
    const forms = observations.map(row => row.payload);
    assert.deepEqual(new Set(forms.map(form => form.checkedAt)), new Set([state.applicationForm!.checkedAt, "2026-10-28T02:00:00.000Z"]));
    assert.ok(!JSON.stringify(observations).includes("private-"));
    const memory = inspectionMemoryStore();
    observations.forEach(observation => memory.rows.set(observation.id, observation));
    const restored = parseSimulationSession(await hydrateApplicationInspections(memory as unknown as TalentAdminClient, row.payload));
    assert.ok(restored?.applicationReview?.form);
    assert.equal(restored!.applicationForm!.url, state.applicationUrl);
    const privileges = (await db.query<{rls: boolean; anon_read: boolean; user_read: boolean; server_read: boolean; server_insert: boolean; server_update: boolean}>(`select relrowsecurity rls,
      has_table_privilege('anon','role_application_inspections','select') anon_read,
      has_table_privilege('authenticated','role_application_inspections','select') user_read,
      has_table_privilege('service_role','role_application_inspections','select') server_read,
      has_table_privilege('service_role','role_application_inspections','insert') server_insert,
      has_table_privilege('service_role','role_application_inspections','update') server_update
      from pg_class where relname='role_application_inspections'`)).rows[0];
    assert.deepEqual(privileges, { rls: true, anon_read: false, user_read: false, server_read: true, server_insert: true, server_update: false });
    // Actual INSERT ... ON CONFLICT matches the service-role upsert used at runtime.
    await db.exec("set role service_role");
    const newForm = splitApplicationInspections({...fixture(), applicationForm: {...state.applicationForm!, checkedAt: "2026-11-01T02:00:00.000Z"}}).rows[0];
    for (let n=0;n<2;n++) await db.query("insert into role_application_inspections values($1,$2,$3,$4) on conflict(id) do nothing", [newForm.id,newForm.role_ref,newForm.checked_at,JSON.stringify(newForm.payload)]);
    assert.equal((await db.query("select * from role_application_inspections")).rows.length, 3);
  } finally { await db.close(); }
});
