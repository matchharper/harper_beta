import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";

const matchingId = "00000000-0000-4000-8000-000000000007";
const cursor = "00000000-0000-4000-8000-000000000008";

function harness({ anonymous = false, owned = true, missingPosting = false } = {}) {
  const filters: Record<string, unknown> = {};
  const calls: Array<Record<string, unknown>> = [];
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => {
      filters[key] = value;
      return query;
    },
    maybeSingle: async () => ({
      data: owned ? { id: matchingId } : null,
      error: null,
    }),
  };
  const dependencies: Record<string, unknown> = {
    zod: { z },
    "next/server": {
      NextResponse: {
        json: (body: unknown, init?: { status: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    },
    "@/lib/supabaseServer": {
      getRequestUser: async () => (anonymous ? null : { id: "owner" }),
    },
    "@/lib/talentOnboarding/admin": { getTalentSupabaseAdmin: () => ({}) },
    "@/lib/talentOpportunity": {
      fetchTalentPostingCardsByRoleIds: async (args: Record<string, unknown>) => {
        calls.push(args);
        return missingPosting ? [] : [{
          roleId: "role",
          title: "Engineer",
          companyName: "Company",
          companyLogoUrl: "https://example.com/company-logo.png",
          location: "Seoul, South Korea",
          postedAt: "2026-10-30T00:00:00Z",
          recommendedAt: "2026-11-02T00:00:00Z",
          description: "Full job description",
        }];
      },
    },
    "@/lib/career/matching/store": {
      matchingTable: () => query,
      listMatchings: async (args: Record<string, unknown>) => {
        calls.push(args);
        return {
          matchings: [
            {
              id: matchingId,
              title: "AI roles",
              description: "Seoul",
              revision: 12,
            },
          ],
          nextCursor: cursor,
        };
      },
    },
    "@/lib/career/matching/externalEvaluationResults": {
      readExternalEvaluationResults: async (args: Record<string, unknown>) => {
        calls.push(args);
        return {
          evaluations: [
            {
              id: "evaluation",
              role_id: "role",
              is_recommended: true,
              assessment: { fit: { mutualFit: 96.5 }, privateEvidence: "omit" },
              role: {
                name: "Engineer",
                company_workspace: { company_name: "Company" },
              },
            },
          ],
          evaluationCount: 31,
          evaluationCursor: cursor,
        };
      },
    },
  };
  const source = ts.transpileModule(
    readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const loaded = {
    exports: {} as {
      GET: (req: { nextUrl: URL }) => Promise<{ status: number; body: any }>;
    },
  };
  vm.runInNewContext(source, {
    module: loaded,
    exports: loaded.exports,
    console,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return {
    get: (params = "") =>
      loaded.exports.GET({
        nextUrl: new URL(`http://localhost/api/talent/matchings?${params}`),
      }),
    filters,
    calls,
  };
}

test("matching API rejects anonymous and malformed requests before reading data", async () => {
  const anonymous = harness({ anonymous: true });
  assert.equal((await anonymous.get()).status, 401);
  assert.equal(anonymous.calls.length, 0);
  const invalid = harness();
  assert.equal((await invalid.get("matchingId=invalid")).status, 400);
  assert.equal((await invalid.get("cursor=invalid")).status, 400);
  assert.equal(invalid.calls.length, 0);
});

test("matching API refuses another user's matching before loading evaluations", async () => {
  const h = harness({ owned: false });
  assert.equal((await h.get(`matchingId=${matchingId}`)).status, 404);
  assert.deepEqual(h.filters, { id: matchingId, talent_id: "owner" });
  assert.equal(h.calls.length, 0);
});

test("matching API forwards owner and cursors and returns only display fields", async () => {
  const h = harness();
  const list = await h.get(`cursor=${cursor}`);
  assert.equal(list.status, 200);
  assert.equal(h.calls[0].userId, "owner");
  assert.equal(h.calls[0].archived, false);
  assert.equal(h.calls[0].newestFirst, true);
  assert.equal(h.calls[0].cursor, cursor);
  assert.equal(list.body.matchings[0].revision, undefined);
  const detail = await h.get(`matchingId=${matchingId}&cursor=${cursor}`);
  assert.equal(detail.status, 200);
  assert.equal(h.calls[1].userId, "owner");
  assert.equal(h.calls[1].matchingId, matchingId);
  assert.equal(h.calls[1].cursor, cursor);
  assert.equal(h.calls[1].excludePreviouslyRecommended, true);
  assert.equal(detail.body.opportunities[0].isRecommended, true);
  assert.equal(detail.body.opportunities[0].score, 96.5);
  assert.equal(h.calls[2].userId, "owner");
  assert.deepEqual(Array.from(h.calls[2].roleIds as string[]), ["role"]);
  assert.equal(detail.body.opportunities[0].companyLogoUrl, "https://example.com/company-logo.png");
  assert.equal(detail.body.opportunities[0].location, "Seoul, South Korea");
  assert.equal(detail.body.opportunities[0].postedAt, "2026-10-30T00:00:00Z");
  assert.equal(detail.body.opportunities[0].recommendedAt, undefined);
  assert.equal(detail.body.opportunities[0].opportunity.description, "Full job description");
  assert.equal(detail.body.opportunities[0].assessment, undefined);
  assert.equal(detail.body.nextCursor, cursor);
  assert.equal(detail.body.count, 31);
});

test("matching API can include recommended positions and rejects invalid filters", async () => {
  const h = harness();
  assert.equal((await h.get(`matchingId=${matchingId}&excludeRecommended=false`)).status, 200);
  assert.equal(h.calls[0].excludePreviouslyRecommended, false);
  assert.equal((await h.get(`matchingId=${matchingId}&excludeRecommended=invalid`)).status, 400);
});

test("matching API preserves an evaluation when its posting is unavailable without inventing metadata", async () => {
  const h = harness({ missingPosting: true });
  const detail = await h.get(`matchingId=${matchingId}`);
  assert.equal(detail.status, 200);
  const item = detail.body.opportunities[0];
  assert.equal(item.title, "Engineer");
  assert.equal(item.companyName, "Company");
  assert.equal(item.opportunity, null);
  assert.equal(item.companyLogoUrl, null);
  assert.equal(item.location, null);
  assert.equal(item.postedAt, null);
  assert.equal(detail.body.nextCursor, cursor);
});
