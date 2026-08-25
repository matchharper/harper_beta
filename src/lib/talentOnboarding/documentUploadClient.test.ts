import assert from "node:assert/strict";
import test from "node:test";
import { uploadTalentDocument } from "./documentUploadClient";
import { MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES } from "./documentUploadLimits";

test("uploads the file to the Vercel API as multipart form data", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const file = new File(["resume"], "resume.txt", { type: "text/plain" });

  const payload = await uploadTalentDocument({
    fetchWithAuth: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return Response.json({ document: { id: "document-1" }, ok: true });
    },
    file,
    resumeRequestToken: "request-token",
    source: "chat",
  });

  assert.equal(requestUrl, "/api/talent/documents/upload");
  assert.equal(requestInit?.method, "POST");
  assert.ok(requestInit?.body instanceof FormData);
  assert.equal((requestInit.body.get("file") as File).name, "resume.txt");
  assert.equal(requestInit.body.get("kind"), "resume");
  assert.equal(requestInit.body.get("source"), "chat");
  assert.equal(requestInit.body.get("resumeRequestToken"), "request-token");
  assert.equal(payload.document?.id, "document-1");
});

test("rejects files above 4 MiB before making a request", async () => {
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
    /4 MB/
  );
  assert.equal(requested, false);
});

test("keeps a maximum-size multipart request below Vercel's 4.5 MiB limit", async () => {
  let formData: FormData | null = null;
  const file = new File(
    [new Uint8Array(MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES)],
    "resume.pdf",
    { type: "application/pdf" }
  );

  await uploadTalentDocument({
    fetchWithAuth: async (_url, init) => {
      formData = init?.body instanceof FormData ? init.body : null;
      return Response.json({ document: { id: "document-1" }, ok: true });
    },
    file,
    resumeRequestToken: "request-token",
  });

  assert.ok(formData);
  const serializedRequest = new Request("https://example.com/upload", {
    method: "POST",
    body: formData,
  });
  const serializedBytes = (await serializedRequest.arrayBuffer()).byteLength;
  assert.ok(serializedBytes < 4.5 * 1024 * 1024);
});
