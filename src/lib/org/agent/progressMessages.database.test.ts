import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("web progress messages persist in sequence while retries, terminal replies and Slack stay unique", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table company_messages (id bigint generated always as identity primary key, role text, message_type text, content text, metadata jsonb)");
    const previous = readFileSync("supabase/migrations/20260922082129_company_agent_web_action_turns.sql", "utf8");
    const start = previous.indexOf("create unique index company_messages_agent_turn_phase_uidx");
    await db.exec(previous.slice(start, previous.indexOf(";", start) + 1));
    const insert = (runId: string, phase: string, sequence?: number, messageType = "chat", role = "assistant") =>
      db.query("insert into company_messages(role,message_type,content,metadata) values($1,$2,$3,$4)",
        [role, messageType, `${runId}:${phase}:${sequence}`, JSON.stringify({ agentTurn: { runId, phase, sequence } })]);
    await insert("legacy", "progress");
    await insert("web", "progress", 0);
    await insert("slack", "progress", 0, "slack");
    await assert.rejects(insert("web", "progress", 1), { code: "23505" });
    const before = (await db.query("select * from company_messages order by id")).rows;
    await db.exec(readFileSync("supabase/migrations/20261029094911_company_chat_multiple_progress_messages.sql", "utf8"));
    assert.deepEqual((await db.query("select * from company_messages order by id")).rows, before);
    await insert("web", "progress", 1);
    await insert("web", "progress", 2);
    await insert("web", "terminal", 3);
    await assert.rejects(insert("web", "progress", 1), { code: "23505" });
    await assert.rejects(insert("legacy", "progress", 0), { code: "23505" });
    await assert.rejects(insert("web", "terminal", 4), { code: "23505" });
    await assert.rejects(insert("slack", "progress", 1, "slack"), { code: "23505" });
    await insert("other-turn", "progress", 1);
    await insert("web", "progress", 1, "chat", "user");
    const messages = await db.query<{ content: string }>("select content from company_messages where role='assistant' and metadata->'agentTurn'->>'runId'='web' order by id");
    assert.deepEqual(messages.rows.map(row => row.content), ["web:progress:0", "web:progress:1", "web:progress:2", "web:terminal:3"]);
  } finally {
    await db.close();
  }
});
