import assert from "node:assert/strict";
import test from "node:test";
import { createPdfArtifactCache } from "./pdfCache";
import { exportResume } from "./export";
import { RESUME_RENDER_VERSION } from "./template";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { prepareAttachments } from "@/lib/career/externalOperations/attachments";

function fixture() {
  const rows: any[] = [];
  const files = new Map<string, Buffer>();
  const admin: any = {
    from(table: string) {
      assert.equal(table, "talent_external_operations");
      const filters: Record<string, unknown> = {};
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        maybeSingle: async () => ({ data: rows.find(row => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null, error: null }),
        insert: async (row: any) => {
          if (rows.some(other => ["user_id", "kind", "idempotency_key"].every(key => other[key] === row[key]))) return { error: { code: "23505" } };
          rows.push(structuredClone(row)); return { error: null };
        },
      };
      return query;
    },
    storage: { from: () => ({
      download: async (path: string) => ({ data: files.has(path) ? new Blob([new Uint8Array(files.get(path)!)]) : null, error: null }),
      upload: async (path: string, bytes: Buffer, options: any) => {
        assert.equal(options.upsert, false); assert.ok(!files.has(path)); files.set(path, Buffer.from(bytes)); return { error: null };
      },
      remove: async (paths: string[]) => { paths.forEach(path => files.delete(path)); return { error: null }; },
    }) },
  };
  return { admin, rows, files };
}
const identity = { userId: "owner", documentId: "document", revision: 1 };

test("later requests return the identical stored PDF without rendering; inputs and ownership separate cache entries", async () => {
  const { admin, rows } = fixture();
  let renders = 0;
  const render = async () => ({ pdf: Buffer.from(`%PDF-original-${++renders}`), pageCount: 2 });
  const first = await createPdfArtifactCache(admin).getOrCreate(identity, "html-and-options", render);
  const second = await createPdfArtifactCache(admin).getOrCreate({ revision: identity.revision, documentId: identity.documentId, userId: identity.userId }, "html-and-options", render);
  assert.deepEqual(second, first);
  assert.equal(renders, 1);
  await createPdfArtifactCache(admin).getOrCreate(identity, "changed-html-or-options", render);
  await createPdfArtifactCache(admin).getOrCreate({ ...identity, revision: 2 }, "html-and-options", render);
  await createPdfArtifactCache(admin).getOrCreate({ ...identity, userId: "other-owner" }, "html-and-options", render);
  assert.equal(renders, 4);
  assert.equal(rows.length, 4);
  assert.ok(rows.every(row => row.conversation_id === null));
});

test("concurrent first renders converge on one immutable file even across separate cache instances", async () => {
  const { admin, rows, files } = fixture();
  let renders = 0;
  const render = async () => ({ pdf: Buffer.from(`%PDF-concurrent-${++renders}`), pageCount: 1 });
  const first = createPdfArtifactCache(admin), second = createPdfArtifactCache(admin);
  const artifacts = await Promise.all([first.getOrCreate(identity, "same", render), first.getOrCreate(identity, "same", render), second.getOrCreate(identity, "same", render)]);
  assert.equal(renders, 2);
  assert.equal(rows.length, 1);
  assert.equal(files.size, 1);
  for (const artifact of artifacts) assert.deepEqual(artifact, artifacts[0]);
});

test("failed rendering is not cached and corrupted or mismatched stored bytes are never returned", async () => {
  const { admin, rows, files } = fixture();
  const cache = createPdfArtifactCache(admin);
  await assert.rejects(cache.getOrCreate(identity, "same", async () => { throw new Error("renderer failed"); }), /renderer failed/);
  assert.equal(rows.length, 0); assert.equal(files.size, 0);
  const render = async () => ({ pdf: Buffer.from("%PDF-valid"), pageCount: 1 });
  await cache.getOrCreate(identity, "same", render);
  files.set(rows[0].provider_refs.storage_path, Buffer.from("%PDF-tampered"));
  await assert.rejects(cache.getOrCreate(identity, "same", render), /integrity mismatch/);
  rows[0].request.revision = 2;
  await assert.rejects(cache.getOrCreate(identity, "same", render), /identity mismatch/);
});

test("cache hits still recheck document revision, deletion and company permission before delivery", async () => {
  const { admin } = fixture();
  const cache = createPdfArtifactCache(admin);
  const row: any = { id: identity.documentId, talent_id: identity.userId, revision: 1, origin_type: "harper_generated_resume", is_deleted: false,
    file_name: "Resume", structured_content: { schema_version: 1, content: { language: "en", basics: { name: "Example" } } } };
  let renders = 0;
  const render: any = async (_content: unknown, context: any) => ({
    ...await context.cache.getOrCreate(context.document, "same", async () => ({ pdf: Buffer.from(`%PDF-${++renders}`), pageCount: 1 })), text: "Example",
  });
  const options = { expectedRevision: 1, renderVersion: RESUME_RENDER_VERSION, cache, render };
  await exportResume({ ...options, read: async () => row });
  for (const changed of [null, { ...row, is_deleted: true }, { ...row, revision: 2 }, new Error("Company access revoked")]) {
    let reads = 0;
    await assert.rejects(exportResume({ ...options, read: async () => {
      if (++reads === 1) return row;
      if (changed instanceof Error) throw changed;
      return changed;
    } }), /not found|changed|revoked/);
    assert.equal(reads, 2);
  }
  assert.equal(renders, 1);
});

