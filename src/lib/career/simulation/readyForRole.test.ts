import test from "node:test";
import assert from "node:assert/strict";
import { createSimulationSession } from "./session";
import { createPreparation } from "./preparation";
import { suggestionAction } from "./suggestionSchema";
import { askApplicationInput, pendingApplicationBatch } from "./applicationInput";
import { manageApplicationSuggestions } from "./suggestions";
import {
  readyForRole,
  readyForRoleSchema,
  readyForRoleTool,
} from "./readyForRole";
import { documentFingerprint } from "./resumeAttachment";
import { GENERATED_RESUME_ORIGIN } from "@/lib/resumes/schema";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

function fixture() {
  const userId = "11111111-1111-4111-8111-111111111111",
    sourceId = "22222222-2222-4222-8222-222222222222";
  const docs = new Map<string, any>([
    [
      sourceId,
      {
        id: sourceId,
        talent_id: userId,
        kind: "resume",
        file_name: "Original.pdf",
        origin_type: "upload",
        is_deleted: false,
        is_public: false,
        extracted_text: "Alex Example\nBuilt APIs",
        storage_path: "original.pdf",
        revision: 1,
      },
    ],
  ]);
  let state = createSimulationSession({
    roleName: "Example · Engineer",
    roleRef: "job:synthetic",
    documentId: sourceId,
    documentName: "Original.pdf",
  });
  state.analysisStatus = "completed";
  state.preparation = createPreparation();
  state.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
  const action = suggestionAction(
    {
      kind: "change",
      title: "Clarify work",
      reason: "User accepted",
      edits: [
        {
          target: "Experience",
          originalText: "Built APIs",
          suggestedText: "Built internal APIs",
        },
      ],
    },
    "C"
  );
  action.status = "completed";
  state.actions = [action];
  const admin = {
    from: (table: string) => {
      assert.equal(table, "talent_documents");
      const filters: Record<string, unknown> = {};
      let operation = "read",
        value: any;
      const q = {
        select: () => q,
        limit: () => q,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        insert: (v: any) => {
          operation = "insert";
          value = v;
          return q;
        },
        update: (v: any) => {
          operation = "update";
          value = v;
          return q;
        },
        maybeSingle: async () => {
          const current = [...docs.values()].find((d) =>
            Object.entries(filters).every(([k, v]) => d[k] === v)
          );
          if (operation === "insert") {
            docs.set(value.id, {
              is_deleted: false,
              ...value,
              revision: value.revision ?? 1,
            });
            return { data: docs.get(value.id), error: null };
          }
          if (operation === "update" && current) {
            Object.assign(current, value, { revision: current.revision + 1 });
            return { data: current, error: null };
          }
          return { data: current ?? null, error: null };
        },
      };
      return q;
    },
    rpc: async (_name: string, args: any) => {
      if (args.p_payload)
        state = { ...args.p_payload, revision: state.revision + 1 };
      return {
        data: {
          id: state.sessionId,
          message_id: 10,
          payload: state,
          created_at: state.startedAt,
        },
        error: null,
      };
    },
  } as unknown as TalentAdminClient;
  return {
    store: { admin, userId, conversationId: "conversation" },
    record: { messageId: 10, state },
    docs,
    sourceId,
  };
}
test("private saving remains available during inspection without pinning a submission version", async () => {
  const f = fixture();
  f.record.state.actions = [];
  f.record.state.applicationUrl = "https://example.test/apply";
  f.record.state.applicationInspection = { status: "running", runId: "inspection" };
  const pending = await readyForRole(f.store, f.record, { action: "reuse" }, 1, "pending");
  assert.equal(pending.result.preparationComplete, false);
  assert.equal(pending.record.state.preparation?.finalDocumentId, null);
  for (const status of ["supported", "unsupported", "unknown"] as const) {
    f.record.state.applicationInspection.status = "completed";
    f.record.state.applicationForm = { status: status === "supported" ? "read" : "unavailable", url: f.record.state.applicationUrl, checkedAt: new Date().toISOString(), fields: [], limitations: [], submission: { status, reason: "Observed access result" } };
    const ready = await readyForRole(f.store, f.record, { action: "reuse" }, 1, status);
    assert.equal(ready.result.submission.status, status);
    assert.equal(ready.result.applicationUrl, "https://example.test/apply");
    assert.equal(ready.result.applicationStarted, false);
  }
});
test("approved edits save while an unanswered question remains, then reuse the saved copy after resolution", async () => {
  const f = fixture();
  f.record.state.actions.push(suggestionAction({ kind: "question", title: "Portfolio URL?", reason: "Required field" }, "Q"));
  f.record.state = askApplicationInput(f.record.state, {
    purpose: "suggestions", items: [{ actionId: "Q" }],
  }, "question");
  const originalBatch = pendingApplicationBatch(f.record.state)!;
  const partial = await readyForRole(f.store, f.record, {
    action: "create", content: {
      language: "en", basics: { name: "Alex Example" },
      experience: [{ title: "Engineer", bullets: ["Built internal APIs"] }],
    },
  }, 1, "save-approved");
  assert.match(partial.result.savedResumeText, /Built internal APIs/);
  assert.equal(partial.result.preparationComplete, false);
  assert.equal(partial.record.state.preparation?.finalDocumentId, null);
  assert.equal(pendingApplicationBatch(partial.record.state)?.id, originalBatch.id);
  assert.equal(partial.record.state.actions.find(a => a.id === "Q")?.status, "pending");
  const resolved = manageApplicationSuggestions(partial.record.state, {
    changes: [{ id: "Q", decision: "ignore" }],
  }, "resolved-from-reply", 2);
  const final = await readyForRole(f.store, { ...partial.record, state: resolved }, { action: "reuse" }, 2, "pin-existing-copy");
  assert.equal(final.result.preparationComplete, true);
  assert.equal(final.result.documentId, partial.result.documentId);
  assert.equal(f.docs.size, 2);
});
test("ready saves a private tailored copy, preserves the uploaded original and pins the actual revision", async () => {
  const f = fixture(),
    original = structuredClone(f.docs.get(f.sourceId));
  const result = await readyForRole(
    f.store,
    f.record,
    {
      resume: {
        action: "create",
        document_name: "Alex - Example",
        content: {
          language: "en",
          basics: { name: "Alex Example" },
          experience: [{ title: "Engineer", bullets: ["Built internal APIs"] }],
        },
      },
    },
    1,
    "ready-1"
  );
  assert.deepEqual(f.docs.get(f.sourceId), original);
  const doc = f.docs.get(result.result.documentId);
  assert.equal(doc.file_name, "Example · Engineer.pdf");
  assert.equal(doc.is_public, false);
  assert.equal(doc.origin_type, GENERATED_RESUME_ORIGIN);
  assert.equal(result.record.state.preparation!.finalDocumentId, doc.id);
  assert.equal(
    result.record.state.preparation!.finalDocumentFingerprint,
    documentFingerprint(doc)
  );
  assert.ok(result.result.documentLink.includes(doc.id));
  assert.equal(result.result.savedResumeText, doc.extracted_text);
  assert.match(result.result.savedResumeText, /Built internal APIs/);
  const again = await readyForRole(
    f.store,
    result.record,
    {},
    2,
    "ready-again"
  );
  assert.equal(again.result.documentId, doc.id);
  assert.equal(f.docs.size, 2);
  // A later supporting-answer change must not ask for the already applied resume edit again.
  const material = suggestionAction({
    kind: "material",
    title: "Short motivation",
    reason: "Required field",
    applicationField: "Motivation",
    draftText: "API work",
  });
  material.status = "completed";
  again.record.state.actions.push(material);
  again.record.state.preparation!.inputRevision++;
  const materialReady = await readyForRole(
    f.store,
    again.record,
    {},
    3,
    "ready-material"
  );
  assert.equal(materialReady.result.documentId, doc.id);
  assert.equal(f.docs.size, 2);
  // Changing or withdrawing an applied edit must be reconciled in the document.
  materialReady.record.state.actions[0].status = "skipped";
  await assert.rejects(
    () => readyForRole(f.store, materialReady.record, {}, 4, "withdraw"),
    /resume changes/
  );
  const restored = await readyForRole(
    f.store,
    materialReady.record,
    {
      resume: {
        action: "update",
        document_name: "Tailored Korean English",
        document_id: doc.id,
        expected_revision: doc.revision,
        changes: [
          {
            op: "set",
            path: `/experience/${doc.structured_content.content.experience[0].id}/bullets/0`,
            value: "Built APIs",
          },
        ],
      },
    },
    4,
    "restore"
  );
  assert.equal(restored.result.documentId, doc.id);
  assert.equal(restored.result.revision, 2);
  assert.equal(restored.result.fileName, "Example · Engineer.pdf");
  assert.equal(f.docs.size, 2, "later edits reuse the working copy");
  assert.deepEqual(f.docs.get(f.sourceId), original);
  assert.match(f.docs.get(doc.id).extracted_text, /Built APIs/);
  assert.doesNotMatch(f.docs.get(doc.id).extracted_text, /Built internal APIs/);
});
test("readiness preserves partial form uncertainty alongside accessible submission", async () => {
  const f = fixture();
  f.record.state.actions = [];
  f.record.state.applicationForm = {
    status: "partial",
    url: "https://example.test/apply",
    checkedAt: new Date().toISOString(),
    text: "Required: describe a product you have used.",
    fields: [],
    limitations: ["Answer-dependent fields have not been inspected."],
    submission: { status: "supported", reason: "Public form is reachable." },
  };
  const { result } = await readyForRole(f.store, f.record, { action: "reuse" }, 1, "partial");
  assert.equal(result.applicationInspection.status, "partial");
  assert.equal(result.applicationInspection.text, f.record.state.applicationForm.text);
  assert.deepEqual(result.applicationInspection.limitations, f.record.state.applicationForm.limitations);
  assert.equal(result.submission.status, "supported");
  assert.equal(result.applicationStarted, false);
});
test("saving preserves unresolved items and cannot bypass accepted changes, ownership or source preservation", async () => {
  const f = fixture();
  await assert.rejects(
    () => readyForRole(f.store, f.record, {}, 1, "empty"),
    /Accepted resume changes/
  );
  await assert.rejects(
    () =>
      readyForRole(
        f.store,
        f.record,
        {
          resume: {
            action: "update",
            document_id: f.sourceId,
            expected_revision: 1,
            changes: [{ op: "set", path: "/basics/name", value: "Alex" }],
          },
        },
        1,
        "overwrite"
      ),
    /Uploaded resumes/
  );
  f.record.state.actions[0].status = "pending";
  const partial = await readyForRole(f.store, f.record, {}, 1, "unanswered");
  assert.equal(partial.result.preparationComplete, false);
  assert.deepEqual(partial.result.pendingItemIds, ["C"]);
  assert.equal(partial.record.state.actions[0].status, "pending");
  assert.equal(partial.record.state.preparation?.finalDocumentId, null);
  f.record.state.actions[0].status = "skipped";
  f.docs.get(f.sourceId).talent_id = "another-owner";
  await assert.rejects(
    () => readyForRole(f.store, f.record, {}, 1, "foreign"),
    /unavailable/
  );
});

