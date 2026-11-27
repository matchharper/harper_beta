import assert from "node:assert/strict";
import test from "node:test";
import { closedPostingBeforePreparation } from "./postingCheck";
import { executeUseBrowser } from "./tool";
import type { ExternalToolContext } from "../externalOperations/store";

const roleId = "00000000-0000-4000-8000-000000000010";
const summary = (applicationsClosed: boolean) => JSON.stringify({
  applicationsClosed, employmentTypes: [], hiringCompany: "Example Labs", isJobPosting: true,
  jobDescription: "Build reliable systems.", jobLocation: "Seoul", roleSummary: "Example Labs is hiring.",
  roleTitle: "Data Engineer", salaryRange: "", workArrangement: "",
});
const exa = (result: Record<string, unknown>) => ({ getContents: async () => ({ requestId: "r", ...result }) }) as never;
const roles = (rows: Record<string, unknown>[]) => {
  const chain: any = { select: () => chain, in: async (_key: string, ids: string[]) => ({ data: rows.filter(row => ids.includes(String(row.role_id))), error: null }) };
  return { admin: { from: (table: string) => { assert.equal(table, "company_roles"); return chain; } } } as unknown as ExternalToolContext;
};
const role = (fields: Record<string, unknown>) => ({ role_id: roleId, name: "Data Engineer", status: "active", is_expired: false,
  external_jd_url: "https://careers.example.com/data-engineer", ...fields });

test("a role already ended in Harper is closed without reading the page", async () => {
  const result = await closedPostingBeforePreparation(roles([role({ status: "ended", is_expired: true })]), { role_refs: [roleId] },
    { exa: { getContents: async () => assert.fail("read a page for a role Harper already knows is closed") } as never });
  assert.match(result ?? "", /already closed in Harper/);
});

test("a page that says applications are closed stops the preparation", async () => {
  const result = await closedPostingBeforePreparation(roles([role({})]), { role_refs: [roleId] },
    { exa: exa({ results: [{ summary: summary(true) }] }) });
  assert.match(result ?? "", /careers\.example\.com\/data-engineer is closed .*no longer accepts applications/);
});

test("a 404 closes the posting even when the page cannot be read at all", async () => {
  const result = await closedPostingBeforePreparation(roles([role({ external_jd_url: "https://job-boards.greenhouse.io/acme/jobs/12345" })]),
    { role_refs: [roleId] },
    { exa: exa({ results: [], statuses: [{ status: "error", error: { tag: "CRAWL_NOT_FOUND", httpStatusCode: 404 } }] }),
      fetcher: async () => new Response("{}", { status: 404 }) });
  assert.match(result ?? "", /HTTP 404/);
});

test("an open posting, an unreadable page and a forbidden read all let the preparation start", async () => {
  assert.equal(await closedPostingBeforePreparation(roles([role({})]), { role_refs: [roleId] },
    { exa: exa({ results: [{ summary: summary(false) }] }) }), null);
  assert.equal(await closedPostingBeforePreparation(roles([role({})]), { role_refs: [roleId] },
    { exa: exa({ results: [], statuses: [{ status: "error", error: { tag: "CRAWL_FORBIDDEN", httpStatusCode: 403 } }] }) }), null);
  assert.equal(await closedPostingBeforePreparation(roles([role({})]), { role_refs: [roleId] },
    { exa: { getContents: async () => { throw new Error("network down"); } } as never }), null);
});

test("the role's own posting page is read before the run's starting URL", async () => {
  const read: string[] = [];
  await closedPostingBeforePreparation(roles([role({})]), { role_refs: [roleId], url: "https://www.wanted.co.kr/login" },
    { exa: { getContents: async (urls: string[]) => { read.push(...urls); return { requestId: "r", results: [{ summary: summary(false) }] }; } } as never });
  assert.deepEqual([...new Set(read)], ["https://careers.example.com/data-engineer"]);
});

test("a run with no role and no URL is not checked", async () => {
  assert.equal(await closedPostingBeforePreparation(roles([]), {}, { exa: exa({}) }), null);
});

test("use_browser opens no browser for a closed role, and ignore_closed skips the check", async (t) => {
  process.env.BROWSER_USE_API_KEY = "fixture-key";
  const providerCalls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => { providerCalls.push(String(url)); return new Response(null, { status: 500 }); });
  const context = { ...roles([role({ status: "ended", is_expired: true })]), userId: "00000000-0000-4000-8000-000000000001",
    conversationId: "00000000-0000-4000-8000-000000000099", requestId: "closed-check" } as ExternalToolContext;
  const result = await executeUseBrowser({ action: "run", task: "Inspect the application form", role_refs: [roleId] }, context);
  assert.match(String((result as { modelOutput?: string }).modelOutput), /already closed in Harper\. No browser was opened/);
  assert.deepEqual(providerCalls, []);
  // Skipping the check reaches the browser path (the fixture has no browser tables, so it stops there).
  await assert.rejects(executeUseBrowser({ action: "run", task: "Inspect", role_refs: [roleId], ignore_closed: true }, context));
});
