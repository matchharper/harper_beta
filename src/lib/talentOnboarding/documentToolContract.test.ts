import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const documentToolSource = readFileSync(
  new URL("./documentTool.ts", import.meta.url),
  "utf8"
);
const toolRegistrySource = readFileSync(
  new URL("./tools.ts", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260821100000_talent_documents_soft_delete.sql",
    import.meta.url
  ),
  "utf8"
);
const updateDocumentToolStart = toolRegistrySource.indexOf(
  "[TALENT_TOOL_NAMES.UPDATE_DOCUMENT]"
);
const updateDocumentToolEnd = toolRegistrySource.indexOf(
  "[TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS]",
  updateDocumentToolStart
);
const updateDocumentToolSource = toolRegistrySource.slice(
  updateDocumentToolStart,
  updateDocumentToolEnd
);

test("document tool schemas expose list, bounded read, and soft update", () => {
  assert.match(toolRegistrySource, /LIST_DOCUMENTS: "list_documents"/);
  assert.match(toolRegistrySource, /READ_DOCUMENT: "read_document"/);
  assert.match(toolRegistrySource, /UPDATE_DOCUMENT: "update_document"/);
  assert.match(toolRegistrySource, /is_deleted:/);
  assert.match(toolRegistrySource, /Soft-delete or restore the document/);
  assert.match(toolRegistrySource, /remain in storage/);
});

test("document reads consistently exclude soft-deleted rows and paginate", () => {
  assert.match(documentToolSource, /\.eq\("is_deleted", false\)/);
  assert.match(documentToolSource, /\.range\(offset, offset \+ limit\)/);
  assert.match(documentToolSource, /nextOffset/);
  assert.match(documentToolSource, /MAX_READ_CHARS = 6_000/);
});

test("list_documents does not fetch extracted document text", () => {
  const listSelect = documentToolSource.match(
    /const DOCUMENT_LIST_SELECT =\s*\n?\s*"([^"]+)";/
  )?.[1];

  assert.ok(listSelect);
  assert.doesNotMatch(listSelect, /extracted_text/);
  assert.match(documentToolSource, /\.select\("id"\)/);
  assert.match(documentToolSource, /\.neq\("extracted_text", ""\)/);
  assert.match(documentToolSource, /hasExtractedText/);
});

test("document tool metadata does not expose storage byte size to the LLM", () => {
  assert.doesNotMatch(documentToolSource, /sizeBytes:/);
});

test("update_document cannot edit extracted document content", () => {
  assert.ok(updateDocumentToolStart >= 0);
  assert.ok(updateDocumentToolEnd > updateDocumentToolStart);
  assert.doesNotMatch(updateDocumentToolSource, /\bcontent:\s*\{/);
  assert.match(
    updateDocumentToolSource,
    /내용 수정은 불가능하며, 새로 업로드 해야한다\./
  );
  assert.doesNotMatch(documentToolSource, /hasOwn\(args\.input, "content"\)/);
  assert.doesNotMatch(documentToolSource, /update\.extracted_text/);
});

test("migration repairs nulls before enforcing false default and not-null", () => {
  const repairIndex = migration.indexOf("set is_deleted = false");
  const defaultIndex = migration.indexOf(
    "alter column is_deleted set default false"
  );
  const notNullIndex = migration.indexOf(
    "alter column is_deleted set not null"
  );

  assert.ok(repairIndex >= 0);
  assert.ok(defaultIndex > repairIndex);
  assert.ok(notNullIndex > repairIndex);
  assert.match(migration, /where is_deleted = false/);
});
