import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "./admin";
import {
  listTalentDocumentsForTool,
  readTalentDocumentForTool,
  updateTalentDocumentForTool,
} from "./documentTool";
import { serializeTalentDocuments } from "./documentStore";
import type { TalentDocumentRow } from "./models";
import { recordPdfExport } from "@/lib/documents/pdfDiagnostics";
import { PdfRenderError } from "@/lib/resumes/pdfError";

function createGmailDocument(
  overrides: Partial<TalentDocumentRow> = {}
): TalentDocumentRow {
  return {
    content_sha256: "hash",
    content_type: "text/markdown",
    created_at: "2026-09-01T00:00:00.000Z",
    extracted_text: "# Career history\n\n## Acme — Engineer",
    file_name: "Career History.md",
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
  const logs: any[] = [];

  class Query {
    private filters: Filter[] = [];
    private selected = "";
    private patch: Partial<TalentDocumentRow> = {};
    update(patch: Partial<TalentDocumentRow>) { this.patch = patch; return this; }
    single() {
      const target = rows.find(row => this.filters.every(({column,value}) => row[column as keyof TalentDocumentRow] === value));
      if (target) Object.assign(target, this.patch);
      return Promise.resolve({ data: target ?? null, error: null });
    }

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
    from(table: string) {
      if (table === "logs") {
        const filters = new Map<string, unknown>();
        const query = {
          insert: async (row: unknown) => { logs.unshift({ ...(row as object), created_at: "2026-10-27T01:02:00.000Z" }); return { error: null }; },
          select: () => query,
          eq: (key: string, value: unknown) => { filters.set(key, value); return query; },
          in: (key: string, value: unknown) => { filters.set(key, value); return query; },
          order: () => query,
          limit: async () => ({ data: logs.filter(row => row.user_id === filters.get("user_id") && row.type === filters.get("type") &&
            (filters.get("meta_data->>documentId") as string[]).includes(row.meta_data.documentId)), error: null }),
        };
        return query;
      }
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

test("download diagnostics reach document tools with revision, exact cause and unknown device receipt", async () => {
  const document = createGmailDocument({ id: "resume", kind: "resume", origin_type: "harper_generated_resume", revision: 3,
    structured_content: { schema_version: 1, content: { language: "en", basics: { name: "Fixture" } } } });
  const { admin } = createDocumentAdmin([document]);
  await recordPdfExport({ admin, userId: "talent-a", documentId: document.id, revision: 2, outcome: "failed",
    error: new PdfRenderError("PDF could not be read", { stage: "pdf_read", pdfReceived: true, httpStatus: 200, cause: "Malformed PDF from https://provider/?token=private-fixture" }) });
  await recordPdfExport({ admin, userId: "someone-else", documentId: document.id, revision: 3, outcome: "succeeded", pageCount: 1 });
  const listed = await listTalentDocumentsForTool({ admin, userId: "talent-a", input: {} });
  assert.equal(listed.documents[0].revision, 3);
  const read = await readTalentDocumentForTool({ admin, userId: "talent-a", input: { document_id: document.id } });
  assert.equal(read.pdfExport?.outcome, "failed");
  assert.equal(read.pdfExport?.revision, 2);
  assert.equal(read.pdfExport?.downloadReceivedByUser, "unknown");
  assert.match(String(read.pdfExport?.error), /pdf_read/);
  assert.match(String(read.pdfExport?.error), /Malformed PDF/);
  assert.doesNotMatch(String(read.pdfExport?.error), /private-fixture/);
  assert.equal(read.pdfExport?.at, "2026-10-27 10:02");
  assert.deepEqual((listed.documents[0] as any).pdfExport, read.pdfExport);
  await recordPdfExport({ admin, userId: "talent-a", documentId: document.id, revision: 3, outcome: "succeeded", pageCount: 3 });
  const successful = await readTalentDocumentForTool({ admin, userId: "talent-a", input: { document_id: document.id } });
  assert.equal(successful.pdfExport?.outcome, "succeeded");
  assert.equal(successful.pdfExport?.error, undefined);
  assert.equal(successful.pdfExport?.downloadReceivedByUser, "unknown");
});

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

test("generated resumes expose editable JSON/revision only to their owner and reject primary selection", async () => {
  const structured = {
    schema_version: 1,
    content: { language: "ko", basics: { name: "김하늘" } },
  };
  const document = createGmailDocument({
    kind: "resume",
    origin_type: "harper_generated_resume",
    origin_id: null,
    structured_content: structured,
    revision: 3,
  });
  const { admin } = createDocumentAdmin([document]);
  const result = await readTalentDocumentForTool({
    admin,
    userId: "talent-a",
    input: { document_id: document.id, format: "structured" },
  });
  assert.deepEqual(result.structuredContent, structured);
  assert.equal(result.revision, 3);
  await assert.rejects(
    readTalentDocumentForTool({
      admin,
      userId: "other",
      input: { document_id: document.id, format: "structured" },
    }),
    /not found/
  );
  for (const flag of ["is_primary"]) {
    await assert.rejects(
      updateTalentDocumentForTool({
        admin,
        userId: "talent-a",
        input: { document_id: document.id, [flag]: true },
      }),
      /primary/
    );
  }
});


test("owners can publish and unpublish generated resumes without primary selection", async () => {
  const document = createGmailDocument({ kind: "resume", origin_type: "harper_generated_resume", origin_id: null });
  const { admin } = createDocumentAdmin([document]);
  for (const value of [true, false]) {
    const result = await updateTalentDocumentForTool({ admin, userId: "talent-a", input: { document_id: document.id, is_public: value } });
    assert.equal(result.ok, true);
    assert.equal(document.is_public, value);
    assert.equal(document.is_primary, false);
  }
  await assert.rejects(updateTalentDocumentForTool({ admin, userId: "other", input: { document_id: document.id, is_public: true } }), /not found/);
});
