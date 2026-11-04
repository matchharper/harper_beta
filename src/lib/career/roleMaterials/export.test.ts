import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { exportRoleMaterialDocument } from "./export";
import type { RoleMaterial } from "./store";

function fixture(race = false) {
  const files = new Map<string, Buffer>([
    ["immutable-source", Buffer.from("Original uploaded bytes")],
  ]);
  const uploads: string[] = [],
    removals: string[] = [],
    reads: string[] = [];
  let record: any = null;
  const material = {
    id: "material",
    talent_id: "owner",
    role_id: "role",
    documents: [
      {
        id: "document",
        revision: 7,
        file_name: "이력서.pdf",
        origin_type: "upload",
        storage_path: "immutable-source",
        content_type: "application/pdf",
      },
    ],
  } as unknown as RoleMaterial;
  const admin: any = {
    from(table: string) {
      assert.equal(
        table,
        "talent_role_material_files",
        "do not reread mutable documents"
      );
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: record, error: null }),
        insert: async (next: any) => {
          if (race) {
            const winner = Buffer.from(
              "Same approved document rendered by the winning request"
            );
            files.set("winner", winner);
            record = {
              ...next,
              storage_path: "winner",
              file_hash: createHash("sha256").update(winner).digest("hex"),
            };
            return { error: { code: "23505" } };
          }
          record = next;
          return { error: null };
        },
      };
      return query;
    },
    storage: {
      from: () => ({
        download: async (path: string) => {
          reads.push(path);
          return files.has(path)
            ? {
                data: new Blob([new Uint8Array(files.get(path)!)]),
                error: null,
              }
            : { data: null, error: new Error("Missing file") };
        },
        upload: async (path: string, bytes: Buffer, options: any) => {
          assert.equal(options.upsert, false);
          uploads.push(path);
          files.set(path, bytes);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          for (const path of paths) {
            removals.push(path);
            files.delete(path);
          }
          return { error: null };
        },
      }),
    },
  };
  return {
    admin,
    material,
    files,
    uploads,
    removals,
    reads,
    record: () => record,
  };
}

test("an accepted document export keeps its first exact file across later source changes", async () => {
  const f = fixture();
  const original = await exportRoleMaterialDocument({
    ...f,
    documentId: "document",
  });
  assert.equal(original.bytes.toString(), "Original uploaded bytes");
  assert.equal(original.fileName, "이력서.pdf");
  f.files.delete("immutable-source");
  const retried = await exportRoleMaterialDocument({
    ...f,
    documentId: "document",
  });
  assert.deepEqual(retried.bytes, original.bytes);
  assert.equal(f.uploads.length, 1);
  assert.equal(f.reads.filter((path) => path === "immutable-source").length, 1);
  await assert.rejects(
    () => exportRoleMaterialDocument({ ...f, documentId: "not-assigned" }),
    /not part of these accepted materials/
  );
});

test("concurrent first exports reuse the winning file and remove only the losing temporary upload", async () => {
  const f = fixture(true);
  const result = await exportRoleMaterialDocument({
    ...f,
    documentId: "document",
  });
  assert.equal(
    result.bytes.toString(),
    "Same approved document rendered by the winning request"
  );
  assert.deepEqual(f.removals, [f.uploads[0]]);
  assert.ok(f.files.has("winner"));
  assert.ok(f.files.has("immutable-source"));
});

test("missing original files and modified pinned bytes never return a successful download", async () => {
  const missing = fixture();
  missing.files.clear();
  await assert.rejects(
    () => exportRoleMaterialDocument({ ...missing, documentId: "document" }),
    /Missing file/
  );
  assert.equal(missing.uploads.length, 0);
  const f = fixture();
  await exportRoleMaterialDocument({ ...f, documentId: "document" });
  f.files.set(f.record().storage_path, Buffer.from("Changed bytes"));
  await assert.rejects(
    () => exportRoleMaterialDocument({ ...f, documentId: "document" }),
    /integrity mismatch/
  );
  assert.equal(f.uploads.length, 1);
});
