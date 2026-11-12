import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { CAREER_ACTION_ITEM_TOOLS } from "./actionItemsTool";
import {
  formatCareerActionItemResponse,
  type CareerActionItemContent,
} from "./actionItems";

const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const conversation = "00000000-0000-4000-8000-000000000003";
const content: CareerActionItemContent = {
  title: "준비된 지원서 확인",
  description: "내용을 확인해 주세요",
  buttonText: "검토하기",
  action: { type: "send_message", text: "준비된 지원서를 보여줘" },
  priority: 2,
  urgency: "normal",
};

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table talent_users(user_id uuid primary key);
    create table talent_conversations(id uuid primary key,user_id uuid);
    insert into talent_users values('${user}'),('${other}');
    insert into talent_conversations values('${conversation}','${user}');`);
  await db.exec(
    await readFile(
      "supabase/migrations/20261104134635_career_action_items.sql",
      "utf8"
    )
  );
  await db.exec(await readFile("supabase/migrations/20261111112104_career_optional_action_presentation.sql", "utf8"));
  return db;
}
async function command(
  db: PGlite,
  operation: string,
  options: {
    owner?: string;
    id?: string;
    revision?: number;
    item?: CareerActionItemContent;
    key?: string;
  } = {}
) {
  return (
    await db.query<{ result: any }>(
      "select manage_career_action_item($1,$2,$3,$4,$5,$6,$7) as result",
      [
        options.owner ?? user,
        conversation,
        operation,
        options.id ?? null,
        options.revision ?? null,
        options.item ?? content,
        options.key ?? "create-key",
      ]
    )
  ).rows[0].result;
}

function fixtureAdmin(db: PGlite) {
  return {
    from: (table: string) => {
      assert.equal(table, "career_action_items");
      const values: unknown[] = [];
      const conditions = ["deleted_at is null"];
      const read = () =>
        db.query(
          `select * from career_action_items where ${conditions.join(" and ")}`,
          values
        );
      const query = {
        select: () => query,
        is: () => query,
        eq: (key: string, value: unknown) => {
          assert.ok(["user_id", "id"].includes(key));
          values.push(value);
          conditions.push(`${key}=$${values.length}`);
          return query;
        },
        maybeSingle: async () => ({
          data: (await read()).rows[0] ?? null,
          error: null,
        }),
        then: (resolve: (value: unknown) => void) =>
          read().then(({ rows }) => resolve({ data: rows, error: null })),
      };
      return query;
    },
    rpc: async (_name: string, args: any) => ({
      error: null,
      data: await command(db, args.p_operation, {
        owner: args.p_user_id,
        id: args.p_id,
        revision: args.p_expected_revision,
        item: args.p_item,
        key: args.p_creation_key,
      }),
    }),
  };
}

test("one tool call batches creation, partial updates and deletion, preserving revision safety on retry", async () => {
  const db = await setup();
  try {
    const context = {
      admin: fixtureAdmin(db),
      userId: user,
      conversationId: conversation,
      resumeRequestId: "batch-1",
    };
    const execute = (input: Record<string, unknown>): Promise<any> =>
      CAREER_ACTION_ITEM_TOOLS.manage_action_items.execute!(input, context);
    const initial = await execute({
      operation: "batch",
      changes: [
        { operation: "create", item: content },
        {
          operation: "create",
          item: { ...content, title: "일정 답하기", urgency: "urgent" },
        },
      ],
    });
    assert.deepEqual(
      initial.results.map((result: any) => result.status),
      ["created", "created"]
    );
    const [first, second] = initial.results.map((result: any) => result.item);
    const changes = [
      {
        operation: "update",
        id: first.id,
        expectedRevision: 1,
        item: { priority: 30 },
      },
      { operation: "delete", id: second.id, expectedRevision: 1 },
      {
        operation: "create",
        item: { ...content, title: "새 질문", priority: 1, urgency: "urgent" },
      },
    ];
    const mixed = await execute({ operation: "batch", changes });
    assert.deepEqual(
      mixed.results.map((result: any) => result.status),
      ["updated", "deleted", "created"]
    );
    assert.equal(mixed.results[0].item.title, content.title);
    assert.deepEqual(mixed.results[0].item.action, content.action);
    assert.equal(mixed.results[0].item.urgency, "normal");
    assert.equal(mixed.results[0].item.revision, 2);
    assert.ok(mixed.modelOutput.includes("1. update:"));
    assert.ok(mixed.modelOutput.includes("2. delete:"));
    assert.ok(!mixed.modelOutput.includes("creation_key"));
    const retry = await execute({ operation: "batch", changes });
    assert.deepEqual(
      retry.results.map((result: any) => result.status),
      ["conflict", "not_found", "already_created"]
    );
    assert.equal(retry.results[0].item.priority, 30);
    const listed = await execute({ operation: "list" });
    assert.deepEqual(
      listed.items.map((item: any) => item.title),
      [content.title, "새 질문"]
    );
    assert.ok(
      listed.modelOutput.includes(
        "Display priority: 30 (higher appears above)\nUrgency: normal"
      )
    );
  } finally {
    await db.close();
  }
});

test("batch validates before writes and reports uncertain commits without hiding earlier success", async () => {
  const db = await setup();
  try {
    const admin = fixtureAdmin(db);
    const context = {
      admin,
      userId: user,
      conversationId: conversation,
      resumeRequestId: "batch-errors",
    };
    const execute = (input: Record<string, unknown>): Promise<any> =>
      CAREER_ACTION_ITEM_TOOLS.manage_action_items.execute!(input, context);
    await assert.rejects(
      execute({
        operation: "batch",
        changes: [
          { operation: "create", item: content },
          { operation: "create", item: { title: "incomplete" } },
        ],
      })
    );
    assert.equal((await execute({ operation: "list" })).items.length, 0);
    const rpc = admin.rpc;
    let writes = 0;
    admin.rpc = async (...args) => {
      const result = await rpc(...args);
      if (++writes === 2) throw new Error("Connection lost after commit");
      return result;
    };
    const result = await execute({
      operation: "batch",
      changes: [0, 1, 2].map((index) => ({
        operation: "create",
        item: { ...content, title: `Item ${index}` },
      })),
    });
    assert.deepEqual(
      result.results.map((value: any) => value.status),
      ["created", "unconfirmed", "not_attempted"]
    );
    assert.equal(writes, 2);
    assert.equal((await execute({ operation: "list" })).items.length, 2);
    assert.ok(result.modelOutput.includes("Read the list before retrying"));
  } finally {
    await db.close();
  }
});

test("owned actions persist, stale updates cannot overwrite, and retried creation cannot resurrect deletion", async () => {
  const db = await setup();
  try {
    const created = await command(db, "create");
    assert.equal(created.status, "created");
    assert.equal((await command(db, "create")).id, created.id);
    await assert.rejects(
      command(db, "update", { owner: other, id: created.id, revision: 1 }),
      /Conversation not owned/
    );
    const changed = {
      ...content,
      title: "일정 답하기",
      action: { type: "compose_reply" as const, text: "목요일 가능 시간" },
    };
    assert.equal(
      (
        await command(db, "update", {
          id: created.id,
          revision: 1,
          item: changed,
        })
      ).item.revision,
      2
    );
    const conflict = await command(db, "update", {
      id: created.id,
      revision: 1,
    });
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.item.title, changed.title);
    assert.equal(
      (await command(db, "delete", { id: created.id, revision: 1 })).status,
      "conflict"
    );
    assert.equal(
      (await command(db, "delete", { id: created.id, revision: 2 })).status,
      "deleted"
    );
    assert.ok((await command(db, "create")).item.deleted_at);
    assert.equal(
      (
        await db.query(
          "select * from career_action_items where deleted_at is null"
        )
      ).rows.length,
      0
    );
    // Ten is an agent curation guideline, not a database quota.
    for (let i = 0; i < 11; i++)
      await command(db, "create", { key: `item-${i}` });
    assert.equal(
      (
        await db.query(
          "select * from career_action_items where deleted_at is null"
        )
      ).rows.length,
      11
    );
  } finally {
    await db.close();
  }
});

test("RLS allows only owner reads; clients cannot write or execute the service RPC", async () => {
  const db = await setup();
  try {
    await command(db, "create");
    await db.exec(
      `set role authenticated; set request.jwt.claim.sub='${other}';`
    );
    assert.equal(
      (await db.query("select * from career_action_items")).rows.length,
      0
    );
    await db.exec(`set request.jwt.claim.sub='${user}';`);
    assert.equal(
      (await db.query("select * from career_action_items")).rows.length,
      1
    );
    await assert.rejects(
      db.exec("delete from career_action_items"),
      /permission denied/
    );
    await assert.rejects(command(db, "create"), /permission denied/);
    await db.exec("reset role; set role anon;");
    await assert.rejects(
      db.query("select * from career_action_items"),
      /permission denied/
    );
  } finally {
    await db.close();
  }
});

test("production executor returns a text projection and a selected card survives queued message projection", async () => {
  const db = await setup();
  try {
    const admin = {
      rpc: async (_name: string, args: any) => ({
        error: null,
        data: await command(db, args.p_operation, {
          id: args.p_id,
          revision: args.p_expected_revision,
          item: args.p_item,
          key: args.p_creation_key,
        }),
      }),
    };
    const result: any = await CAREER_ACTION_ITEM_TOOLS.manage_action_items
      .execute!(
      { operation: "create", item: content },
      {
        admin: admin as any,
        userId: user,
        conversationId: conversation,
        resumeRequestId: "reply-1",
      }
    );
    assert.equal(result.status, "created");
    assert.ok(result.modelOutput.includes(content.action.text));
    assert.ok(!result.modelOutput.includes("creation_key"));
    assert.ok(!result.modelOutput.includes("created_at"));
    const snapshot = structuredClone(result.item);
    await command(db, "delete", { id: result.item.id, revision: 1 });
    const { formatTalentMessageContentForLlmPrompt } =
      await import("./opportunityFeedbackNote");
    const projected = formatTalentMessageContentForLlmPrompt({
      role: "user",
      content: "목요일 오후요",
      payload: { careerActionItem: snapshot },
    });
    assert.ok(projected.includes("목요일 오후요"));
    assert.ok(projected.includes(content.title));
    assert.ok(projected.includes(result.item.id));
    assert.equal(
      formatCareerActionItemResponse({
        careerActionItem: { ...snapshot, revision: "forged" },
      }),
      ""
    );
  } finally {
    await db.close();
  }
});


test("creating a card only needs its title, caption and click action; omitted presentation does not reset updates", async () => {
  const db = await setup();
  try {
    const item = { title: content.title, buttonText: content.buttonText, action: content.action };
    const raw = await command(db, "create", { item: item as CareerActionItemContent, key: "minimal-db" });
    assert.equal(raw.item.description, "");
    assert.equal(raw.item.priority, 0);
    assert.equal(raw.item.urgency, "normal");
    const execute = (input: Record<string, unknown>): Promise<any> => CAREER_ACTION_ITEM_TOOLS.manage_action_items.execute!(input, {
      admin: fixtureAdmin(db), userId: user, conversationId: conversation, resumeRequestId: "minimal-tool",
    });
    const created = await execute({ operation: "create", item });
    assert.equal(created.item.description, "");
    assert.equal(created.item.priority, 0);
    assert.equal(created.item.urgency, "normal");
    assert.match(created.modelOutput, /Display priority: 0/);
    const emphasized = await execute({ operation: "update", id: created.id, expectedRevision: created.item.revision,
      item: { priority: 8, urgency: "urgent", description: "Time-sensitive" } });
    const renamed = await execute({ operation: "update", id: created.id, expectedRevision: emphasized.item.revision,
      item: { title: "Updated title" } });
    assert.equal(renamed.item.priority, 8);
    assert.equal(renamed.item.urgency, "urgent");
    assert.equal(renamed.item.description, "Time-sensitive");
    await assert.rejects(execute({ operation: "create", item: { title: "No action", buttonText: "Open" } }));
  } finally { await db.close(); }
});
