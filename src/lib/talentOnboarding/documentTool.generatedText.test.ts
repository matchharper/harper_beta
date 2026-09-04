import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "./admin";
import {
  listTalentDocumentsForTool,
  readTalentDocumentForTool,
} from "./documentTool";
import { serializeTalentDocuments } from "./documentStore";
import type { TalentDocumentRow } from "./models";

function createGmailDocument(
  overrides: Partial<TalentDocumentRow> = {}
): TalentDocumentRow {
  return {
    content_sha256: "hash",
    content_type: "text/markdown",
    created_at: "2026-09-01T00:00:00.000Z",
    extracted_text: "# Career history\n\n## Acme — Engineer",
    file_name: "Gmail Career History.md",
    id: "gmail-document",
    is_deleted: false,
    is_primary: false,
    is_public: false,
    kind: "document",
    origin_id: "singleton",
    origin_type: "gmail_career_history",
    size_bytes: 37,
    storage_path: null,
    talent_id: "talent-a",
    updated_at: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

type Filter = { column: string; value: unknown };

function createDocumentAdmin(rows: TalentDocumentRow[]) {
  const signedPaths: string[] = [];

  class Query {
    private filters: Filter[] = [];
    private selected = "";

    select(value: string) {
      this.selected = value;
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push({ column, value });
      return this;
    }

    neq() {
      return Promise.resolve({ data: this.resolveRows(), error: null });
    }

    in(column: string, values: unknown[]) {
      this.filters.push({ column, value: values });
      return this;
    }

    order() {
      return this;
    }

    range() {
      return Promise.resolve({ data: this.resolveRows(), error: null });
    }

    maybeSingle() {
      return Promise.resolve({
        data: this.resolveRows()[0] ?? null,
        error: null,
      });
    }

    private resolveRows() {
      const filtered = rows.filter((row) =>
        this.filters.every(({ column, value }) => {
          const actual = row[column as keyof TalentDocumentRow];
          return Array.isArray(value)
            ? value.includes(actual)
            : actual === value;
        })
      );
      if (this.selected === "id") {
        return filtered
          .filter((row) => row.extracted_text !== "")
          .map((row) => ({ id: row.id }));
      }
      return filtered;
    }
  }

  const admin = {
    from() {
      return new Query();
    },
    storage: {
      from() {
        return {
          async createSignedUrl(path: string) {
            signedPaths.push(path);
            return { data: { signedUrl: `signed:${path}` }, error: null };
          },
        };
      },
    },
  } as unknown as TalentAdminClient;

  return { admin, signedPaths };
}

test("lists and reads generated Gmail text without a Storage object", async () => {
  const document = createGmailDocument();
  const { admin } = createDocumentAdmin([document]);

  const listed = await listTalentDocumentsForTool({
    admin,
    input: {},
    userId: "talent-a",
  });
  assert.deepEqual(listed.documents, [
    {
      createdAt: document.created_at,
      documentId: document.id,
      fileName: document.file_name,
      hasExtractedText: true,
      isPrimary: false,
      isPublic: false,
      kind: "document",
      source: "gmail_career_history",
    },
  ]);

  const read = await readTalentDocumentForTool({
    admin,
    input: { document_id: document.id },
    userId: "talent-a",
  });
  assert.equal(read.excerpt, document.extracted_text);
  assert.equal(read.textAvailable, true);
});

test("document tools cannot read a generated document owned by another talent", async () => {
  const { admin } = createDocumentAdmin([createGmailDocument()]);

  await assert.rejects(
    readTalentDocumentForTool({
      admin,
      input: { document_id: "gmail-document" },
      userId: "talent-b",
    }),
    /Document not found/
  );
});

test("document serialization signs only rows backed by Storage", async () => {
  const generated = createGmailDocument();
  const uploaded = createGmailDocument({
    file_name: "portfolio.pdf",
    id: "uploaded-document",
    origin_id: null,
    origin_type: null,
    storage_path: "talent-a/portfolio.pdf",
  });
  const { admin, signedPaths } = createDocumentAdmin([generated, uploaded]);

  const serialized = await serializeTalentDocuments({
    admin,
    documents: [generated, uploaded],
  });

  assert.deepEqual(signedPaths, ["talent-a/portfolio.pdf"]);
  assert.equal(serialized[0]?.downloadUrl, null);
  assert.equal(serialized[0]?.originType, "gmail_career_history");
  assert.equal(serialized[1]?.downloadUrl, "signed:talent-a/portfolio.pdf");
});
