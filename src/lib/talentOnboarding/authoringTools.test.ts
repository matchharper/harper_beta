import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { TalentAdminClient } from "./admin";
import { executeProfileRows } from "./profileRows";
import { profileExtraEntries } from "./profileStore";
import { formatToolResultText } from "@/lib/llm/promptText";
import {
  writeDocument,
  upsertDocument,
  AUTHORED_DOCUMENT_ORIGIN,
  isResumeDocumentWrite,
} from "@/lib/documents/authoring";
import { GENERATED_RESUME_ORIGIN } from "@/lib/resumes/schema";
import { readTalentDocumentForTool } from "./documentTool";

async function database() {
  const db = new PGlite();
  await db.exec(`
    create table talent_documents (id text primary key, talent_id text, kind text, file_name text, description text, storage_path text, content_type text, size_bytes bigint, content_sha256 text, extracted_text text, is_public boolean default false, is_primary boolean default false, is_deleted boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(), origin_type text, origin_id text, structured_content jsonb, revision integer default 1);
    create table talent_experiences (id bigint primary key, talent_id text, role text, company_name text, company_link text, company_location text, employment_type text, start_date date, end_date date, description text, memo text, months integer);
    create table talent_educations (id bigint primary key, talent_id text, school text, degree text, field text, start_date date, end_date date, url text, description text, memo text);
    create table talent_extras (talent_id text primary key, content jsonb);
  `);
  let beforeWrite: (() => Promise<void>) | undefined;
  let loseResponse = false;
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
    single() { return this.maybeSingle(); }
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
        if (loseResponse && this.operation !== "select") {
          loseResponse = false;
          return { data: null, error: new Error("connection lost after commit") };
        }
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
    loseNextResponse: () => { loseResponse = true; },
  };
}

test("background document tools use the authenticated reply identity without a new user message", async () => {
  const { executeTalentTool } = await import("./tools");
  const { db, admin } = await database();
  const context = {
    admin,
    userId: "owner",
    conversationId: "conversation",
    userMessageId: null,
    resumeRequestId: "external:browser-run",
  };
  const execute = (input: Record<string, unknown>, current = context) =>
    executeTalentTool({ name: "upsert_document", logging: false, input, context: current }) as Promise<any>;
  try {
    for (const input of [
      { action: "create", type: "markdown", title: "지원서 답변", markdown: "확인된 경력을 정리한 답변" },
      { action: "create", type: "resume", title: "지원용 이력서", content: { language: "ko", basics: { name: "가상 사용자" }, experience: [{ title: "개발자", organization: "Example", description: "서비스 개발" }] } },
    ]) {
      const first = await execute(input);
      const repeated = await execute(input);
      assert.equal(first.ok, true);
      assert.equal(repeated.documentId, first.documentId);
      assert.equal(repeated.revision, first.revision);
      await assert.rejects(execute({ action: "update", document_id: first.documentId, description: "다른 소유자" }, { ...context, userId: "other" }));
    }
    assert.equal((await db.query("select * from talent_documents")).rows.length, 2);
    await assert.rejects(execute({ action: "create", type: "markdown", title: "없음", markdown: "없음" }, { ...context, conversationId: "" }), /authenticated conversation context/);
    await assert.rejects(execute({ action: "create", type: "markdown", title: "없음", markdown: "없음" }, { ...context, resumeRequestId: "" }), /authenticated conversation context/);
  } finally { await db.close(); }
});

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

