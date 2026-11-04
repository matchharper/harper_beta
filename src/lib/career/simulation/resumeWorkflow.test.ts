import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { GENERATED_RESUME_ORIGIN } from "@/lib/resumes/schema";
import { createSimulationSession } from "./session";
import { createPreparation } from "./preparation";
import { assertApplicationDocumentWrite } from "./resumeWorkflow";

function fixture() {
  const userId = "candidate";
  const documents = [
    { id: "resume", talent_id: userId, origin_type: GENERATED_RESUME_ORIGIN, kind: "resume", is_deleted: false },
    { id: "deleted-resume", talent_id: userId, origin_type: GENERATED_RESUME_ORIGIN, kind: "resume", is_deleted: true },
  ];
  const admin = {
    from(table: string) {
      assert.equal(table, "talent_documents");
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        async maybeSingle() {
          return { data: documents.find(document => Object.entries(filters).every(
            ([key, value]) => document[key as keyof typeof document] === value,
          )) ?? null, error: null };
        },
      };
      return query;
    },
  } as unknown as TalentAdminClient;
  const session = createSimulationSession({ roleRef: "job:test", roleName: "Engineer", documentId: null, documentName: null });
  session.analysisStatus = "completed";
  return { session, args: { admin, userId, name: "upsert_document" } };
}

test("unified resume creation and inferred resume edits retain the application writer boundary", async () => {
  const { session, args } = fixture();
  session.preparation = createPreparation();
  for (const input of [
    { action: "create", type: "resume", title: "Resume", content: {} },
    { action: "copy", document_id: "resume", expected_revision: 1 },
    { action: "update", document_id: "resume", title: "Revised resume", expected_revision: 1 },
    { action: "update", document_id: "deleted-resume", title: "Restored resume", is_deleted: false, expected_revision: 1 },
    { action: "update", document_id: "resume", changes: [{ op: "set_summary", value: "Approved" }], expected_revision: 1 },
  ]) await assert.rejects(assertApplicationDocumentWrite(session, { ...args, input }), /ready_for_role/);
});

test("application preparation still allows supporting documents and resume metadata", async () => {
  const { session, args } = fixture();
  session.preparation = createPreparation();
  for (const input of [
    { action: "create", type: "markdown", title: "Motivation", markdown: "Confirmed work" },
    { action: "update", document_id: "resume", description: "Prepared resume" },
    { action: "update", document_id: "resume", is_public: false },
  ]) await assert.doesNotReject(assertApplicationDocumentWrite(session, { ...args, input }));
});

test("manual application sessions preserve analysis and browser safety checks for the unified writer", async () => {
  const { session, args } = fixture();
  const input = { action: "create", type: "resume", title: "Resume", content: {} };
  session.analysisStatus = "running";
  await assert.rejects(assertApplicationDocumentWrite(session, { ...args, input }), /analysis first/);
  session.analysisStatus = "completed";
  session.browser = { status: "running" } as NonNullable<typeof session.browser>;
  await assert.rejects(assertApplicationDocumentWrite(session, { ...args, input }), /Stop the current application browser/);
  session.browser = undefined;
  await assert.doesNotReject(assertApplicationDocumentWrite(session, { ...args, input }));
});
