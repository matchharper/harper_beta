import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { ResumeExportError } from "@/lib/resumes/export";
import { PdfRenderError } from "@/lib/resumes/pdfError";
import type { CareerForm } from "./schema";
import { CareerFormError, classifyFormResponseError, failedPdfExport, selectedFileError } from "./responseError";
import { respondToCareerForm } from "./server";

const userId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
const documentId = "00000000-0000-4000-8000-000000000003";
const rendering = (stage: string) => new PdfRenderError(stage === "configuration" ? "PDF rendering is not configured." : "PDF rendering failed.",
  { stage, pdfReceived: false });

test("each failure has one status, code and answer to whether pressing again can help", () => {
  const invalid = z.object({ formId: z.number() }).safeParse({});
  assert.equal(invalid.success, false);
  const cases: [unknown, number, string, boolean][] = [
    [new CareerFormError("form_changed", "Form not found"), 409, "form_changed", false],
    [new CareerFormError("file_unavailable", "Document not found"), 422, "file_unavailable", false],
    [new CareerFormError("invalid_answer", "Unknown selected option"), 422, "invalid_answer", false],
    [invalid.error, 422, "invalid_answer", false],
    [new ResumeExportError(409, "Document changed. Reload the preview before downloading."), 409, "form_changed", false],
    [new ResumeExportError(404, "Document not found"), 422, "file_unavailable", false],
    [new ResumeExportError(422, "Resume content is invalid"), 422, "file_unavailable", false],
    [new ResumeExportError(500, "Export failed"), 500, "unexpected", true],
    [rendering("configuration"), 503, "file_render_unavailable", false],
    ...["provider_request", "provider_response", "pdf_read", "timeout"].map(stage =>
      [rendering(stage), 503, "file_render_failed", true] as [unknown, number, string, boolean]),
    [new Error("Attachment download failed"), 500, "unexpected", true],
    ["a thrown string", 500, "unexpected", true],
    [undefined, 500, "unexpected", true],
  ];
  for (const [error, status, code, retryable] of cases)
    assert.deepEqual(classifyFormResponseError(error), { status, code, retryable });
});

test("a selected file that fails keeps its cause's reason and names the document only for a PDF that was not made", () => {
  const file = { documentId, revision: 2 };
  const cause = rendering("configuration");
  const error = selectedFileError(cause, file);
  assert.deepEqual(classifyFormResponseError(error), { status: 503, code: "file_render_unavailable", retryable: false });
  assert.equal(error.message, "PDF rendering is not configured.");
  assert.equal(error.cause, cause);
  assert.deepEqual(failedPdfExport(error), { ...file, error: cause });
  const missing = selectedFileError(new ResumeExportError(404, "Document not found"), file);
  assert.equal(classifyFormResponseError(missing).code, "file_unavailable");
  assert.equal(failedPdfExport(missing), undefined);
  assert.equal(failedPdfExport(cause), undefined, "without the selected document there is nothing to log");
  assert.equal(selectedFileError("a thrown string", file).message, "Selected file could not be prepared");
});

// A review that approves an application with a Harper-made document. The form-response path runs as it is;
// only the database transport is a fixture.
function fixture() {
  const document = { id: documentId, talent_id: userId, is_deleted: false, revision: 1, file_name: "A사 지원용 이력서",
    origin_type: "harper_authored_document", extracted_text: "# 경력", updated_at: "2026-11-05T00:00:00Z" };
  const form: CareerForm = { formId: 42, revision: 1, kind: "form", title: "A사 지원", items: [
    { id: "resume", label: "이력서", type: "document", content: { documentId, revision: 1, fileName: document.file_name } },
    { id: "visa", label: "비자 지원 필요", type: "text", content: { value: "" } },
  ], positive: { id: "submit", label: "이 내용으로 지원", message: "이 내용으로 지원해줘" } };
  const writes: unknown[] = [];
  const status = { form: "open" };
  const admin: any = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query: any = {
        select: () => query, order: () => query, limit: () => query, contains: () => query, in: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        // Only the ownership check reads a list.
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: document.is_deleted ? [] : [structuredClone(document)], error: null }).then(resolve),
        maybeSingle: async () => ({ data: table === "talent_documents" ? (document.is_deleted ? null : structuredClone(document))
          : table === "talent_messages" && filters.message_type === "career_form"
            ? { id: 42, user_id: userId, conversation_id: conversationId, role: "assistant", message_type: "career_form",
              payload: form, content: "", created_at: "2026-11-05T00:00:00Z" }
            : null, error: null }),
      };
      return query;
    },
    rpc: async (name: string, input: unknown) => {
      if (name === "read_career_form_status") return { data: status.form, error: null };
      writes.push(input);
      return { data: null, error: { message: "No write is expected" } };
    },
  };
  const approve = (values: Record<string, string>) => respondToCareerForm({ admin, userId, conversationId,
    input: { conversationId, formId: 42, revision: 1, actionId: "submit", values, requestId: "approve-1" } });
  return { document, status, writes, approve };
}
const refusal = (run: Promise<unknown>) => run.then(() => assert.fail("The answer must not be saved"), (error: unknown) => error);

test("approving a Harper-made document while PDF rendering is not configured is refused as unavailable before any write", async (t) => {
  const saved = process.env.BROWSERLESS_API_TOKEN;
  delete process.env.BROWSERLESS_API_TOKEN;
  t.after(() => { if (saved === undefined) delete process.env.BROWSERLESS_API_TOKEN; else process.env.BROWSERLESS_API_TOKEN = saved; });
  const request = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not fetch"); });
  const { writes, approve } = fixture();
  const error = await refusal(approve({ resume: documentId, visa: "아니요" }));
  assert.deepEqual(classifyFormResponseError(error), { status: 503, code: "file_render_unavailable", retryable: false });
  assert.match((error as Error).message, /not configured/);
  const pdf = failedPdfExport(error);
  assert.deepEqual(pdf && { documentId: pdf.documentId, revision: pdf.revision }, { documentId, revision: 1 });
  assert.ok(pdf?.error instanceof PdfRenderError);
  assert.equal(request.mock.callCount(), 0);
  assert.deepEqual(writes, []);
});

test("a closed form, a removed document and an answer the form does not ask for each give their own reason", async () => {
  const closed = fixture();
  closed.status.form = "answered";
  assert.equal(classifyFormResponseError(await refusal(closed.approve({ resume: documentId }))).code, "form_changed");
  const removed = fixture();
  removed.document.is_deleted = true;
  assert.equal(classifyFormResponseError(await refusal(removed.approve({ resume: documentId }))).code, "file_unavailable");
  const unknown = fixture();
  assert.equal(classifyFormResponseError(await refusal(unknown.approve({ salary: "협의" }))).code, "invalid_answer");
  assert.deepEqual([...closed.writes, ...removed.writes, ...unknown.writes], []);
});
