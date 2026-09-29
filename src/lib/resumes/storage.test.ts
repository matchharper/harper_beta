import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { generateResume, resumeDocumentId } from "./service";

const user = "b00f9944-e939-4d66-93e5-7f44f2655ba4";
const other = "9a9f9944-e939-4d66-93e5-7f44f2655ba4";

test("direct document storage: duplicates, revisions, deletion, lost responses and failures", async () => {
  const db = new PGlite();
  const files = new Set<string>();
  let saveFails = false;
  let loseResponse = false;
  let removeFails = false;
  let beforeWrite: (() => Promise<void>) | undefined;
  class Query {
    filters: [string, unknown][] = [];
    fields?: Record<string, unknown>;
    operation = "select";
    select() {
      return this;
    }
    eq(k: string, v: unknown) {
      this.filters.push([k, v]);
      return this;
    }
    insert(v: Record<string, unknown>) {
      this.fields = v;
      this.operation = "insert";
      return this;
    }
    update(v: Record<string, unknown>) {
      this.fields = v;
      this.operation = "update";
      return this;
    }
    async maybeSingle() {
      const values: unknown[] = [];
      const arg = (v: unknown) => {
        values.push(
          typeof v === "object" && v !== null ? JSON.stringify(v) : v
        );
        return `$${values.length}`;
      };
      let sql = "select * from talent_documents";
      if (this.operation === "insert")
        sql = `insert into talent_documents (${Object.keys(this.fields!).join(",")}) values (${Object.values(this.fields!).map(arg).join(",")})`;
      if (this.operation === "update")
        sql = `update talent_documents set ${Object.entries(this.fields!)
          .map(([k, v]) => `${k}=${arg(v)}`)
          .join(",")}`;
      if (this.filters.length)
        sql += ` where ${this.filters.map(([k, v]) => `${k}=${arg(v)}`).join(" and ")}`;
      if (this.operation !== "select") sql += " returning *";
      try {
        if (this.operation !== "select") {
          if (saveFails)
            return {
              data: null,
              error: { code: "23514", message: "save failed" },
            };
          const hook = beforeWrite;
          beforeWrite = undefined;
          await hook?.();
        }
        const r = await db.query(sql, values);
        if (loseResponse && this.operation !== "select") {
          loseResponse = false;
          return {
            data: null,
            error: { code: "", message: "connection lost" },
          };
        }
        return { data: r.rows[0] ?? null, error: null };
      } catch (e) {
        const error = e as { code: string; message: string };
        return { data: null, error };
      }
    }
  }
  const admin = {
    from(table: string) {
      assert.equal(table, "talent_documents");
      return new Query();
    },
    storage: {
      from() {
        return {
          async upload() {
            throw new Error("JSON saves must not upload files");
          },
          async remove(paths: string[]) {
            if (removeFails) return { error: { message: "remove failed" } };
            paths.forEach((p) => files.delete(p));
            return { error: null };
          },
        };
      },
    },
  } as unknown as TalentAdminClient;
  const run = (input: unknown, requestId: string, userId = user) =>
    generateResume({
      admin,
      userId,
      userMessageId: "message",
      requestId,
      input,
    });
  const create = {
    action: "create",
    document_name: "Same name",
    content: { language: "ko", basics: { name: "김하늘" } },
  };
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.talent_users(user_id uuid primary key);
      create table public.talent_documents(id uuid primary key, talent_id uuid references talent_users(user_id), kind text, origin_type text, origin_id text, file_name text, storage_path text unique, content_type text, size_bytes bigint, content_sha256 text, extracted_text text, is_public boolean default false, is_primary boolean default false, is_deleted boolean default false);
      insert into talent_users values ('${user}'), ('${other}');`);
    await db.exec(
      await readFile(
        "supabase/migrations/20260927145926_generated_resumes.sql",
        "utf8"
      )
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20260927160808_simplify_generated_resumes.sql",
        "utf8"
      )
    );
    const [first, duplicate] = await Promise.all([
      run(create, "create"),
      run(create, "create"),
    ]);
    assert.equal(first.documentId, duplicate.documentId);
    assert.equal(files.size, 0);
    assert.equal(first.revision, 1);
    const saved = (
      await db.query("select * from talent_documents where id=$1", [
        first.documentId,
      ])
    ).rows[0] as Record<string, unknown>;
    assert.equal(saved.storage_path, null);
    assert.equal(saved.size_bytes, null);
    assert.equal(saved.content_type, null);
    assert.equal(saved.content_sha256, null);
    assert.equal(saved.extracted_text, "김하늘");
    assert.ok(saved.structured_content);
    assert.equal((await run(create, "create")).documentId, first.documentId);
    const second = await run(create, "separate");
    assert.notEqual(first.documentId, second.documentId);
    assert.equal(first.fileName, second.fileName);
    const edit = {
      action: "update",
      document_id: first.documentId,
      expected_revision: 1,
      content: create.content,
    };
    await assert.rejects(run(edit, "cross-owner", other), /not found/);
    saveFails = true;
    await assert.rejects(run(edit, "save-failure"), /saved/);
    saveFails = false;
    const edits = await Promise.allSettled([run(edit, "a"), run(edit, "b")]);
    assert.equal(edits.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(files.size, 0);
    loseResponse = true;
    const updated = await run(
      { ...edit, expected_revision: 2 },
      "lost-response"
    );
    assert.equal(updated.revision, 3);
    assert.equal(
      (await run({ ...edit, expected_revision: 2 }, "lost-response")).revision,
      3
    );
    // A legacy file is detached only after a successful edit; cleanup failures do not undo it.
    await db.query(
      "update talent_documents set storage_path='legacy.pdf' where id=$1",
      [first.documentId]
    );
    files.add("legacy.pdf");
    removeFails = true;
    const next = await run(
      { ...edit, expected_revision: 4 },
      "cleanup-failure"
    );
    assert.equal(next.revision, 5); // Cleanup failure cannot roll back a published document.
    removeFails = false;
    beforeWrite = async () => {
      await db.query(
        "update talent_documents set is_deleted=true where id=$1",
        [first.documentId]
      );
    };
    await assert.rejects(
      run({ ...edit, expected_revision: 5 }, "deletion"),
      /deleted/
    );
    await assert.rejects(run(create, "create"), /no longer available/);
    assert.notEqual(resumeDocumentId(user, "x"), resumeDocumentId(other, "x"));
    assert.equal(
      (await db.query("select * from talent_documents")).rows.length,
      2
    );
    assert.equal(
      (
        await db.query(
          "select * from talent_documents where is_public or is_primary"
        )
      ).rows.length,
      0
    );
  } finally {
    await db.close();
  }
});
