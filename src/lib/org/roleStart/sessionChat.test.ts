import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { RoleStartQuestion } from "./session";

const roleId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

test("session and chat commit together; stale revisions and failed messages never partially save", async () => {
  const db = new PGlite();
  let statements = 0;
  // Execute the production tagged SQL with PGlite; fragments keep real bound parameters.
  class Fragment {
    constructor(readonly strings: readonly string[], readonly values: unknown[]) {}
    render(parameters: unknown[]): string {
      return this.strings.reduce((out, part, index) => {
        if (!index) return part;
        const value = this.values[index - 1];
        return out + (value instanceof Fragment ? value.render(parameters) : `$${parameters.push(value)}`) + part;
      }, "");
    }
    then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
      const parameters: unknown[] = [];
      const query = this.render(parameters);
      statements++;
      return db.query(query, parameters).then(result => resolve(result.rows), reject);
    }
  }
  const sql = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => new Fragment(strings, values), {
    json: (value: unknown) => JSON.stringify(value),
  });
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function(name, ...args) {
    if (name === "server-only") return {};
    if (name === "./db") return { roleStartSql: () => sql };
    return original.call(this, name, ...args);
  };
  let save!: typeof import("./session").saveRoleStartSession;
  let saveCompensation!: typeof import("./session").saveRoleStartCompensation;
  try { ({ saveRoleStartSession: save, saveRoleStartCompensation: saveCompensation } = await import("./session")); }
  finally { loader._load = original; }
  try {
    await db.exec(`
      create table company_roles(role_id uuid primary key, salary_range text, updated_at timestamptz,
        information jsonb not null);
      create table company_role_start_sessions(role_id uuid primary key, company_workspace_id uuid,
        phase text, brief jsonb default '{}', questions jsonb default '{}', pending_question jsonb,
        pool jsonb, first_candidates jsonb default '[]', evaluations jsonb default '{}', batch jsonb,
        timings jsonb default '{}', progress jsonb default '[]', refined_answers int default 0,
        revision int default 1, updated_at timestamptz default now());
      create table company_conversations(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
        role_id uuid, last_message_id bigint, last_message_at timestamptz, updated_at timestamptz);
      create table company_messages(id bigserial primary key, conversation_id uuid, company_workspace_id uuid,
        role_id uuid, company_user_id uuid, role text, content text, message_type text, status text,
        metadata jsonb, mentions jsonb, thinking_logs jsonb, created_at timestamptz);
      insert into company_roles values ('${roleId}',null,now(),'{"testOnly":true,"testFixture":"role-start-atomic-answer"}');
      insert into company_role_start_sessions(role_id,company_workspace_id,phase) values ('${roleId}','${workspaceId}','questions');
      insert into company_conversations(company_workspace_id,role_id) values ('${workspaceId}','${roleId}');
      insert into company_messages(conversation_id,company_workspace_id,role_id,role,content,message_type,metadata)
        select id,company_workspace_id,role_id,'assistant','first question','chat',
        '{"keep":"metadata","roleStartQuestion":{"questionId":"q1","status":"pending","chips":[]}}' from company_conversations;
    `);
    const next: RoleStartQuestion = { id: "q2", question: "Next?", why: "Why", chips: [], status: "pending", overlap: null, askedAt: "" };
    const chat = { workspaceId, questionId: "q1", status: "answered" as const,
      answer: { userId, content: "스타트업 경험 중요" }, nextQuestion: next, briefReady: false };
    const saved = await save({ roleId, expectedRevision: 1, expectedPhase: ["questions", "review"], patch: { pendingQuestion: next, refinedAnswers: 1 }, chat });
    assert.equal(statements, 1, "one round trip for both session and all chat writes");
    assert.equal(saved?.revision, 2);
    assert.equal(saved?.refinedAnswers, 1);
    let messages = (await db.query<{ id: number; role: string; content: string; metadata: any }>("select * from company_messages order by id")).rows;
    assert.deepEqual(messages.map(m => m.role), ["assistant", "user", "assistant"]);
    assert.equal(messages[1].content, "스타트업 경험 중요");
    assert.equal(messages[0].metadata.keep, "metadata");
    assert.equal(messages[0].metadata.roleStartQuestion.status, "answered");
    assert.equal(messages[2].metadata.roleStartQuestion.questionId, "q2");
    assert.equal((await db.query<{ last_message_id: number }>("select last_message_id from company_conversations")).rows[0].last_message_id, messages[2].id);

    assert.equal(await save({ roleId, expectedRevision: 1, patch: {}, chat }), null);
    assert.equal((await db.query("select * from company_messages")).rows.length, 3, "stale double click cannot add messages");

    // A real database failure in the chat projection rolls back the session too.
    await db.exec("create function reject_fixture_message() returns trigger language plpgsql as $$begin raise exception 'fixture chat write failed'; end$$; create trigger reject_fixture before insert on company_messages for each row execute function reject_fixture_message();");
    await assert.rejects(save({ roleId, expectedRevision: 2, patch: { phase: "review" }, chat }), /fixture chat write failed/);
    assert.equal((await db.query<{ revision: number }>("select revision from company_role_start_sessions")).rows[0].revision, 2);
    await db.exec("drop trigger reject_fixture on company_messages");
    await save({ roleId, expectedRevision: 2, patch: { phase: "review", pendingQuestion: null },
      chat: { ...chat, questionId: "q2", status: "closed", answer: null, nextQuestion: null, briefReady: true } });
    await save({ roleId, expectedRevision: 3, patch: {}, chat: { ...chat, answer: null, nextQuestion: null, briefReady: true } });
    messages = (await db.query<any>("select * from company_messages order by id")).rows;
    assert.equal(messages.filter(m => m.metadata.roleStartBriefReady).length, 1, "review navigation card is reused");

    const count = statements;
    const compensation = await saveCompensation(roleId, "1억원");
    assert.equal(statements, count + 1);
    assert.equal(compensation.session?.questions.compensation, "answered");
    assert.equal(compensation.salaryRange, "1억원");
    assert.equal((await db.query<{ salary_range: string }>("select salary_range from company_roles")).rows[0].salary_range, "1억원");
    await saveCompensation(roleId, "");
    assert.equal((await db.query<{ salary_range: string }>("select salary_range from company_roles")).rows[0].salary_range, "1억원", "skip preserves an existing salary");
  } finally { await db.close(); }
});