test("unified resume create/update/copy preserves source, stable entries, metadata and retry effects", async () => {
  const { db, admin, beforeWrite, loseNextResponse } = await database();
  const run = (input: Record<string, unknown>, requestId: string, userId = "me") =>
    upsertDocument({ admin, userId, userMessageId: 1, requestId, input });
  const row = async (id: unknown) => (await db.query<any>("select * from talent_documents where id=$1", [id])).rows[0];
  try {
    await db.exec(`create function advance_resume_revision() returns trigger language plpgsql as $$ begin if old.origin_type='harper_generated_resume' then new.revision:=old.revision+1; end if; return new; end $$; create trigger advance_resume before update on talent_documents for each row execute function advance_resume_revision();`);
    const input = { action: "create", type: "resume", title: "김하늘_개발자", description: "개발 경력 이력서", content: { language: "ko", basics: { name: "김하늘", email: "haneul@example.com" }, experience: [{ title: "개발자", organization: "Example", description: "기존 경력" }] } };
    loseNextResponse();
    const created = await run(input, "create");
    assert.ok("documentId" in created);
    assert.equal(created.type, "resume");
    assert.equal(created.revision, 1);
    assert.equal(created.isPrivate, true);
    assert.deepEqual(await run(input, "create"), created);
    const id = created.documentId;
    const first = await row(id);
    assert.equal(first.origin_type, GENERATED_RESUME_ORIGIN);
    assert.equal(first.description, input.description);
    assert.equal(first.storage_path, null);
    const entryId = first.structured_content.content.experience[0].id;
    const edit = { action: "update", document_id: id, expected_revision: 1, changes: [{ op: "set", path: `/experience/${entryId}/description`, value: "수정한 경력" }], description: "수정한 이력서", is_public: true };
    assert.equal(await isResumeDocumentWrite({ admin, userId: "me", input: edit }), true);
    assert.equal(await isResumeDocumentWrite({ admin, userId: "me", input: { action: "update", document_id: id, description: "설명" } }), false);
    loseNextResponse();
    const updated = await run(edit, "update");
    assert.ok("revision" in updated);
    assert.equal(updated.revision, 2);
    assert.deepEqual(await run(edit, "update"), updated);
    assert.equal((await row(id)).description, "수정한 이력서");
    assert.equal((await row(id)).structured_content.content.experience[0].id, entryId);
    await assert.rejects(run({ ...edit, description: "stale" }, "stale"), /changed/);
    assert.equal((await row(id)).description, "수정한 이력서");
    const copy = { action: "copy", document_id: id, expected_revision: 2, title: "별도 이력서", changes: [{ op: "set", path: `/experience/${entryId}/title`, value: "소프트웨어 개발자" }] };
    const copied = await run(copy, "copy");
    assert.ok("documentId" in copied);
    assert.notEqual(copied.documentId, id);
    assert.equal(copied.isPrivate, true);
    const copyRow = await row(copied.documentId);
    assert.equal(copyRow.description, "수정한 이력서");
    assert.notEqual(copyRow.structured_content.content.experience[0].id, entryId);
    assert.deepEqual(copyRow.structured_content.source_document_ids, [id]);
    assert.equal((await row(id)).structured_content.content.experience[0].title, "개발자");
    await assert.rejects(run(copy, "foreign", "other"), /not found/);
    // A second write under the same conversation request is a new command,
    // while an exact replay above remains idempotent.
    await run({ action: "update", document_id: id, expected_revision: 2, title: "이름만 변경" }, "update");
    assert.equal((await row(id)).file_name, "이름만 변경.pdf");
    assert.equal((await row(id)).structured_content.content.experience[0].description, "수정한 경력");
    assert.deepEqual(await run(copy, "copy"), copied);
    await assert.rejects(run({ ...copy, title: "오래된 복사" }, "stale-copy"), /changed/);
    const before = await row(id);
    beforeWrite(async () => { await db.query("update talent_documents set description='Concurrent description' where id=$1", [id]); });
    await assert.rejects(run({ ...edit, expected_revision: 3, description: "Must not save" }, "race"), /changed/);
    assert.equal((await row(id)).description, "Concurrent description");
    assert.deepEqual((await row(id)).structured_content, before.structured_content);
    await assert.rejects(run({ ...edit, expected_revision: 4, is_primary: true }, "primary"), /cannot be selected as primary/);
    assert.equal((await row(id)).revision, 4);
    await run({ action: "update", document_id: id, is_deleted: true }, "delete");
    assert.equal((await row(id)).revision, 5);
    const restored = await run({ action: "update", document_id: id, expected_revision: 5, is_deleted: false, title: "복원한 이력서" }, "restore");
    assert.ok("revision" in restored);
    assert.equal(restored.revision, 6);
    assert.equal((await row(id)).is_deleted, false);
    assert.equal((await row(id)).is_public, false);
    assert.equal((await row(id)).file_name, "복원한 이력서.pdf");
    assert.deepEqual((await row(id)).structured_content, before.structured_content);
  } finally { await db.close(); }
});

test("unified markdown copy is private, independent, scoped, owned and safely replayable", async () => {
  const { db, admin, loseNextResponse } = await database();
  const run = (input: Record<string, unknown>, requestId: string, userId = "me") => upsertDocument({ admin, userId, userMessageId: 1, requestId, input });
  const row = async (id: unknown) => (await db.query<any>("select * from talent_documents where id=$1", [id])).rows[0];
  try {
    const created = await run({ action: "create", type: "markdown", title: "지원동기", markdown: "# 지원동기\n\nOriginal detail.", description: "지원동기 초안", is_public: true }, "create");
    assert.ok("documentId" in created);
    const id = created.documentId;
    const copy = { action: "copy", document_id: id, expected_revision: 1, title: "다른 회사 지원동기", edits: [{ old_text: "Original", new_text: "Adapted" }] };
    assert.equal(await isResumeDocumentWrite({ admin, userId: "me", input: copy }), false);
    loseNextResponse();
    const copied = await run(copy, "copy");
    assert.ok("documentId" in copied);
    assert.equal(copied.type, "markdown");
    assert.equal(copied.action, "copy");
    assert.equal(copied.isPrivate, true);
    assert.equal((await row(copied.documentId)).description, "지원동기 초안");
    assert.equal((await row(copied.documentId)).extracted_text, "# 지원동기\n\nAdapted detail.");
    assert.equal((await row(id)).extracted_text, "# 지원동기\n\nOriginal detail.");
    assert.deepEqual(await run(copy, "copy"), copied);
    await assert.rejects(run(copy, "foreign", "other"), /not found/);
    await run({ action: "update", document_id: id, expected_revision: 1, markdown: "Later source" }, "update");
    assert.deepEqual(await run(copy, "copy"), copied);
    await assert.rejects(run(copy, "new-stale-copy"), /changed/);
    await assert.rejects(run({ ...copy, expected_revision: 2, edits: [{ old_text: "Later" }] }, "bad-edit"), /replacement new_text/);
    await db.query("update talent_documents set is_deleted=true where id=$1", [id]);
    assert.deepEqual(await run(copy, "copy"), copied);
    await assert.rejects(run({ ...copy, expected_revision: 2 }, "deleted-source"), /not found/);
  } finally { await db.close(); }
});

