import assert from "node:assert/strict";
import test from "node:test";
import { followDatabase, followAdmin, id } from "./preparation.testSupport";
import { CAREER_COMPANY_TOOLS } from "./tools";
import { readFollowInventory } from "./inventory";
import {
  prepareFollowedCompanies,
  readPreparedFollowContext,
} from "./preparation";
import { formatToolResultText } from "@/lib/llm/promptText";

const execute = CAREER_COMPANY_TOOLS.follow_company.execute!;
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const db = await followDatabase();
  t.after(() => db.close());
  const admin = followAdmin(db);
  const context = { admin, userId: id(1), userMessageId: "name-follow-test" };
  return { db, admin, context };
}

test("mixed name/workspace batch saves without directory search, retries safely and manages name follows by owned ID", async (t) => {
  const { db, context } = await fixture(t);
  const companies = [
    {
      company_name: "  이름만 있는 회사  ",
      instruction: "플랫폼 엔지니어 채용",
    },
    { company_workspace_id: id(10) },
    { company_name: "New English Company" },
  ];
  const saved = (await execute(
    { action: "follow", companies },
    context
  )) as any;
  assert.equal(saved.failures.length, 0);
  assert.equal(saved.follows.length, 3);
  const named = saved.follows[0];
  assert.equal(named.company_name, "이름만 있는 회사");
  assert.equal(named.company_db_id, null);
  assert.equal(named.company_workspace_id, null);
  assert.equal(named.scope, "name");
  assert.equal(saved.follows[1].scope, "workspace");
  assert.equal(saved.follows[1].company_db_id, 1);
  const text = formatToolResultText(saved);
  assert.match(text, /이름만 있는 회사/);
  assert.match(text, /플랫폼 엔지니어 채용/);
  assert.ok(!text.includes("company_db_id"));
  const replay = (await execute(
    { action: "follow", companies: [...companies].reverse() },
    context
  )) as any;
  assert.deepEqual(
    replay.follows.map((row: any) => row.id).reverse(),
    saved.follows.map((row: any) => row.id)
  );
  const duplicate = (await execute(
    { action: "follow", companies: [companies[0]] },
    { ...context, userMessageId: "another-request" }
  )) as any;
  assert.equal(duplicate.follows[0].id, named.id);
  assert.equal(
    (
      await db.query("select * from talent_company_follow where talent_id=$1", [
        id(1),
      ])
    ).rows.length,
    4
  );
  // An unrelated user's subscription cannot be changed, even with its known ID.
  await assert.rejects(
    execute(
      { action: "unfollow", follow_id: named.id, expected_revision: 1 },
      { ...context, userId: id(2) }
    ),
    /unavailable/
  );
  const updated = (await execute(
    {
      action: "update",
      follow_id: named.id,
      expected_revision: 1,
      instruction: "연구직도 포함",
    },
    context
  )) as any;
  assert.equal(updated.follow.revision, 2);
  assert.equal(updated.follow.company_name, named.company_name);
  await assert.rejects(
    execute(
      { action: "unfollow", follow_id: named.id, expected_revision: 1 },
      context
    ),
    /revision conflict/
  );
  const removed = (await execute(
    { action: "unfollow", follow_id: named.id, expected_revision: 2 },
    context
  )) as any;
  assert.ok(removed.follow.unfollowed_at);
  assert.equal(
    (await readFollowInventory(context.admin, id(1))).companies.some(
      (c) => c.id === named.id
    ),
    false
  );
  const refollowed = (await execute(
    { action: "follow", companies: [companies[0]] },
    { ...context, userMessageId: "refollow" }
  )) as any;
  assert.equal(refollowed.follows[0].id, named.id);
  assert.equal(refollowed.follows[0].unfollowed_at, null);
  // Existing company follows survive the migration with their original key.
  assert.equal(
    (
      await db.query<any>(
        "select scope_key from talent_company_follow where id=$1",
        [id(20)]
      )
    ).rows[0].scope_key,
    "company:1"
  );
});

