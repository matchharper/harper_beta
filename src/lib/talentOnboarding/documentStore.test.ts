import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "./admin";
import { serializeTalentDocuments } from "./documentStore";
import type { TalentDocumentRow } from "./models";

function documentRow(
  overrides: Partial<TalentDocumentRow> = {}
): TalentDocumentRow {
  return {
    id: "document-1",
    talent_id: "user-1",
    kind: "document",
    file_name: "portfolio.pdf",
    storage_path: "user-1/portfolio.pdf",
    content_type: "application/pdf",
    size_bytes: 100,
    content_sha256: null,
    extracted_text: null,
    origin_type: null,
    origin_id: null,
    is_public: false,
    is_primary: false,
    is_deleted: false,
    created_at: "2026-09-06T01:00:00.000Z",
    updated_at: "2026-09-06T01:00:00.000Z",
    ...overrides,
  };
}

test("creates signed URLs for files but not call notes", async () => {
  const signedPaths: string[] = [];
  const admin = {
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => {
          signedPaths.push(path);
          return { data: { signedUrl: `signed:${path}` }, error: null };
        },
      }),
    },
  } as unknown as TalentAdminClient;

  const documents = await serializeTalentDocuments({
    admin,
    documents: [
      documentRow(),
      documentRow({
        id: "9de379c1-b735-42a6-8e92-3939b12e87f0",
        kind: "call_note",
        file_name: "Harper call note",
        storage_path: null,
        content_type: null,
      }),
    ],
  });

  assert.deepEqual(signedPaths, ["user-1/portfolio.pdf"]);
  assert.equal(documents[0]?.downloadUrl, "signed:user-1/portfolio.pdf");
  assert.equal(documents[1]?.downloadUrl, null);
});