test("model-facing ready commands use native fields while persisted wrapped calls remain readable", () => {
  const command = {
    action: "copy",
    document_id: "22222222-2222-4222-8222-222222222222",
    expected_revision: 1,
    document_name: "Alex - Example",
    changes: [{ op: "set", path: "/basics/name", value: "Alex Example" }],
  };
  assert.deepEqual(readyForRoleSchema.parse(command), { resume: command });
  assert.deepEqual(readyForRoleSchema.parse({ resume: command }), {
    resume: command,
  });
  assert.deepEqual(readyForRoleSchema.parse({}), {});
  assert.deepEqual(readyForRoleSchema.parse({ action: "reuse" }), {});
  assert.throws(
    () =>
      readyForRoleSchema.parse({ action: "reuse", changes: command.changes }),
    /no other fields/
  );
  assert.ok("action" in readyForRoleTool.function.parameters.properties);
  assert.ok(!("resume" in readyForRoleTool.function.parameters.properties));
  assert.throws(() =>
    readyForRoleSchema.parse({
      ...command,
      changes: JSON.stringify(command.changes),
    })
  );
  assert.throws(() =>
    readyForRoleSchema.parse({
      action: "update",
      document_id: command.document_id,
      expected_revision: 1,
      changes: [],
    })
  );
});