test("unified writer rejects ambiguous format changes before saving and preserves uploaded originals", async () => {
  const { db, admin } = await database();
  const run = (input: Record<string, unknown>) => upsertDocument({ admin, userId: "me", userMessageId: 1, input });
  try {
    await assert.rejects(run({ action: "create", title: "No type", markdown: "body" }), /requires type/);
    await assert.rejects(run({ action: "create", type: "resume", title: "Wrong body", markdown: "body" }), /structured content/);
    await assert.rejects(run({ action: "create", type: "markdown", title: "Wrong body", content: {} }), /Markdown uses/);
    const created = await run({ action: "create", type: "markdown", title: "Original", markdown: "body" });
    assert.ok("documentId" in created);
    await assert.rejects(run({ action: "update", type: "resume", document_id: created.documentId, expected_revision: 1, title: "Wrong type" }), /type differs/);
    await db.query("update talent_documents set origin_type=null where id=$1", [created.documentId]);
    await assert.rejects(run({ action: "update", document_id: created.documentId, expected_revision: 1, markdown: "overwrite" }), /preserve the original/);
    await assert.rejects(run({ action: "copy", document_id: created.documentId, expected_revision: 1, title: "copy upload" }), /preserve the original/);
    await run({ action: "update", document_id: created.documentId, description: "Uploaded source" });
    const row = (await db.query<any>("select * from talent_documents where id=$1", [created.documentId])).rows[0];
    assert.equal(row.description, "Uploaded source");
    assert.equal(row.extracted_text, "body");
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


test("upsert saves content and description together, preserves omitted fields, and cannot partially apply a rejected edit", async () => {
  const { db, admin, beforeWrite } = await database();
  const run = (input: Record<string, unknown>, userMessageId = 1) => upsertDocument({ admin, userId: "me", userMessageId, input });
  try {
    const created = await run({ title: "Interview", markdown: "Original body", description: "면접 질문과 답변" });
    assert.ok("documentId" in created);
    const id = created.documentId;
    const row = async () => (await db.query<any>("select * from talent_documents where id=$1", [id])).rows[0];
    assert.equal((await row()).description, "면접 질문과 답변");
    await run({ document_id: id, description: "지원 회사 면접 준비" }, 2);
    assert.equal((await row()).extracted_text, "Original body");
    const edit = { document_id: id, expected_revision: 1, edits: [{ old_text: "Original", new_text: "Revised" }], description: "수정 완료", is_public: true };
    const saved = await run(edit, 3);
    assert.deepEqual(await run(edit, 3), saved);
    assert.equal((await row()).extracted_text, "Revised body");
    assert.equal((await row()).description, "수정 완료");
    assert.equal((await row()).is_public, true);
    await assert.rejects(run({ ...edit, description: "잘못 덮어쓴 설명" }, 4), /changed/);
    assert.equal((await row()).description, "수정 완료");
    await run({ document_id: id, expected_revision: 2, markdown: "Final body" }, 5);
    assert.equal((await row()).description, "수정 완료");
    assert.equal((await row()).is_public, true);
    beforeWrite(async () => { await db.query("update talent_documents set revision=4, extracted_text='Concurrent body' where id=$1", [id]); });
    await assert.rejects(run({ document_id: id, expected_revision: 3, markdown: "Stale body", description: "Stale description", is_public: false }, 6), /could not be saved/);
    assert.equal((await row()).extracted_text, "Concurrent body");
    assert.equal((await row()).description, "수정 완료");
    assert.equal((await row()).is_public, true);
    await db.query("update talent_documents set origin_type=null where id=$1", [id]);
    await run({ document_id: id, description: "업로드 문서 설명" }, 7);
    assert.equal((await row()).extracted_text, "Concurrent body");
    await assert.rejects(run({ document_id: id, expected_revision: 4, markdown: "Overwrite upload", description: "bad" }, 8), /preserve the original/);
    assert.equal((await row()).description, "업로드 문서 설명");
  } finally { await db.close(); }
});
