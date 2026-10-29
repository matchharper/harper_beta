import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { TalentAdminClient } from "./admin";
import { executeProfileRows } from "./profileRows";
import { profileExtraEntries } from "./profileStore";
import { formatToolResultText } from "@/lib/llm/promptText";
import {
  writeDocument,
  AUTHORED_DOCUMENT_ORIGIN,
} from "@/lib/documents/authoring";
import { readTalentDocumentForTool } from "./documentTool";

async function database() {
  const db = new PGlite();
  await db.exec(`
    create table talent_documents (id text primary key, talent_id text, kind text, file_name text, storage_path text, content_type text, size_bytes bigint, content_sha256 text, extracted_text text, is_public boolean default false, is_primary boolean default false, is_deleted boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(), origin_type text, origin_id text, structured_content jsonb, revision integer default 1);
    create table talent_experiences (id bigint primary key, talent_id text, role text, company_name text, company_link text, company_location text, employment_type text, start_date date, end_date date, description text, memo text, months integer);
    create table talent_educations (id bigint primary key, talent_id text, school text, degree text, field text, start_date date, end_date date, url text, description text, memo text);
    create table talent_extras (talent_id text primary key, content jsonb);
  `);
  let beforeWrite: (() => Promise<void>) | undefined;
  class Query {
    conditions: [string, string, unknown][] = [];
    operation = "select";
    fields: Record<string, unknown> = {};
    constructor(private table: string) {}
    select() {
      return this;
    }
    eq(k: string, v: unknown) {
      return this.filter(k, "eq", v);
    }
    filter(k: string, op: string, v: unknown) {
      this.conditions.push([k, op, v]);
      return this;
    }
    insert(v: Record<string, unknown>) {
      this.operation = "insert";
      this.fields = v;
      return this;
    }
    update(v: Record<string, unknown>) {
      this.operation = "update";
      this.fields = v;
      return this;
    }
    delete() {
      this.operation = "delete";
      return this;
    }
    async maybeSingle() {
      if (this.operation !== "select" && beforeWrite) {
        const hook = beforeWrite;
        beforeWrite = undefined;
        await hook();
      }
      const values: unknown[] = [];
      const param = (value: unknown) => {
        values.push(
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : value
        );
        return `$${values.length}`;
      };
      let sql = `select * from ${this.table}`;
      if (this.operation === "insert")
        sql = `insert into ${this.table} (${Object.keys(this.fields)}) values (${Object.values(this.fields).map(param)})`;
      if (this.operation === "update")
        sql = `update ${this.table} set ${Object.entries(this.fields)
          .map(([k, v]) => `${k}=${param(v)}`)
          .join(",")}`;
      if (this.operation === "delete") sql = `delete from ${this.table}`;
      if (this.conditions.length)
        sql +=
          " where " +
          this.conditions
            .map(([k, op, v]) =>
              op === "is" ? `${k} is null` : `${k}=${param(v)}`
            )
            .join(" and ");
      if (this.operation !== "select") sql += " returning *";
      try {
        const result = await db.query(sql, values);
        return {
          data: JSON.parse(JSON.stringify(result.rows[0] ?? null)),
          error: null,
        };
      } catch (error) {
        return { data: null, error };
      }
    }
  }
  return {
    db,
    admin: {
      from: (table: string) => new Query(table),
    } as unknown as TalentAdminClient,
    beforeWrite: (hook: () => Promise<void>) => {
      beforeWrite = hook;
    },
  };
}

