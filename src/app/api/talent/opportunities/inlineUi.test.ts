import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { isPostingRoleId } from "@/lib/career/postingLinks";

const roleId = "00000000-0000-4000-8000-000000000001";
function harness(anonymous = false) {
  const calls: Record<string, unknown>[] = [];
  const source = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as { GET: (req: unknown) => Promise<{ status: number; body: any }> } };
  vm.runInNewContext(source, { module, exports: module.exports, console,
    require: (name: string) => {
      if (name === "next/server") return { NextResponse: { json: (body: unknown, init?: { status: number }) => ({ body, status: init?.status ?? 200 }) } };
      if (name === "@/lib/supabaseServer") return { getRequestUser: async () => anonymous ? null : { id: "authenticated-owner" } };
      if (name === "@/lib/talentOnboarding/server") return { getTalentSupabaseAdmin: () => ({}) };
      if (name === "@/lib/career/postingLinks") return { isPostingRoleId };
      if (name === "@/lib/talentOpportunity") return { fetchTalentOpportunityHistoryByRoleIds: async (args: Record<string, unknown>) => { calls.push(args); return [{ roleId }]; }, archiveEndedInternalOpportunitiesForTalent: () => { throw new Error("A display request must not mutate history"); } };
      return {};
    },
  });
  return { calls, get: (query: string) => module.exports.GET({ nextUrl: new URL(`http://localhost/api/talent/opportunities?${query}`), cookies: { get: () => undefined } }) };
}
test("explicit collection reads are batched, owner-scoped and have no view/archive side effect", async () => {
  const h = harness();
  const result = await h.get(`roleIds=${roleId},${roleId}&userId=another-user`);
  assert.equal(result.status, 200);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].userId, "authenticated-owner");
  assert.deepEqual(Array.from(h.calls[0].roleIds as string[]), [roleId]);
});
test("anonymous and invalid collection requests do not reach the reader", async () => {
  const anonymous = harness(true);
  assert.equal((await anonymous.get(`roleIds=${roleId}`)).status, 401);
  const h = harness();
  for (const ids of ["", "bad-id", `${roleId},bad-id`]) assert.equal((await h.get(`roleIds=${ids}`)).status, 400);
  assert.equal(h.calls.length + anonymous.calls.length, 0);
});