test("flat create and update commands save through the actual preparation service", async () => {
  const f = fixture();
  const result = await readyForRole(
    f.store,
    f.record,
    {
      action: "create",
      content: {
        language: "en",
        basics: { name: "Alex Example" },
        experience: [{ title: "Engineer", bullets: ["Built internal APIs"] }],
      },
    },
    1,
    "flat-create"
  );
  const doc = f.docs.get(result.result.documentId);
  assert.equal(doc.file_name, "Example · Engineer.pdf");
  const updated = await readyForRole(
    f.store,
    result.record,
    {
      action: "update",
      document_id: doc.id,
      expected_revision: doc.revision,
      changes: [
        {
          op: "set",
          path: `/experience/${doc.structured_content.content.experience[0].id}/bullets/0`,
          value: "Built and maintained internal APIs",
        },
      ],
    },
    2,
    "flat-update"
  );
  assert.equal(updated.result.documentId, doc.id);
  assert.equal(updated.result.revision, 2);
  assert.equal(f.docs.size, 2);
  assert.equal(
    f.docs.get(f.sourceId).extracted_text,
    "Alex Example\nBuilt APIs"
  );
  assert.match(doc.extracted_text, /Built and maintained internal APIs/);
});

test("application names number existing files, ignore deleted/other-owner files and stay stable on retry", async () => {
  const f = fixture();
  for (const [id, name, extra] of [
    ["existing", "Example · Engineer.pdf", {}],
    ["second", "Example · Engineer (2).pdf", {}],
    ["deleted", "Example · Engineer (3).pdf", { is_deleted: true }],
    ["foreign", "Example · Engineer (3).pdf", { talent_id: "another-user" }],
  ] as const) {
    f.docs.set(id, {
      ...f.docs.get(f.sourceId),
      id,
      file_name: name,
      ...extra,
    });
  }
  const command = {
    action: "create",
    document_name: "Tailored Korean English",
    content: {
      language: "en",
      basics: { name: "Alex Example" },
      experience: [{ title: "Engineer", bullets: ["Built internal APIs"] }],
    },
  };
  const first = await readyForRole(
    f.store,
    f.record,
    command,
    1,
    "same-request"
  );
  const retry = await readyForRole(
    f.store,
    f.record,
    command,
    1,
    "same-request"
  );
  assert.equal(first.result.fileName, "Example · Engineer (3).pdf");
  assert.equal(retry.result.fileName, first.result.fileName);
  assert.equal(retry.result.documentId, first.result.documentId);
  assert.equal(f.docs.size, 6);
});

test("generated sources can be copied without a model-authored title", async () => {
  const f = fixture();
  const first = await readyForRole(
    f.store,
    f.record,
    {
      action: "create",
      content: { language: "en", basics: { name: "Alex Example" } },
    },
    1,
    "first"
  );
  const source = f.docs.get(first.result.documentId);
  const next = fixture().record;
  next.state.documentId = source.id;
  const copy = await readyForRole(
    f.store,
    next,
    {
      action: "copy",
      document_id: source.id,
      expected_revision: source.revision,
    },
    2,
    "second"
  );
  assert.equal(copy.result.fileName, "Example · Engineer (2).pdf");
  assert.equal(source.file_name, "Example · Engineer.pdf");
  assert.notEqual(copy.result.documentId, source.id);
});
