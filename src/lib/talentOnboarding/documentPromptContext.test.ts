import assert from "node:assert/strict";
import test from "node:test";
import type { TalentDocumentRow } from "./models";
import {
  buildFirstTurnUploadedDocumentContext,
  FIRST_TURN_DOCUMENT_EXCERPT_CHARS,
} from "./documentPromptContext";

function createDocument(
  overrides: Partial<TalentDocumentRow> = {}
): TalentDocumentRow {
  return {
    content_sha256: null,
    content_type: "text/plain",
    created_at: "2026-08-21T00:00:00.000Z",
    extracted_text: "hello",
    file_name: "notes.txt",
    id: "document-1",
    is_deleted: false,
    is_primary: false,
    is_public: false,
    kind: "document",
    origin_id: null,
    origin_type: null,
    size_bytes: 5,
    storage_path: "user/notes.txt",
    talent_id: "user-1",
    updated_at: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}

test("first-turn upload context includes bounded hidden document data", () => {
  const context = buildFirstTurnUploadedDocumentContext([
    createDocument({
      extracted_text: "x".repeat(FIRST_TURN_DOCUMENT_EXCERPT_CHARS + 10),
      file_name: "resume.md",
      kind: "resume",
    }),
  ]);

  assert.ok(context);
  assert.match(context, /hidden from the user/);
  assert.match(context, /first-turn context/);
  assert.match(context, /"file_name":"resume\.md"/);
  assert.match(context, /"kind":"resume"/);
  assert.match(context, /"has_more":true/);
  assert.match(
    context,
    new RegExp(`"next_offset":${FIRST_TURN_DOCUMENT_EXCERPT_CHARS}`)
  );
  assert.match(context, /update_document/);
  assert.match(context, /is_deleted=true/);
});

test("deleted documents and empty batches do not create first-turn context", () => {
  assert.equal(buildFirstTurnUploadedDocumentContext([]), null);
  assert.equal(
    buildFirstTurnUploadedDocumentContext([
      createDocument({ is_deleted: true }),
    ]),
    null
  );
});

test("binary files are described without fabricated extracted text", () => {
  const context = buildFirstTurnUploadedDocumentContext([
    createDocument({
      content_type: "application/vnd.ms-powerpoint",
      extracted_text: null,
      file_name: "portfolio.ppt",
    }),
  ]);

  assert.ok(context);
  assert.match(context, /"content_excerpt":null/);
  assert.match(context, /"text_available":false/);
  assert.match(context, /"has_more":false/);
  assert.match(context, /"next_offset":null/);
});