test("name-only scheduled preparation passes follow facts without searching or reading old search caches", async (t) => {
  const { db, admin, context } = await fixture(t);
  await db.exec(`update talent_company_follow set unfollowed_at=now()`);
  const saved = await execute({ action: "follow", companies: [
    { company_name: "새로운 연구소", instruction: "한국 연구팀의 채용 소식에 관심 있어요" },
    { company_name: "Other Unlisted Lab" },
  ] }, context) as any;
  await db.exec(`update talent_company_follow set followed_at='2026-11-04 00:00:00+00' where scope='name'`);
  const from = admin.from, rpc = admin.rpc;
  admin.from = (table: string) => {
    assert.notEqual(table, "company_hiring_search_cache", "preparation/read must not use old fixed-query evidence");
    assert.notEqual(table, "documents");
    return from(table);
  };
  admin.rpc = (name: string, args: any) => {
    assert.notEqual(name, "claim_company_hiring_search");
    return rpc(name, args);
  };
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected automatic web search"); });
  const inventory = await readFollowInventory(admin, id(1));
  assert.equal(inventory.roles.length, 0);
  const run = (await db.query<any>("select * from opportunity_discovery_run where id=$1", [id(40)])).rows[0];
  // Use production dependencies: there are no linked roles to evaluate.
  const result = await prepareFollowedCompanies({ admin, run });
  assert.equal(result.ready, true);
  const prompt = await readPreparedFollowContext(admin, id(1), result.state);
  assert.match(prompt, /새로운 연구소/);
  assert.match(prompt, /Other Unlisted Lab/);
  assert.match(prompt, /한국 연구팀의 채용 소식에 관심 있어요/);
  assert.match(prompt, /followed 2026-11-04 09:00/);
  assert.match(prompt, /no linked directory roles/);
  assert.doesNotMatch(prompt, /hiring evidence|research is not yet available|company_db_id|website/i);
  const read = await execute({ action: "read", follow_id: saved.follows[0].id }, context) as any;
  assert.match(formatToolResultText(read), /새로운 연구소/);
  assert.match(formatToolResultText(read), /followed 2026-11-04 09:00/);
  assert.match(formatToolResultText(read), /한국 연구팀의 채용 소식에 관심 있어요/);
  assert.equal(read.roles.length, 0);
  assert.equal(read.news, undefined);
  await db.query("update talent_setting set blocked_companies=$1 where user_id=$2", [["새로운 연구소"], id(1)]);
  assert.equal((await readFollowInventory(admin, id(1))).companies.some(c => c.name === "새로운 연구소"), false);
});

test("invalid name identities fail before writes; SQL guards empty names, conversation ownership and RPC permissions", async (t) => {
  const { db, admin, context } = await fixture(t);
  for (const company of [
    {},
    { company_name: "   " },
    { company_workspace_id: "not-a-uuid" },
  ]) {
    await assert.rejects(
      execute({ action: "follow", companies: [company] }, context)
    );
  }
  const empty = await admin.rpc("write_career_company_follow", {
    p_user_id: id(1),
    p_conversation_id: null,
    p_request_id: "empty",
    p_input: { action: "follow", company_name: " " },
  });
  assert.match(empty.error.message, /Company name is required/);
  const badConversation = (await execute(
    { action: "follow", companies: [{ company_name: "Unknown Company" }] },
    { ...context, conversationId: id(99) }
  )) as any;
  assert.equal(badConversation.follows.length, 0);
  assert.match(badConversation.failures[0].error, /Conversation unavailable/);
  assert.match(
    formatToolResultText(badConversation),
    /Follow failed for Unknown Company/
  );
  assert.equal(
    (await db.query("select * from talent_company_follow")).rows.length,
    2
  );
  const access = (
    await db.query<any>(`select
    has_function_privilege('anon','write_career_company_follow(uuid,uuid,text,jsonb)','execute') anon,
    has_function_privilege('authenticated','write_career_company_follow(uuid,uuid,text,jsonb)','execute') authenticated,
    has_function_privilege('service_role','write_career_company_follow(uuid,uuid,text,jsonb)','execute') service`)
  ).rows[0];
  assert.deepEqual(access, {
    anon: false,
    authenticated: false,
    service: true,
  });
});