test("profile dates reach Postgres DATE columns and the model receives the stored date or real failure", async () => {
  const { db, admin } = await database();
  try {
    await db.exec("insert into talent_experiences (id,talent_id,role) values (41393,'me','Engineer')");
    const rows = [{ type: "experience", operation: "update", rowId: "41393", fields: { end_date: "2026-10" } }];
    const results = await executeProfileRows({ admin, userId: "me", rows });
    assert.equal(results[0].ok, true);
    assert.equal((await db.query<{ end_date: string }>("select end_date::text from talent_experiences where id=41393")).rows[0].end_date, "2026-10-31");
    const modelText = formatToolResultText({ profileRows: results });
    assert.match(modelText, /2026-10-31/);
    assert.match(modelText, /41393/);
    await db.exec("create function fail_profile_save() returns trigger language plpgsql as $$ begin raise exception 'profile storage unavailable'; end $$; create trigger fail_save before update on talent_experiences for each row execute function fail_profile_save();");
    const failed = await executeProfileRows({ admin, userId: "me", rows });
    assert.equal(failed[0].ok, false);
    assert.match(formatToolResultText({ profileRows: failed }), /profile storage unavailable/);
    assert.doesNotMatch(String(failed[0].error), /changed while saving/);
  } finally { await db.close(); }
});

test("profile row edits preserve other facts, enforce ownership, detect conflicts and retry additions", async () => {
  const fixture = await database();
  const { db, admin } = fixture;
  try {
    await db.exec(
      "insert into talent_experiences (id,talent_id,role,description,memo,start_date,months) values (1,'me','Engineer','Keep the full history','Keep memo','2020-01-01',60),(2,'other','Private',null,null,null,null)"
    );
    const run = (rows: unknown) =>
      executeProfileRows({ admin, userId: "me", requestId: 10, rows });
    assert.equal(
      (
        await run([
          {
            type: "experience",
            operation: "update",
            rowId: "1",
            fields: { start_date: "2021-03", role: "Senior Engineer" },
          },
        ])
      )[0].ok,
      true
    );
    const {
      rows: [saved],
    } = await db.query<any>("select * from talent_experiences where id=1");
    assert.equal(saved.description, "Keep the full history");
    assert.equal(saved.memo, "Keep memo");
    assert.equal(saved.months, null);
    assert.equal(
      (
        await run([
          {
            type: "experience",
            operation: "update",
            rowId: "2",
            fields: { role: "wrong" },
          },
        ])
      )[0].ok,
      false
    );
    const read = await executeProfileRows({
      admin,
      userId: "me",
      readRows: [{ type: "experience", rowId: "1" }],
    });
    assert.equal((read[0].fields as any).description, saved.description);
    fixture.beforeWrite(async () => {
      await db.exec(
        "update talent_experiences set role='Concurrent correction' where id=1"
      );
    });
    assert.equal(
      (
        await run([
          {
            type: "experience",
            operation: "update",
            rowId: "1",
            fields: { role: "stale" },
          },
        ])
      )[0].ok,
      false
    );
    const addition = [
      {
        type: "education",
        operation: "add",
        fields: {
          school: "Example University",
          degree: "BSc",
          start_date: "2012",
        },
      },
    ];
    const first = await run(addition);
    const retry = await run(addition);
    assert.equal(first[0].rowId, retry[0].rowId);
    assert.equal(retry[0].changed, false);
    assert.equal(
      (await db.query<any>("select count(*) from talent_educations")).rows[0]
        .count,
      1
    );
    assert.equal(
      (
        await run([
          { type: "education", operation: "delete", rowId: first[0].rowId },
        ])
      )[0].ok,
      true
    );
    await assert.rejects(
      run([
        {
          type: "experience",
          operation: "update",
          rowId: "1",
          fields: { talent_id: "other" },
        },
      ]),
      /Invalid experience field/
    );
  } finally {
    await db.close();
  }
});

test("extra edits retain legacy fields/envelope and stable IDs; concurrent updates are not overwritten", async () => {
  const fixture = await database();
  const { db, admin } = fixture;
  try {
    const original = {
      metadata: { keep: true },
      extras: [
        {
          name: "Project",
          content: "Old text",
          published_at: "2020",
          url: "https://example.com",
        },
        { title: "Other", arbitrary: 3 },
      ],
    };
    await db.query("insert into talent_extras values ('me',$1)", [
      JSON.stringify(original),
    ]);
    const id = profileExtraEntries(original).rows[0].id;
    const run = () =>
      executeProfileRows({
        admin,
        userId: "me",
        requestId: 11,
        rows: [
          {
            type: "extra",
            operation: "update",
            rowId: id,
            fields: { description: "New text", date: null },
          },
        ],
      });
    assert.equal((await run())[0].ok, true);
    const content = (await db.query<any>("select content from talent_extras"))
      .rows[0].content;
    assert.deepEqual(content.metadata, original.metadata);
    assert.equal(content.extras[0].url, original.extras[0].url);
    assert.equal(content.extras[1].arbitrary, 3);
    assert.equal(
      profileExtraEntries(content).rows[0].fields.description,
      "New text"
    );
    assert.equal(profileExtraEntries(content).rows[0].fields.date, null);
    fixture.beforeWrite(async () => {
      await db.exec(
        "update talent_extras set content = content || '{\"concurrent\":true}'::jsonb"
      );
    });
    assert.equal((await run())[0].ok, false);
  } finally {
    await db.close();
  }
});

