import assert from "node:assert/strict";
import test from "node:test";
import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { exportResume, ResumeExportError } from "./export";
import { RESUME_RENDER_VERSION } from "./template";

const row = {
  id: "fixture",
  file_name: "김하늘_이력서.pdf",
  revision: 2,
  origin_type: "harper_generated_resume",
  is_deleted: false,
  structured_content: {
    schema_version: 1,
    content: { language: "ko", basics: { name: "김하늘" } },
  },
} as unknown as TalentDocumentRow;
const options = { expectedRevision: 2, renderVersion: RESUME_RENDER_VERSION };
const status = (n: number) => (e: unknown) =>
  e instanceof ResumeExportError && e.status === n;

test("revoking company access during rendering prevents returning the PDF", async () => {
  let allowed = true;
  const denied = new Error("Company access revoked");
  await assert.rejects(exportResume({
    ...options,
    read: async () => {
      if (!allowed) throw denied;
      return row;
    },
    render: async () => {
      allowed = false;
      return { pdf: Buffer.from("private"), text: "", pageCount: 1 };
    },
  }), (error) => error === denied);
});

test("export reads the saved JSON, verifies again and never mutates its document", async () => {
  const before = structuredClone(row);
  let reads = 0;
  const artifact = await exportResume({
    ...options,
    read: async () => {
      reads++;
      return row;
    },
    render: async (content) => {
      assert.equal(content.basics.name, "김하늘");
      return { pdf: Buffer.from("PDF"), text: "김하늘", pageCount: 1 };
    },
  });
  assert.equal(reads, 2);
  assert.equal(artifact.fileName, row.file_name);
  assert.deepEqual(row, before);
});

test("unavailable, stale or unsupported documents never start a PDF renderer", async () => {
  const render = async () => {
    throw new Error("must not render");
  };
  await assert.rejects(
    exportResume({ ...options, read: async () => null, render }),
    status(404)
  );
  await assert.rejects(
    exportResume({
      ...options,
      read: async () => ({ ...row, is_deleted: true }),
      render,
    }),
    status(404)
  );
  await assert.rejects(
    exportResume({
      ...options,
      expectedRevision: 1,
      read: async () => row,
      render,
    }),
    status(409)
  );
  await assert.rejects(
    exportResume({
      ...options,
      renderVersion: "old",
      read: async () => row,
      render,
    }),
    status(409)
  );
  await assert.rejects(
    exportResume({
      ...options,
      read: async () => ({ ...row, structured_content: null }),
      render,
    }),
    status(422)
  );
});

test("edits/deletion during rendering reject the result; failure preserves the document", async () => {
  for (const changed of [{ ...row, revision: 3 }, null]) {
    let current: TalentDocumentRow | null = row;
    await assert.rejects(
      exportResume({
        ...options,
        read: async () => current,
        render: async () => {
          current = changed;
          return { pdf: Buffer.from("old"), text: "", pageCount: 1 };
        },
      }),
      status(changed ? 409 : 404)
    );
  }
  const before = structuredClone(row);
  await assert.rejects(
    exportResume({
      ...options,
      read: async () => row,
      render: async () => {
        throw new Error("timeout");
      },
    }),
    /timeout/
  );
  assert.deepEqual(row, before);
});
