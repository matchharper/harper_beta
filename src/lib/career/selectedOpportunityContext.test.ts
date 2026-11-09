import assert from "node:assert/strict";
import test from "node:test";
import { readSelectedOpportunityContext } from "./selectedOpportunityContext.server";
import { appendCareerOpportunityMentionMetadata, stripCareerOpportunityMentionMetadata } from "./opportunityMentionText";
import { createCareerInputInbox } from "./work/inbox";

const roleId = "00000000-0000-4000-8000-000000000001";
const description = "  # Engineer\n\nOriginal JD — 원문\n2026-12-01T09:00:00+09:00\n" + "Full responsibilities.\n".repeat(800) + "  ";
const content = appendCareerOpportunityMentionMetadata("Example · Engineer에 지원해줘.", [{ roleId, label: "Example · Engineer" }]);

function emptyProgressQuery() {
  const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return query;
}

test("selected posting uses server facts, preserves the full original JD and leaves the visible message unchanged", async () => {
  const reads: string[] = [];
  const admin = { from(table: string) {
    reads.push(table);
    if (table !== "company_roles") return emptyProgressQuery();
    assert.equal(table, "company_roles");
    const query = {
      select: (columns: string) => { assert.ok(columns.includes("employee_count_range")); return query; },
      in(key: string, ids: string[]) { assert.equal(key, "role_id"); assert.deepEqual(ids, [roleId]); return query; },
      eq(key: string, value: string) { assert.deepEqual([key, value], ["source_type", "external"]); return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [{ role_id: roleId,
        source_type: "external", name: "Server title", description, external_jd_url: "https://example.invalid/jobs/engineer",
        company_workspace: { company_name: "Server company", company_db: { employee_count_range: { start: 11, end: 50 } } },
      }], error: null }).then(resolve); },
    };
    return query;
  } } as any;
  const messages = [{ role: "user", content }, { role: "user", content },
    { role: "assistant", content: appendCareerOpportunityMentionMetadata("Another role", [{ roleId: "00000000-0000-4000-8000-000000000002", label: "Unselected" }]) }];
  const before = structuredClone(messages);
  const context = await readSelectedOpportunityContext({ admin, userId: "owner", conversationId: "conversation", messages });
  assert.deepEqual(reads, ["company_roles", "talent_opportunity_recommendation", "talent_external_operations"]);
  assert.ok(context.includes("Saved opportunity: none."));
  assert.ok(context.includes("Company size (stored): 11–50 team members"));
  assert.ok(context.includes("Work history: none."));
  assert.ok(context.includes("Saved stage is not a submission receipt"));
  assert.ok(context.includes(description));
  for (const fact of ["Server title", "Server company", "https://example.invalid/jobs/engineer"]) assert.ok(context.includes(fact));
  assert.equal(context.split(description).length - 1, 1);
  assert.ok(!context.includes("Unselected"));
  assert.deepEqual(messages, before);
  assert.equal(stripCareerOpportunityMentionMetadata(content), "Example · Engineer에 지원해줘.");
});

test("ordinary messages and invalid database IDs do not load posting context", async () => {
  const admin = { from() { throw new Error("No query expected"); } } as any;
  assert.equal(await readSelectedOpportunityContext({ admin, userId: "owner", conversationId: "conversation", messages: [
    { role: "user", content: "지원 방법을 알려줘" },
    { role: "user", content: appendCareerOpportunityMentionMetadata("Invalid", [{ roleId: "not-a-uuid", label: "Invalid" }]) },
  ] }), "");
});

test("missing stored data stays unknown instead of using client text or a company homepage", async () => {
  const admin = { from(table: string) {
    if (table !== "company_roles") return emptyProgressQuery();
    const query = { select: () => query, in: () => query, eq: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ role_id: roleId, source_type: "external",
        name: "Engineer", description: null, external_jd_url: null, company_workspace: { homepage_url: "https://homepage.invalid" } }], error: null }).then(resolve) };
    return query;
  } } as any;
  const context = await readSelectedOpportunityContext({ admin, userId: "owner", conversationId: "conversation", messages: [{ role: "user", content }] });
  assert.ok(context.includes("JD link: not recorded"));
  assert.ok(context.includes("Company size (stored): not recorded"));
  assert.ok(context.includes("Job description (original):\nnot recorded"));
  assert.ok(!context.includes("homepage.invalid"));
});

test("new inputs during a running reply receive their context once, before delivery is recorded", async () => {
  const rows: any[] = [];
  const readIds: number[][] = [];
  const inbox = createCareerInputInbox({ deliveredIds: [], save: async () => {},
    read: async () => ({ messages: rows, deliveredIds: [], inputIds: rows.map(row => row.id), completed: false }),
    readContext: async messages => { readIds.push(messages.map(row => row.id)); return description; },
  });
  const transcript: any[] = [];
  assert.equal(await inbox.append(transcript), false);
  rows.push({ id: 1, role: "user", content, payload: {}, message_type: "chat" });
  assert.equal(await inbox.append(transcript), true);
  assert.ok(transcript[0].content.includes(description));
  assert.equal(await inbox.append(transcript), false);
  rows.push({ ...rows[0], id: 2 });
  assert.equal(await inbox.append(transcript), true);
  assert.deepEqual(readIds, [[1], [2]]);
  assert.deepEqual(inbox.messageIds(), [1, 2]);
  assert.ok(rows.every(row => row.content === content));
});