test("general documents are private, editable by revision, paginated on read and idempotent without returning their body", async () => {
  const { db, admin } = await database();
  try {
    const input = {
      title: "면접 준비",
      markdown:
        "# 면접 준비\n\n" + "확인된 경험을 바탕으로 준비합니다. ".repeat(400),
    };
    const write = (
      input: Record<string, unknown>,
      userId = "me",
      userMessageId = 1
    ) => writeDocument({ admin, userId, userMessageId, input });
    const created = await write(input);
    assert.equal(created.isPrivate, true);
    assert.equal(created.revision, 1);
    assert.ok(JSON.stringify(created).length < 700);
    assert.ok(!JSON.stringify(created).includes("확인된 경험"));
    assert.deepEqual(await write(input), created);
    const request = { admin, userId: "me", requestId: "stable-client-request", input };
    const firstAttempt = await writeDocument({ ...request, userMessageId: 100 });
    assert.deepEqual(await writeDocument({ ...request, userMessageId: 101 }), firstAttempt);
    const read = await readTalentDocumentForTool({
      admin,
      userId: "me",
      input: { document_id: created.documentId },
    });
    assert.equal(read.revision, 1);
    assert.equal(read.hasMore, true);
    assert.equal(read.excerpt?.length, 4000);
    const edit = {
      title: "면접 준비 수정",
      markdown: "# 수정된 문서",
      document_id: created.documentId,
      expected_revision: 1,
    };
    const updated = await write(edit, "me", 2);
    assert.equal(updated.revision, 2);
    assert.deepEqual(await write(edit, "me", 2), updated);
    await assert.rejects(
      write({ ...edit, markdown: "stale" }, "me", 3),
      /changed/
    );
    await assert.rejects(
      write({ ...edit, expected_revision: 2 }, "other", 3),
      /not found/
    );
    const patch = {
      document_id: created.documentId,
      expected_revision: 2,
      edits: [{ old_text: "수정된", new_text: "최종" }],
    };
    const patched = await write(patch, "me", 4);
    assert.equal(patched.revision, 3);
    assert.deepEqual(await write(patch, "me", 4), patched);
    const passage = await readTalentDocumentForTool({
      admin,
      userId: "me",
      input: { document_id: created.documentId, query: "최종" },
    });
    assert.equal(passage.excerpt, "# 최종 문서");
    assert.equal(passage.matchFound, true);
    const missing = await readTalentDocumentForTool({
      admin,
      userId: "me",
      input: { document_id: created.documentId, query: "없음" },
    });
    assert.equal(missing.excerpt, "");
    assert.equal(missing.matchFound, false);
    await assert.rejects(
      write(
        {
          document_id: created.documentId,
          expected_revision: 3,
          edits: [{ old_text: "없는 구절", new_text: "변경" }],
        },
        "me",
        5
      ),
      /missing or ambiguous/
    );
    await db.query("update talent_documents set origin_type=null where id=$1", [
      created.documentId,
    ]);
    await assert.rejects(
      write({ ...edit, expected_revision: 2 }, "me", 3),
      /preserve the original/
    );
    await db.query(
      "update talent_documents set origin_type=$1,is_deleted=true where id=$2",
      [AUTHORED_DOCUMENT_ORIGIN, created.documentId]
    );
    await assert.rejects(write(input), /could not be saved/);
  } finally {
    await db.close();
  }
});