test("the existing PostgreSQL operation table persists private PDF receipts without a conversation or schema change", async () => {
  const db = new PGlite();
  try {
    const migration = await readFile("supabase/migrations/20261029163255_career_general_agent_runtime.sql", "utf8");
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table talent_users(user_id uuid primary key); create table talent_conversations(id uuid primary key);`);
    await db.exec(migration.slice(migration.indexOf("create table public.talent_external_operations"), migration.indexOf("create function public.create_talent_external_operation")));
    const owner = "00000000-0000-4000-8000-000000000001";
    await db.query("insert into talent_users values ($1)", [owner]);
    const { admin } = fixture();
    admin.from = () => {
      const filters: Record<string, unknown> = {};
      const query: any = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        maybeSingle: async () => ({ data: (await db.query("select * from talent_external_operations where user_id=$1 and kind=$2 and idempotency_key=$3", [filters.user_id, filters.kind, filters.idempotency_key])).rows[0] ?? null, error: null }),
        insert: async (row: any) => {
          try {
            await db.query("insert into talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request,result,provider_refs) values($1,$2,$3,$4,$5,$6,$7,$8)",
              [row.user_id, row.conversation_id, row.kind, row.idempotency_key, row.status, row.request, row.result, row.provider_refs]);
            return { error: null };
          } catch (error) { return { error }; }
        } };
      return query;
    };
    const cache = createPdfArtifactCache(admin);
    const scope = { ...identity, userId: owner };
    const first = await cache.getOrCreate(scope, "exact-render-input", async () => ({ pdf: Buffer.from("%PDF-original bytes"), pageCount: 1 }));
    const second = await createPdfArtifactCache(admin).getOrCreate(scope, "exact-render-input", async () => { throw new Error("Must reuse the PostgreSQL receipt"); });
    assert.deepEqual(first.pdf, second.pdf);
    assert.equal((await db.query("select * from talent_external_operations")).rows.length, 1);
    const privileges: any = (await db.query("select has_table_privilege('authenticated','talent_external_operations','INSERT') as can_write, has_table_privilege('anon','talent_external_operations','SELECT') as can_read")).rows[0];
    assert.deepEqual(privileges, { can_write: false, can_read: false });
  } finally { await db.close(); }
});

test("document download and browser attachment share one rendered PDF byte for byte", {
  skip: !process.env.PDF_CACHE_E2E_ARTIFACT_PATH,
}, async t => {
  const pdf = await readFile(process.env.PDF_CACHE_E2E_ARTIFACT_PATH!);
  const { admin } = fixture();
  const row: any = { id: "00000000-0000-4000-8000-000000000003", talent_id: "00000000-0000-4000-8000-000000000001",
    revision: 1, file_name: "Example resume", kind: "resume", origin_type: "harper_generated_resume", is_deleted: false,
    structured_content: { schema_version: 1, content: { language: "en", basics: { name: "Example Candidate" } } } };
  const from = admin.from;
  admin.from = (table: string) => {
    if (table !== "talent_documents") return from(table);
    const filters: Record<string, unknown> = {};
    const query: any = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      maybeSingle: async () => ({ data: Object.entries(filters).every(([key, value]) => row[key] === value) ? structuredClone(row) : null, error: null }) };
    return query;
  };
  const previousToken = process.env.BROWSERLESS_API_TOKEN;
  process.env.BROWSERLESS_API_TOKEN = "local-cache-test";
  t.after(() => { if (previousToken === undefined) delete process.env.BROWSERLESS_API_TOKEN; else process.env.BROWSERLESS_API_TOKEN = previousToken; });
  const provider = t.mock.method(globalThis, "fetch", async (_url: unknown, request?: RequestInit) => {
    const body = JSON.parse(String(request?.body));
    assert.ok(body.html.includes("/resume-assets/"));
    assert.ok(!body.html.includes("data:font/woff2;base64"));
    return new Response(new Uint8Array(pdf));
  });
  const download = () => exportResume({ expectedRevision: row.revision, renderVersion: RESUME_RENDER_VERSION,
    read: async () => structuredClone(row), cache: createPdfArtifactCache(admin) });
  assert.deepEqual((await download()).pdf, pdf);
  const [attached] = await prepareAttachments({ admin, userId: row.talent_id }, [{ document_id: row.id, revision: 1 }]);
  assert.deepEqual(attached.bytes, pdf);
  assert.deepEqual((await download()).pdf, pdf);
  assert.equal(provider.mock.callCount(), 1);
  row.revision = 2;
  await download();
  assert.equal(provider.mock.callCount(), 2);
  row.structured_content.content.basics.name = "Changed content in the same revision";
  await download();
  assert.equal(provider.mock.callCount(), 3);
});
