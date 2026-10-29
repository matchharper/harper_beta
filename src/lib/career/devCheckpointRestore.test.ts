import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  restoreCheckpointRows,
  readCheckpointRows,
  type CheckpointQuery,
} from "./devCheckpointRestore";
import { canonicalRows, type CareerCheckpoint } from "./devCheckpointData";

const tables = [
  "talent_users",
  "talent_conversations",
  "talent_messages",
  "talent_simulate_application",
];
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table talent_users(user_id text primary key, name text);
    create table talent_conversations(id int primary key, user_id text references talent_users(user_id), updated_at timestamptz);
    create table talent_messages(id int generated always as identity primary key, user_id text references talent_users(user_id), conversation_id int references talent_conversations(id), content text, payload jsonb);
    create table talent_simulate_application(id int primary key, user_id text references talent_users(user_id), message_id int references talent_messages(id), payload jsonb);
    create table external_receipts(id int primary key, message_id int references talent_messages(id) on delete cascade);
    create table notifications(message_id int);
    create function notify_on_message() returns trigger language plpgsql as $$ begin insert into notifications values(new.id); return new; end $$;
    create trigger notify after insert on talent_messages for each row execute function notify_on_message();
    insert into talent_users values ('daniel','Daniel'),('other','Other');
    insert into talent_conversations values (1,'daniel','2026-10-28 07:17:11.994333+00'),(2,'other',now());
    insert into talent_messages(user_id,conversation_id,content,payload) values ('daniel',1,'baseline','{"b":2,"a":1}'),('other',2,'keep',null);
    insert into talent_simulate_application values(1,'daniel',1,'{"revision":3}');
  `);
  const query: CheckpointQuery = async (sql, params = []) =>
    (await db.query(sql, params)).rows as Record<string, any>[];
  await query("update talent_messages set content=$1 where id=1", [
    "Don't change $checkpoint$ or backslash \\ or Unicode: 지원해줘",
  ]);
  const rows = await readCheckpointRows(query, "daniel", tables);
  const columns = await query(
    "select table_name,column_name,is_generated from information_schema.columns where table_schema='public'"
  );
  const fks = [
    {
      child: "talent_conversations",
      parent: "talent_users",
      child_columns: ["user_id"],
      parent_columns: ["user_id"],
    },
    {
      child: "talent_messages",
      parent: "talent_users",
      child_columns: ["user_id"],
      parent_columns: ["user_id"],
    },
    {
      child: "talent_messages",
      parent: "talent_conversations",
      child_columns: ["conversation_id"],
      parent_columns: ["id"],
    },
    {
      child: "talent_simulate_application",
      parent: "talent_messages",
      child_columns: ["message_id"],
      parent_columns: ["id"],
    },
    {
      child: "external_receipts",
      parent: "talent_messages",
      child_columns: ["message_id"],
      parent_columns: ["id"],
    },
  ].map((fk) => ({ ...fk, parent_schema: "public" }));
  const snapshot = {
    version: 1,
    user: { id: "daniel", email: "fixture@example.test", captured_at: "fixed" },
    columns,
    fks,
    tables: rows,
  } as CareerCheckpoint;
  return { db, query, snapshot };
}

test("restores updates, deletions and new work exactly and repeatedly without replaying triggers or touching other accounts", async () => {
  const { db, query, snapshot } = await fixture();
  try {
    for (let round = 0; round < 2; round++) {
      await db.exec(`update talent_users set name='Changed' where user_id='daniel';
        update talent_messages set content='Changed' where id=1;
        delete from talent_simulate_application where id=1;
        insert into talent_messages(user_id,conversation_id,content) values('daniel',1,'test input');`);
      const notifications = await query("select * from notifications");
      await db.transaction(async (tx) => {
        await restoreCheckpointRows(
          async (sql, params = []) =>
            (await tx.query(sql, params)).rows as Record<string, any>[],
          snapshot,
          tables
        );
      });
      const restored = await readCheckpointRows(query, "daniel", tables);
      for (const table of tables)
        assert.deepEqual(
          canonicalRows(restored[table]),
          canonicalRows(snapshot.tables[table])
        );
      assert.equal(
        (
          await query(
            "select content from talent_messages where user_id='other'"
          )
        )[0].content,
        "keep"
      );
      assert.deepEqual(
        await query("select * from notifications"),
        notifications
      );
    }
  } finally {
    await db.close();
  }
});

test("external references to new messages abort the entire reset instead of cascading outside the account", async () => {
  const { db, query, snapshot } = await fixture();
  try {
    await db.exec(`update talent_users set name='Changed' where user_id='daniel';
      insert into talent_messages(user_id,conversation_id,content) values('daniel',1,'sent');
      insert into external_receipts values(1,3);`);
    const before = await readCheckpointRows(query, "daniel", tables);
    await assert.rejects(
      db.transaction(async (tx) => {
        await restoreCheckpointRows(
          async (sql, params = []) =>
            (await tx.query(sql, params)).rows as Record<string, any>[],
          snapshot,
          tables
        );
      }),
      /external_receipts/
    );
    assert.deepEqual(await readCheckpointRows(query, "daniel", tables), before);
    assert.equal(
      (await query("select count(*)::int n from external_receipts"))[0].n,
      1
    );
    assert.equal(
      (await query("show session_replication_role"))[0]
        .session_replication_role,
      "origin"
    );
  } finally {
    await db.close();
  }
});

test("quiescence checks run under the table locks before any state is replaced", async () => {
  const { db, query, snapshot } = await fixture();
  try {
    const before = await readCheckpointRows(query, "daniel", tables);
    await assert.rejects(
      db.transaction(async (tx) => {
        await restoreCheckpointRows(
          async (sql, params = []) =>
            (await tx.query(sql, params)).rows as Record<string, any>[],
          snapshot,
          tables,
          async () => {
            throw new Error("worker busy");
          }
        );
      }),
      /worker busy/
    );
    assert.deepEqual(await readCheckpointRows(query, "daniel", tables), before);
  } finally {
    await db.close();
  }
});
