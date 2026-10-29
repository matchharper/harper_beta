import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationReviewText,
  editApplicationReview,
  prepareApplicationReview,
} from "./applicationReview";
import { createSimulationSession, parseSimulationSession } from "./session";
import { createPreparation } from "./preparation";
import { applicationReviewView } from "./applicationReviewView";
import { executeApplicationReview } from "./applicationReviewService";
import { documentFingerprint } from "./resumeAttachment";
import { startApplicationBrowser } from "./applicationBrowserServer";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

function fixture() {
  let state = createSimulationSession({
    roleRef: "role:fixture",
    roleName: "Fixture Engineer",
    documentId: "resume",
    documentName: "Original.pdf",
  });
  state.activity = { version: 1, outputs: {}, batches: [] };
  state.analysisStatus = "completed";
  state.preparation = createPreparation();
  const document = {
    id: "resume",
    kind: "resume",
    storage_path: "owner/resume.pdf",
    content_sha256: "original",
  };
  state.preparation.finalDocumentId = document.id;
  state.preparation.finalDocumentFingerprint = documentFingerprint(document);
  state.applicationUrl = "https://fixture.example/apply";
  state.applicationForm = {
    status: "read",
    url: state.applicationUrl,
    checkedAt: state.startedAt,
    limitations: [],
    submission: { status: "supported", reason: "Public form" },
    fields: [
      {
        label: "Motivation",
        type: "textarea",
        required: true,
        options: [],
        instructions: "",
        fileTypes: [],
        maxLength: null,
      },
      {
        label: "Resume",
        type: "file",
        required: true,
        options: [],
        instructions: "",
        fileTypes: ["pdf"],
        maxLength: null,
      },
    ],
  };
  state.applicationReview = prepareApplicationReview(state, "resume", [
    { fieldId: "field-1", value: "Approved answer" },
    { fieldId: "field-2", documentId: "resume" },
  ]);
  const admin = {
    rpc: async (_: string, args: any) => {
      assert.equal(args.p_user_id, "owner");
      if (args.p_operation === "save") {
        if (args.p_revision !== state.revision)
          return {
            data: null,
            error: { message: "Session revision conflict" },
          };
        state = {
          ...structuredClone(args.p_payload),
          revision: state.revision + 1,
        };
      }
      return {
        data: {
          message_id: 1,
          created_at: state.startedAt,
          payload: structuredClone(state),
        },
        error: null,
      };
    },
    from: () => {
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return q;
        },
        maybeSingle: async () => ({
          data:
            filters.talent_id === "owner" && filters.id === "resume"
              ? document
              : null,
          error: null,
        }),
      };
      return q;
    },
  } as unknown as TalentAdminClient;
  return {
    store: { admin, userId: "owner", conversationId: "conversation" },
    record: () => ({ messageId: 1, state: structuredClone(state) }),
    set: (next: typeof state) => {
      state = next;
    },
  };
}

test("saved user edits survive model preparation and serialize with their observed fields", () => {
  const f = fixture(),
    s = f.record().state;
  s.applicationReview = editApplicationReview(s.applicationReview!, 1, [
    { fieldId: "field-1", value: "My exact answer\nwith two lines" },
  ]);
  const prepared = prepareApplicationReview(s, "resume", [
    { fieldId: "field-1", value: "Model replacement" },
  ])!;
  assert.equal(prepared.fields[0].value, "My exact answer\nwith two lines");
  assert.equal(
    parseSimulationSession({ ...s, applicationReview: prepared })
      ?.applicationReview?.fields[0].value,
    prepared.fields[0].value
  );
  assert.match(
    applicationReviewText(prepared),
    /Motivation: My exact answer\nwith two lines/
  );
  assert.throws(
    () => editApplicationReview(prepared, 1, []),
    /revision conflict/
  );
  assert.throws(
    () =>
      editApplicationReview(prepared, prepared.revision, [
        { fieldId: "invented", value: "wrong field" },
      ]),
    /Unknown application field/
  );
});

test("attachment ownership and browser immutability protect saved form edits", async () => {
  const f = fixture();
  await assert.rejects(
    executeApplicationReview(f.store, f.record(), {
      messageId: 1,
      operation: "save",
      requestId: "foreign",
      reviewRevision: 1,
      answers: [{ fieldId: "field-2", documentId: "someone-elses-file" }],
    }),
    /attachment unavailable/
  );
  const saved = await executeApplicationReview(f.store, f.record(), {
    messageId: 1,
    operation: "save",
    requestId: "edit",
    reviewRevision: 1,
    answers: [{ fieldId: "field-1", value: "User edit" }],
  });
  await assert.rejects(
    startApplicationBrowser(f.store, saved, { purpose: "Apply" }),
    /review/
  );
  const started = await startApplicationBrowser(
    f.store,
    saved,
    { purpose: "Apply" },
    undefined,
    2
  );
  assert.equal(
    started.state.browser?.reviewedApplication?.fields[0].value,
    "User edit"
  );
  await assert.rejects(
    executeApplicationReview(f.store, started, {
      messageId: 1,
      operation: "save",
      requestId: "racing-edit",
      reviewRevision: 2,
      answers: [],
    }),
    /cannot be edited/
  );
  const again = await startApplicationBrowser(
    f.store,
    started,
    { purpose: "Apply" },
    undefined,
    2
  );
  assert.equal(again.state.browser?.id, started.state.browser?.id);
});

test("observed login barrier hands off without starting a browser", async () => {
  const f = fixture(),
    s = f.record().state;
  s.applicationForm!.submission = {
    status: "unsupported",
    reason: "Login required",
  };
  s.applicationReview!.form.submission = s.applicationForm!.submission;
  f.set(s);
  await assert.rejects(
    startApplicationBrowser(
      f.store,
      f.record(),
      { purpose: "Apply" },
      undefined,
      1
    ),
    /observed access barrier/
  );
  const view = applicationReviewView(f.record());
  assert.equal(view.browser, null);
  assert.equal(view.resumeDocumentId, "resume");
  assert.equal(view.applicationUrl, "https://fixture.example/apply");
});

test("review responses omit browser credentials and raw request bodies", async () => {
  const f = fixture();
  const started = await startApplicationBrowser(
    f.store,
    f.record(),
    { purpose: "Apply" },
    undefined,
    1
  );
  started.state.browser!.pendingRequest = {
    id: "request",
    url: "https://fixture.example/send",
    pageUrl: "https://fixture.example/apply",
    method: "POST",
    bodyHash: "hash",
    formHash: "hash",
    bodyPreview: "secret-token",
    fields: [{ label: "Name", value: "Fixture" }],
  };
  const view = applicationReviewView(started);
  assert.deepEqual(view.browser?.request?.fields, [
    { label: "Name", value: "Fixture" },
  ]);
  assert.equal(JSON.stringify(view).includes("secret-token"), false);
});
