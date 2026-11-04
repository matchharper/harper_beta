import { saveApplication } from "./saveApplication";
import { recordResumeDelivery } from "./applicationFollowUp";
import { inspectionMemoryStore } from "./sharedApplicationInspection.testSupport";
import { hydrateApplicationInspections } from "./sharedApplicationInspection";
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
import { buildPreparationPrompt } from "./preparationPrompt";
import { serializeToolResultForModel } from "@/lib/llm/toolError";

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
  const inspections = inspectionMemoryStore();
  const admin = {
    from: (table: string) => {
      if (table === "role_application_inspections") return inspections.from(table);
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
      const nextPayload = args.p_payload ? await hydrateApplicationInspections(admin, args.p_payload) as typeof state : null;
      if (args.p_payload)
        state = { ...nextPayload!, revision: state.revision + 1 };
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
test("resume completion is independent of inspection and never creates the application draft", async () => {
  const f = fixture();
  f.record.state.actions = [];
  f.record.state.applicationUrl = "https://example.test/apply";
  f.record.state.applicationInspection = { status: "running", runId: "inspection" };
  const pending = await readyForRole(f.store, f.record, { action: "reuse" }, 1, "pending");
  assert.equal(pending.result.preparationComplete, true);
  assert.equal(pending.record.state.preparation?.finalDocumentId, f.sourceId);
  assert.equal(pending.record.state.applicationReview, undefined);
  for (const status of ["supported", "unsupported", "unknown"] as const) {
    f.record.state.applicationInspection.status = "completed";
    f.record.state.applicationForm = { status: status === "supported" ? "read" : "unavailable", url: f.record.state.applicationUrl, checkedAt: new Date().toISOString(), fields: [], limitations: [], submission: { status, reason: "Observed access result" } };
    const ready = await readyForRole(f.store, f.record, { action: "reuse" }, 1, status);
    assert.equal(ready.result.preparationComplete, true);
    assert.equal(ready.record.state.applicationReview, undefined);
    assert.equal(ready.result.applicationStarted, false);
  }
});

test("application answers require a separately delivered resume and resolve its attachment", async () => {
  const f = fixture();
  f.record.state.actions = [];
  f.record.state.applicationForm = { status: "read", url: "https://fixture.example/apply", checkedAt: new Date().toISOString(), limitations: [], submission: { status: "supported", reason: "Public form" }, fields: [
    { label: "Motivation", type: "textarea", required: true, options: [], instructions: "", fileTypes: [], maxLength: null },
    { label: "Resume", type: "file", required: true, options: [], instructions: "", fileTypes: ["pdf"], maxLength: null },
  ] };
  const ready = await readyForRole(f.store, f.record, { action: "reuse" }, 1, "ready");
  const input = { application_fields: [{ fieldId: "field-1", value: "Previously approved text" }, { fieldId: "field-2", documentId: "final_resume" }] };
  await assert.rejects(saveApplication(f.store, ready.record, input, "too-early"), /Deliver the prepared resume/);
  const delivered = { ...ready.record, state: recordResumeDelivery(ready.record.state, 20, "follow-up") };
  const saved = await saveApplication(f.store, delivered, input, "ready-form");
  assert.equal(saved.record.state.applicationReview?.fields[0].value, "Previously approved text");
  assert.equal(saved.record.state.applicationReview?.fields[1].documentId, f.sourceId);
  assert.equal(saved.result.applicationReview?.available, true);
  assert.equal(saved.record.state.browser, undefined);
});
test("supporting documents persist on a login handoff and require ownership", async () => {
  const f = fixture();
  f.record.state.actions = [];
  f.record.state.applicationForm = {
    status: "partial", url: "https://example.test/apply", checkedAt: f.record.state.startedAt,
    fields: [], limitations: [], submission: { status: "unsupported", reason: "Login required" },
  };
  const supportingId = "55555555-5555-4555-8555-555555555555";
  f.docs.set(supportingId, {
    ...f.docs.get(f.sourceId), id: supportingId, kind: "document", file_name: "Project.pdf",
    origin_type: "harper_authored_document", extracted_text: "Known project and contribution",
  });
  const ready = await readyForRole(f.store, f.record, { action: "reuse" }, 1, "ready");
  const delivered = { ...ready.record, state: recordResumeDelivery(ready.record.state, 20, "follow-up") };
  const saved = await saveApplication(f.store, delivered, {
    application_fields: [], application_documents: [supportingId],
  }, "supporting");
  assert.deepEqual(saved.record.state.applicationReview?.documents, [{ documentId: supportingId, title: "Project.pdf" }]);
  const again = await saveApplication(f.store, saved.record, { application_fields: [] }, "preserve");
  assert.deepEqual(again.record.state.applicationReview?.documents, saved.record.state.applicationReview?.documents);
  f.docs.get(supportingId).talent_id = "different-owner";
  await assert.rejects(saveApplication(f.store, again.record, {
    application_fields: [], application_documents: [supportingId],
  }, "foreign"), /supporting document unavailable/);
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
    submission: { status: "supported" },
  };
  const { record, result } = await readyForRole(f.store, f.record, { action: "reuse" }, 1, "partial");
  const before = buildPreparationPrompt(record.state).map(b => b.text).join("\n");
  assert.ok(!before.includes("Answer-dependent fields have not been inspected."));
  const delivered = recordResumeDelivery(record.state, 20, "follow-up");
  const after = buildPreparationPrompt(delivered).map(b => b.text).join("\n");
  assert.ok(after.includes("Answer-dependent fields have not been inspected."));
  assert.ok(after.includes("Required: describe a product you have used."));
  assert.equal(result.applicationStarted, false);
});

test("planning retains access evidence; save receipts retain actions without repeating inspection logs", async () => {
  for (const reason of [
    "공고 페이지에 마감된 공고로 표시되어 지원할 수 없습니다.",
    "지원 폼을 보려면 회사 채용 사이트에 로그인이 필요합니다.",
  ]) {
    const f = fixture();
    f.record.state.actions = [];
    f.record.state.applicationInspection = { status: "completed", runId: "fixture" };
    f.record.state.applicationForm = {
      status: "unavailable", url: "https://example.test/job",
      checkedAt: "2026-10-29T00:30:00.000Z", fields: [], text: "",
      limitations: ["지원 폼을 열지 못해 질문을 확인하지 못했습니다."],
      submission: { status: "unsupported", reason },
    };
    const { record, result } = await readyForRole(f.store, f.record, { action: "reuse" }, 1, "barrier");
    const before = buildPreparationPrompt(record.state).find(block => block.key === "application_preparation_context")!.text;
    assert.ok(!before.includes(reason));
    const context = buildPreparationPrompt(recordResumeDelivery(record.state, 20, "follow-up"))
      .find(block => block.key === "application_preparation_context")!.text;
    assert.ok(context.includes(reason));
    assert.ok(context.includes("Assisted submission access: unsupported"));
    assert.ok(!context.includes("2026-10-29T00:30:00.000Z"));

    // This is the serializer used for tool delivery to the conversation provider.
    const providerText = serializeToolResultForModel(result);
    assert.equal(providerText, result.modelOutput);
    assert.ok(!providerText.includes("unsupported"));
    assert.ok(!providerText.includes(reason));
    assert.ok(!providerText.includes("지원 폼을 열지 못해 질문을 확인하지 못했습니다."));
    assert.ok(providerText.includes(result.documentLink));
    assert.equal(result.applicationStarted, false);
  }
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
  const normalized = { ...command, document_name: "Application resume" };
  assert.deepEqual(readyForRoleSchema.parse(command), { resume: normalized });
  assert.deepEqual(readyForRoleSchema.parse({ resume: command }), {
    resume: normalized,
  });
  assert.deepEqual(readyForRoleSchema.parse({}), {});
  assert.deepEqual(readyForRoleSchema.parse({ action: "reuse" }), {});
  assert.throws(() => readyForRoleSchema.parse({
    action: "reuse", application_fields: [{ fieldId: "name", value: "Alex Example" }],
  }), /save_application/);
  assert.throws(
    () =>
      readyForRoleSchema.parse({ action: "reuse", changes: command.changes }),
    /apply content or changes/
  );
  assert.ok("action" in readyForRoleTool.function.parameters.properties);
  assert.ok(!("resume" in readyForRoleTool.function.parameters.properties));
  assert.ok("document_name" in readyForRoleTool.function.parameters.properties);
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

test("application-owned filenames ignore empty legacy values while source revision checks remain intact", async () => {
  for (const document_name of [undefined, "", null, "Legacy filename"]) {
    const f = fixture();
    const command = {
      action: "create", document_name,
      content: { language: "en", basics: { name: "Alex Example" } },
    };
    const saved = await readyForRole(f.store, f.record, command, 1, "filename");
    assert.equal(saved.result.fileName, "Example · Engineer.pdf");
    assert.throws(() => readyForRoleSchema.parse({ ...command, document_id: f.sourceId }), /must not include document_id/);
    assert.throws(() => readyForRoleSchema.parse({ ...command, expected_revision: 1 }), /expected_revision/);
  }
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
