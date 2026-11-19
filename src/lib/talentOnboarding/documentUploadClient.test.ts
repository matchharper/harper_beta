import assert from "node:assert/strict";
import test from "node:test";
import {
  TalentDocumentUploadError,
  uploadTalentDocument,
} from "./documentUploadClient";
import { MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES } from "./documentUploadLimits";

test("sends a 20 MiB file directly to Storage and only metadata to Harper", async (t) => {
  const file = new File([new Uint8Array(MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES)], "resume.pdf");
  const uploadUrl = "https://storage.example/upload/sign/private";
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, uploadUrl);
    assert.equal(init.method, "PUT");
    assert.equal(init.body, file);
    assert.deepEqual(init.headers, { "Content-Type": "application/pdf" });
    calls.push("store");
    return new Response(null, { status: 200 });
  });
  const result = await uploadTalentDocument({ file, source: "chat", resumeRequestToken: "request-token",
    fetchWithAuth: async (url, init) => {
      assert.equal(url, "/api/talent/documents/upload");
      const body = JSON.parse(String(init?.body));
      assert.ok(String(init?.body).length < 1024);
      assert.equal(body.size, 20 * 1024 * 1024);
      assert.equal(body.resumeRequestToken, "request-token");
      assert.equal(body.source, "chat");
      calls.push(body.action);
      if (body.action === "prepare") return Response.json({ uploadId: "upload", uploadUrl, contentType: "application/pdf" });
      assert.equal(body.uploadId, "upload");
      return Response.json({ document: { id: "document-1" } });
    },
  });
  assert.equal(result.document?.id, "document-1");
  assert.deepEqual(calls, ["prepare", "store", "complete"]);
});

test("rejects files above 20 MiB before making a request", async () => {
  let requested = false;
  const file = new File(
    [new Uint8Array(MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES + 1)],
    "resume.pdf",
    { type: "application/pdf" }
  );

  await assert.rejects(
    uploadTalentDocument({
      fetchWithAuth: async () => {
        requested = true;
        return Response.json({ ok: true });
      },
      file,
    }),
    (error: unknown) =>
      error instanceof TalentDocumentUploadError &&
      error.code === "file_too_large" &&
      /20 MB/.test(error.message)
  );
  assert.equal(requested, false);
});

test("preserves a safe server error code for the onboarding UI", async () => {
  const file = new File(["not really a pdf"], "resume.pdf", {
    type: "application/pdf",
  });

  await assert.rejects(
    uploadTalentDocument({
      fetchWithAuth: async () =>
        Response.json(
          {
            code: "invalid_file_content",
            error: "File content does not match a supported document format",
          },
          { status: 400 }
        ),
      file,
    }),
    (error: unknown) =>
      error instanceof TalentDocumentUploadError &&
      error.code === "invalid_file_content" &&
      error.message ===
        "File content does not match a supported document format"
  );
});

test("does not trust an unknown server error code", async () => {
  const file = new File(["resume"], "resume.txt", { type: "text/plain" });

  await assert.rejects(
    uploadTalentDocument({
      fetchWithAuth: async () =>
        Response.json(
          { code: "database_error", error: "Failed to upload document" },
          { status: 500 }
        ),
      file,
    }),
    (error: unknown) =>
      error instanceof TalentDocumentUploadError && error.code === null
  );
});
